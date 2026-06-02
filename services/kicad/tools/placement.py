"""
Layrix — Placement (tools/placement.py)

Deux points d'entrée publics :
  1. place_components()  — positions explicites fournies par l'agent
  2. auto_place()        — placement automatique, 2 candidats + gate courtyard

Pipeline auto_place :
  Candidat A : place_unplaced (grille cluster-by-net, toujours faisable)
  Candidat B : pin-adjacent  (chaque petit composant sous le pin du module)
  Gate       : PlacementAnalyzer.find_conflicts (0 conflit requis)
  Sélection  : HPWL pin-aware le plus bas
  Fallback   : pcbnew grille simple
"""

from __future__ import annotations

import base64
import logging
import math
import shutil
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mode 1 : placement explicite
# ---------------------------------------------------------------------------

def place_components(pcb_path: str, components: list[dict], output_path: str) -> dict:
    try:
        import pcbnew  # type: ignore
    except ImportError as exc:
        raise ImportError("pcbnew non disponible — KiCad doit être installé") from exc

    board = pcbnew.LoadBoard(pcb_path)
    placed: list[str] = []
    errors: list[str] = []

    for comp in components:
        fp = board.FindFootprintByReference(comp["ref"])
        if not fp:
            errors.append(f"Footprint {comp['ref']} introuvable")
            continue
        x_iu = pcbnew.FromMM(float(comp["x_mm"]))
        y_iu = pcbnew.FromMM(float(comp["y_mm"]))
        if hasattr(pcbnew, "VECTOR2I"):
            fp.SetPosition(pcbnew.VECTOR2I(x_iu, y_iu))
        else:
            fp.SetPosition(pcbnew.wxPoint(x_iu, y_iu))
        rotation = float(comp.get("rotation", 0.0))
        if hasattr(fp, "SetOrientationDegrees"):
            fp.SetOrientationDegrees(rotation)
        else:
            fp.SetOrientation(rotation * 10)
        if comp.get("side") == "back":
            fp.Flip(fp.GetPosition(), False)
        placed.append(comp["ref"])

    pcbnew.SaveBoard(output_path, board)
    return {"status": "ok", "path": output_path, "placed": len(placed), "errors": errors}


# ---------------------------------------------------------------------------
# Mode 2 : auto-placement
# ---------------------------------------------------------------------------

def auto_place(kicad_pcb_b64: str, board_width_mm: float, board_height_mm: float) -> dict:
    """Place les footprints automatiquement.

    Candidat A (place_unplaced) est toujours lancé — grille déterministe, 0 conflit.
    Candidat B (pin-adjacent) est ajouté quand un gros module est détecté —
    positionne les petits composants juste sous les pins auxquels ils se connectent.
    Le candidat avec le HPWL pin-aware le plus bas ET 0 conflit courtyard est retenu.
    Fallback pcbnew si kicad-tools indisponible.
    """
    pcb_bytes = base64.b64decode(kicad_pcb_b64)

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        dst = Path(tmp) / "placed.kicad_pcb"
        opt = Path(tmp) / "pin_adj.kicad_pcb"

        try:
            from kicad_tools.placement.place_unplaced import place_unplaced
            from kicad_tools.schema.pcb import PCB

            src.write_bytes(pcb_bytes)

            # Candidat A : grille cluster-by-net
            result = place_unplaced(str(src), output_path=str(dst),
                                    margin=1.5, spacing=1.0, cluster=True)
            placed_count = len(result.placed_refs)
            logger.info("place_unplaced: %d placés, %d overflow",
                        placed_count, len(result.overflow_refs))

            if not dst.exists() or placed_count == 0:
                raise RuntimeError("place_unplaced n'a rien placé")

            candidates: list[dict] = [
                {"name": "place_unplaced", "bytes": dst.read_bytes(),
                 "placed_refs": result.placed_refs},
            ]

            # Candidat B : pin-adjacent
            try:
                seed = _pin_adjacent_seed(str(dst))
                if seed:
                    pcb_adj = PCB.load(str(dst))
                    seen: dict[tuple, int] = {}
                    for ref, (sx, sy) in seed.items():
                        key = (round(sx, 1), round(sy, 1))
                        offset = seen.get(key, 0)
                        pcb_adj.update_footprint_position(ref, sx + offset * 8.0, sy)
                        seen[key] = offset + 1
                    pcb_adj.save(str(opt))
                    candidates.append({"name": "pin_adjacent", "bytes": opt.read_bytes(),
                                       "placed_refs": result.placed_refs})
            except Exception as exc:
                logger.warning("pin-adjacent échoué (%s) — ignoré", exc)

            best = _select_best_placement(candidates)
            logger.info("placement retenu: %s", best["name"])
            return {
                "kicad_pcb_b64": base64.b64encode(best["bytes"]).decode(),
                "placed_count": placed_count,
                "positions": [{"ref": r} for r in best["placed_refs"]],
            }

        except Exception as exc:
            logger.warning("place_unplaced échoué (%s) — fallback pcbnew", exc)

        # Fallback : pcbnew grille simple
        src.write_bytes(pcb_bytes)
        placed = _pcbnew_grid_place(str(src), str(dst), board_width_mm, board_height_mm)
        output_bytes = dst.read_bytes() if dst.exists() else src.read_bytes()
        logger.info("pcbnew grille fallback: %d composants placés", len(placed))
        return {
            "kicad_pcb_b64": base64.b64encode(output_bytes).decode(),
            "placed_count": len(placed),
            "positions": [{"ref": r} for r in placed],
        }


# ---------------------------------------------------------------------------
# Sélection : gate courtyard + HPWL pin-aware
# ---------------------------------------------------------------------------

def _select_best_placement(candidates: list[dict]) -> dict:
    """Retourne le candidat faisable (0 conflit) avec le HPWL le plus bas."""
    scored = []
    for c in candidates:
        conflicts = _count_placement_conflicts(c["bytes"])
        score = _hpwl(c["bytes"]) if conflicts == 0 else float("inf")
        logger.info("placement candidat %s: %d conflits, hpwl=%s",
                    c["name"], conflicts,
                    f"{score:.1f}" if score != float("inf") else "n/a")
        scored.append((conflicts, score, c))

    feasible = [s for s in scored if s[0] == 0]
    if feasible:
        feasible.sort(key=lambda s: s[1])
        return feasible[0][2]
    scored.sort(key=lambda s: s[0])
    return scored[0][2]


def _count_placement_conflicts(pcb_bytes: bytes) -> int:
    """Nombre de conflits courtyard/clearance (0 = placement faisable)."""
    from kicad_tools.placement.analyzer import PlacementAnalyzer
    with tempfile.NamedTemporaryFile(suffix=".kicad_pcb", mode="wb", delete=False) as f:
        f.write(pcb_bytes)
        p = Path(f.name)
    try:
        return len(PlacementAnalyzer().find_conflicts(str(p)))
    except Exception as exc:
        logger.warning("find_conflicts échoué (%s) — candidat marqué non-faisable", exc)
        return 10**6
    finally:
        p.unlink(missing_ok=True)


def _hpwl(pcb_bytes: bytes) -> float:
    """HPWL pin-aware : demi-périmètre bbox des pads absolus (rotation incluse)."""
    from kicad_tools.schema.pcb import PCB
    with tempfile.NamedTemporaryFile(suffix=".kicad_pcb", mode="wb", delete=False) as f:
        f.write(pcb_bytes)
        p = Path(f.name)
    try:
        pcb = PCB.load(str(p))
    except Exception:
        return float("inf")
    finally:
        p.unlink(missing_ok=True)

    nets: dict[str, list[tuple[float, float]]] = {}
    for fp in pcb.footprints:
        fx, fy = fp.position
        cos_r = math.cos(math.radians(fp.rotation))
        sin_r = math.sin(math.radians(fp.rotation))
        for pad in getattr(fp, "pads", []):
            name = getattr(pad, "net_name", None)
            if not name:
                continue
            px, py = pad.position
            nets.setdefault(name, []).append((
                fx + px * cos_r - py * sin_r,
                fy + px * sin_r + py * cos_r,
            ))

    total = 0.0
    for pts in nets.values():
        if len(pts) >= 2:
            xs = [x for x, _ in pts]
            ys = [y for _, y in pts]
            total += (max(xs) - min(xs)) + (max(ys) - min(ys))
    return total


# ---------------------------------------------------------------------------
# Seed pin-adjacent
# ---------------------------------------------------------------------------

def _courtyard_area_fp(fp) -> float:
    """Aire (mm²) du courtyard réel d'un footprint. 0 si absent."""
    xs: list[float] = []
    ys: list[float] = []
    for g in getattr(fp, "graphics", []):
        if getattr(g, "layer", None) not in ("F.CrtYd", "B.CrtYd"):
            continue
        for pt in (getattr(g, "start", None), getattr(g, "end", None)):
            if pt is not None:
                xs.append(pt[0])
                ys.append(pt[1])
    return (max(xs) - min(xs)) * (max(ys) - min(ys)) if xs else 0.0


def _pin_adjacent_seed(pcb_path: str) -> dict[str, tuple[float, float]] | None:
    """Position cible pour chaque petit composant : juste sous le pin du module
    auquel il est le plus connecté.

    Retourne {ref: (x, y)} ou None si pas de gros module détecté.
    """
    try:
        from kicad_tools.schema.pcb import PCB
        pcb = PCB.load(pcb_path)
    except Exception:
        return None

    large = {fp.reference: fp for fp in pcb.footprints if _courtyard_area_fp(fp) > 500}
    small = {fp.reference: fp for fp in pcb.footprints if _courtyard_area_fp(fp) <= 500}
    if not large or not small:
        return None

    # Positions absolues des pads des gros modules, par net
    def _abs(fp, pad) -> tuple[float, float]:
        fx, fy = fp.position
        r = math.radians(fp.rotation)
        px, py = pad.position
        return (fx + px * math.cos(r) - py * math.sin(r),
                fy + px * math.sin(r) + py * math.cos(r))

    large_net_pads: dict[str, list[tuple[float, float]]] = {}
    for fp in large.values():
        for pad in getattr(fp, "pads", []):
            net = getattr(pad, "net_name", None)
            if net:
                large_net_pads.setdefault(net, []).append(_abs(fp, pad))

    # y_max du courtyard du module (limite inférieure du body)
    module_y_max = max(
        (pt[1] + fp.position[1]
         for fp in large.values()
         for g in getattr(fp, "graphics", [])
         if getattr(g, "layer", None) in ("F.CrtYd", "B.CrtYd")
         for pt in (getattr(g, "start", None), getattr(g, "end", None)) if pt),
        default=None,
    )

    seed: dict[str, tuple[float, float]] = {}
    for ref, fp in small.items():
        targets = [pos
                   for pad in getattr(fp, "pads", [])
                   for pos in large_net_pads.get(getattr(pad, "net_name", "") or "", [])]
        if not targets:
            continue
        tx = sum(x for x, _ in targets) / len(targets)
        ty = (module_y_max + 5.0) if module_y_max is not None else (
            sum(y for _, y in targets) / len(targets) + 5.0
        )
        seed[ref] = (round(tx, 2), round(ty, 2))

    logger.info("pin_adjacent_seed: %d composants seedés", len(seed))
    return seed or None


# ---------------------------------------------------------------------------
# Fallback : pcbnew grille simple
# ---------------------------------------------------------------------------

def _pcbnew_grid_place(src: str, dst: str,
                       board_width_mm: float, board_height_mm: float) -> list[str]:
    """Grille déterministe via pcbnew. Retourne [] si pcbnew indisponible."""
    try:
        import pcbnew  # type: ignore
    except ImportError:
        logger.warning("pcbnew indisponible — copie brute")
        shutil.copy2(src, dst)
        return []
    try:
        board = pcbnew.LoadBoard(src)
    except Exception as exc:
        logger.warning("pcbnew LoadBoard échoué (%s) — copie brute", exc)
        shutil.copy2(src, dst)
        return []

    footprints = list(board.GetFootprints())
    if not footprints:
        pcbnew.SaveBoard(dst, board)
        return []

    margin = 5.0
    cols = max(1, int((board_width_mm - 2 * margin) / 15))
    step_x = (board_width_mm - 2 * margin) / cols
    placed: list[str] = []
    for i, fp in enumerate(footprints):
        x = margin + (i % cols) * step_x + step_x / 2
        y = margin + (i // cols) * 15.0
        fp.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(x), pcbnew.FromMM(y)))
        placed.append(fp.GetReference())

    pcbnew.SaveBoard(dst, board)
    return placed


# ---------------------------------------------------------------------------
# Board-fit (utilisé par les tests)
# ---------------------------------------------------------------------------

def _fit_board_outline_to_components(pcb_bytes: bytes, margin_mm: float = 10.0) -> bytes:
    """Redimensionne Edge.Cuts autour des footprints placés + marge."""
    import uuid as _uuid
    text = pcb_bytes.decode("utf-8", errors="replace")
    try:
        from kicad_tools.schema.pcb import PCB
        with tempfile.NamedTemporaryFile(suffix=".kicad_pcb", mode="wb", delete=False) as f:
            f.write(pcb_bytes)
            p = Path(f.name)
        pcb = PCB.load(str(p))
        p.unlink(missing_ok=True)
        xs = [fp.position[0] for fp in pcb.footprints]
        ys = [fp.position[1] for fp in pcb.footprints]
    except Exception as exc:
        logger.warning("_fit_board_outline: PCB API failed (%s)", exc)
        return pcb_bytes

    if not xs:
        return pcb_bytes

    x0, y0 = round(min(xs) - margin_mm, 2), round(min(ys) - margin_mm, 2)
    x1, y1 = round(max(xs) + margin_mm, 2), round(max(ys) + margin_mm, 2)
    text = _strip_edge_cuts_graphics(text)
    outline = (
        f'\n  (gr_rect (start {x0} {y0}) (end {x1} {y1})'
        f'\n    (stroke (width 0.1) (type solid)) (fill none) (layer "Edge.Cuts")'
        f'\n    (uuid "{_uuid.uuid4()}"))\n'
    )
    last = text.rfind(")")
    if last >= 0:
        text = text[:last] + outline + text[last:]
    return text.encode("utf-8")


def _strip_edge_cuts_graphics(text: str) -> str:
    """Supprime les gr_line/gr_rect Edge.Cuts par scan de parenthèses équilibrées."""
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        if text.startswith("(gr_line", i) or text.startswith("(gr_rect", i):
            depth, j = 0, i
            while j < n:
                if text[j] == "(":
                    depth += 1
                elif text[j] == ")":
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
                j += 1
            if '"Edge.Cuts"' in text[i:j]:
                i = j
                continue
            out.append(text[i:j])
            i = j
        else:
            out.append(text[i])
            i += 1
    return "".join(out)

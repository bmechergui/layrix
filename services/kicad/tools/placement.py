"""
Layrix — Placement
Deux modes :
  1. place_components(pcb_path, components, output_path) — positions explicites fournies par l'agent
  2. auto_place(pcb_b64, board_w, board_h) → dict
       Primaire : kicad-tools CMA-ES place_unplaced (cluster=True)
       Fallback  : pcbnew grille simple
"""

from __future__ import annotations

import base64
import logging
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mode 1 : placement explicite (coordonnées fournies par l'agent)
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
# Mode 2 : auto-placement (I/O base64)
# ---------------------------------------------------------------------------

def _optimize_with_priors(pcb_path: str, output_path: str,
                           max_iterations: int = 300, time_budget: float = 90.0) -> bool:
    """CMA-ES avec priors physiques complets :
      · schematic_proximity_prior  → seed CMA-ES basé sur connectivité schéma
      · detect_power_domains       → identifie groupes VCC/GND (log)
      · detect_signal_flow         → ordre topologique connectors→MCU→sensors (log)

    Workflow :
      1. Lire PCB → components, nets, board
      2. Calculer schematic_proximity_prior → PlacementVector initial
      3. Écrire ce seed dans le PCB (positions initiales physiquement correctes)
      4. CMA-ES raffine depuis ce seed (bypass caps déjà près MCU, flux signal déjà correct)
    """
    try:
        from kicad_tools.cli.optimize_placement_cmd import (
            _read_board_data, _write_placements_to_pcb, run_optimize_placement,
        )
        from kicad_tools.placement.priors import (
            schematic_proximity_prior, detect_power_domains, detect_signal_flow,
        )
        import tempfile as _tmp2

        # 1. Lire les données du PCB
        components, nets, board_outline, rules, origin = _read_board_data(str(pcb_path))
        if not components:
            return False

        # 2. Règles physiques — log + calcul du seed
        try:
            power_groups = detect_power_domains(components, nets)
            logger.info("power_domains: %d domaines (VCC/GND groups)", len(power_groups))
        except Exception as exc:
            logger.warning("detect_power_domains: %s", exc)

        try:
            signal_flow = detect_signal_flow(components, nets)
            ordered = getattr(signal_flow, 'ordered_refs', getattr(signal_flow, 'ordered', []))
            logger.info("signal_flow: %d composants dans l'ordre topologique", len(ordered))
        except Exception as exc:
            logger.warning("detect_signal_flow: %s", exc)

        # 3. schematic_proximity_prior → seed CMA-ES physiquement correct
        # Composants fortement connectés (bypass caps ↔ MCU) déjà proches dans le seed
        prior_vector = schematic_proximity_prior(components, nets, board_outline)
        logger.info("schematic_proximity_prior: seed calculé (%d composants)", len(components))

        # 4. Écrire le seed dans le PCB temporaire → starting point pour CMA-ES
        seeded_pcb = Path(_tmp2.mktemp(suffix='.kicad_pcb'))
        _write_placements_to_pcb(str(pcb_path), str(seeded_pcb),
                                  prior_vector, components, origin)
        logger.info("seed écrit dans PCB: %s", seeded_pcb.name)

        # 5. CMA-ES raffine depuis le seed physique
        # seed_method="existing" → utilise les positions du PCB seeded
        # (notre patch kicad-tools qui lit les positions actuelles du PCB)
        success = run_optimize_placement(
            pcb_path=str(seeded_pcb),
            strategy_name="cmaes",
            max_iterations=max_iterations,
            output_path=str(output_path),
            seed_method="existing",  # ← patch Layrix : utilise le prior écrit dans PCB
            # drc=1e6 : respecte les pad clearances (validé expérimentalement 2026-06-02)
            # wirelength=2.0 : tire les composants vers les vrais pins (pin-aware HPWL)
            weights_json='{"wirelength": 2.0, "overlap": 1e6, "drc": 1e6, "area": 0.5}',
            time_budget=time_budget,
            quiet=True,
        )
        logger.info("CMA-ES avec priors: résultat=%s", success)
        return success == 0 or success is True or success is None

    except Exception as exc:
        logger.warning("_optimize_with_priors échoué (%s)", exc)
        return False


def _try_optimize_placement(pcb_bytes: bytes) -> bytes | None:
    """Run `kct optimize-placement --strategy cmaes`.

    Returns the optimized PCB bytes only when the optimizer reports a FEASIBLE
    final result (no overlap/DRC). Returns None when infeasible or on error, so
    the caller falls back to place_unplaced — this is the case for large shield
    footprints (Arduino/STM32) where optimize-placement's pad-bbox overlap model
    leaves components stacked.
    """
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.kicad_pcb"
        dst = Path(tmp) / "out.kicad_pcb"
        src.write_bytes(pcb_bytes)
        try:
            result = subprocess.run(
                [
                    sys.executable, "-m", "kicad_tools.cli", "optimize-placement",
                    str(src), "--output", str(dst),
                    "--strategy", "cmaes",
                    "--seed", "force-directed",
                ],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=130, check=False,
            )
        except Exception as exc:
            logger.warning("optimize-placement subprocess failed: %s", exc)
            return None

        # Keep result only if the FINAL line is feasible (not INFEASIBLE)
        final_line = ""
        for ln in result.stdout.splitlines():
            if ln.strip().startswith("Final:"):
                final_line = ln
        feasible = "feasible" in final_line.lower() and "infeasible" not in final_line.lower()
        if dst.exists() and feasible:
            logger.info("optimize-placement: feasible — %s", final_line.strip()[:80])
            return dst.read_bytes()
        logger.info(
            "optimize-placement: infeasible/no-output — fallback place_unplaced (%s)",
            final_line.strip()[:80] or f"rc={result.returncode}",
        )
        return None


def _courtyard_area_fp(fp) -> float:
    """Return the F/B.CrtYd bounding-box area (mm²) for a footprint object.

    Returns 0.0 when the footprint has no courtyard graphics.
    Used to classify footprints as large modules (area > 500mm²) vs small
    discrete components so the hybrid placement strategy can fix module positions
    while letting CMA-ES optimise small-component positions.
    """
    xs: list[float] = []
    ys: list[float] = []
    for g in getattr(fp, "graphics", []):
        if getattr(g, "layer", None) not in ("F.CrtYd", "B.CrtYd"):
            continue
        for pt in (getattr(g, "start", None), getattr(g, "end", None)):
            if pt is not None:
                xs.append(pt[0])
                ys.append(pt[1])
    if not xs:
        return 0.0
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def _count_placement_conflicts(pcb_bytes: bytes) -> int:
    """Number of courtyard/clearance conflicts (0 = manufacturable placement).

    Authoritative feasibility gate: PlacementAnalyzer reads real footprint
    courtyards (incl. module bodies such as Arduino), unlike the CMA-ES overlap
    model which only sees pad bounding boxes. On any failure, returns a large
    sentinel so the candidate is treated as worst (never silently "feasible").
    """
    from kicad_tools.placement.analyzer import PlacementAnalyzer

    with tempfile.NamedTemporaryFile(suffix=".kicad_pcb", mode="wb", delete=False) as f:
        f.write(pcb_bytes)
        p = Path(f.name)
    try:
        return len(PlacementAnalyzer().find_conflicts(str(p)))
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("find_conflicts échoué (%s) — candidat marqué non-faisable", exc)
        return 10**6
    finally:
        p.unlink(missing_ok=True)


def _hpwl(pcb_bytes: bytes) -> float:
    """Half-perimeter wirelength using absolute pad positions (pin-aware).

    Computes the HPWL bounding box over the true absolute pad positions of
    each multi-pad net, applying the footprint rotation so the metric reflects
    the real wire length after placement — not just the distance between
    component origins. This matches the pin-aware cost used by the CMA-ES
    optimizer (cost.py compute_wirelength with component_defs).
    """
    import math
    from kicad_tools.schema.pcb import PCB

    with tempfile.NamedTemporaryFile(suffix=".kicad_pcb", mode="wb", delete=False) as f:
        f.write(pcb_bytes)
        p = Path(f.name)
    try:
        pcb = PCB.load(str(p))
    except Exception:  # pragma: no cover - defensive
        return float("inf")
    finally:
        p.unlink(missing_ok=True)

    nets: dict[str, list[tuple[float, float]]] = {}
    for fp in pcb.footprints:
        fx, fy = fp.position
        rot_rad = math.radians(fp.rotation)
        cos_r, sin_r = math.cos(rot_rad), math.sin(rot_rad)
        for pad in getattr(fp, "pads", []):
            name = getattr(pad, "net_name", None)
            if not name:
                continue
            px, py = pad.position  # relative to footprint origin
            abs_x = fx + px * cos_r - py * sin_r
            abs_y = fy + px * sin_r + py * cos_r
            nets.setdefault(name, []).append((abs_x, abs_y))

    total = 0.0
    for pts in nets.values():
        if len(pts) < 2:
            continue
        xs = [x for x, _ in pts]
        ys = [y for _, y in pts]
        total += (max(xs) - min(xs)) + (max(ys) - min(ys))
    return total


def _select_best_placement(candidates: list[dict]) -> dict:
    """Pick the best placement candidate.

    Hard gate: only candidates with zero courtyard/clearance conflicts are
    eligible (Layrix rule — never emit an overlapping / DRC-violating board).
    Among feasible candidates, choose the lowest HPWL (shortest wirelength →
    most routable). If none is feasible, keep the candidate with the fewest
    conflicts (the place_unplaced baseline is the reliably-feasible fallback).
    """
    scored: list[tuple[int, float, dict]] = []
    for c in candidates:
        conflicts = _count_placement_conflicts(c["bytes"])
        score = _hpwl(c["bytes"]) if conflicts == 0 else float("inf")
        logger.info(
            "placement candidat %s: %d conflits, hpwl=%s",
            c["name"], conflicts, f"{score:.1f}" if score != float("inf") else "n/a",
        )
        scored.append((conflicts, score, c))

    feasible = [s for s in scored if s[0] == 0]
    if feasible:
        feasible.sort(key=lambda s: s[1])  # lowest HPWL wins
        return feasible[0][2]

    scored.sort(key=lambda s: s[0])  # fewest conflicts = least-bad fallback
    return scored[0][2]


def auto_place(
    kicad_pcb_b64: str,
    board_width_mm: float,
    board_height_mm: float,
) -> dict:
    """Pipeline placement call_agent_placement — 3 niveaux.

    Ordre optimal : place_unplaced D'ABORD (bon starting point),
    puis kct optimize-placement TOUJOURS pour raffiner.

    Niveau 1 : kicad-tools
      a. place_unplaced(cluster=True)   ← grille initiale cluster-by-net
         footprints déjà à (-1000,-1000) par _generate_with_kicad_tools
      b. kct optimize-placement         ← raffine TOUJOURS depuis la grille
         si result.area > 50mm² (pas stacked) → utilise le résultat

    Niveau 2 : pcbnew grille simple
      → si kicad-tools indisponible ou exception

    Niveau 3 : TypeScript S-expr
      → retourné comme '' par generate_pcb() → TypeScript runCircuitSynthEngine()
    """
    pcb_bytes = base64.b64decode(kicad_pcb_b64)

    # --- Niveau 1 : place_unplaced → puis kct optimize-placement ---
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        dst = Path(tmp) / "placed.kicad_pcb"
        opt = Path(tmp) / "optimized.kicad_pcb"

        try:
            from kicad_tools.placement.place_unplaced import place_unplaced
            from kicad_tools.schema.pcb import PCB

            src.write_bytes(pcb_bytes)

            # Candidat A : place_unplaced — grille cluster-by-net, ligne de base
            # toujours faisable (0 chevauchement courtyard).
            # Marges resserrées (1.5/1.0 vs 3.0/3.0) : –23% de segments routés,
            # même qualité DRC (validé expérimentalement 2026-06-02).
            result = place_unplaced(
                str(src), output_path=str(dst),
                margin=1.5, spacing=1.0, cluster=True,
            )
            placed_count = len(result.placed_refs)
            logger.info("place_unplaced: %d placés, %d overflow",
                        placed_count, len(result.overflow_refs))

            if not dst.exists() or placed_count == 0:
                raise RuntimeError("place_unplaced n'a rien placé")

            candidates: list[dict] = [
                {"name": "place_unplaced", "bytes": dst.read_bytes(),
                 "placed_refs": result.placed_refs},
            ]

            # Candidat B : hybride pin-aware
            # 1. CMA-ES (avec HPWL calculé sur les vrais pads, cf. Codex pin-aware fix)
            #    optimise TOUS les composants — gros modules inclus.
            # 2. Les gros modules (courtyard > 500mm²) sont restaurés à leurs positions
            #    place_unplaced (stables, dans le board) — le CMA-ES a tenté de les
            #    déplacer sans connaître leur corps réel.
            # 3. Les petits composants gardent leurs positions CMA-ES pin-aware
            #    → serrés près des vrais pins des modules.
            # Gate : sélection retient ce candidat seulement s'il a 0 conflit courtyard.
            try:
                # Sauvegarder positions place_unplaced des gros modules
                pcb_pu = PCB.load(str(dst))
                large_pos = {
                    fp.reference: (fp.position, fp.rotation)
                    for fp in pcb_pu.footprints
                    if _courtyard_area_fp(fp) > 500
                }

                if _optimize_with_priors(str(dst), str(opt),
                                         max_iterations=300, time_budget=90.0) and opt.exists():
                    # Restaurer les gros modules à leurs positions stables
                    if large_pos:
                        pcb_cmaes = PCB.load(str(opt))
                        for ref, (pos, rot) in large_pos.items():
                            pcb_cmaes.update_footprint_position(ref, pos[0], pos[1], rotation=rot)
                        pcb_cmaes.save(str(opt))
                        logger.info(
                            "hybride: %d module(s) restauré(s) depuis place_unplaced: %s",
                            len(large_pos), list(large_pos.keys()),
                        )

                    candidates.append(
                        {"name": "cmaes_hybrid", "bytes": opt.read_bytes(),
                         "placed_refs": result.placed_refs}
                    )
            except Exception as exc:
                logger.warning("CMA-ES hybride échoué (%s) — candidat ignoré", exc)

            best = _select_best_placement(candidates)
            logger.info("placement retenu: %s", best["name"])
            return {
                "kicad_pcb_b64": base64.b64encode(best["bytes"]).decode(),
                "placed_count": placed_count,
                "positions": [{"ref": r} for r in best["placed_refs"]],
            }
        except Exception as exc:
            logger.warning("place_unplaced échoué (%s) — fallback pcbnew grille", exc)

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


def _set_edge_cuts_rect(pcb_text: str, x0: float, y0: float, x1: float, y1: float) -> str:
    """Replace all Edge.Cuts shapes with a single rectangle (x0,y0)-(x1,y1)."""
    import uuid as _uuid
    pcb_text = re.sub(r'\(gr_line[^)]*"Edge\.Cuts"[^)]*\)', "", pcb_text, flags=re.DOTALL)
    pcb_text = re.sub(
        r'\(gr_rect\s+\(start[^)]*\)\s+\(end[^)]*\)[\s\S]*?"Edge\.Cuts"[\s\S]*?\)\)',
        "", pcb_text,
    )
    outline = (
        f'\n  (gr_rect (start {x0} {y0}) (end {x1} {y1})'
        f'\n    (stroke (width 0.1) (type solid)) (fill none) (layer "Edge.Cuts")'
        f'\n    (uuid "{_uuid.uuid4()}"))\n'
    )
    last = pcb_text.rfind(")")
    return pcb_text[:last] + outline + pcb_text[last:] if last >= 0 else pcb_text + outline


def _fit_board_outline_to_components(pcb_bytes: bytes, margin_mm: float = 10.0) -> bytes:
    """Create an Edge.Cuts rectangle fitted to the placed footprints + margin.

    Uses the kicad_tools PCB model to read real footprint positions (not raw
    ``(at …)`` lines, which also match pad-relative offsets). Only top-level
    ``(gr_line/gr_rect … "Edge.Cuts" …)`` blocks are replaced — footprints are
    never touched. Returns the input unchanged if no footprints are found.
    """
    import uuid as _uuid

    text = pcb_bytes.decode("utf-8", errors="replace")

    try:
        import tempfile as _tmp
        from kicad_tools.schema.pcb import PCB
        with _tmp.NamedTemporaryFile(suffix=".kicad_pcb", mode="wb", delete=False) as _f:
            _f.write(pcb_bytes)
            _p = Path(_f.name)
        pcb = PCB.load(str(_p))
        _p.unlink(missing_ok=True)
        xs = [fp.position[0] for fp in pcb.footprints]
        ys = [fp.position[1] for fp in pcb.footprints]
    except Exception as exc:  # pragma: no cover - API fallback
        logger.warning("_fit_board_outline: PCB API failed (%s) — outline unchanged", exc)
        return pcb_bytes

    if not xs:
        return pcb_bytes

    # Footprint anchors + generous margin to cover body/pad extents (Arduino ≈ 35×91mm).
    x0 = round(min(xs) - margin_mm, 2)
    y0 = round(min(ys) - margin_mm, 2)
    x1 = round(max(xs) + margin_mm, 2)
    y1 = round(max(ys) + margin_mm, 2)

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
    """Remove top-level (gr_line …)/(gr_rect …) blocks whose layer is Edge.Cuts.

    Uses balanced-paren scanning (NOT greedy regex) so footprint bodies are
    never consumed. Footprint outlines use (fp_line …) and are left intact.
    """
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        if text.startswith("(gr_line", i) or text.startswith("(gr_rect", i):
            depth = 0
            j = i
            while j < n:
                c = text[j]
                if c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
                j += 1
            block = text[i:j]
            if '"Edge.Cuts"' in block:
                i = j  # drop this Edge.Cuts graphic
                continue
            out.append(block)
            i = j
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _pcbnew_grid_place(
    src: str, dst: str, board_width_mm: float, board_height_mm: float
) -> list[str]:
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
    step_x = (board_width_mm - 2 * margin) / max(1, cols)
    step_y = 15.0
    placed: list[str] = []

    for i, fp in enumerate(footprints):
        x = margin + (i % cols) * step_x + step_x / 2
        y = margin + (i // cols) * step_y
        fp.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(x), pcbnew.FromMM(y)))
        placed.append(fp.GetReference())

    pcbnew.SaveBoard(dst, board)
    return placed


def _inject_board_outline(pcb_text: str, width_mm: float, height_mm: float) -> str:
    """Remplace les gr_line Edge.Cuts existantes par un rectangle propre."""
    pcb_text = re.sub(
        r'\(gr_line[^)]*\([^)]*\)[^)]*"Edge\.Cuts"[^)]*\)',
        "",
        pcb_text,
        flags=re.DOTALL,
    )
    w, h = width_mm, height_mm
    outline = (
        f'\n  (gr_line (start 0 0) (end {w} 0) (layer "Edge.Cuts") (width 0.05))'
        f'\n  (gr_line (start {w} 0) (end {w} {h}) (layer "Edge.Cuts") (width 0.05))'
        f'\n  (gr_line (start {w} {h}) (end 0 {h}) (layer "Edge.Cuts") (width 0.05))'
        f'\n  (gr_line (start 0 {h}) (end 0 0) (layer "Edge.Cuts") (width 0.05))\n'
    )
    last = pcb_text.rfind(")")
    if last == -1:
        return pcb_text + outline
    return pcb_text[:last] + outline + pcb_text[last:]

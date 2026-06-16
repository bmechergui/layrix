"""
Layrix — Placement (tools/placement.py)

Délègue au workflow officiel kicad-tools (aucun algo custom) :
  1. place_components()  — positions explicites fournies par l'agent
  2. auto_place()        — placement auto 2 phases COMPLÉMENTAIRES :
       Phase 1 : PlacementOptimizer (physique locale, clustering, connecteurs ancrés)
       Phase 2 : run_optimize_placement --strategy cmaes --seed current
                 CMA-ES (CMAwM) seeded depuis Phase 1 → raffinement global
"""

from __future__ import annotations

import base64
import logging
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
# Mode 2 : auto-placement — 2 phases COMPLÉMENTAIRES
#   Phase 1 : PlacementOptimizer (physique locale, clustering, connecteurs ancrés)
#   Phase 2 : CMA-ES (CMAwM) via run_optimize_placement, seedé depuis Phase 1
# ---------------------------------------------------------------------------

# Phase 2 CMA-ES — nombre max d'itérations (budget mural en secondes)
_CMAES_MAX_ITER: int = 300
_CMAES_TIME_BUDGET: float = 60.0  # secondes max pour Phase 2


def _connector_refs(pcb) -> list[str]:
    """Références des connecteurs (J*, P*) — ancrés en Phase 1 (contrainte
    physique/mécanique) puis restaurés après la Phase 2 CMA-ES."""
    return [fp.reference for fp in pcb.footprints
            if fp.reference and fp.reference[0] in ("J", "P")]


def _clamp_fixed_refs_to_outline(pcb, fixed_refs: list[str], margin_mm: float = 2.0) -> list[str]:
    """Ramène les footprints ``fixed_refs`` à l'intérieur du contour Edge.Cuts.

    ``PlacementOptimizer`` traite ``fixed_refs`` comme des ancrages immobiles :
    si call_agent_gen_pcb a posé un connecteur hors-carte, l'optimiseur le laisse
    hors-carte → nets inroutables. On le clampe AVANT l'ancrage.
    """
    from kicad_tools.optim.board_outline import extract_board_outline

    outline = extract_board_outline(pcb)
    if outline is None or not outline.vertices:
        return []

    ox, oy = pcb.board_origin
    xs = [v.x - ox for v in outline.vertices]
    ys = [v.y - oy for v in outline.vertices]
    min_x, max_x = min(xs) + margin_mm, max(xs) - margin_mm
    min_y, max_y = min(ys) + margin_mm, max(ys) - margin_mm

    clamped: list[str] = []
    for fp in pcb.footprints:
        if fp.reference not in fixed_refs:
            continue
        x, y = fp.position
        cx = min(max(x, min_x), max_x)
        cy = min(max(y, min_y), max_y)
        if (cx, cy) != (x, y):
            logger.warning("connector %s hors-carte (%.2f,%.2f) -> clampé (%.2f,%.2f)",
                           fp.reference, x, y, cx, cy)
            fp.position = (cx, cy)
            clamped.append(fp.reference)
    return clamped


def auto_place(kicad_pcb_b64: str, board_width_mm: float, board_height_mm: float) -> dict:
    """Placement en 2 phases COMPLÉMENTAIRES (agent placement ⑤).

    Phase 1 — PlacementOptimizer (physique LOCALE) : regroupe les composants
      (``enable_clustering`` → quartz+caps, découplage) et ANCRE les connecteurs
      (``fixed_refs``, clampés dans le contour). Pose la structure.
    Phase 2 — CMA-ES (CMAwM, ``run_optimize_placement --strategy cmaes``) :
      seeded depuis les positions de Phase 1 (``seed_method="current"``).
      Raffinement global : minimise overlap + wirelength + boundary violation.
      CMAwM gère nativement x/y continus + rotation/side discrets. Complète
      Phase 1 sans repartir de zéro (≠ force-directed seed).

    Re-ancrage : positions connecteurs restaurées à celles de Phase 1 après la
    Phase 2 (garde-fou — CMA-ES pourrait micro-déplacer un connecteur).
    """
    pcb_bytes = base64.b64decode(kicad_pcb_b64)

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        interm = Path(tmp) / "phase1.kicad_pcb"
        out = Path(tmp) / "out.kicad_pcb"
        src.write_bytes(pcb_bytes)

        from kicad_tools.schema.pcb import PCB
        from kicad_tools.optim import PlacementOptimizer

        pcb = PCB.load(str(src))

        # Filet : footprints hors-carte (vieux PCB pré-placé à -1000) → place_unplaced
        if any(fp.position[0] < -100 or fp.position[1] < -100 for fp in pcb.footprints):
            from kicad_tools.placement.place_unplaced import place_unplaced
            place_unplaced(str(src), output_path=str(src), margin=2.0, spacing=2.0, cluster=True)
            pcb = PCB.load(str(src))
            logger.info("footprints hors-carte → place_unplaced appliqué")

        # ── Phase 1 : PlacementOptimizer (clustering + connecteurs ancrés) ──
        # enable_clustering=True → detect_functional_clusters (natif) regroupe
        # GÉNÉRIQUEMENT, sur N'IMPORTE QUEL board : quartz+caps de charge (TIMING),
        # caps de découplage près de l'alim (POWER), interface, driver — par
        # motif électronique, pas par références hardcodées.
        conn = _connector_refs(pcb)
        _clamp_fixed_refs_to_outline(pcb, conn)
        opt = PlacementOptimizer.from_pcb(pcb, fixed_refs=conn, enable_clustering=True)
        opt.run(iterations=1000)
        opt.snap_rotations_to_90()
        opt.write_to_pcb(pcb)
        pcb.save(str(interm))
        conn_positions = {fp.reference: fp.position
                          for fp in PCB.load(str(interm)).footprints
                          if fp.reference in conn}
        logger.info("Phase 1 - PlacementOptimizer: clustering + %d connecteurs ancrés", len(conn))

        # ── Phase 2 (COMPLÉMENTAIRE) : CMA-ES seedé depuis Phase 1 ──────────
        # run_optimize_placement avec seed_method="current" : encode les positions
        # de Phase 1 comme moyenne initiale CMA-ES → raffinement global autour
        # de la structure de Phase 1 (quartz groupé, connecteurs clampés).
        # CMAwM gère nativement x/y continus + rotation/side discrets.
        # Connecteurs verrouillés via locked flag ou fixed par Phase 1 clamp.
        try:
            from kicad_tools.cli.optimize_placement_cmd import run_optimize_placement

            rc = run_optimize_placement(
                str(interm),
                strategy_name="cmaes",
                max_iterations=_CMAES_MAX_ITER,
                output_path=str(out),
                seed_method="current",
                quiet=True,
                allow_infeasible=True,
                time_budget=_CMAES_TIME_BUDGET,
            )
            if not out.exists():
                raise RuntimeError(f"CMA-ES n'a produit aucun output (rc={rc})")
            logger.info("Phase 2 - CMA-ES terminé (rc=%d)", rc)
        except Exception as exc:
            logger.warning("Phase 2 - CMA-ES échoué (%s) — placement Phase 1 conservé", exc)
            out.write_bytes(interm.read_bytes())

        # ── Re-ancrage : restaurer les positions connecteurs de Phase 1 ──
        final = PCB.load(str(out))
        restored = 0
        for fp in final.footprints:
            anchor = conn_positions.get(fp.reference)
            if anchor is not None and fp.position != anchor:
                fp.position = anchor
                restored += 1
        if restored:
            final.save(str(out))
            logger.info("Re-ancrage : %d connecteur(s) restauré(s) post-CMA-ES", restored)

        footprints = PCB.load(str(out)).footprints
        return {
            "kicad_pcb_b64": base64.b64encode(out.read_bytes()).decode(),
            "kicad_pcb_phase1_b64": base64.b64encode(interm.read_bytes()).decode(),
            "placed_count": len(footprints),
            "positions": [
                {"ref": fp.reference,
                 "x": round(fp.position[0], 2), "y": round(fp.position[1], 2)}
                for fp in footprints
            ],
        }

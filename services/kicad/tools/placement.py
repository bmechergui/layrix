"""
Layrix — Placement (tools/placement.py)

Délègue au workflow officiel kicad-tools (aucun algo custom) :
  1. place_components()  — positions explicites fournies par l'agent
  2. auto_place()        — placement auto via l'API/CLI officielle :
       a. place_unplaced()          → placement initial (grille cluster-by-net)
       b. kct placement optimize    → raffinement (force-directed, connecteurs fixés)
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
# Mode 2 : auto-placement — raffinement CMA-ES (run_optimize_placement)
# ---------------------------------------------------------------------------

# CMA-ES borné en temps : un board peut avoir beaucoup de composants. La boucle
# d'optimisation sort dès que ce budget wall-clock est dépassé (best-effort).
_CMAES_MAX_ITERATIONS: int = 500
_CMAES_TIME_BUDGET_S: float = 120.0


def auto_place(kicad_pcb_b64: str, board_width_mm: float, board_height_mm: float) -> dict:
    """Raffine le placement d'un PCB déjà placé (par gen_pcb / PlacementOptimizer)
    via l'optimiseur officiel ``kct optimize-placement --strategy cmaes``.

    Architecture (2026-06-15) :
      · gen_pcb (tools/pcb.py)  → placement initial PlacementOptimizer force-directed
      · agent placement (ici)   → raffinement CMA-ES, TOUS composants mobiles

    CMA-ES (``run_optimize_placement``) re-génère lui-même son seed en
    force-directed (``seed_method="force-directed"``) puis optimise. **Aucun
    connecteur n'est ancré** — tous les composants sont mobiles (choix produit).
    ``allow_infeasible=True`` : on récupère le meilleur placement même si une
    légère infaisabilité subsiste (le routeur/DRC en aval gère), plutôt que de
    faire échouer l'étape. Sur erreur dure, on retourne le board d'entrée.
    """
    pcb_bytes = base64.b64decode(kicad_pcb_b64)

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        out = Path(tmp) / "out.kicad_pcb"
        src.write_bytes(pcb_bytes)

        from kicad_tools.schema.pcb import PCB
        from kicad_tools.cli.optimize_placement_cmd import run_optimize_placement

        try:
            rc = run_optimize_placement(
                str(src),
                strategy_name="cmaes",
                seed_method="force-directed",
                max_iterations=_CMAES_MAX_ITERATIONS,
                time_budget=_CMAES_TIME_BUDGET_S,
                output_path=str(out),
                allow_infeasible=True,
                quiet=True,
            )
            logger.info("CMA-ES optimize-placement terminé (rc=%s)", rc)
            if not out.exists():
                raise RuntimeError("optimize-placement n'a produit aucun output")
        except Exception as exc:
            logger.warning("CMA-ES échoué (%s) — placement d'entrée conservé", exc)
            out.write_bytes(pcb_bytes)

        footprints = PCB.load(str(out)).footprints
        return {
            "kicad_pcb_b64": base64.b64encode(out.read_bytes()).decode(),
            "placed_count": len(footprints),
            "positions": [
                {"ref": fp.reference,
                 "x": round(fp.position[0], 2), "y": round(fp.position[1], 2)}
                for fp in footprints
            ],
        }

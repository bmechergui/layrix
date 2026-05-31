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

def auto_place(
    kicad_pcb_b64: str,
    board_width_mm: float,
    board_height_mm: float,
) -> dict:
    pcb_text = base64.b64decode(kicad_pcb_b64).decode("utf-8", errors="replace")

    # Only inject Edge.Cuts when the PCB has no valid board outline.
    # PCBFromSchematic already writes correct Edge.Cuts at the board origin;
    # injecting new lines at (0,0) shifts the kicad-tools bounds by -board_origin
    # and causes CMA-ES to place footprints outside the visible board area.
    _needs_outline = '"Edge.Cuts"' not in pcb_text
    if _needs_outline:
        pcb_text = _inject_board_outline(pcb_text, board_width_mm, board_height_mm)

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        dst = Path(tmp) / "output.kicad_pcb"
        src.write_text(pcb_text, encoding="utf-8")

        # Primaire : kct optimize-placement CMA-ES
        # Utilise signal flow + power domains + proximity priors automatiquement.
        # Prend les positions grille de place_all_components() et les raffine.
        try:
            result = subprocess.run(
                [
                    sys.executable, "-m", "kicad_tools.cli", "optimize-placement",
                    str(src), "--output", str(dst),
                    "--strategy", "cmaes",
                    "--max-iterations", "300",
                    "--time-budget", "120",
                    "--seed", "force-directed",
                ],
                capture_output=True, text=True, timeout=130, check=False,
            )
            if dst.exists():
                output_bytes = dst.read_bytes()
                import re as _re
                fp_count = len(_re.findall(r'\(footprint\s+"', output_bytes.decode("utf-8", errors="replace")))
                logger.info("kct optimize-placement CMA-ES: %d footprints optimisés", fp_count)
                return {
                    "kicad_pcb_b64": base64.b64encode(output_bytes).decode(),
                    "placed_count": fp_count,
                    "positions": [],
                }
            logger.warning("kct optimize-placement: pas de sortie (rc=%d) — %s",
                           result.returncode, result.stderr[:200])
        except Exception as exc:
            logger.warning("kct optimize-placement échoué (%s) — fallback place_unplaced", exc)

        # Fallback 1 : place_unplaced cluster (pour composants hors-board)
        try:
            from kicad_tools.placement.place_unplaced import place_unplaced
            pu_result = place_unplaced(
                str(src), output_path=str(dst),
                margin=3.0, spacing=3.0, cluster=True,
            )
            output_bytes = dst.read_bytes() if dst.exists() else src.read_bytes()
            logger.info("place_unplaced fallback: %d composants placés", len(pu_result.placed_refs))
            return {
                "kicad_pcb_b64": base64.b64encode(output_bytes).decode(),
                "placed_count": len(pu_result.placed_refs),
                "positions": [{"ref": r} for r in pu_result.placed_refs],
            }
        except Exception as exc:
            logger.warning("place_unplaced échoué (%s) — fallback pcbnew grille", exc)

        # Fallback 2 : pcbnew grille simple
        placed = _pcbnew_grid_place(str(src), str(dst), board_width_mm, board_height_mm)
        output_bytes = dst.read_bytes() if dst.exists() else src.read_bytes()
        logger.info("pcbnew grille fallback: %d composants placés", len(placed))
        return {
            "kicad_pcb_b64": base64.b64encode(output_bytes).decode(),
            "placed_count": len(placed),
            "positions": [{"ref": r} for r in placed],
        }


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

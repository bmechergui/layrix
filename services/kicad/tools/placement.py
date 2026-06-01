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
    """Auto-placement via kicad-tools place_unplaced (cluster-by-net).

    Recipe (works for discrete circuits AND large modules like Arduino/STM32):
      1. Use a generous working board so the grid cells (sized to the largest
         footprint) all fit — avoids overflow on big shield footprints.
      2. Move every footprint outside the board → marks them "unplaced".
      3. place_unplaced(cluster=True) lays them out in a net-clustered grid.
      4. Fit the final Edge.Cuts tightly around the placed components.
    """
    pcb_bytes = base64.b64decode(kicad_pcb_b64)

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        dst = Path(tmp) / "output.kicad_pcb"

        try:
            from kicad_tools.schema.pcb import PCB
            from kicad_tools.placement.place_unplaced import place_unplaced, _get_board_bounds

            import math as _math
            src.write_bytes(pcb_bytes)
            pcb = PCB.load(str(src))
            n = len(list(pcb.footprints))
            # Grid sized so place_unplaced wraps into rows (cell = 70mm covers
            # Arduino UNO R3 68×53mm). A rectangle cols×rows forces wrapping;
            # a too-wide board would lay everything in a single row.
            cols = max(1, _math.ceil(n ** 0.5))
            rows = max(1, _math.ceil(n / cols))
            cell = 70.0
            work_w = max(board_width_mm, cols * cell)
            work_h = max(board_height_mm, rows * cell)

            # 1. Set the working board via the official PCB API (no regex)
            pcb.replace_outline(0.0, 0.0, work_w, work_h)

            # 2. Move all footprints outside the board → "unplaced"
            bounds = _get_board_bounds(pcb)
            for fp in pcb.footprints:
                fp.position = (bounds[0], bounds[1] - 60.0)
            pcb.save(str(src))

            # 3. place_unplaced clusters them into a grid inside the board
            result = place_unplaced(
                str(src), output_path=str(dst),
                margin=3.0, spacing=3.0, cluster=True,
            )
            placed_count = len(result.placed_refs)
            logger.info(
                "place_unplaced: %d placés, %d overflow (board %.0f×%.0fmm)",
                placed_count, len(result.overflow_refs), work_w, work_h,
            )

            # 4. Fit board outline tightly around placed components (official API)
            placed_pcb = PCB.load(str(dst))
            xs = [fp.position[0] for fp in placed_pcb.footprints]
            ys = [fp.position[1] for fp in placed_pcb.footprints]
            if xs:
                m = 10.0
                placed_pcb.replace_outline(
                    min(xs) - m, min(ys) - m,
                    (max(xs) - min(xs)) + 2 * m, (max(ys) - min(ys)) + 2 * m,
                )
                placed_pcb.save(str(dst))

            return {
                "kicad_pcb_b64": base64.b64encode(dst.read_bytes()).decode(),
                "placed_count": placed_count,
                "positions": [{"ref": r} for r in result.placed_refs],
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
    """Create Edge.Cuts rectangle fitted to placed footprint positions + margin."""
    import uuid as _uuid
    text = pcb_bytes.decode("utf-8", errors="replace")

    xs, ys = [], []
    for m in re.finditer(r'^\s+\(at\s+([\d.\-]+)\s+([\d.\-]+)\)\s*$', text, re.MULTILINE):
        xs.append(float(m.group(1)))
        ys.append(float(m.group(2)))
    if not xs:
        return pcb_bytes

    x0 = round(min(xs) - margin_mm, 2)
    y0 = round(min(ys) - margin_mm, 2)
    x1 = round(max(xs) + margin_mm, 2)
    y1 = round(max(ys) + margin_mm, 2)

    # Remove existing Edge.Cuts (gr_line and gr_rect)
    text = re.sub(r'\(gr_line[^)]*"Edge\.Cuts"[^)]*\)', "", text, flags=re.DOTALL)
    text = re.sub(
        r'\(gr_rect\s+\(start[^)]*\)\s+\(end[^)]*\)[\s\S]*?"Edge\.Cuts"[\s\S]*?\)\)',
        "", text,
    )
    outline = (
        f'\n  (gr_rect (start {x0} {y0}) (end {x1} {y1})'
        f'\n    (stroke (width 0.1) (type solid)) (fill none) (layer "Edge.Cuts")'
        f'\n    (uuid "{_uuid.uuid4()}"))\n'
    )
    last = text.rfind(")")
    if last >= 0:
        text = text[:last] + outline + text[last:]
    return text.encode("utf-8")


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

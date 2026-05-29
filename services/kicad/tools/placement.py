"""
Layrix — Placement pcbnew
Deux modes :
  1. place_components(pcb_path, components, output_path) — positions explicites fournies par l'agent
  2. auto_place(pcb_b64, board_w, board_h) → dict  — CMA-ES via kicad-tools, I/O base64
"""

from __future__ import annotations

import base64
import logging
import tempfile
from pathlib import Path

from tools.placement_layout import compute_layout

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers pcbnew
# ---------------------------------------------------------------------------

def _load_pcbnew():
    try:
        import pcbnew  # type: ignore
        return pcbnew
    except ImportError as exc:
        raise ImportError(
            "pcbnew non disponible — KiCad doit être installé dans l'environnement Python"
        ) from exc


# ---------------------------------------------------------------------------
# Mode 1 : placement explicite (coordonnées fournies)
# ---------------------------------------------------------------------------

def place_components(pcb_path: str, components: list[dict], output_path: str) -> dict:
    pcbnew = _load_pcbnew()
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
# Mode 2 : auto-placement (kicad-tools CMA-ES → fallback grille)
# ---------------------------------------------------------------------------

def auto_place(
    kicad_pcb_b64: str,
    board_width_mm: float,
    board_height_mm: float,
) -> dict:
    """
    Auto-placement via kicad-tools CMA-ES.
    Fallback sur placement grille (placement_layout.py) si kicad-tools absent.
    I/O base64 — aucun filesystem partagé requis.
    """
    pcbnew = _load_pcbnew()
    pcb_bytes = base64.b64decode(kicad_pcb_b64)

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        resized = Path(tmp) / "resized.kicad_pcb"
        dst = Path(tmp) / "output.kicad_pcb"
        src.write_bytes(pcb_bytes)

        # Étape 1 : redimensionner le contour PCB via pcbnew
        board = pcbnew.LoadBoard(str(src))
        _resize_board(board, board_width_mm, board_height_mm, pcbnew)
        pcbnew.SaveBoard(str(resized), board)

        placed_refs: list[str] = []

        # Étape 2 : placement CMA-ES via kicad-tools
        try:
            from kicad_tools.placement.place_unplaced import place_unplaced
            result = place_unplaced(
                str(resized),
                output=str(dst),
                margin=1.5,
                spacing=1.5,
                cluster=True,
            )
            placed_refs = result.placed_refs
            logger.info(
                "kicad-tools place_unplaced: %d placed, %d overflow",
                result.placed_count,
                result.overflow_count,
            )
        except Exception as exc:
            logger.warning("kicad-tools placement failed (%s) — fallback grille", exc)
            placed_refs = _fallback_grid_place(resized, dst, board_width_mm, board_height_mm, pcbnew)

        positions = [{"ref": r} for r in placed_refs]
        return {
            "kicad_pcb_b64": base64.b64encode(dst.read_bytes()).decode(),
            "placed_count": len(placed_refs),
            "positions": positions,
        }


def _fallback_grid_place(
    src: Path,
    dst: Path,
    board_width_mm: float,
    board_height_mm: float,
    pcbnew,
) -> list[str]:
    """Placement grille déterministe — fallback si kicad-tools absent."""
    board = pcbnew.LoadBoard(str(src))
    footprints = list(board.GetFootprints())
    refs = [fp.GetReference() for fp in footprints]

    if not refs:
        pcbnew.SaveBoard(str(dst), board)
        return []

    layout = compute_layout(refs, board_width_mm, board_height_mm)
    placed: list[str] = []

    for fp in footprints:
        ref = fp.GetReference()
        if ref not in layout:
            continue
        x_mm, y_mm, rotation = layout[ref]
        fp.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(x_mm), pcbnew.FromMM(y_mm)))
        if hasattr(fp, "SetOrientationDegrees"):
            fp.SetOrientationDegrees(rotation)
        placed.append(ref)

    pcbnew.SaveBoard(str(dst), board)
    return placed


def _resize_board(board, width_mm: float, height_mm: float, pcbnew) -> None:
    """Redimensionne le contour du PCB (Edge.Cuts) aux dimensions demandées."""
    edge_layer = pcbnew.Edge_Cuts

    to_remove = [item for item in board.GetDrawings() if item.GetLayer() == edge_layer]
    for item in to_remove:
        board.Remove(item)

    w_nm = pcbnew.FromMM(width_mm)
    h_nm = pcbnew.FromMM(height_mm)

    corners = [
        (0, 0, w_nm, 0),
        (w_nm, 0, w_nm, h_nm),
        (w_nm, h_nm, 0, h_nm),
        (0, h_nm, 0, 0),
    ]

    for x1, y1, x2, y2 in corners:
        seg = pcbnew.PCB_SHAPE(board)
        seg.SetShape(pcbnew.SHAPE_T_SEGMENT)
        seg.SetLayer(edge_layer)
        seg.SetStart(pcbnew.VECTOR2I(x1, y1))
        seg.SetEnd(pcbnew.VECTOR2I(x2, y2))
        seg.SetWidth(pcbnew.FromMM(0.05))
        board.Add(seg)

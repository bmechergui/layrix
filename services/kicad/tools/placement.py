"""
Layrix — Placement pcbnew
Deux modes :
  1. place_components(pcb_path, components, output_path) — positions explicites fournies par l'agent
  2. auto_place(pcb_b64, board_w, board_h) → dict  — algorithme grille automatique, I/O base64
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
    """Import pcbnew — lève ImportError avec message clair si absent."""
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
    """
    Place les footprints aux coordonnées explicites fournies.

    Args:
        pcb_path: Chemin absolu du .kicad_pcb source
        components: Liste de {ref, x_mm, y_mm, rotation, side}
        output_path: Chemin de sortie du .kicad_pcb modifié

    Returns:
        {status, path, placed, errors}
    """
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
        else:  # KiCad 5/6 fallback
            fp.SetPosition(pcbnew.wxPoint(x_iu, y_iu))

        rotation = float(comp.get("rotation", 0.0))
        if hasattr(fp, "SetOrientationDegrees"):
            fp.SetOrientationDegrees(rotation)
        else:  # KiCad 5/6 expects deci-degrees
            fp.SetOrientation(rotation * 10)

        if comp.get("side") == "back":
            fp.Flip(fp.GetPosition(), False)

        placed.append(comp["ref"])

    pcbnew.SaveBoard(output_path, board)

    return {
        "status": "ok",
        "path": output_path,
        "placed": len(placed),
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Mode 2 : auto-placement (planner guidé — IC centre, passifs cluster, conn bord)
# ---------------------------------------------------------------------------

def auto_place(
    kicad_pcb_b64: str,
    board_width_mm: float,
    board_height_mm: float,
) -> dict:
    """
    Auto-placement guidé depuis un .kicad_pcb encodé en base64.

    Délègue le calcul des positions à ``tools.placement_layout.compute_layout``
    pour garantir la parité avec le fallback TypeScript.

    Args:
        kicad_pcb_b64: Contenu du .kicad_pcb encodé base64
        board_width_mm: Largeur du PCB en mm
        board_height_mm: Hauteur du PCB en mm

    Returns:
        {kicad_pcb_b64: str, placed_count: int, positions: list[{ref, x_mm, y_mm}]}
    """
    pcbnew = _load_pcbnew()

    pcb_bytes = base64.b64decode(kicad_pcb_b64)

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        dst = Path(tmp) / "output.kicad_pcb"
        src.write_bytes(pcb_bytes)

        board = pcbnew.LoadBoard(str(src))

        # Recadrer le PCB aux dimensions demandées
        _resize_board(board, board_width_mm, board_height_mm, pcbnew)

        footprints = list(board.GetFootprints())
        refs = [fp.GetReference() for fp in footprints]

        if not refs:
            pcbnew.SaveBoard(str(dst), board)
            return {
                "kicad_pcb_b64": base64.b64encode(dst.read_bytes()).decode(),
                "placed_count": 0,
                "positions": [],
            }

        layout = compute_layout(refs, board_width_mm, board_height_mm)

        placement_log: list[dict] = []
        for fp in footprints:
            ref = fp.GetReference()
            if ref not in layout:
                continue
            x_mm, y_mm, rotation = layout[ref]
            fp.SetPosition(pcbnew.VECTOR2I(
                pcbnew.FromMM(x_mm),
                pcbnew.FromMM(y_mm),
            ))
            if hasattr(fp, "SetOrientationDegrees"):
                fp.SetOrientationDegrees(rotation)
            placement_log.append({
                "ref": ref,
                "x_mm": round(x_mm, 3),
                "y_mm": round(y_mm, 3),
            })

        pcbnew.SaveBoard(str(dst), board)

        return {
            "kicad_pcb_b64": base64.b64encode(dst.read_bytes()).decode(),
            "placed_count": len(placement_log),
            "positions": placement_log,
        }


def _resize_board(board, width_mm: float, height_mm: float, pcbnew) -> None:
    """
    Redimensionne le contour du PCB (Edge.Cuts) aux dimensions demandées.
    Supprime l'ancien contour et crée un rectangle propre.
    """
    edge_layer = pcbnew.Edge_Cuts

    # Supprimer anciens segments Edge.Cuts
    to_remove = [item for item in board.GetDrawings() if item.GetLayer() == edge_layer]
    for item in to_remove:
        board.Remove(item)

    # Créer rectangle : (0,0) → (width, height) en nm
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

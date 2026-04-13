"""
Layrix — Placement pcbnew
Deux modes :
  1. place_components(pcb_path, components, output_path) — positions explicites fournies par l'agent
  2. auto_place(pcb_b64, board_w, board_h) → dict  — algorithme grille automatique, I/O base64
"""

from __future__ import annotations

import base64
import logging
import math
import tempfile
from pathlib import Path
from typing import TypedDict

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

        fp.SetPosition(pcbnew.VECTOR2I(
            pcbnew.FromMM(float(comp["x_mm"])),
            pcbnew.FromMM(float(comp["y_mm"])),
        ))
        fp.SetOrientationDegrees(float(comp.get("rotation", 0.0)))

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
# Mode 2 : auto-placement (algorithme grille)
# ---------------------------------------------------------------------------

class _FpInfo(TypedDict):
    ref: str
    width_nm: int   # bounding box width  en nanomètres (unités internes KiCad)
    height_nm: int  # bounding box height en nanomètres
    net_count: int  # nombre de nets connectés — heuristique priorité


def _footprint_info(fp, pcbnew) -> _FpInfo:
    """Extrait dimensions + connectivité d'un footprint."""
    bbox = fp.GetBoundingBox()
    nets = {pad.GetNetname() for pad in fp.Pads() if pad.GetNetname()}
    return _FpInfo(
        ref=fp.GetReference(),
        width_nm=bbox.GetWidth(),
        height_nm=bbox.GetHeight(),
        net_count=len(nets),
    )


def _grid_positions(
    fps_info: list[_FpInfo],
    board_w_mm: float,
    board_h_mm: float,
    margin_mm: float = 2.0,
    gap_mm: float = 1.5,
) -> dict[str, tuple[float, float]]:
    """
    Calcule des positions en grille adaptative pour tous les footprints.

    Stratégie :
      - Trier par net_count desc (composants les plus connectés d'abord)
      - Empiler ligne par ligne de gauche à droite
      - Largeur ligne = board_w_mm - 2*margin_mm
      - Passer à la ligne suivante dès que la prochaine pièce dépasse la largeur

    Returns:
        {ref: (x_mm, y_mm)} — coin supérieur gauche du footprint centré
    """
    nm_to_mm = 1 / 1_000_000  # 1 nm = 0.000001 mm  (pcbnew interne = nm)

    usable_w = board_w_mm - 2 * margin_mm

    # Trier : plus connecté d'abord, puis plus grand
    sorted_fps = sorted(fps_info, key=lambda f: (-f["net_count"], -f["width_nm"]))

    positions: dict[str, tuple[float, float]] = {}
    cursor_x = margin_mm
    cursor_y = margin_mm
    row_max_h = 0.0

    for fp in sorted_fps:
        w = fp["width_nm"] * nm_to_mm + gap_mm
        h = fp["height_nm"] * nm_to_mm + gap_mm

        if cursor_x + w > board_w_mm - margin_mm and cursor_x > margin_mm:
            # Nouvelle ligne
            cursor_y += row_max_h
            cursor_x = margin_mm
            row_max_h = 0.0

        # Centre du footprint
        cx = cursor_x + w / 2.0
        cy = cursor_y + h / 2.0

        # Garde les composants dans le PCB verticalement
        if cy + h / 2.0 > board_h_mm - margin_mm:
            logger.warning(
                "Footprint %s dépasse la hauteur du PCB — placé au bord", fp["ref"]
            )
            cy = board_h_mm - margin_mm - h / 2.0

        positions[fp["ref"]] = (cx, cy)
        cursor_x += w
        row_max_h = max(row_max_h, h)

    return positions


def auto_place(
    kicad_pcb_b64: str,
    board_width_mm: float,
    board_height_mm: float,
) -> dict:
    """
    Auto-placement en grille depuis un .kicad_pcb encodé en base64.

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

        # Collecter les infos footprints
        fps_info: list[_FpInfo] = [
            _footprint_info(fp, pcbnew) for fp in board.GetFootprints()
        ]

        if not fps_info:
            pcbnew.SaveBoard(str(dst), board)
            return {
                "kicad_pcb_b64": base64.b64encode(dst.read_bytes()).decode(),
                "placed_count": 0,
                "positions": [],
            }

        # Calculer positions
        positions = _grid_positions(fps_info, board_width_mm, board_height_mm)

        # Appliquer positions
        placement_log: list[dict] = []
        for fp in board.GetFootprints():
            ref = fp.GetReference()
            if ref not in positions:
                continue
            x_mm, y_mm = positions[ref]
            fp.SetPosition(pcbnew.VECTOR2I(
                pcbnew.FromMM(x_mm),
                pcbnew.FromMM(y_mm),
            ))
            placement_log.append({"ref": ref, "x_mm": round(x_mm, 3), "y_mm": round(y_mm, 3)})

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

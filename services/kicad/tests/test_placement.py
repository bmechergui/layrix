"""Tests — auto_place() (tools/placement.py), TDD.

Architecture (2026-06-15) :
  - gen_pcb (tools/pcb.py)      → placement initial PlacementOptimizer (force-directed)
  - agent placement (auto_place) → raffinement CMA-ES (run_optimize_placement,
    --strategy cmaes), TOUS composants mobiles (aucun ancrage de connecteur).

CMA-ES re-seed lui-même en force-directed (il ignore les positions d'entrée) :
on ne teste donc plus « le connecteur ne bouge pas » (invariant supprimé — les
connecteurs sont mobiles comme les autres). L'invariant garanti devient :
**tous les composants finissent dans le contour Edge.Cuts** (placement legal).
"""
from __future__ import annotations

import base64
from pathlib import Path

from kicad_tools.schema.pcb import PCB

from tools.placement import auto_place

_BOARD_W_MM, _BOARD_H_MM = 60.0, 40.0


def _footprint_sexp(ref: str, uuid: str, x_abs: float, y_abs: float) -> str:
    """Footprint minimal (connecteur 2 broches) à la position sheet-absolute donnée."""
    return f"""\
  (footprint "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical"
    (layer "F.Cu")
    (uuid "{uuid}")
    (at {x_abs} {y_abs})
    (property "Reference" "{ref}" (at 0 -2 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "Conn" (at 0 2 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (pad "1" thru_hole circle (at 0 0) (size 1.7 1.7) (drill 1)
      (layers "*.Cu" "*.Mask") (net 0 ""))
    (pad "2" thru_hole circle (at 0 2.54) (size 1.7 1.7) (drill 1)
      (layers "*.Cu" "*.Mask") (net 0 ""))
  )
"""


def _board_with_footprints(
    tmp_path: Path,
    refs_board_xy: dict[str, tuple[float, float]],
) -> bytes:
    """Board 60x40mm centré (PCB.create(center=True), défaut prod) + footprints
    injectés aux positions board-relative données (converties en sheet-absolute)."""
    pcb = PCB.create(width=_BOARD_W_MM, height=_BOARD_H_MM, layers=2)
    ox, oy = pcb.board_origin
    board_path = tmp_path / "board.kicad_pcb"
    pcb.save(str(board_path))

    text = board_path.read_text(encoding="utf-8")
    close_idx = text.rstrip().rfind(")")

    inject = ""
    for i, (ref, (bx, by)) in enumerate(refs_board_xy.items()):
        uuid = f"{i:08d}-0000-0000-0000-000000000000"
        inject += _footprint_sexp(ref, uuid, ox + bx, oy + by)

    text = text[:close_idx] + inject + text[close_idx:]
    board_path.write_text(text, encoding="utf-8")
    return board_path.read_bytes()


def test_auto_place_keeps_all_components_on_board(tmp_path):
    """Invariant CMA-ES : après auto_place, TOUS les composants sont dans le
    contour Edge.Cuts [0,W]x[0,H] — même un connecteur arrivé hors-carte."""
    pcb_bytes = _board_with_footprints(
        tmp_path,
        {"J1": (30.0, 135.0),   # hors-carte en entrée (y=135 > 40)
         "J2": (10.0, 10.0),
         "J3": (50.0, 30.0)},
    )
    b64 = base64.b64encode(pcb_bytes).decode()

    result = auto_place(b64, _BOARD_W_MM, _BOARD_H_MM)

    for pos in result["positions"]:
        assert 0.0 <= pos["x"] <= _BOARD_W_MM, f"{pos['ref']}.x={pos['x']} hors [0,{_BOARD_W_MM}]"
        assert 0.0 <= pos["y"] <= _BOARD_H_MM, f"{pos['ref']}.y={pos['y']} hors [0,{_BOARD_H_MM}]"


def test_auto_place_returns_all_components(tmp_path):
    """auto_place retourne bien tous les composants placés."""
    pcb_bytes = _board_with_footprints(
        tmp_path, {"J1": (10.0, 10.0), "J2": (30.0, 20.0), "J3": (50.0, 30.0)},
    )
    b64 = base64.b64encode(pcb_bytes).decode()

    result = auto_place(b64, _BOARD_W_MM, _BOARD_H_MM)

    assert result["placed_count"] == 3
    assert {p["ref"] for p in result["positions"]} == {"J1", "J2", "J3"}
    assert result["kicad_pcb_b64"]

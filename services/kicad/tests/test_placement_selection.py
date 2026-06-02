"""Definitive placement strategy: candidates -> validate (courtyard) -> select.

auto_place must NEVER return a placement with courtyard/clearance conflicts
(Layrix rule: no overlapping/DRC-violating boards). Among feasible candidates
it picks the lowest HPWL (shortest wirelength). The clean place_unplaced grid
is the reliably-feasible baseline; CMA-ES is kept only when it is feasible.
"""
import base64
import re
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

GENERATED = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test\meteo_arduino.kicad_pcb")

pytestmark = pytest.mark.skipif(
    not GENERATED.exists(),
    reason="run tests/test_full_pipeline.py first to generate meteo_arduino.kicad_pcb",
)


def _clean_bytes() -> bytes:
    """place_unplaced output — spread, 0 conflicts."""
    from kicad_tools.placement.place_unplaced import place_unplaced
    tmp = Path(tempfile.mkdtemp())
    out = tmp / "clean.kicad_pcb"
    place_unplaced(str(GENERATED), output_path=str(out), margin=3.0, spacing=3.0, cluster=True)
    return out.read_bytes()


def _overlap_bytes() -> bytes:
    """All footprints stacked on one point — guaranteed courtyard conflicts."""
    from kicad_tools.schema.pcb import PCB
    pcb = PCB.load(str(GENERATED))
    for fp in pcb.footprints:
        pcb.update_footprint_position(fp.reference, 50.0, 50.0, rotation=0)
    tmp = Path(tempfile.mkdtemp())
    out = tmp / "overlap.kicad_pcb"
    pcb.save(str(out))
    return out.read_bytes()


def test_count_conflicts_flags_overlap_and_clears_spread():
    from tools.placement import _count_placement_conflicts
    assert _count_placement_conflicts(_overlap_bytes()) > 0
    assert _count_placement_conflicts(_clean_bytes()) == 0


def test_select_rejects_overlapping_candidate():
    from tools.placement import _select_best_placement
    clean = _clean_bytes()
    chosen = _select_best_placement([
        {"name": "cmaes", "bytes": _overlap_bytes(), "placed_refs": ["U1"]},
        {"name": "place_unplaced", "bytes": clean, "placed_refs": ["U1"]},
    ])
    assert chosen["name"] == "place_unplaced"
    assert chosen["bytes"] == clean


def test_auto_place_meteo_has_zero_conflicts():
    from tools.placement import auto_place, _count_placement_conflicts
    src = GENERATED.read_bytes()
    res = auto_place(base64.b64encode(src).decode(), 200.0, 160.0)
    out = base64.b64decode(res["kicad_pcb_b64"])
    assert res["placed_count"] == 5
    assert _count_placement_conflicts(out) == 0, "auto_place returned an overlapping placement"

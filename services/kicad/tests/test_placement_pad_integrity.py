"""Placement must NOT collapse footprint pads.

Root cause of routing 0% (2026-06-02): the CMA-ES seed writer
(_write_placements_to_pcb) overwrote every (at ...) line inside a footprint —
including pads — stacking all pads onto one point, so the router found no path.
These tests assert each footprint keeps as many distinct pad coordinates as it
has pads, through place_unplaced AND the CMA-ES _optimize_with_priors step.
"""
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


def _pad_uniqueness(pcb_path: str) -> list[tuple[str, int, int]]:
    """Return [(footprint_name, n_pads, n_distinct_pad_positions), ...]."""
    text = Path(pcb_path).read_text(encoding="utf-8", errors="replace")
    rows = []
    for blk in text.split("\n\t(footprint ")[1:]:
        name = blk[:40].split('"')[1] if '"' in blk[:40] else "?"
        pats = re.findall(r'\(pad "[^"]+"[^\n]*\n\s*\(at ([\d.\-]+) ([\d.\-]+)', blk)
        rows.append((name, len(pats), len(set(pats))))
    return rows


def _place_unplaced(src_path: str, dst_path: str) -> None:
    from kicad_tools.placement.place_unplaced import place_unplaced
    place_unplaced(src_path, output_path=dst_path, margin=3.0, spacing=3.0, cluster=True)


def test_optimize_with_priors_preserves_pad_positions():
    from tools.placement import _optimize_with_priors

    tmp = Path(tempfile.mkdtemp())
    placed = tmp / "placed.kicad_pcb"
    _place_unplaced(str(GENERATED), str(placed))

    # Sanity: place_unplaced keeps pads distinct
    for name, n_pads, n_uniq in _pad_uniqueness(str(placed)):
        assert n_uniq == n_pads, f"place_unplaced already collapsed {name}"

    out = tmp / "opt.kicad_pcb"
    ok = _optimize_with_priors(str(placed), str(out), max_iterations=40, time_budget=15.0)
    assert ok and out.exists(), "optimize did not produce output"

    for name, n_pads, n_uniq in _pad_uniqueness(str(out)):
        assert n_uniq == n_pads, (
            f"{name}: pads collapsed by CMA-ES — {n_uniq} distinct of {n_pads}"
        )

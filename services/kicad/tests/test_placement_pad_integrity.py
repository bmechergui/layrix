"""Placement must NOT collapse footprint pads.

Root cause of routing 0% (2026-06-02): the CMA-ES seed writer
(_write_placements_to_pcb) overwrote every (at ...) line inside a footprint —
including pads — stacking all pads onto one point, so the router found no path.
_optimize_with_priors was removed from placement.py (refactor 2026-06-02) as it
was no longer in the pipeline; the integrity guarantee is now tested via auto_place.
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


def _pad_uniqueness(pcb_bytes: bytes) -> list[tuple[str, int, int]]:
    """Return [(footprint_name, n_pads, n_distinct_pad_positions), ...]."""
    text = pcb_bytes.decode("utf-8", errors="replace")
    rows = []
    for blk in text.split("\n\t(footprint ")[1:]:
        name = blk[:40].split('"')[1] if '"' in blk[:40] else "?"
        pats = re.findall(r'\(pad "[^"]+"[^\n]*\n\s*\(at ([\d.\-]+) ([\d.\-]+)', blk)
        rows.append((name, len(pats), len(set(pats))))
    return rows


def test_auto_place_preserves_pad_positions():
    """auto_place must not collapse footprint pads (root cause of routing 0%)."""
    from tools.placement import auto_place

    src = GENERATED.read_bytes()
    res = auto_place(base64.b64encode(src).decode(), 200.0, 160.0)
    out = base64.b64decode(res["kicad_pcb_b64"])

    for name, n_pads, n_uniq in _pad_uniqueness(out):
        assert n_uniq == n_pads, (
            f"{name}: pads collapsed after auto_place — {n_uniq} distinct of {n_pads}"
        )

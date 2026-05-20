"""Integration tests for the pcbnew-backed ``auto_place`` and ``place_components``.

These tests are SKIPPED when ``pcbnew`` is not importable (e.g. Windows dev box
without KiCad). They run inside the Docker container or on any host with
KiCad 7+ Python bindings installed.

Coverage of the pure layout math itself lives in ``test_placement_layout.py`` —
this module only verifies the wiring layer (base64 round-trip, board mutation,
refs match between input pcb and computed layout).
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

import pytest

# pcbnew gating — entire module skipped if KiCad bindings are absent
pcbnew = pytest.importorskip("pcbnew")  # noqa: F841

# Allow imports from services/kicad/tools without installing the package
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent))

from tools.placement import auto_place, place_components  # noqa: E402


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def minimal_pcb_b64() -> str:
    """Build a tiny .kicad_pcb in memory with a few footprints for testing.

    The board has: 1 IC (U1), 2 resistors (R1, R2), 1 connector (J1).
    All start at (0, 0); auto_place should move them.
    """
    import pcbnew  # noqa: F401 — already imported, just re-bind locally

    board = pcbnew.BOARD()
    board.SetCopperLayerCount(2)

    # Stub footprints — minimal valid pcbnew Footprint objects
    def _add_fp(ref: str) -> None:
        fp = pcbnew.FOOTPRINT(board)
        fp.SetReference(ref)
        board.Add(fp)

    for ref in ("U1", "R1", "R2", "J1"):
        _add_fp(ref)

    # Serialize to temp file then read+encode
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".kicad_pcb", delete=False) as tmp:
        path = tmp.name
    pcbnew.SaveBoard(path, board)
    raw = Path(path).read_bytes()
    Path(path).unlink(missing_ok=True)
    return base64.b64encode(raw).decode("ascii")


# ============================================================================
# auto_place — base64 round-trip + planner integration
# ============================================================================


class TestAutoPlace:
    def test_returns_required_keys(self, minimal_pcb_b64: str) -> None:
        result = auto_place(
            kicad_pcb_b64=minimal_pcb_b64,
            board_width_mm=80.0,
            board_height_mm=60.0,
        )
        assert "kicad_pcb_b64" in result
        assert "placed_count" in result
        assert "positions" in result

    def test_placed_count_matches_input(self, minimal_pcb_b64: str) -> None:
        result = auto_place(
            kicad_pcb_b64=minimal_pcb_b64,
            board_width_mm=80.0,
            board_height_mm=60.0,
        )
        assert result["placed_count"] == 4  # U1 R1 R2 J1

    def test_positions_contain_each_ref(self, minimal_pcb_b64: str) -> None:
        result = auto_place(
            kicad_pcb_b64=minimal_pcb_b64,
            board_width_mm=80.0,
            board_height_mm=60.0,
        )
        refs = {p["ref"] for p in result["positions"]}
        assert refs == {"U1", "R1", "R2", "J1"}

    def test_ic_placed_near_center(self, minimal_pcb_b64: str) -> None:
        result = auto_place(
            kicad_pcb_b64=minimal_pcb_b64,
            board_width_mm=80.0,
            board_height_mm=60.0,
        )
        u1 = next(p for p in result["positions"] if p["ref"] == "U1")
        # IC must land near the center (40, 30)
        assert abs(u1["x_mm"] - 40.0) < 5.0
        assert abs(u1["y_mm"] - 30.0) < 5.0

    def test_connector_on_edge(self, minimal_pcb_b64: str) -> None:
        result = auto_place(
            kicad_pcb_b64=minimal_pcb_b64,
            board_width_mm=80.0,
            board_height_mm=60.0,
        )
        j1 = next(p for p in result["positions"] if p["ref"] == "J1")
        # Left or right edge — not the center
        assert j1["x_mm"] < 10.0 or j1["x_mm"] > 70.0

    def test_output_b64_decodes_to_valid_pcb(self, minimal_pcb_b64: str) -> None:
        result = auto_place(
            kicad_pcb_b64=minimal_pcb_b64,
            board_width_mm=80.0,
            board_height_mm=60.0,
        )
        raw = base64.b64decode(result["kicad_pcb_b64"])
        assert raw.startswith(b"(kicad_pcb"), "decoded payload is not a kicad_pcb"


# ============================================================================
# place_components — explicit positions
# ============================================================================


class TestPlaceComponents:
    def test_places_listed_refs(self, tmp_path: Path, minimal_pcb_b64: str) -> None:
        in_path = tmp_path / "in.kicad_pcb"
        out_path = tmp_path / "out.kicad_pcb"
        in_path.write_bytes(base64.b64decode(minimal_pcb_b64))

        result = place_components(
            pcb_path=str(in_path),
            components=[
                {"ref": "U1", "x_mm": 25.0, "y_mm": 25.0, "rotation": 0.0, "side": "front"},
                {"ref": "R1", "x_mm": 10.0, "y_mm": 10.0, "rotation": 90.0, "side": "front"},
            ],
            output_path=str(out_path),
        )
        assert result["status"] == "ok"
        assert result["placed"] == 2
        assert out_path.exists()

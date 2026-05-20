"""RED tests for the pure-Python placement planner.

The planner classifies each footprint by reference designator and computes a
(x_mm, y_mm, rotation_deg) layout from a refs list + board dimensions. It is a
pure function: no pcbnew, no filesystem, no network. Both the Python pcbnew
backend and the TypeScript fallback must produce identical positions for the
same input.

These tests pin down the contract before the implementation lands.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Allow imports from services/kicad/tools without installing the package
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent))

from tools.placement_layout import (  # noqa: E402
    CLUSTER_RADIUS_BASE_MM,
    CLUSTER_RADIUS_STEP_MM,
    EDGE_OFFSET_MM,
    IC_SPACING_MM,
    MARGIN_MM,
    classify_kind,
    compute_layout,
)


# ============================================================================
# classify_kind — reference designator → kind
# ============================================================================


class TestClassifyKind:
    @pytest.mark.parametrize(
        "ref,expected",
        [
            ("U1", "IC"),
            ("U10", "IC"),
            ("U999", "IC"),
            ("IC1", "IC"),
            ("IC42", "IC"),
            ("R1", "RES"),
            ("R100", "RES"),
            ("C1", "CAP"),
            ("C12", "CAP"),
            ("D1", "DIODE"),
            ("D5", "DIODE"),
            ("LED1", "DIODE"),
            ("LED99", "DIODE"),
            ("J1", "CONN"),
            ("J7", "CONN"),
            ("P1", "CONN"),
            ("P3", "CONN"),
            ("TP1", "MISC"),
            ("Y1", "MISC"),
            ("X1", "MISC"),
        ],
    )
    def test_table(self, ref: str, expected: str) -> None:
        assert classify_kind(ref) == expected

    def test_lowercase_is_handled(self) -> None:
        assert classify_kind("u1") == "IC"
        assert classify_kind("r5") == "RES"

    def test_empty_string_is_misc(self) -> None:
        assert classify_kind("") == "MISC"

    def test_unknown_prefix_is_misc(self) -> None:
        assert classify_kind("Z1") == "MISC"
        assert classify_kind("FOO42") == "MISC"


# ============================================================================
# compute_layout — refs + board → {ref: (x_mm, y_mm, rotation_deg)}
# ============================================================================


class TestComputeLayoutSignature:
    def test_returns_dict(self) -> None:
        layout = compute_layout(["U1"], 50.0, 50.0)
        assert isinstance(layout, dict)

    def test_each_value_is_3_tuple(self) -> None:
        layout = compute_layout(["U1", "R1"], 50.0, 50.0)
        for pos in layout.values():
            assert isinstance(pos, tuple)
            assert len(pos) == 3
            x, y, rot = pos
            assert isinstance(x, float)
            assert isinstance(y, float)
            assert isinstance(rot, float)

    def test_empty_refs_returns_empty_dict(self) -> None:
        assert compute_layout([], 50.0, 50.0) == {}

    def test_every_ref_has_a_position(self) -> None:
        refs = ["U1", "R1", "R2", "C1", "C2", "D1", "J1"]
        layout = compute_layout(refs, 80.0, 60.0)
        assert set(layout.keys()) == set(refs)


class TestComputeLayoutIC:
    def test_single_ic_at_centroid(self) -> None:
        layout = compute_layout(["U1"], 50.0, 50.0)
        x, y, _ = layout["U1"]
        # Within 1mm of board center
        assert abs(x - 25.0) < 1.0
        assert abs(y - 25.0) < 1.0

    def test_two_ics_spread_horizontally(self) -> None:
        layout = compute_layout(["U1", "U2"], 60.0, 40.0)
        x1, y1, _ = layout["U1"]
        x2, y2, _ = layout["U2"]
        # Same row (within tolerance)
        assert abs(y1 - y2) < 1.0
        # Y centered
        assert abs(y1 - 20.0) < 1.0
        # Horizontally separated by at least 5mm
        assert abs(x2 - x1) > 5.0

    def test_three_ics_distribute_horizontally(self) -> None:
        layout = compute_layout(["U1", "U2", "U3"], 90.0, 50.0)
        xs = sorted(layout[r][0] for r in ["U1", "U2", "U3"])
        # All within board
        for x in xs:
            assert MARGIN_MM < x < 90.0 - MARGIN_MM
        # Roughly equally spaced
        gap1 = xs[1] - xs[0]
        gap2 = xs[2] - xs[1]
        assert abs(gap1 - gap2) < 2.0


class TestComputeLayoutPassives:
    def test_passives_cluster_around_single_ic(self) -> None:
        refs = ["U1", "R1", "R2", "C1", "C2"]
        layout = compute_layout(refs, 50.0, 50.0)
        ic_x, ic_y, _ = layout["U1"]
        for r in ["R1", "R2", "C1", "C2"]:
            px, py, _ = layout[r]
            dist = ((px - ic_x) ** 2 + (py - ic_y) ** 2) ** 0.5
            # Cluster radius is bounded by base + N*step (4 passives in cluster)
            expected_max = CLUSTER_RADIUS_BASE_MM + CLUSTER_RADIUS_STEP_MM * 4 + 2.0
            assert dist <= expected_max
            assert dist >= CLUSTER_RADIUS_BASE_MM - 2.0

    def test_passives_attach_to_nearest_ic(self) -> None:
        # Two ICs spread far apart; passive should attach to the closer one.
        refs = ["U1", "U2", "R1"]
        layout = compute_layout(refs, 100.0, 50.0)
        u1x, u1y, _ = layout["U1"]
        u2x, u2y, _ = layout["U2"]
        r1x, r1y, _ = layout["R1"]
        d1 = ((r1x - u1x) ** 2 + (r1y - u1y) ** 2) ** 0.5
        d2 = ((r1x - u2x) ** 2 + (r1y - u2y) ** 2) ** 0.5
        # R1 must be in the cluster radius of one of them
        assert min(d1, d2) <= CLUSTER_RADIUS_BASE_MM + CLUSTER_RADIUS_STEP_MM + 2.0

    def test_no_ic_passives_still_placed(self) -> None:
        # Passives with no IC must still get valid positions
        layout = compute_layout(["R1", "R2", "C1"], 50.0, 50.0)
        for r in ["R1", "R2", "C1"]:
            x, y, _ = layout[r]
            assert MARGIN_MM <= x <= 50.0 - MARGIN_MM
            assert MARGIN_MM <= y <= 50.0 - MARGIN_MM


class TestComputeLayoutConnectors:
    def test_single_connector_left_edge(self) -> None:
        layout = compute_layout(["J1"], 50.0, 50.0)
        x, _, _ = layout["J1"]
        # On left edge (within EDGE_OFFSET_MM of margin)
        assert x <= MARGIN_MM + EDGE_OFFSET_MM + 1.0

    def test_two_connectors_opposite_edges(self) -> None:
        layout = compute_layout(["J1", "J2"], 60.0, 40.0)
        x1, _, _ = layout["J1"]
        x2, _, _ = layout["J2"]
        # One left, one right
        xs = sorted([x1, x2])
        assert xs[0] <= MARGIN_MM + EDGE_OFFSET_MM + 1.0
        assert xs[1] >= 60.0 - MARGIN_MM - EDGE_OFFSET_MM - 1.0

    def test_four_connectors_alternate_edges(self) -> None:
        layout = compute_layout(["J1", "J2", "J3", "J4"], 60.0, 60.0)
        # Two should be on left edge, two on right
        left = sum(
            1 for r in ["J1", "J2", "J3", "J4"]
            if layout[r][0] <= MARGIN_MM + EDGE_OFFSET_MM + 1.0
        )
        right = sum(
            1 for r in ["J1", "J2", "J3", "J4"]
            if layout[r][0] >= 60.0 - MARGIN_MM - EDGE_OFFSET_MM - 1.0
        )
        assert left == 2
        assert right == 2

    def test_p_connectors_treated_as_conn(self) -> None:
        layout = compute_layout(["P1"], 50.0, 50.0)
        x, _, _ = layout["P1"]
        assert x <= MARGIN_MM + EDGE_OFFSET_MM + 1.0


class TestComputeLayoutBounds:
    @pytest.mark.parametrize(
        "board_w,board_h",
        [(30.0, 30.0), (50.0, 50.0), (100.0, 80.0), (200.0, 150.0)],
    )
    def test_all_positions_inside_margins(
        self, board_w: float, board_h: float
    ) -> None:
        refs = ["U1", "U2", "R1", "R2", "R3", "C1", "C2", "C3", "D1", "J1", "J2", "TP1"]
        layout = compute_layout(refs, board_w, board_h)
        for ref, (x, y, _) in layout.items():
            assert MARGIN_MM <= x <= board_w - MARGIN_MM, f"{ref} x={x} out of bounds"
            assert MARGIN_MM <= y <= board_h - MARGIN_MM, f"{ref} y={y} out of bounds"


class TestComputeLayoutDeterminism:
    def test_same_input_same_output(self) -> None:
        refs = ["U1", "R1", "R2", "C1", "J1"]
        layout1 = compute_layout(refs, 50.0, 50.0)
        layout2 = compute_layout(refs, 50.0, 50.0)
        assert layout1 == layout2

    def test_input_list_not_mutated(self) -> None:
        refs = ["U1", "R1", "C1"]
        refs_copy = list(refs)
        compute_layout(refs, 50.0, 50.0)
        assert refs == refs_copy


class TestComputeLayoutNE555:
    """NE555 timer reference case — what the actual agent pipeline produces."""

    def test_ne555_layout_realistic(self) -> None:
        refs = ["U1", "R1", "R2", "R3", "C1", "C2", "C3", "D1", "J1"]
        layout = compute_layout(refs, 80.0, 60.0)
        # IC roughly centered
        u1x, u1y, _ = layout["U1"]
        assert abs(u1x - 40.0) < 5.0
        assert abs(u1y - 30.0) < 5.0
        # Passives within cluster of IC
        for r in ["R1", "R2", "R3", "C1", "C2", "C3"]:
            x, y, _ = layout[r]
            dist = ((x - u1x) ** 2 + (y - u1y) ** 2) ** 0.5
            assert dist <= CLUSTER_RADIUS_BASE_MM + CLUSTER_RADIUS_STEP_MM * 6 + 2.0
        # Connector on an edge
        j1x, _, _ = layout["J1"]
        assert j1x <= MARGIN_MM + EDGE_OFFSET_MM + 1.0 or j1x >= 80.0 - MARGIN_MM - EDGE_OFFSET_MM - 1.0


class TestConstantsExposed:
    """The constants used by the algorithm must be importable for parity tests."""

    def test_margin_is_positive(self) -> None:
        assert MARGIN_MM > 0

    def test_ic_spacing_is_positive(self) -> None:
        assert IC_SPACING_MM > 0

    def test_cluster_radius_base_is_positive(self) -> None:
        assert CLUSTER_RADIUS_BASE_MM > 0

    def test_cluster_radius_step_is_positive(self) -> None:
        assert CLUSTER_RADIUS_STEP_MM > 0

    def test_edge_offset_is_positive(self) -> None:
        assert EDGE_OFFSET_MM > 0

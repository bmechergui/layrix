"""Unit tests for the LLM reasoner helpers (the parts that don't call Claude)."""
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))

# kicad_tools lives in the vendored (gitignored) kicad-tools/ — bootstrap its path
# the same way main.py does, then skip the integration test if it's unavailable.
_KT_SRC = Path(__file__).parents[1] / "kicad-tools" / "src"
if _KT_SRC.is_dir() and str(_KT_SRC) not in sys.path:
    sys.path.insert(0, str(_KT_SRC))

_BOARD = (
    Path(__file__).parents[1]
    / "kicad-tools" / "boards" / "01-voltage-divider" / "output" / "voltage_divider.kicad_pcb"
)

try:
    import kicad_tools.reasoning  # noqa: F401

    _KT_OK = _BOARD.exists()
except ImportError:
    _KT_OK = False

from tools import reasoning


def test_extract_json_from_llm_text():
    assert reasoning._extract_json(
        'Je propose: {"type":"route_net","net":"DHT_DATA"} voilà'
    ) == {"type": "route_net", "net": "DHT_DATA"}
    assert reasoning._extract_json(
        '{"type":"place_component","ref":"C1","near":"U1","offset":[2,0]}'
    ) == {"type": "place_component", "ref": "C1", "near": "U1", "offset": [2, 0]}


def test_extract_json_returns_none_without_json():
    assert reasoning._extract_json("aucune commande ici") is None
    assert reasoning._extract_json("{cassé") is None


def test_available_false_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert reasoning.available() is False


@pytest.mark.skipif(not _KT_OK, reason="kicad_tools + voltage_divider board required")
def test_route_with_llm_reports_true_progress_after_in_session_routing():
    """route_with_llm must report the REAL routed pct, not stale load-time state.

    Regression: the interpreter writes traces to the editor but does NOT sync
    them back into PCBState.nets[*].traces, so NetState.is_routed stayed False
    in-session -> route_with_llm reported 0% (and never saw is_complete) on a
    board it had actually routed to 100%. We drive the loop with a deterministic
    decider (Claude is injected, so no API key needed) that routes whatever the
    agent suggests next.
    """

    def greedy_decide(prompt: str) -> dict | None:
        # Proxy du LLM : router le premier net listé sous "## Unrouted Nets"
        # (le vrai Claude lit cette section, pas l'historique).
        block = prompt.split("## Unrouted Nets", 1)
        if len(block) < 2:
            return None
        m = re.search(r"^- (\S+?)[\s\[:]", block[1], re.MULTILINE)
        return {"type": "route_net", "net": m.group(1)} if m else None

    pcb_bytes = _BOARD.read_bytes()
    out_bytes, pct, steps = reasoning.route_with_llm(
        pcb_bytes, max_steps=10, decide=greedy_decide
    )

    assert pct == 100, f"expected 100% routed, got {pct}% — stale in-session state"
    # Must detect completion and stop early, not burn all 10 steps re-routing.
    assert any("complet" in s.lower() for s in steps), steps
    assert len(steps) <= 5, f"loop did not stop early: {len(steps)} steps -> {steps}"
    assert len(out_bytes) > 0

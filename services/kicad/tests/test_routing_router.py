"""FastAPI integration tests for ``routers/routing.py``.

Mocks ``_find_freerouting`` + ``_run_freerouting`` so the router contract is
exercised without Freerouting/pcbnew installed.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent))

from main import app  # noqa: E402
import routers.routing as routing_router  # noqa: E402


client = TestClient(app)

MINIMAL_PCB = b"(kicad_pcb (version 20240108) (generator pcbnew))\n"


def _b64(content: bytes = MINIMAL_PCB) -> str:
    return base64.b64encode(content).decode("ascii")


class TestRouteAutoSkippedWhenFreeroutingMissing:
    def test_skipped_payload(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(routing_router, "_find_freerouting", lambda: None)
        resp = client.post(
            "/route/auto",
            json={"kicad_pcb_b64": _b64(), "layers": 2},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["skipped"] is True
        assert body["routed_percent"] == 0
        assert body["layers"] == 2
        assert "freerouting" in (body.get("warning") or "").lower()


class TestRouteAutoSuccess:
    def test_returns_updated_pcb(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fake_freerouting = ("/fake/java", "/fake/freerouting.jar")
        monkeypatch.setattr(routing_router, "_find_freerouting", lambda: fake_freerouting)

        # Mock all pcbnew touch-points so the test runs without KiCad installed
        monkeypatch.setattr(
            routing_router,
            "_export_specctra",
            lambda _pcb, dsn: dsn.write_text("(specctra)", encoding="utf-8"),
        )

        def fake_run(_paths: tuple[str, str], _dsn: Path, ses: Path, _timeout: int) -> None:
            ses.write_text("(SES routed)", encoding="utf-8")

        monkeypatch.setattr(routing_router, "_run_freerouting", fake_run)

        def fake_apply(_pcb_bytes: bytes, _ses_path: Path) -> bytes:
            return b"(kicad_pcb routed)"

        monkeypatch.setattr(routing_router, "_specctra_roundtrip", fake_apply)

        resp = client.post(
            "/route/auto",
            json={"kicad_pcb_b64": _b64(), "layers": 4},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["skipped"] is False
        assert body["routed_percent"] == 100
        assert body["layers"] == 4
        decoded = base64.b64decode(body["kicad_pcb_b64"])
        assert decoded == b"(kicad_pcb routed)"


class TestRouteAutoFreeroutingFailure:
    def test_freerouting_timeout_returns_500(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(routing_router, "_find_freerouting", lambda: ("/fake/java", "/fake/fr.jar"))
        monkeypatch.setattr(
            routing_router,
            "_export_specctra",
            lambda _pcb, dsn: dsn.write_text("(specctra)", encoding="utf-8"),
        )

        def boom(*_args: Any, **_kwargs: Any) -> None:
            raise TimeoutError("Freerouting exceeded 300s")

        monkeypatch.setattr(routing_router, "_run_freerouting", boom)

        resp = client.post(
            "/route/auto",
            json={"kicad_pcb_b64": _b64(), "layers": 2},
        )
        assert resp.status_code == 500

    def test_pydantic_invalid_layers(self) -> None:
        resp = client.post(
            "/route/auto",
            json={"kicad_pcb_b64": _b64(), "layers": 16},  # not in (2,4,8)
        )
        assert resp.status_code == 422

"""
Layrix — PCB HTTP endpoint
POST /pcb/generate → JSON schema → .kicad_pcb
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from tools.schematic import SchemaComponent, SchemaNet
from tools.pcb import generate_pcb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pcb", tags=["pcb"])


# ============================================================
# HTTP models
# ============================================================

class PcbRequest(BaseModel):
    components: list[SchemaComponent]
    nets: list[str]
    connections: list[SchemaNet] = Field(default_factory=list)
    board_width_mm: float = Field(default=50.0, ge=10.0, le=200.0)
    board_height_mm: float = Field(default=50.0, ge=10.0, le=200.0)
    project_id: str = ""


class PcbResponse(BaseModel):
    success: bool
    kicad_pcb_content: Optional[str] = None
    error: Optional[str] = None


# ============================================================
# Endpoint
# ============================================================

@router.post("/generate", response_model=PcbResponse)
def generate(req: PcbRequest) -> PcbResponse:
    """JSON schema → .kicad_pcb (S-expression)."""
    if not req.components:
        return PcbResponse(success=False, error="No components in schema")
    try:
        pcb_content = generate_pcb(
            req.components, req.connections, req.board_width_mm, req.board_height_mm,
        )
        return PcbResponse(success=True, kicad_pcb_content=pcb_content)
    except Exception as exc:
        logger.error("generate pcb failed: %s", exc)
        return PcbResponse(success=False, error=str(exc))

"""Internal config endpoints — receive live prompt/settings pushes from NestJS."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.core import prompt_registry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/config", tags=["config"])


class ApplyConfigBody(BaseModel):
    prompts: dict[str, str] = Field(default_factory=dict)
    settings: dict | None = None


def _assert_internal(secret: str | None) -> None:
    expected = get_settings().internal_secret
    if not secret or secret != expected:
        raise HTTPException(status_code=401, detail="Invalid internal secret")


@router.post("/apply")
async def apply_config(
    body: ApplyConfigBody,
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
):
    _assert_internal(x_internal_secret)
    prompt_registry.apply_config(prompts=body.prompts, settings=body.settings)
    return {"ok": True, "snapshot": prompt_registry.snapshot()}


@router.get("/status")
async def config_status(
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
):
    _assert_internal(x_internal_secret)
    return prompt_registry.snapshot()

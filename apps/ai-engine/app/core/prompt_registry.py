"""
In-memory registry for Super Admin–editable AI prompts and OpenAI settings.

NestJS pushes updates via POST /api/v1/config/apply after Apply.
Falls back to the hardcoded defaults in prompts.py / consultation_ai.py.
"""
from __future__ import annotations

import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

_lock = threading.RLock()
_prompts: dict[str, str] = {}
_settings: dict[str, Any] = {}


def apply_config(*, prompts: dict[str, str] | None = None, settings: dict[str, Any] | None = None) -> None:
    with _lock:
        if prompts:
            _prompts.update({k: v for k, v in prompts.items() if isinstance(v, str) and v.strip()})
            logger.info("Prompt registry updated (%d keys)", len(_prompts))
        if settings:
            _settings.update({k: v for k, v in settings.items() if v is not None})
            logger.info(
                "AI settings updated — model=%s fast=%s",
                _settings.get("openaiModel"),
                _settings.get("openaiFastModel"),
            )


def get_prompt(key: str, default: str) -> str:
    with _lock:
        return _prompts.get(key) or default


def get_settings() -> dict[str, Any]:
    with _lock:
        return dict(_settings)


def get_model(kind: str, fallback: str) -> str:
    """kind: 'main' | 'fast' | 'embedding'"""
    with _lock:
        if kind == "fast":
            return str(_settings.get("openaiFastModel") or fallback)
        if kind == "embedding":
            return str(_settings.get("openaiEmbeddingModel") or fallback)
        return str(_settings.get("openaiModel") or fallback)


def snapshot() -> dict[str, Any]:
    with _lock:
        return {
            "prompt_keys": sorted(_prompts.keys()),
            "prompt_count": len(_prompts),
            "settings": dict(_settings),
        }

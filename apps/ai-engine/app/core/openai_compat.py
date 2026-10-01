"""OpenAI Chat Completions compatibility helpers.

GPT-5.x and reasoning models reject custom `temperature` (only the default of 1
is allowed). Passing 0.2 on those models returns HTTP 400 and must not be retried.
"""
from __future__ import annotations

from typing import Any

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    BadRequestError,
    RateLimitError,
)


def supports_sampling_temperature(model: str) -> bool:
    slug = (model or "").strip().lower()
    if not slug:
        return False
    # GPT-5 family + o-series reasoning models: temperature is fixed at default.
    if slug.startswith("gpt-5"):
        return False
    if slug.startswith(("o1", "o3", "o4")):
        return False
    return True


def is_unsupported_temperature_error(exc: BaseException) -> bool:
    if not isinstance(exc, BadRequestError):
        return False
    body = str(getattr(exc, "message", "") or exc).lower()
    return "temperature" in body and (
        "unsupported" in body or "does not support" in body
    )


def is_retryable_openai_error(exc: BaseException) -> bool:
    """Retry transient failures only — never client 400s such as unsupported params."""
    if isinstance(exc, (APIConnectionError, APITimeoutError, RateLimitError)):
        return True
    if isinstance(exc, BadRequestError):
        return False
    if isinstance(exc, APIStatusError):
        return exc.status_code in {408, 409, 429} or exc.status_code >= 500
    return False


def with_optional_temperature(
    params: dict[str, Any],
    temperature: float | None,
) -> dict[str, Any]:
    out = dict(params)
    model = str(out.get("model") or "")
    if temperature is not None and supports_sampling_temperature(model):
        out["temperature"] = temperature
    else:
        out.pop("temperature", None)
    return out

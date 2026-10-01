"""
/api/v1/parse         — Parse a document, return text + metadata (no AI)
/api/v1/extract       — Parse + full RAG extraction pipeline, return ExtractedKnowledge
/api/v1/extract-text  — RAG extraction from already-parsed (combined) text
"""
from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.core.extractor import ExtractionPipeline
from app.core.parser import parse_document

logger = logging.getLogger(__name__)
router = APIRouter()

_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


class ExtractTextBody(BaseModel):
    text: str = Field(min_length=40)
    pathway_name: str = Field(min_length=1)
    condition: str = Field(min_length=1)
    word_count: int | None = None
    page_count: int | None = None


async def _read_file(upload: UploadFile) -> bytes:
    data = await upload.read()
    if len(data) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {_MAX_FILE_SIZE // 1024 // 1024} MB",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    return data


# ─── Parse only (no AI) ───────────────────────────────────────────────────────

@router.post("/parse", tags=["Documents"], summary="Parse document → extract text")
async def parse(
    file: Annotated[UploadFile, File(description="PDF, DOCX, DOC, or TXT")],
):
    """
    Extract raw text from an uploaded document.
    Returns text, page_count, word_count, file_type, metadata.
    No OpenAI calls — just document parsing.
    """
    settings = get_settings()
    data = await _read_file(file)

    try:
        result = parse_document(
            data,
            filename=file.filename or "upload",
            content_type=file.content_type or "",
            ocr_enabled=settings.ocr_enabled,
            ocr_language=settings.ocr_language,
        )
    except ValueError as exc:
        # Unsupported type vs other ValueErrors (e.g. PyMuPDF "document closed")
        detail = str(exc)
        if "Unsupported file type" in detail:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=detail)
        logger.exception("Document parsing failed for %s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse document: {detail}",
        )
    except Exception as exc:
        logger.exception("Document parsing failed for %s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse document: {exc}",
        )

    return JSONResponse(result)


# ─── Full RAG extraction pipeline ────────────────────────────────────────────

@router.post(
    "/extract",
    tags=["AI Pipeline"],
    summary="Parse + AI extraction → ExtractedKnowledge",
)
async def extract(
    file: Annotated[UploadFile, File(description="Clinical guideline document")],
    pathway_name: Annotated[str, Form(description="Name of the clinical pathway")],
    condition: Annotated[str, Form(description="Medical condition")],
):
    """
    Full pipeline:
    1. Parse document (PDF / DOCX / TXT)
    2. Chunk text
    3. Parallel LLM extraction on all chunks
    4. Merge + deduplicate
    5. GPT-4o summary

    Returns the same ExtractedKnowledge structure consumed by NestJS.
    """
    settings = get_settings()
    t0 = time.monotonic()

    # ── Parse ────────────────────────────────────────────────────────────────
    data = await _read_file(file)

    try:
        parsed = parse_document(
            data,
            filename=file.filename or "upload",
            content_type=file.content_type or "",
            ocr_enabled=settings.ocr_enabled,
            ocr_language=settings.ocr_language,
        )
    except ValueError as exc:
        detail = str(exc)
        if "Unsupported file type" in detail:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=detail)
        logger.exception("Parsing failed for %s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Document parsing failed: {detail}",
        )
    except Exception as exc:
        logger.exception("Parsing failed for %s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Document parsing failed: {exc}",
        )

    text: str = parsed["text"]
    if len(text.split()) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Document contains too little text to analyse. It may be scanned without OCR support.",
        )

    # ── Extract ──────────────────────────────────────────────────────────────
    try:
        pipeline = ExtractionPipeline(settings)
    except FileNotFoundError as exc:
        logger.exception("AI client init failed (SSL/certs or missing runtime files)")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "AI service runtime is not ready (missing certificates or dependencies). "
                "Please retry shortly or contact support."
            ),
        ) from exc
    except Exception as exc:
        logger.exception("AI client init failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service unavailable: {exc}",
        ) from exc

    try:
        knowledge = await pipeline.extract(text, pathway_name, condition)
    except Exception as exc:
        logger.exception("AI extraction failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI extraction failed: {exc}",
        ) from exc

    duration_ms = (time.monotonic() - t0) * 1000
    chunks_processed = knowledge.pop("_chunks_processed", None)
    if chunks_processed is None:
        chunks_processed = len(knowledge.get("sections", []))

    return JSONResponse({
        "knowledge": knowledge,
        "chunks_processed": chunks_processed,
        "word_count": parsed["word_count"],
        "page_count": parsed["page_count"],
        "file_type": parsed["file_type"],
        "duration_ms": round(duration_ms, 1),
    })


@router.post(
    "/extract-text",
    tags=["AI Pipeline"],
    summary="AI extraction from already-parsed text (multi-doc)",
)
async def extract_text(body: ExtractTextBody):
    """
    Run the RAG extraction pipeline on combined text from one or more documents.
    Used by NestJS after it has parsed all uploaded guides.
    """
    settings = get_settings()
    t0 = time.monotonic()
    text = body.text.strip()
    if len(text.split()) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Combined text contains too little content to analyse.",
        )

    # Cap pathological mega-uploads
    max_chars = getattr(settings, "max_combined_chars", 400_000)
    if len(text) > max_chars:
        logger.warning("Truncating combined text from %d to %d chars", len(text), max_chars)
        text = text[:max_chars]

    try:
        pipeline = ExtractionPipeline(settings)
    except FileNotFoundError as exc:
        logger.exception("AI client init failed (SSL/certs or missing runtime files)")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "AI service runtime is not ready (missing certificates or dependencies). "
                "Please retry shortly or contact support."
            ),
        ) from exc
    except Exception as exc:
        logger.exception("AI client init failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service unavailable: {exc}",
        ) from exc

    try:
        knowledge = await pipeline.extract(text, body.pathway_name, body.condition)
    except Exception as exc:
        logger.exception("AI extraction failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI extraction failed: {exc}",
        ) from exc

    duration_ms = (time.monotonic() - t0) * 1000
    chunks_processed = knowledge.pop("_chunks_processed", len(knowledge.get("sections", [])))
    word_count = body.word_count if body.word_count is not None else len(text.split())

    return JSONResponse({
        "knowledge": knowledge,
        "chunks_processed": chunks_processed,
        "word_count": word_count,
        "page_count": body.page_count or 0,
        "file_type": "combined",
        "duration_ms": round(duration_ms, 1),
    })

"""
Staged pathway generation API routes.

POST /api/v1/pathway/classify
POST /api/v1/pathway/analyze-overlap
POST /api/v1/pathway/extract-concepts
POST /api/v1/pathway/generate-from-concepts
"""
from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.core.pathway_pipeline import PathwayGenerationPipeline

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pathway", tags=["Pathway Pipeline"])


class ClassifyBody(BaseModel):
    text: str = Field(min_length=40)
    file_name: str = Field(min_length=1)
    condition: str = Field(min_length=1)


class OverlapDocument(BaseModel):
    id: str
    fileName: str
    documentType: str | None = None
    suggestedRole: str | None = None
    authority: str | None = None
    textExcerpt: str = ""


class AnalyzeOverlapBody(BaseModel):
    condition: str = Field(min_length=1)
    documents: list[OverlapDocument] = Field(min_length=1)


class ConceptDocument(BaseModel):
    id: str
    fileName: str
    role: str | None = None
    text: str = Field(min_length=40)


class ExtractConceptsBody(BaseModel):
    pathway_name: str = Field(min_length=1)
    condition: str = Field(min_length=1)
    documents: list[ConceptDocument] = Field(min_length=1)


class ConceptSourceIn(BaseModel):
    documentId: str
    sourceExcerpt: str | None = None
    sourcePage: int | None = None


class ConceptIn(BaseModel):
    category: str
    label: str
    description: str | None = None
    importance: str | None = None
    metadata: dict[str, Any] | None = None
    confidence: float | None = None
    aliases: list[str] = Field(default_factory=list)
    sources: list[ConceptSourceIn] = Field(default_factory=list)


class GenerateFromConceptsBody(BaseModel):
    pathway_name: str = Field(min_length=1)
    condition: str = Field(min_length=1)
    concepts: list[ConceptIn] = Field(min_length=1)
    limits: dict[str, int] | None = None


def _pipeline() -> PathwayGenerationPipeline:
    settings = get_settings()
    try:
        return PathwayGenerationPipeline(settings)
    except Exception as exc:
        logger.exception("Failed to init pathway pipeline")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service unavailable: {exc}",
        ) from exc


@router.post("/classify", summary="Classify a clinical document")
async def classify(body: ClassifyBody):
    t0 = time.monotonic()
    pipe = _pipeline()
    try:
        result = await pipe.classify_document(body.text, body.file_name, body.condition)
    except Exception as exc:
        logger.exception("Document classification failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Classification failed: {exc}",
        ) from exc
    return JSONResponse({
        **result,
        "duration_ms": round((time.monotonic() - t0) * 1000, 1),
    })


@router.post("/analyze-overlap", summary="Compare documents for overlap / roles")
async def analyze_overlap(body: AnalyzeOverlapBody):
    t0 = time.monotonic()
    pipe = _pipeline()
    docs = [d.model_dump() for d in body.documents]
    try:
        overlaps = await pipe.analyze_overlap(docs, body.condition)
    except Exception as exc:
        logger.exception("Overlap analysis failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Overlap analysis failed: {exc}",
        ) from exc
    return JSONResponse({
        "overlaps": overlaps,
        "duration_ms": round((time.monotonic() - t0) * 1000, 1),
    })


@router.post("/extract-concepts", summary="Extract + normalize clinical concepts")
async def extract_concepts(body: ExtractConceptsBody):
    t0 = time.monotonic()
    pipe = _pipeline()
    docs = [d.model_dump() for d in body.documents]
    try:
        concepts = await pipe.extract_and_normalize_concepts(
            docs, body.pathway_name, body.condition,
        )
    except Exception as exc:
        logger.exception("Concept extraction failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Concept extraction failed: {exc}",
        ) from exc
    return JSONResponse({
        "concepts": concepts,
        "count": len(concepts),
        "duration_ms": round((time.monotonic() - t0) * 1000, 1),
    })


@router.post("/generate-from-concepts", summary="Generate pathway from stored concepts")
async def generate_from_concepts(body: GenerateFromConceptsBody):
    t0 = time.monotonic()
    pipe = _pipeline()
    concepts = [c.model_dump() for c in body.concepts]
    try:
        knowledge = await pipe.generate_pathway_from_concepts(
            concepts,
            body.pathway_name,
            body.condition,
            body.limits,
        )
    except Exception as exc:
        logger.exception("Pathway generation from concepts failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Pathway generation failed: {exc}",
        ) from exc
    chunks = knowledge.pop("_chunks_processed", 0)
    return JSONResponse({
        "knowledge": knowledge,
        "chunks_processed": chunks,
        "duration_ms": round((time.monotonic() - t0) * 1000, 1),
    })

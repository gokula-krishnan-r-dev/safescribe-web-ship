"""
Consultation AI endpoints.

POST /api/v1/consultations/analyze-transcript   — Extract entities from transcript
POST /api/v1/consultations/recommend-pathways   — Rank pathway suggestions
POST /api/v1/consultations/answer-questions     — Pre-fill Q&A from transcript
POST /api/v1/consultations/screen-red-flags     — Safety screening
POST /api/v1/consultations/assess-eligibility   — Eligibility check
POST /api/v1/consultations/recommend-treatment  — Treatment plan
POST /api/v1/consultations/generate-counselling — Patient counselling
POST /api/v1/consultations/generate-documentation — Clinical notes
POST /api/v1/consultations/generate-referral-letter — Referral letter
POST /api/v1/consultations/generate-referral-reason — Reason for referral
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.core.consultation_ai import ConsultationAI

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/consultations", tags=["Consultation AI"])
# Legacy alias used by Nest Clinical Judgment summary polish
compat_router = APIRouter(prefix="/consult", tags=["Consultation AI"])


def _engine() -> ConsultationAI:
    return ConsultationAI(get_settings())


# ─── Request models ───────────────────────────────────────────────────────────

class TranscriptRequest(BaseModel):
    transcript: str


class PathwayRequest(BaseModel):
    transcript: str
    entities: dict[str, Any] = {}
    available_pathways: list[dict[str, Any]] = []


class QuestionRequest(BaseModel):
    transcript: str
    entities: dict[str, Any] = {}
    questions: list[dict[str, Any]] = []


class RedFlagRequest(BaseModel):
    entities: dict[str, Any] = {}
    demographics: dict[str, Any] = {}
    question_responses: list[dict[str, Any]] = []
    pathway_rules: list[dict[str, Any]] = []


class EligibilityRequest(BaseModel):
    entities: dict[str, Any] = {}
    demographics: dict[str, Any] = {}
    red_flags: dict[str, Any] = {}
    pathway_treatments: list[dict[str, Any]] = []


class TreatmentRequest(BaseModel):
    entities: dict[str, Any] = {}
    demographics: dict[str, Any] = {}
    eligibility: dict[str, Any] = {}
    pathway_treatments: list[dict[str, Any]] = []


class CounsellingRequest(BaseModel):
    patient_context: dict[str, Any] = {}
    selected_treatments: list[dict[str, Any]] = []
    approved_counselling: dict[str, Any] = {}
    stricter_retry: bool = False
    # Legacy fields kept so older clients still parse.
    treatment_plan: dict[str, Any] = {}
    entities: dict[str, Any] = {}
    pathway_counselling: list[dict[str, Any]] = []
    consultation_data: dict[str, Any] = {}


class DocumentationRequest(BaseModel):
    consultation_data: dict[str, Any] = {}
    document_formats: dict[str, Any] = {}
    document_prompts: dict[str, Any] = {}
    stricter_retry: bool = False
    requested_documents: list[str] | None = None


class ReferralLetterRequest(BaseModel):
    referral_payload: dict[str, Any] = {}
    system_prompt: str | None = None


class ReferralReasonRequest(BaseModel):
    draft_payload: dict[str, Any] = {}
    system_prompt: str | None = None


class DraftTextRequest(BaseModel):
    task: str = "CJ_ASSESSMENT_SUMMARY"
    inputs: dict[str, Any] = {}
    constraints: dict[str, Any] = {}


class RenewDocumentationRequest(BaseModel):
    document_kind: str
    system_prompt: str = ""
    draft_body: str = ""
    verified_facts: dict[str, Any] = {}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/analyze-transcript")
async def analyze_transcript(req: TranscriptRequest):
    if not req.transcript.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Transcript is empty")
    try:
        result = await _engine().analyze_transcript(req.transcript)
        return result
    except Exception as exc:
        logger.exception("Transcript analysis failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/recommend-pathways")
async def recommend_pathways(req: PathwayRequest):
    try:
        result = await _engine().recommend_pathways(
            req.transcript, req.entities, req.available_pathways
        )
        return {"pathways": result}
    except Exception as exc:
        logger.exception("Pathway recommendation failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/answer-questions")
async def answer_questions(req: QuestionRequest):
    if not req.questions:
        return {"answers": []}
    try:
        result = await _engine().answer_questions(
            req.transcript, req.entities, req.questions
        )
        return {"answers": result}
    except Exception as exc:
        logger.exception("Question answering failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/screen-red-flags")
async def screen_red_flags(req: RedFlagRequest):
    try:
        result = await _engine().screen_red_flags(
            req.entities, req.demographics, req.question_responses, req.pathway_rules
        )
        return result
    except Exception as exc:
        logger.exception("Red flag screening failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


class CjRedFlagRequest(BaseModel):
    schemaVersion: str = "cj-red-flag-input-1.0"
    consultationContext: dict[str, Any] = {}
    approvedCandidates: list[dict[str, Any]] = []


@router.post("/cj-red-flags")
async def generate_cj_red_flags(req: CjRedFlagRequest):
    """Clinical Judgment: rank/phrase up to 3 questions from approved candidates."""
    try:
        if not req.approvedCandidates:
            return {
                "schemaVersion": "cj-red-flag-output-1.0",
                "status": "CANNOT_GENERATE",
                "questions": [],
                "missingFields": ["approvedCandidates"],
                "warnings": ["No approved candidates supplied"],
            }
        result = await _engine().generate_cj_red_flags(
            req.consultationContext, req.approvedCandidates
        )
        if not result.get("questions"):
            logger.warning("CJ red-flag engine returned no questions; caller should fallback")
        return result
    except Exception as exc:
        logger.exception("CJ red-flag generation failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/assess-eligibility")
async def assess_eligibility(req: EligibilityRequest):
    try:
        result = await _engine().assess_eligibility(
            req.entities, req.demographics, req.red_flags, req.pathway_treatments
        )
        return result
    except Exception as exc:
        logger.exception("Eligibility assessment failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/recommend-treatment")
async def recommend_treatment(req: TreatmentRequest):
    try:
        result = await _engine().recommend_treatment(
            req.entities, req.demographics, req.eligibility, req.pathway_treatments
        )
        return result
    except Exception as exc:
        logger.exception("Treatment recommendation failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/generate-counselling")
async def generate_counselling(req: CounsellingRequest):
    try:
        result = await _engine().generate_counselling(
            patient_context=req.patient_context,
            selected_treatments=req.selected_treatments,
            approved_counselling=req.approved_counselling,
            stricter_retry=req.stricter_retry,
            treatment_plan=req.treatment_plan,
            entities=req.entities,
            pathway_counselling=req.pathway_counselling,
            consultation_data=req.consultation_data or None,
        )
        return result
    except Exception as exc:
        logger.exception("Counselling generation failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/generate-documentation")
async def generate_documentation(req: DocumentationRequest):
    try:
        result = await _engine().generate_documentation(
            req.consultation_data,
            document_formats=req.document_formats or None,
            document_prompts=req.document_prompts or None,
            stricter_retry=req.stricter_retry,
            requested_documents=req.requested_documents,
        )
        return result
    except Exception as exc:
        logger.exception("Documentation generation failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/generate-referral-letter")
async def generate_referral_letter(req: ReferralLetterRequest):
    try:
        return await _engine().generate_referral_letter(
            referral_payload=req.referral_payload,
            system_prompt=req.system_prompt,
        )
    except Exception as exc:
        logger.exception("Referral letter generation failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/generate-referral-reason")
async def generate_referral_reason(req: ReferralReasonRequest):
    try:
        return await _engine().generate_referral_reason(
            draft_payload=req.draft_payload,
            system_prompt=req.system_prompt,
        )
    except Exception as exc:
        logger.exception("Referral reason generation failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/draft-text")
@compat_router.post("/draft-text")
async def draft_text(req: DraftTextRequest):
    try:
        return await _engine().draft_text(
            req.task,
            req.inputs,
            req.constraints,
        )
    except Exception as exc:
        logger.exception("Draft text generation failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/generate-renew-documentation")
@compat_router.post("/generate-renew-documentation")
async def generate_renew_documentation(req: RenewDocumentationRequest):
    if not req.draft_body.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="draft_body is empty")
    try:
        return await _engine().refine_renew_documentation(
            document_kind=req.document_kind,
            system_prompt=req.system_prompt,
            draft_body=req.draft_body,
            verified_facts=req.verified_facts,
        )
    except Exception as exc:
        logger.exception("Renew documentation refinement failed")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

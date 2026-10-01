"""
Pydantic models that mirror the TypeScript ExtractedKnowledge interfaces in
apps/api/src/modules/clinical-pathways/ai-pipeline.service.ts.
Keep these in sync if the NestJS interfaces change.
"""
from __future__ import annotations

from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────

class QuestionType(str, Enum):
    TEXT = "TEXT"
    TEXTAREA = "TEXTAREA"
    YES_NO = "YES_NO"
    DATE = "DATE"
    NUMBER = "NUMBER"
    SELECT = "SELECT"
    MULTI_SELECT = "MULTI_SELECT"
    SCALE = "SCALE"


class RuleAction(str, Enum):
    URGENT_REFERRAL = "URGENT_REFERRAL"
    STOP_PRESCRIBING = "STOP_PRESCRIBING"
    SHOW_WARNING = "SHOW_WARNING"
    REQUIRE_DOCUMENTATION = "REQUIRE_DOCUMENTATION"
    ADJUST_DOSE = "ADJUST_DOSE"
    CONTRAINDICATED = "CONTRAINDICATED"


class RuleSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    STOP = "STOP"


class FollowupUrgency(str, Enum):
    ROUTINE = "ROUTINE"
    URGENT = "URGENT"
    EMERGENCY = "EMERGENCY"


# ─── Sub-models ───────────────────────────────────────────────────────────────

class SelectOption(BaseModel):
    label: str
    value: str


class ExtractedSection(BaseModel):
    name: str
    display_name: str = Field(alias="displayName")
    description: str
    order: int

    model_config = {"populate_by_name": True}


class ExtractedQuestion(BaseModel):
    section: str
    question: str
    description: str
    help_text: str = Field(alias="helpText", default="")
    type: QuestionType = QuestionType.TEXT
    required: bool = True
    options: list[SelectOption] | None = None
    source_page: int | None = Field(alias="sourcePage", default=None)
    source_reference: str | None = Field(alias="sourceReference", default=None)
    confidence: float = 75.0
    clinical_reason: str = Field(alias="clinicalReason", default="")

    model_config = {"populate_by_name": True}


class ExtractedRule(BaseModel):
    question_ref: str = Field(alias="questionRef")
    condition: str
    operator: str
    value: str
    action: RuleAction
    severity: RuleSeverity
    message: str
    details: str = ""

    model_config = {"populate_by_name": True}


class ExtractedTreatment(BaseModel):
    medication_name: str = Field(alias="medicationName")
    generic_name: str | None = Field(alias="genericName", default=None)
    dose: str | None = None
    route: str | None = None
    frequency: str | None = None
    duration: str | None = None
    max_dose: str | None = Field(alias="maxDose", default=None)
    eligibility: str | None = None
    renal_adjustment: str | None = Field(alias="renalAdjustment", default=None)
    hepatic_adjustment: str | None = Field(alias="hepaticAdjustment", default=None)
    pregnancy_notes: str | None = Field(alias="pregnancyNotes", default=None)
    breastfeeding_notes: str | None = Field(alias="breastfeedingNotes", default=None)
    warnings: list[str] = []
    interactions: list[str] = []
    monitoring: str | None = None

    model_config = {"populate_by_name": True}


class ExtractedCounselling(BaseModel):
    category: str
    point: str
    detail: str | None = None


class ExtractedFollowup(BaseModel):
    timeframe: str
    condition: str
    action: str
    urgency: FollowupUrgency = FollowupUrgency.ROUTINE


class RedFlagSeverity(str, Enum):
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    EMERGENCY = "EMERGENCY"


class DifferentialLikelihood(str, Enum):
    COMMON = "COMMON"
    LESS_COMMON = "LESS_COMMON"
    RARE = "RARE"


class ExtractedRedFlag(BaseModel):
    title: str
    description: str | None = None
    severity: RedFlagSeverity = RedFlagSeverity.CRITICAL
    action: str | None = None
    source_reference: str | None = Field(alias="sourceReference", default=None)

    model_config = {"populate_by_name": True}


class ExtractedDifferential(BaseModel):
    condition: str
    question: str | None = None
    why_it_matters: str | None = Field(alias="whyItMatters", default=None)
    suggested_pathway: str | None = Field(alias="suggestedPathway", default=None)
    key_symptoms: str | None = Field(alias="keySymptoms", default=None)
    distinguishing_features: str | None = Field(alias="distinguishingFeatures", default=None)
    recommended_action: str | None = Field(alias="recommendedAction", default=None)
    likelihood: DifferentialLikelihood | None = None

    model_config = {"populate_by_name": True}


# ─── Top-level extraction result ─────────────────────────────────────────────

class ExtractedKnowledge(BaseModel):
    """Mirrors TypeScript ExtractedKnowledge — returned by /extract endpoint."""

    summary: str = ""
    sections: list[ExtractedSection] = []
    questions: list[ExtractedQuestion] = []
    rules: list[ExtractedRule] = []
    treatments: list[ExtractedTreatment] = []
    counselling: list[ExtractedCounselling] = []
    followup: list[ExtractedFollowup] = []
    red_flags: list[ExtractedRedFlag] = Field(alias="redFlags", default=[])
    differentials: list[ExtractedDifferential] = []

    model_config = {"populate_by_name": True}

    def to_nestjs_dict(self) -> dict[str, Any]:
        """Serialise using camelCase alias names for the NestJS consumer."""
        return self.model_dump(by_alias=True, exclude_none=False)


# ─── Document parse result ────────────────────────────────────────────────────

class ParsedDocument(BaseModel):
    text: str
    page_count: int
    word_count: int
    file_type: str
    metadata: dict[str, Any] = {}


# ─── API request / response wrappers ─────────────────────────────────────────

class ExtractionRequest(BaseModel):
    pathway_name: str
    condition: str


class ExtractionResponse(BaseModel):
    knowledge: dict[str, Any]
    chunks_processed: int
    word_count: int
    page_count: int
    file_type: str
    duration_ms: float

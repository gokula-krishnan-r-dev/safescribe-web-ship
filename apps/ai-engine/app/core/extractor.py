"""
RAG-based Clinical Knowledge Extraction Pipeline

Phase 1 — Chunk : section-aware overlapping chunks
Phase 2 — Extract: parallel async LLM calls (rate-limited, with retry)
Phase 3 — Merge  : smart deduplication + confidence-aware merge
Phase 4 — Synth  : GPT-4o final summary
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

from openai import AsyncOpenAI
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import Settings
from app.core.chunker import chunk_text
from app.core.prompts import (
    SYSTEM_PROMPT,
    SUMMARY_SYSTEM,
    build_chunk_prompt,
    build_summary_prompt,
)
from app.core import prompt_registry

logger = logging.getLogger(__name__)

# ─── Standard clinical sections always guaranteed in output ─────────────────

STANDARD_SECTIONS: list[dict[str, Any]] = [
    {"name": "diagnosisConfirmation", "displayName": "Diagnosis Confirmation", "description": "Questions that confirm the clinical diagnosis", "order": 0},
    {"name": "additionalAssessment",  "displayName": "Additional Assessment",  "description": "Context-specific assessment (severity, pregnancy, etc.)", "order": 1},
    {"name": "treatmentEligibility",  "displayName": "Treatment Eligibility",  "description": "Criteria that determine which treatments are appropriate", "order": 2},
]


class ExtractionPipeline:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.openai_timeout,
            max_retries=0,  # we handle retries ourselves via tenacity
        )
        self._semaphore = asyncio.Semaphore(settings.parallel_chunk_limit)

    # ── Public entry point ───────────────────────────────────────────────────

    async def extract(
        self,
        text: str,
        pathway_name: str,
        condition: str,
    ) -> dict[str, Any]:
        t0 = time.monotonic()
        chunks = chunk_text(
            text,
            chunk_size=self.settings.chunk_size_chars,
            overlap=self.settings.chunk_overlap_chars,
            max_chunks=self.settings.max_chunks_per_doc,
        )
        logger.info(
            'Pipeline start: "%s" — %d chunks, %d chars',
            pathway_name, len(chunks), len(text),
        )

        # Phase 2 — parallel extraction
        tasks = [
            self._extract_chunk_safe(chunk, pathway_name, condition, i, len(chunks))
            for i, chunk in enumerate(chunks)
        ]
        results = await asyncio.gather(*tasks)
        successful = [r for r in results if r]

        failed = len(chunks) - len(successful)
        if failed:
            logger.warning("%d/%d chunks failed — continuing with partial results", failed, len(chunks))

        # Phase 3 — merge
        knowledge = self._merge(successful, pathway_name, condition)

        # Phase 4 — summary
        knowledge["summary"] = await self._summarise(pathway_name, condition, knowledge)

        elapsed = (time.monotonic() - t0) * 1000
        logger.info("Pipeline complete in %.0f ms — %d Q · %d T · %d R · %d RF · %d chunks",
                    elapsed,
                    len(knowledge["questions"]),
                    len(knowledge["treatments"]),
                    len(knowledge["rules"]),
                    len(knowledge.get("redFlags") or []),
                    len(chunks))
        knowledge["_chunks_processed"] = len(chunks)
        return knowledge

    # ── Phase 2: per-chunk extraction ────────────────────────────────────────

    async def _extract_chunk_safe(
        self,
        chunk: str,
        pathway_name: str,
        condition: str,
        idx: int,
        total: int,
    ) -> dict[str, Any] | None:
        try:
            async with self._semaphore:
                return await self._extract_chunk(chunk, pathway_name, condition, idx, total)
        except Exception as exc:
            logger.error("Chunk %d/%d failed permanently: %s", idx + 1, total, exc)
            return None

    @retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1.5, min=1, max=15),
        reraise=True,
    )
    async def _extract_chunk(
        self,
        chunk: str,
        pathway_name: str,
        condition: str,
        idx: int,
        total: int,
    ) -> dict[str, Any]:
        response = await self.client.chat.completions.create(
            model=prompt_registry.get_model("fast", self.settings.openai_fast_model),
            max_completion_tokens=4500,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": prompt_registry.get_prompt("PATHWAY_CHUNK_EXTRACTION", SYSTEM_PROMPT),
                },
                {"role": "user",   "content": build_chunk_prompt(chunk, pathway_name, condition, idx, total)},
            ],
        )
        raw = response.choices[0].message.content or "{}"
        parsed = _parse_safe(raw)
        qn = len(parsed.get("questions") or [])
        logger.info("Chunk %d/%d extracted: %d questions · %d rules · %d treatments",
                    idx + 1, total, qn,
                    len(parsed.get("rules") or []),
                    len(parsed.get("treatments") or []))
        return parsed

    # ── Phase 3: merge ───────────────────────────────────────────────────────

    def _merge(
        self,
        chunks: list[dict[str, Any]],
        pathway_name: str,
        condition: str,
    ) -> dict[str, Any]:
        seen_sections: dict[str, dict] = {}
        seen_questions: dict[str, dict] = {}
        seen_treatments: dict[str, dict] = {}
        seen_counselling: set[str] = set()
        seen_rules: set[str] = set()
        rules: list[dict] = []
        counselling: list[dict] = []
        followup: list[dict] = []
        seen_followup: set[str] = set()
        seen_red_flags: dict[str, dict] = {}
        seen_differentials: dict[str, dict] = {}

        for chunk in chunks:
            for s in chunk.get("sections", []):
                name = s.get("name", "")
                if name and name not in seen_sections:
                    seen_sections[name] = s

            for q in chunk.get("questions", []):
                normalized_q = _normalize_question(q)
                if not normalized_q:
                    continue
                key = _norm(normalized_q.get("question", ""))
                if not key:
                    continue
                existing = seen_questions.get(key)
                if not existing or normalized_q.get("confidence", 0) > existing.get("confidence", 0):
                    seen_questions[key] = normalized_q

            for t in chunk.get("treatments", []):
                key = _norm(t.get("medicationName", ""))
                if key:
                    if key not in seen_treatments:
                        seen_treatments[key] = t
                    else:
                        seen_treatments[key] = _merge_dicts(seen_treatments[key], t)

            for r in chunk.get("rules", []):
                normalized = _normalize_rule(r)
                if not normalized:
                    continue
                key = _norm(
                    f"{normalized.get('condition','')}-{normalized.get('action','')}-{normalized.get('severity','')}"
                )
                if key not in seen_rules:
                    seen_rules.add(key)
                    rules.append(normalized)

            for c in chunk.get("counselling", []):
                key = _norm(c.get("point", ""))
                if key not in seen_counselling:
                    seen_counselling.add(key)
                    counselling.append(c)

            for f in chunk.get("followup", []):
                key = _norm(f"{f.get('timeframe','')}-{f.get('condition','')}")
                if key not in seen_followup:
                    seen_followup.add(key)
                    followup.append(f)

            for rf in chunk.get("redFlags", []):
                title = rf.get("title", "")
                key = _norm(title)
                if key and key not in seen_red_flags:
                    seen_red_flags[key] = rf

            for d in chunk.get("differentials", []):
                cond = d.get("condition", "")
                key = _norm(cond)
                if not key:
                    continue
                if key not in seen_differentials:
                    seen_differentials[key] = d
                else:
                    seen_differentials[key] = _merge_dicts(seen_differentials[key], d)

        # Ensure standard sections
        existing_names = set(seen_sections.keys())
        for std in STANDARD_SECTIONS:
            if std["name"] not in existing_names:
                seen_sections[std["name"]] = std

        sections = sorted(seen_sections.values(), key=lambda s: s.get("order", 99))

        return {
            "summary": f"Clinical prescribing pathway for {condition} ({pathway_name})",
            "sections": sections,
            "questions": list(seen_questions.values()),
            "rules": rules,
            "treatments": list(seen_treatments.values()),
            "counselling": counselling,
            "followup": followup,
            "redFlags": list(seen_red_flags.values()),
            "differentials": list(seen_differentials.values()),
        }

    # ── Phase 4: summary ─────────────────────────────────────────────────────

    async def _summarise(
        self,
        pathway_name: str,
        condition: str,
        knowledge: dict[str, Any],
    ) -> str:
        try:
            section_names = [s.get("displayName", "") for s in knowledge.get("sections", [])]
            prompt = build_summary_prompt(
                pathway_name,
                condition,
                section_names,
                len(knowledge.get("questions", [])),
                len(knowledge.get("treatments", [])),
                len(knowledge.get("rules", [])),
                len(knowledge.get("counselling", [])),
            )
            response = await self.client.chat.completions.create(
                model=prompt_registry.get_model("main", self.settings.openai_model),
                max_completion_tokens=220,
                messages=[
                    {
                        "role": "system",
                        "content": prompt_registry.get_prompt("PATHWAY_SUMMARY", SUMMARY_SYSTEM),
                    },
                    {"role": "user",   "content": prompt},
                ],
            )
            return (response.choices[0].message.content or "").strip()
        except Exception as exc:
            logger.warning("Summary generation failed: %s", exc)
            qs = len(knowledge.get("questions", []))
            ts = len(knowledge.get("treatments", []))
            return (
                f"Clinical prescribing pathway for {condition}. "
                f"Extracted {qs} questions and {ts} treatment options from guidelines."
            )


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _parse_safe(raw: str) -> dict[str, Any]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Attempt to extract JSON block
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return {}


_VALID_ACTIONS = {
    "URGENT_REFERRAL",
    "STOP_PRESCRIBING",
    "SHOW_WARNING",
    "REQUIRE_DOCUMENTATION",
    "ADJUST_DOSE",
    "CONTRAINDICATED",
}
_VALID_SEVERITIES = {"INFO", "WARNING", "CRITICAL", "STOP"}
_VALID_OPERATORS = {
    "equals",
    "not_equals",
    "greater_than",
    "less_than",
    "contains",
    "yes",
    "no",
}


def _normalize_action(raw: Any) -> str:
    key = re.sub(r"[\s-]+", "_", str(raw or "").strip()).upper()
    if key in _VALID_ACTIONS:
        return key
    text = f"{key} {raw or ''}"
    if re.search(r"REFER|SPECIALIST|EMERGENCY|HOSPITAL|\bED\b", text, re.I):
        return "URGENT_REFERRAL"
    if re.search(r"CONTRA.?INDIC|DO_?NOT_?TREAT|NOT_?ELIGIBLE", text, re.I):
        return "CONTRAINDICATED"
    if re.search(r"STOP_?(PRESCRIB|TREATMENT)|DO_?NOT_?PRESCRIB|DISCONTINU", text, re.I):
        return "STOP_PRESCRIBING"
    if re.search(r"ADJUST_?DOSE|DOSE_?ADJUST|REDUCE_?DOSE|TITRAT", text, re.I):
        return "ADJUST_DOSE"
    if re.search(r"DOCUMENT|CHART|RECORD", text, re.I):
        return "REQUIRE_DOCUMENTATION"
    return "SHOW_WARNING"


def _normalize_severity(raw: Any) -> str:
    key = re.sub(r"[\s-]+", "_", str(raw or "").strip()).upper()
    if key in _VALID_SEVERITIES:
        return key
    text = f"{key} {raw or ''}"
    if re.search(r"STOP|HALT|ABSOLUTE", text, re.I):
        return "STOP"
    if re.search(r"CRITICAL|SEVERE|EMERGENC|LIFE.?THREAT", text, re.I):
        return "CRITICAL"
    if re.search(r"INFO|NOTE|MILD|LOW", text, re.I):
        return "INFO"
    return "WARNING"


def _normalize_operator(raw: Any) -> str:
    v = re.sub(r"\s+", "_", str(raw or "").strip().lower())
    if v in _VALID_OPERATORS:
        return v
    aliases = {
        "eq": "equals",
        "==": "equals",
        "=": "equals",
        "neq": "not_equals",
        "!=": "not_equals",
        "gt": "greater_than",
        ">": "greater_than",
        "lt": "less_than",
        "<": "less_than",
        "true": "yes",
        "false": "no",
    }
    return aliases.get(v, "equals")


_VALID_QUESTION_TYPES = {
    "TEXT", "TEXTAREA", "YES_NO", "DATE", "NUMBER", "SELECT", "MULTI_SELECT", "SCALE",
}
_STANDARD_SECTION_NAMES = {s["name"] for s in STANDARD_SECTIONS}


def _normalize_question(q: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(q, dict):
        return None
    question = str(q.get("question") or q.get("text") or "").strip()
    if len(question) < 8:
        return None

    qtype = re.sub(r"[\s-]+", "_", str(q.get("type") or "TEXT").strip()).upper()
    if qtype not in _VALID_QUESTION_TYPES:
        lower = str(q.get("type") or "").lower()
        if re.search(r"yes.?no|boolean", lower):
            qtype = "YES_NO"
        elif re.search(r"multi", lower):
            qtype = "MULTI_SELECT"
        elif re.search(r"select|choice", lower):
            qtype = "SELECT"
        elif re.search(r"number|numeric", lower):
            qtype = "NUMBER"
        elif re.search(r"date", lower):
            qtype = "DATE"
        elif re.search(r"scale|rating", lower):
            qtype = "SCALE"
        elif re.search(r"textarea|long", lower):
            qtype = "TEXTAREA"
        else:
            qtype = "TEXT"

    section = str(q.get("section") or "diagnosisConfirmation").strip()
    # camelCase-ish: if unknown, fall back via legacy aliases
    if section not in _STANDARD_SECTION_NAMES:
        mapped = {
            "diagnosis": "diagnosisConfirmation",
            "confirmation": "diagnosisConfirmation",
            "presentation": "diagnosisConfirmation",
            "presenting": "diagnosisConfirmation",
            "typical": "diagnosisConfirmation",
            "features": "diagnosisConfirmation",
            "additional": "additionalAssessment",
            "history": "additionalAssessment",
            "patient": "additionalAssessment",
            "safety": "treatmentEligibility",
            "redflag": "treatmentEligibility",
            "red_flag": "treatmentEligibility",
            "eligibility": "treatmentEligibility",
            "treatment": "treatmentEligibility",
            "counsel": "additionalAssessment",
            "document": "additionalAssessment",
            "follow": "additionalAssessment",
        }
        low = re.sub(r"[^a-z]", "", section.lower())
        section = next(
            (v for k, v in mapped.items() if k in low),
            "diagnosisConfirmation",
        )

    try:
        confidence = float(q.get("confidence", 75) or 75)
    except (TypeError, ValueError):
        confidence = 75.0

    return {
        **q,
        "question": question,
        "description": str(q.get("description") or q.get("clinicalReason") or "").strip(),
        "helpText": str(q.get("helpText") or q.get("help_text") or "").strip(),
        "type": qtype,
        "required": bool(q.get("required", True)),
        "options": q.get("options"),
        "sourcePage": q.get("sourcePage") or q.get("source_page"),
        "sourceReference": q.get("sourceReference") or q.get("source_reference"),
        "confidence": confidence,
        "clinicalReason": str(q.get("clinicalReason") or q.get("clinical_reason") or "").strip(),
        "section": section,
    }


def _normalize_rule(r: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(r, dict):
        return None
    condition = str(r.get("condition") or "").strip()
    message = str(r.get("message") or "").strip()
    if not condition or not message:
        return None
    value = r.get("value")
    value_str = "true" if value is None or str(value).strip() == "" else str(value)
    return {
        **r,
        "condition": condition,
        "message": message,
        "action": _normalize_action(r.get("action")),
        "severity": _normalize_severity(r.get("severity")),
        "operator": _normalize_operator(r.get("operator")),
        "value": value_str,
        "details": r.get("details") or "",
        "questionRef": r.get("questionRef") or r.get("question_ref") or "",
    }


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", s.lower())).strip()[:80]


def _merge_dicts(base: dict, override: dict) -> dict:
    result = dict(base)
    for k, v in override.items():
        if v is not None and v != "" and v != [] and v not in (False,):
            result[k] = v
    return result

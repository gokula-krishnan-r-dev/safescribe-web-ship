"""
AI engine for the Consultation Module.

Supports:
  - Transcript analysis & entity extraction
  - Clinical pathway recommendation
  - Demographics pre-fill
  - Question answering from transcript
  - Red flag screening
  - Eligibility assessment
  - Treatment recommendation
  - Counselling generation
  - Documentation generation
  - Referral letter generation
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

from openai import AsyncOpenAI, BadRequestError
from tenacity import retry, retry_if_exception, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import Settings
from app.core import prompt_registry
from app.core.openai_compat import (
    is_retryable_openai_error,
    is_unsupported_temperature_error,
    with_optional_temperature,
)

from app.core.documentation_keys import (
    DOCUMENTATION_DETERMINISTIC_KEYS,
    resolve_requested_llm_documents,
)

logger = logging.getLogger(__name__)


class ConsultationAI:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.openai_timeout,
            max_retries=0,
        )
        self._model_fallback = settings.openai_model
        self._fast_fallback = settings.openai_fast_model

    @property
    def model(self) -> str:
        return prompt_registry.get_model("main", self._model_fallback)

    @property
    def fast(self) -> str:
        return prompt_registry.get_model("fast", self._fast_fallback)

    async def _chat_complete(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        max_completion_tokens: int | None = None,
        temperature: float | None = None,
        response_format: dict[str, Any] | None = None,
    ) -> Any:
        """Chat Completions call that omits params the active model rejects."""
        params: dict[str, Any] = {
            "model": model,
            "messages": messages,
        }
        if max_completion_tokens is not None:
            params["max_completion_tokens"] = max_completion_tokens
        if response_format is not None:
            params["response_format"] = response_format
        params = with_optional_temperature(params, temperature)
        try:
            return await self.client.chat.completions.create(**params)
        except BadRequestError as exc:
            if is_unsupported_temperature_error(exc) and "temperature" in params:
                params.pop("temperature", None)
                logger.info(
                    "Model %s rejected temperature — retrying with API default",
                    model,
                )
                return await self.client.chat.completions.create(**params)
            raise

    # ── Transcript Analysis ──────────────────────────────────────────────────

    @retry(retry=retry_if_exception_type(Exception), stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=1, max=10), reraise=True)
    async def analyze_transcript(self, transcript: str) -> dict[str, Any]:
        """Extract clinical entities from a patient conversation transcript."""
        response = await self.client.chat.completions.create(
            model=self.fast,
            max_completion_tokens=2000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_registry.get_prompt("TRANSCRIPT_ANALYSIS", TRANSCRIPT_SYSTEM)},
                {"role": "user", "content": f"Analyze this patient consultation transcript:\n\n{transcript[:6000]}"},
            ],
        )
        result = _parse(response.choices[0].message.content or "{}")
        return _normalize_transcript_entities(result, transcript)

    # ── Pathway Recommendation ───────────────────────────────────────────────

    @retry(retry=retry_if_exception_type(Exception), stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=1, max=10), reraise=True)
    async def recommend_pathways(
        self,
        transcript: str,
        entities: dict[str, Any],
        available_pathways: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Rank available clinical pathways by pathway-match relevance (not diagnosis)."""
        pathway_blocks: list[str] = []
        for p in available_pathways[:40]:
            routing_text = (p.get("routing_text") or "").strip()
            if routing_text:
                pathway_blocks.append(f"[id:{p['id']}]\n{routing_text}")
                continue
            aliases = ", ".join(p.get("aliases") or [])
            complaints = ", ".join(p.get("presenting_complaints") or [])
            context = ", ".join(p.get("body_context_terms") or [])
            desc = (p.get("routing_description") or "").strip()
            pathway_blocks.append(
                f"- {p.get('name', '')} ({p.get('condition', '')}) [id:{p['id']}]\n"
                f"  Aliases: {aliases or '—'}\n"
                f"  Presentations: {complaints or '—'}\n"
                f"  Context: {context or '—'}\n"
                f"  Routing: {desc or '—'}"
            )
        pathway_list = "\n\n".join(pathway_blocks)
        entities_str = json.dumps(entities, indent=2)
        response = await self.client.chat.completions.create(
            model=self.fast,
            max_completion_tokens=1500,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_registry.get_prompt("PATHWAY_RECOMMENDATION", PATHWAY_SYSTEM)},
                {"role": "user", "content": (
                    f"Transcript summary:\n{transcript[:2000]}\n\n"
                    f"Extracted entities:\n{entities_str}\n\n"
                    f"Available pathways (approved library only):\n{pathway_list}\n\n"
                    "Return JSON with key 'pathways' (max 3) ranked by pathway relevance. "
                    "Use matchLevel high|moderate|low. Do not diagnose."
                )},
            ],
        )
        result = _parse(response.choices[0].message.content or "{}")
        if result.get("no_match") is True:
            return []
        return result.get("pathways", []) or result.get("candidates", [])

    # ── Question Answering ───────────────────────────────────────────────────

    @retry(retry=retry_if_exception_type(Exception), stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=1, max=10), reraise=True)
    async def answer_questions(
        self,
        transcript: str,
        entities: dict[str, Any],
        questions: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Pre-fill clinical questions using the transcript and extracted entities."""
        q_list = json.dumps([
            {"id": q.get("id", ""), "question": q.get("question", ""), "type": q.get("type", "TEXT")}
            for q in questions[:40]
        ], indent=2)
        entities_str = json.dumps(entities, indent=2)
        response = await self.client.chat.completions.create(
            model=self.fast,
            max_completion_tokens=3000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_registry.get_prompt("QUESTION_PREFILL", QA_SYSTEM)},
                {"role": "user", "content": (
                    f"Transcript:\n{transcript[:3000]}\n\n"
                    f"Extracted entities:\n{entities_str}\n\n"
                    f"Questions to answer:\n{q_list}\n\n"
                    "Return JSON with key 'answers' — array of {id, answer, confidence, source}."
                )},
            ],
        )
        result = _parse(response.choices[0].message.content or "{}")
        return result.get("answers", [])

    # ── Red Flag Screening ───────────────────────────────────────────────────

    @retry(retry=retry_if_exception_type(Exception), stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=1, max=10), reraise=True)
    async def screen_red_flags(
        self,
        entities: dict[str, Any],
        demographics: dict[str, Any],
        question_responses: list[dict[str, Any]],
        pathway_rules: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Identify clinical red flags, contraindications, and emergency symptoms."""
        context = json.dumps({
            "entities": entities,
            "demographics": demographics,
            "responses": question_responses[:30],
            "clinical_rules": pathway_rules[:20],
        }, indent=2)
        response = await self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=2000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_registry.get_prompt("RED_FLAG_SCREENING", RED_FLAG_SYSTEM)},
                {"role": "user", "content": f"Clinical data:\n{context}\n\nIdentify all red flags and safety concerns."},
            ],
        )
        return _parse(response.choices[0].message.content or "{}")

    # ── Clinical Judgment Red-Flag Ranking ───────────────────────────────────

    @retry(
        retry=retry_if_exception(is_retryable_openai_error),
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def generate_cj_red_flags(
        self,
        consultation_context: dict[str, Any],
        approved_candidates: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Rank and phrase up to 3 unresolved red-flag questions from an approved
        candidate list. Must not invent candidates, severities, or referral actions.
        """
        payload = {
            "schemaVersion": "cj-red-flag-input-1.0",
            "consultationContext": consultation_context,
            "approvedCandidates": approved_candidates,
        }
        response = await self._chat_complete(
            model=self.model,
            max_completion_tokens=1500,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_registry.get_prompt("CJ_RED_FLAG_GENERATION", CJ_RED_FLAG_SYSTEM)},
                {
                    "role": "user",
                    "content": (
                        "Select and phrase 1 to 3 priority red-flag questions "
                        "from this approved set. Always return at least one question. "
                        f"Never return an empty questions array.\n{json.dumps(payload, indent=2)}"
                    ),
                },
            ],
        )
        result = _parse(response.choices[0].message.content or "{}")
        questions = _materialize_cj_red_flag_questions(
            approved_candidates, result.get("questions")
        )
        return {
            "schemaVersion": "cj-red-flag-output-1.0",
            "status": "OK" if questions else "CANNOT_GENERATE",
            "questions": questions,
            "missingFields": result.get("missingFields") or [],
            "warnings": result.get("warnings") or [],
        }

    # ── Draft clinical prose (Clinical Judgment assessment summary, etc.) ─────

    @retry(
        retry=retry_if_exception(is_retryable_openai_error),
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def draft_text(
        self,
        task: str,
        inputs: dict[str, Any],
        constraints: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Polish pharmacist-confirmed facts into short clinical prose. Never invent findings."""
        limits = constraints or {}
        max_chars = int(limits.get("max_chars") or 2000)
        diagnosis = str(inputs.get("working_diagnosis") or "").strip()
        certainty = str(inputs.get("diagnostic_certainty") or "").strip()
        complaint = str(inputs.get("chief_complaint") or "").strip()
        excerpt = str(inputs.get("transcript_excerpt") or "").strip()

        user = json.dumps(
            {
                "task": task or "CJ_ASSESSMENT_SUMMARY",
                "working_diagnosis": diagnosis,
                "diagnostic_certainty": certainty,
                "chief_complaint": complaint,
                "transcript_excerpt": excerpt[:800],
            },
            indent=2,
        )
        response = await self._chat_complete(
            model=self.fast,
            max_completion_tokens=700,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": prompt_registry.get_prompt("CJ_ASSESSMENT_SUMMARY", CJ_ASSESSMENT_SYSTEM),
                },
                {"role": "user", "content": user},
            ],
        )
        parsed = _parse(response.choices[0].message.content or "{}")
        text = str(parsed.get("text") or parsed.get("summary") or "").strip()
        if len(text) < 10:
            return {"text": ""}
        return {"text": text[:max_chars]}

    @retry(
        retry=retry_if_exception(is_retryable_openai_error),
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=6),
        reraise=True,
    )
    async def refine_renew_documentation(
        self,
        *,
        document_kind: str,
        system_prompt: str,
        draft_body: str,
        verified_facts: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Refine a Nest-built renew document draft using the live Super Admin prompt."""
        kind = (document_kind or "").strip() or "consultation_note"
        system = (
            system_prompt.strip()
            if isinstance(system_prompt, str) and system_prompt.strip()
            else prompt_registry.get_prompt(
                f"RENEW_DOCUMENTATION_{kind.upper()}",
                (
                    "Refine the VERIFIED_DRAFT for a pharmacist renewal document. "
                    "Preserve every clinical fact. Return JSON {\"body\": \"...\"}."
                ),
            )
        )
        facts = verified_facts if isinstance(verified_facts, dict) else {}
        user = (
            f"DOCUMENT_KIND: {kind}\n\n"
            "VERIFIED_DRAFT (source of truth — preserve every clinical fact, "
            "medication name, direction, lab value, and decision):\n"
            f"{draft_body[:12000]}\n\n"
            "VERIFIED_FACTS (optional structured context):\n"
            f"{json.dumps(facts, indent=2)[:4000]}\n\n"
            "Return JSON only: {\"body\": \"<full plain-text document>\"}"
        )
        max_tokens = 3500 if kind == "consultation_note" else 1800
        response = await self._chat_complete(
            model=self.fast,
            max_completion_tokens=max_tokens,
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        parsed = _parse(_choice_text(response) or "{}")
        body = str(parsed.get("body") or "").strip()
        return {"body": body, "document_kind": kind}

    # ── Eligibility Assessment ───────────────────────────────────────────────

    @retry(retry=retry_if_exception_type(Exception), stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=1, max=10), reraise=True)
    async def assess_eligibility(
        self,
        entities: dict[str, Any],
        demographics: dict[str, Any],
        red_flags: dict[str, Any],
        pathway_treatments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Determine treatment eligibility based on patient profile and pathway criteria."""
        context = json.dumps({
            "entities": entities,
            "demographics": demographics,
            "red_flags": red_flags,
            "treatments": pathway_treatments[:10],
        }, indent=2)
        response = await self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=2000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_registry.get_prompt("ELIGIBILITY_ASSESSMENT", ELIGIBILITY_SYSTEM)},
                {"role": "user", "content": f"Patient clinical data:\n{context}"},
            ],
        )
        return _parse(response.choices[0].message.content or "{}")

    # ── Treatment Recommendation ─────────────────────────────────────────────

    @retry(retry=retry_if_exception_type(Exception), stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=1, max=10), reraise=True)
    async def recommend_treatment(
        self,
        entities: dict[str, Any],
        demographics: dict[str, Any],
        eligibility: dict[str, Any],
        pathway_treatments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Generate evidence-based treatment recommendations."""
        context = json.dumps({
            "entities": entities,
            "demographics": demographics,
            "eligibility": eligibility,
            "available_treatments": pathway_treatments,
        }, indent=2)
        response = await self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=3000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_registry.get_prompt("TREATMENT_RECOMMENDATION", TREATMENT_SYSTEM)},
                {"role": "user", "content": f"Patient data:\n{context}"},
            ],
        )
        return _parse(response.choices[0].message.content or "{}")

    # ── Counselling Generation ───────────────────────────────────────────────

    @retry(
        retry=retry_if_exception(is_retryable_openai_error),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def generate_counselling(
        self,
        treatment_plan: dict[str, Any] | None = None,
        entities: dict[str, Any] | None = None,
        pathway_counselling: list[dict[str, Any]] | None = None,
        consultation_data: dict[str, Any] | None = None,
        patient_context: dict[str, Any] | None = None,
        selected_treatments: list[dict[str, Any]] | None = None,
        approved_counselling: dict[str, Any] | None = None,
        stricter_retry: bool = False,
    ) -> dict[str, Any]:
        """Draft four counselling cards from the validated counselling payload."""
        treatments = selected_treatments or []
        if not treatments and isinstance(treatment_plan, dict):
            recs = treatment_plan.get("recommendations")
            if isinstance(recs, list):
                treatments = [row for row in recs if isinstance(row, dict)]
        context = {
            "patient_context": patient_context or {},
            "selected_treatments": treatments[:8],
            "approved_counselling": approved_counselling
            or {
                "medication_use": [],
                "expected_response": [],
                "self_care": [],
                "follow_up": [],
                "safety_net": [],
            },
        }
        payload = json.dumps(context, separators=(",", ":"))[:6000]
        user_instruction = prompt_registry.get_prompt(
            "COUNSELLING_USER_INSTRUCTION",
            COUNSELLING_RETRY_USER if stricter_retry else COUNSELLING_USER,
        )
        logger.info(
            "counselling generate treatments=%s approved_keys=%s stricter=%s",
            len(treatments),
            {k: len(v) if isinstance(v, list) else 0 for k, v in (approved_counselling or {}).items()},
            stricter_retry,
        )
        response = await self._chat_complete(
            model=self.fast,
            max_completion_tokens=2500,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": prompt_registry.get_prompt("COUNSELLING_GENERATION", COUNSELLING_SYSTEM)},
                {"role": "user", "content": user_instruction + "\n\n" + payload},
            ],
        )
        raw = _choice_text(response)
        parsed = _normalize_counselling(_parse(raw or "{}"))
        if _counselling_has_medication(parsed) or _counselling_bullet_count(parsed) > 0:
            return parsed

        logger.warning(
            "Counselling LLM returned no usable bullets (chars=%s) — using treatment-direction fallback",
            len(raw),
        )
        return _fallback_counselling_from_treatments(
            treatments,
            approved_counselling or {},
        )

    # ── Documentation Generation ─────────────────────────────────────────────

    async def generate_documentation(
        self,
        consultation_data: dict[str, Any],
        document_formats: dict[str, Any] | None = None,
        document_prompts: dict[str, Any] | None = None,
        stricter_retry: bool = False,
        requested_documents: list[str] | None = None,
    ) -> dict[str, Any]:
        """Generate Step 6 LLM documents concurrently. Deterministic docs are omitted."""
        prompts = document_prompts if isinstance(document_prompts, dict) else {}
        use_split = bool(prompts) or "dap_payload" in consultation_data
        started = time.monotonic()
        llm_keys = resolve_requested_llm_documents(requested_documents)
        if use_split:
            documents = await self._generate_documents_separately(
                consultation_data,
                document_formats,
                prompts,
                stricter_retry,
                llm_keys,
            )
            logger.info(
                "documentation_bundle keys=%s duration_ms=%d retry=%s",
                ",".join(llm_keys) or "none",
                int((time.monotonic() - started) * 1000),
                stricter_retry,
            )
            return {
                "version": 3,
                "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "revision": 1,
                "documents": documents,
                "disclaimer": (
                    "AI-generated documentation. Must be reviewed and approved "
                    "by a licensed pharmacist before use."
                ),
            }

        summary = json.dumps(consultation_data, indent=2)[:12000]
        format_block = _format_block(document_formats, None, include_writing_prompt=True)
        response = await self._chat_complete(
            model=self.fast,
            max_completion_tokens=8000,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": DOCUMENTATION_SYSTEM,
                },
                {
                    "role": "user",
                    "content": f"Complete consultation data:\n{summary}{format_block}",
                },
            ],
        )
        logger.info(
            "documentation_bundle keys=legacy duration_ms=%d retry=%s",
            int((time.monotonic() - started) * 1000),
            stricter_retry,
        )
        return _parse(_choice_text(response) or "{}")

    async def _generate_documents_separately(
        self,
        consultation_data: dict[str, Any],
        document_formats: dict[str, Any] | None,
        document_prompts: dict[str, Any],
        stricter_retry: bool,
        requested_documents: list[str] | None = None,
    ) -> dict[str, Any]:
        specs = (
            (
                "consultation_note",
                "DOCUMENTATION_CONSULTATION_NOTE",
                "dap_payload",
                DAP_NOTE_SYSTEM,
                3500,
            ),
            (
                "prescription",
                "DOCUMENTATION_PRESCRIPTION",
                "prescription_payload",
                PRESCRIPTION_SYSTEM,
                1200,
            ),
            (
                "prescriber_communication",
                "DOCUMENTATION_PRESCRIBER_COMMUNICATION",
                "pcp_payload",
                PCP_NOTE_SYSTEM,
                1800,
            ),
            (
                "patient_care_summary",
                "DOCUMENTATION_PATIENT_CARE_SUMMARY",
                "patient_summary_payload",
                PATIENT_SUMMARY_SYSTEM,
                1800,
            ),
        )
        llm_keys = set(resolve_requested_llm_documents(requested_documents))
        active_specs = [
            spec
            for spec in specs
            if spec[0] in llm_keys and spec[0] not in DOCUMENTATION_DETERMINISTIC_KEYS
        ]
        if not active_specs:
            return {key: {} for key in llm_keys}
        results = await asyncio.gather(
            *[
                self._generate_one_document(
                    doc_key=doc_key,
                    prompt_key=prompt_key,
                    payload_key=payload_key,
                    fallback_prompt=fallback,
                    max_tokens=max_tokens,
                    consultation_data=consultation_data,
                    document_formats=document_formats,
                    document_prompts=document_prompts,
                    stricter_retry=stricter_retry,
                )
                for doc_key, prompt_key, payload_key, fallback, max_tokens in active_specs
            ],
            return_exceptions=True,
        )
        documents: dict[str, Any] = {}
        for spec, result in zip(active_specs, results):
            doc_key = spec[0]
            if isinstance(result, Exception):
                logger.warning("Documentation %s failed: %s", doc_key, result)
                documents[doc_key] = {}
            else:
                documents[doc_key] = result
        return documents

    async def _generate_one_document(
        self,
        *,
        doc_key: str,
        prompt_key: str,
        payload_key: str,
        fallback_prompt: str,
        max_tokens: int,
        consultation_data: dict[str, Any],
        document_formats: dict[str, Any] | None,
        document_prompts: dict[str, Any],
        stricter_retry: bool,
    ) -> dict[str, Any]:
        started = time.monotonic()
        if doc_key in DOCUMENTATION_DETERMINISTIC_KEYS:
            logger.info(
                "documentation_document_skipped doc_key=%s reason=deterministic",
                doc_key,
            )
            return {}
        supplied = document_prompts.get(doc_key)
        prompt_source = "request"
        if isinstance(supplied, str) and supplied.strip():
            system = supplied.strip()
        else:
            prompt_source = "registry_or_fallback"
            system = prompt_registry.get_prompt(prompt_key, fallback_prompt)
        payload = consultation_data.get(payload_key)
        if doc_key == "consultation_note":
            adapt_source = consultation_data.get("adapt_dap_source")
            renew_source = consultation_data.get("renew_dap_source")
            if isinstance(adapt_source, dict) and adapt_source:
                payload = adapt_source
                payload_key = "adapt_dap_source"
            elif isinstance(renew_source, dict) and renew_source:
                payload = renew_source
                payload_key = "renew_dap_source"
        elif doc_key == "prescriber_communication":
            adapt_pcp = consultation_data.get("adapt_pcp_source")
            renew_pcp = consultation_data.get("renew_pcp_source")
            if isinstance(adapt_pcp, dict) and adapt_pcp:
                payload = adapt_pcp
                payload_key = "adapt_pcp_source"
            elif isinstance(renew_pcp, dict) and renew_pcp:
                payload = renew_pcp
                payload_key = "renew_pcp_source"
        elif doc_key == "patient_care_summary":
            adapt_handout = consultation_data.get("adapt_handout_source")
            if isinstance(adapt_handout, dict) and adapt_handout:
                payload = adapt_handout
                payload_key = "adapt_handout_source"
        if not isinstance(payload, dict):
            payload = {}
        if (
            doc_key == "patient_care_summary"
            and payload_key != "adapt_handout_source"
            and not _handout_generation_allowed(payload)
        ):
            return {}
        user = (
            f"VERIFIED PAYLOAD for `{doc_key}` — use only this data:\n"
            + _payload_json({payload_key: payload})
            + _format_block(
                document_formats,
                doc_key,
                include_writing_prompt=False,
            )
        )
        if stricter_retry:
            user += "\n\n" + DOCUMENTATION_RETRY_USER
        try:
            response = await self._chat_complete(
                model=self.fast,
                max_completion_tokens=max_tokens,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            parsed = _parse(_choice_text(response) or "{}")
            unwrapped = _unwrap_document(parsed, doc_key)
            if doc_key == "patient_care_summary":
                if payload_key == "adapt_handout_source":
                    return _normalize_adapt_handout(unwrapped)
                return _flatten_handout(unwrapped)
            return unwrapped
        finally:
            logger.info(
                "documentation_document_generated doc_key=%s duration_ms=%d retry=%s prompt_source=%s prompt_chars=%d",
                doc_key,
                int((time.monotonic() - started) * 1000),
                stricter_retry,
                prompt_source,
                len(system),
            )

    @retry(
        retry=retry_if_exception(is_retryable_openai_error),
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=6),
        reraise=True,
    )
    async def generate_referral_letter(
        self,
        referral_payload: dict[str, Any] | None = None,
        system_prompt: str | None = None,
    ) -> dict[str, Any]:
        """Draft a referral letter from verified referral facts + Super Admin prompt."""
        payload = referral_payload if isinstance(referral_payload, dict) else {}
        system = (
            system_prompt.strip()
            if isinstance(system_prompt, str) and system_prompt.strip()
            else prompt_registry.get_prompt(
                "DOCUMENTATION_REFERRAL_LETTER",
                REFERRAL_LETTER_SYSTEM,
            )
        )
        user = (
            "VERIFIED PAYLOAD for `referral_letter` — use only this data:\n"
            + json.dumps({"referral_payload": payload}, indent=2)[:8000]
        )
        response = await self._chat_complete(
            model=self.fast,
            max_completion_tokens=1800,
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        parsed = _parse(_choice_text(response) or "{}")
        if "letterText" not in parsed and isinstance(parsed.get("referral_letter"), dict):
            nested = parsed["referral_letter"]
            if isinstance(nested, dict):
                parsed = nested
        return parsed

    async def generate_referral_reason(
        self,
        draft_payload: dict[str, Any] | None = None,
        system_prompt: str | None = None,
    ) -> dict[str, Any]:
        """Draft a provider-facing reason for referral from verified facts."""
        payload = draft_payload if isinstance(draft_payload, dict) else {}
        system = (
            system_prompt.strip()
            if isinstance(system_prompt, str) and system_prompt.strip()
            else prompt_registry.get_prompt(
                "DOCUMENTATION_REFERRAL_REASON",
                REFERRAL_REASON_SYSTEM,
            )
        )
        user = (
            "VERIFIED PAYLOAD for `referral_reason` — use only this data:\n"
            + json.dumps(payload, indent=2)[:8000]
        )
        schema: dict[str, Any] = {
            "type": "json_schema",
            "json_schema": {
                "name": "referral_reason",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "draftReason": {"type": "string"},
                        "usedFactIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "usedReferralTriggerIds": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "needsManualReason": {"type": "boolean"},
                        "insufficientContext": {"type": "boolean"},
                    },
                    "required": [
                        "draftReason",
                        "usedFactIds",
                        "usedReferralTriggerIds",
                        "needsManualReason",
                        "insufficientContext",
                    ],
                },
            },
        }
        try:
            response = await self._chat_complete(
                model=self.fast,
                max_completion_tokens=700,
                temperature=0.1,
                response_format=schema,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
        except BadRequestError:
            response = await self._chat_complete(
                model=self.fast,
                max_completion_tokens=700,
                temperature=0.1,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
        parsed = _parse(_choice_text(response) or "{}")
        if "draftReason" not in parsed and isinstance(parsed.get("reason"), str):
            parsed = {
                "draftReason": parsed.get("reason"),
                "usedFactIds": parsed.get("usedFactIds") or [],
                "usedReferralTriggerIds": parsed.get("usedReferralTriggerIds")
                or parsed.get("usedReferralReasonIds")
                or [],
                "needsManualReason": bool(parsed.get("needsManualReason")),
                "insufficientContext": bool(parsed.get("insufficientContext")),
            }
        if "usedReferralTriggerIds" not in parsed and "usedReferralReasonIds" in parsed:
            parsed["usedReferralTriggerIds"] = parsed.get("usedReferralReasonIds") or []
        if "insufficientContext" not in parsed:
            parsed["insufficientContext"] = False
        return parsed


# ─── Prompt Templates ─────────────────────────────────────────────────────────

TRANSCRIPT_SYSTEM = """You are an expert clinical pharmacist AI assistant.
Analyze patient consultation transcripts and extract structured clinical information.
Transcripts may contain typos — interpret intended clinical meaning (e.g. "coldscore" → cold sore, "amoxlien" → amoxicillin, "egfr for 25" → eGFR 25).

Rules:
1. demographics.sex: Infer from pronouns and wording.
   - "he" / "him" → "Male"
   - "she" / "her" → "Female"
   - Explicit male/female/man/woman also set sex.
   - If pregnant or breastfeeding is mentioned → sex "Female" and set pregnant true/false accordingly.
   - Use exactly "Male", "Female", or "Other" (never lowercase).
2. demographics.pregnant: true if currently pregnant; false if not pregnant or breastfeeding-only; null if unknown.
3. symptoms + chiefComplaint: Current presenting illness / reason for visit ONLY.
4. conditions: PAST medical history / chronic diagnoses ONLY.
   - NEVER put the current presenting complaint or acute symptoms into conditions.
   - Example: transcript "patient has a cold sore" → symptoms include cold sore; conditions = [] (not "cold").
   - Only include conditions clearly described as history (e.g. "history of asthma", "has diabetes").
   - NEVER put lab results (eGFR, HbA1c, creatinine, INR, etc.) into conditions — use labValues.
5. allergies: Known drug/allergens only (fix typos like amoxlien → amoxicillin). Do not invent allergies.
   - "allergic to amoxicillin" → allergies only. Do NOT also list amoxicillin under medications.
   - Set allergyType when the transcript supports it:
     - "severe" / anaphylaxis / swelling / breathing difficulty → "severe"
     - rash / hives / itching without swelling or breathing issues → "non_severe"
     - otherwise → "unknown"
   - Put a short reaction phrase in reaction when mentioned (e.g. "rash", "anaphylaxis").
6. medications: Current/regular medicines ONLY when the transcript explicitly says the patient is taking / on / prescribed them.
   - Omit dose and frequency when the transcript does not state them. Never use "Unknown", "N/A", or similar placeholders.
   - Do NOT add a drug just because its name appears.
   - Do NOT add allergy drugs as medications unless the patient is ALSO taking them.
   - Example: "allergic to amoxicillin" → medications = [] (allergy only).
7. labValues: Numeric lab/test results (eGFR, HbA1c, creatinine, INR, electrolytes, lipids, TSH, etc.).
   - "egfr for 25" / "eGFR 25" → {"test":"eGFR","value":"25","unit":"mL/min"}
   - "HbA1c 7.2" → {"test":"HbA1c","value":"7.2","unit":"%"}
   - NEVER put these in conditions / medical history.

Return JSON with this structure:
{
  "chiefComplaint": "string",
  "symptoms": [{"symptom": "string", "duration": "string", "severity": "mild|moderate|severe", "confidence": 90}],
  "medications": [{"name": "string", "dose": "string", "frequency": "string", "confidence": 90}],
  "allergies": [{"allergen": "string", "reaction": "string", "allergyType": "non_severe|severe|unknown", "confidence": 90}],
  "conditions": [{"condition": "string", "confidence": 90}],
  "labValues": [{"test": "string", "value": "string", "unit": "string", "confidence": 90}],
  "demographics": {
    "age": null, "sex": null, "weight": null, "height": null,
    "pregnant": null, "smokingStatus": null, "alcoholUse": null
  },
  "riskFactors": ["string"],
  "onsetDate": null,
  "patientConcerns": ["string"],
  "overallConfidence": 85
}"""

PATHWAY_SYSTEM = """You are an expert clinical pharmacist AI.
Given patient symptoms, extracted clinical entities, and optional clinical photo findings, rank the available clinical pathways by match confidence.

CRITICAL RULES:
- ONLY return pathways that are clinically related to the transcript / photo findings.
- Do NOT return unrelated pathways (e.g. do not return a UTI pathway for a cold sore consultation).
- Prefer 1–5 highly relevant pathways. Omit anything below ~60 confidence.
- Weight clinical photos strongly when present (e.g. lip vesicles → cold sore / herpes labialis).
- Use entities.imageFindings.suggestedPathwayHints, suggestedConditions, summary, and visibleFindings with the transcript.

Return JSON:
{
  "pathways": [
    {
      "id": "pathway_id",
      "name": "pathway name",
      "confidence": 95,
      "matchedSymptoms": ["symptom1", "symptom2"],
      "reasoning": "clinical explanation including photo evidence when used",
      "priority": 1
    }
  ]
}"""

QA_SYSTEM = """You are an expert clinical pharmacist AI.
Using the transcript and extracted entities, answer clinical consultation questions.

For each question return:
- answer: the extracted answer (string, boolean, number as appropriate)
- confidence: 0-100
- source: "transcript" | "entity" | "inferred"
- answerText: human-readable version

Only answer if you have clear evidence. Leave null if uncertain (confidence < 60).

Return JSON: {"answers": [{id, answer, answerText, confidence, source}]}"""

RED_FLAG_SYSTEM = """You are a clinical safety expert pharmacist.
Screen patient data for red flags, emergency conditions, contraindications, and high-risk situations.

Return JSON:
{
  "hasRedFlags": true,
  "overallRisk": "low|medium|high|critical",
  "redFlags": [
    {
      "flag": "flag name",
      "severity": "WARNING|HIGH|CRITICAL|EMERGENCY",
      "description": "clinical explanation",
      "reasoning": "why this is a red flag",
      "recommendedAction": "what to do",
      "requiresImmediateAction": false
    }
  ],
  "contraindications": ["string"],
  "summary": "brief clinical summary"
}"""

ELIGIBILITY_SYSTEM = """You are a clinical pharmacist expert in treatment eligibility assessment.
Evaluate patient eligibility for treatment based on clinical guidelines, demographics, and red flags.

Return JSON:
{
  "eligible": true,
  "confidence": 90,
  "overallAssessment": "ELIGIBLE|NOT_ELIGIBLE|CONDITIONAL",
  "summary": "brief assessment summary",
  "criteria": [
    {
      "criterion": "criterion name",
      "met": true,
      "explanation": "why met or not met",
      "source": "guideline reference"
    }
  ],
  "conditions": ["any special conditions for eligibility"],
  "recommendedAction": "proceed|refer|defer"
}"""

TREATMENT_SYSTEM = """You are an expert clinical pharmacist with deep knowledge of evidence-based prescribing.
Generate treatment recommendations based on patient profile, eligibility, and clinical pathways.

Return JSON:
{
  "recommendedTreatments": [
    {
      "priority": 1,
      "medicationName": "string",
      "genericName": "string",
      "dose": "string",
      "route": "string",
      "frequency": "string",
      "duration": "string",
      "instructions": "string",
      "reasoning": "clinical reasoning",
      "contraindications": ["string"],
      "interactions": ["string"],
      "monitoring": "string",
      "confidence": 90
    }
  ],
  "alternativeTreatments": [],
  "nonPharmacological": ["string"],
  "lifestyleAdvice": ["string"],
  "referralRecommended": false,
  "referralReasoning": null,
  "followUpRequired": true,
  "followUpTimeframe": "48-72 hours",
  "summary": "brief treatment summary"
}"""

CJ_RED_FLAG_SYSTEM = (
    "You assist a Canadian pharmacist by selecting one to three unresolved "
    "red-flag questions from an approved candidate list supplied by the server. "
    "Use only the supplied candidates and confirmed patient context. "
    "Prioritize findings that would most change referral or prescribing disposition. "
    "Do not diagnose, answer a question, invent candidates, change severity, "
    "change referralAction, or state that prescribing is safe. "
    "Return only schema-valid JSON matching: "
    '{"schemaVersion":"cj-red-flag-output-1.0","status":"OK",'
    '"questions":[{"candidateId":"...","question":"...","whyItMatters":"...",'
    '"priorityRank":1,"selectionReasonCode":"DISPOSITION_CHANGING",'
    '"severity":"...","referralAction":"...","ruleId":null,'
    '"sourceReferences":[]}],"missingFields":[],"warnings":[]}. '
    "severity, referralAction, ruleId, and sourceReferences must exactly match "
    "the selected candidate. questions.length must be 1..3. Never return an empty "
    "questions array. If unsure, select the most generally applicable candidate."
)

CJ_ASSESSMENT_SYSTEM = (
    "You are drafting a pharmacist assessment summary from confirmed consultation facts. "
    "Use only the supplied working diagnosis, diagnostic certainty, presenting concern, "
    "and excerpt. Do not invent examination findings, labs, medications, or red flags. "
    "Do not change diagnostic certainty. Do not mention SafeScribe or AI. "
    "Return JSON {\"text\": \"...\"} as 2–5 professional clinical sentences."
)

COUNSELLING_USER = (
    "Draft pharmacist-facing counselling JSON from PATIENT_CONTEXT, "
    "SELECTED_TREATMENTS, and APPROVED_COUNSELLING only. Return exactly four "
    "sections in order. MEDICATION_USE is one compact line per confirmed medicine "
    "(name + patient directions). EXPECTED_RESPONSE max 2. SELF_CARE and FOLLOW_UP max 3. "
    "Never Tablet(s), Oral route, {BID}, or a Directions: prefix. "
    "If a section has approved/confirmed source text, populate it from that source. "
    "If a section has no approved/confirmed source, return an empty bullets array. "
    "Never invent facts, timeframes, self-care, or red flags. Never return keyMessages."
)

COUNSELLING_RETRY_USER = (
    "The previous draft failed medication validation. Rewrite MEDICATION_USE as one "
    "patient-friendly sentence per SELECTED_TREATMENTS item. Keep each display_name "
    "unchanged. State the same dose, route, frequency, and duration in plain language "
    "a pharmacist can say to the patient. Never output Tablet(s), Oral route, {BID}, "
    "BID, or a Directions: prefix. Do not add brand names. Cards 2-4 may only use "
    "APPROVED_COUNSELLING. Return the four-section JSON only."
)

COUNSELLING_SYSTEM = """You are a clinical pharmacist drafting concise, patient-friendly counselling for PHARMACIST REVIEW during a minor-ailment consultation.

The pharmacist will review and may edit this draft before discussing it with the patient.

Your role is to organize, simplify, and personalize verified clinical information. Do not independently create new clinical recommendations.

INPUT SOURCES

1. PATIENT_CONTEXT
Confirmed patient-specific clinical information.

2. SELECTED_TREATMENTS
One or more pharmacist-confirmed treatments. This is the absolute source of truth for medication display name, strength, dose, route, frequency, duration, quantity, and administration directions.

3. APPROVED_COUNSELLING
Approved condition-specific and/or treatment-specific counselling supplied by the application. It may include medication-use instructions, expected response, self-care, follow-up, safety-net, and urgent-care advice.

SOURCE PRIORITY
1. SELECTED_TREATMENTS
2. PATIENT_CONTEXT
3. APPROVED_COUNSELLING

If information conflicts, use the higher-priority source. Do not use outside medical knowledge to add new clinical instructions. If information required for a section is absent from the validated inputs, return an empty bullets array for that section.

MEDICATION PRESERVATION
Use medication display_name exactly as supplied. Do not add brand names, generic names, parenthetical names, or trademark symbols. You may rewrite inventory dosage-form wording (Tablet(s), Oral route, {BID}) into spoken English.

CLINICAL SAFETY RULES
- Preserve the clinical meaning of every confirmed regimen (same medicine, dose, route, frequency, duration). Rewrite inventory SIG fragments into plain patient language.
- Never change, calculate, infer, substitute, optimize, or correct the confirmed dose, frequency, or duration.
- If more than one treatment is confirmed, include one essential how-to-use sentence for every confirmed treatment.
- Additional timing, technique, administration advice, or precautions may be included only when explicitly present in SELECTED_TREATMENTS or APPROVED_COUNSELLING, and only if they do not repeat the SIG.
- Never invent symptoms, diagnoses, allergies, medications, conditions, examination findings, labs, contraindications, interactions, red flags, expected-response timelines, treatment decisions, follow-up intervals, or referral actions.
- Missing, blank, unknown, or not-assessed information must never be converted into a negative finding.
- Do not mention SafeScribe, AI, pathways, Safety Alert, safety engines, clinical rules, eligibility checks, or internal alerts.
- Do not add generic counselling merely to fill a section.
- Write in plain language that the pharmacist can comfortably say directly to the patient.

STYLE
- concise, calm, practical, patient-friendly
- short sentences
- no unnecessary pharmacology or jargon
- maximum 3 bullets per pathway section (EXPECTED_RESPONSE max 2)
- MEDICATION_USE is one compact line per confirmed medicine

RETURN JSON ONLY
{
  "sections": [
    {"section_key": "MEDICATION_USE", "bullets": []},
    {"section_key": "EXPECTED_RESPONSE", "bullets": []},
    {"section_key": "SELF_CARE", "bullets": []},
    {"section_key": "FOLLOW_UP", "bullets": []}
  ]
}

SECTION RULES
MEDICATION_USE
- Write one plain-language sentence per confirmed medicine that a pharmacist can say to the patient.
- Use display_name exactly as supplied.
- Convert inventory SIG wording into spoken English: "tablet" not "Tablet(s)"; "by mouth" not "by Oral route"; "twice daily" not "{BID}" or "BID".
- Never output a "Directions:" prefix, curly-brace SIG codes, or "Tablet(s)" / "Oral route".
- Prefer SELECTED_TREATMENTS.directions / patient_directions when present; rewrite them into patient language without changing the dose, frequency, or duration.
- One compact line per confirmed medicine. Do not cap at 3 medicines and do not split one SIG into extra bullets.
- Additional timing/technique/precautions may only come from SELECTED_TREATMENTS or APPROVED_COUNSELLING.medication_use, and must not duplicate the SIG.

EXPECTED_RESPONSE
- Use only APPROVED_COUNSELLING.expected_response.
- Maximum 2 bullets.
- Do not generate a timeframe from general medical knowledge.
- If absent, return an empty array.

SELF_CARE
- Use only APPROVED_COUNSELLING.self_care.
- Select the most useful items.
- Maximum 3 bullets.
- Do not output statements such as "No additional self-care measures" when the source array is empty.
- If absent, return an empty array.

FOLLOW_UP
- Use only APPROVED_COUNSELLING.follow_up, APPROVED_COUNSELLING.safety_net, and confirmed patient-specific follow-up/referral instructions.
- Maximum 3 bullets.
- Do not invent red flags or intervals.
- If absent, return an empty array.

FINAL CHECK
Verify every selected treatment is represented by name; the how-to-use sentences keep the same dose, frequency, and duration in plain language; cards 2-4 use only approved/confirmed content; no unsupported clinical facts were added; missing information was not converted into a negative finding; and output is concise.
"""

DOCUMENTATION_RETRY_USER = (
    "STRICTER CORRECTION: The previous draft failed factual validation. "
    "Follow the system prompt. Use only the verified payload. "
    "Do not invent brands, SIGs, counselling, handouts, referrals, negatives, "
    "or missing facts. Quietly omit absent fields. Return JSON fields only."
)

DAP_NOTE_SYSTEM = """You are a clinical pharmacist documentation assistant drafting a professional pharmacist consultation note in DAP format.

Use ONLY the validated dap_payload. Convert verified, pharmacist-confirmed data into natural DAP prose. Do not independently decide what happened.

Return JSON only with exactly:
{"documentTitle":"Pharmacist Consultation Note","data":"","assessment":"","plan":""}

Rules:
- data, assessment, and plan are prose only. Do not put D/A/P headings inside the strings.
- Do not generate treatment/SIG lines in plan; the backend inserts confirmed treatments.
- Document consent in data when consent_obtained is true.
- Omit blank, unknown, empty, or unconfirmed fields. Never convert missing data into a negative finding.
- Do not reproduce questionnaire wording, monograph text, pathway IDs, or internal system terms.
- Do not mention SafeScribe, AI, or Clinical Judgment.
"""

PRESCRIPTION_SYSTEM = """You are a clinical pharmacist documentation assistant drafting a printable prescription from verified treatment data.

Return JSON only:
{"diagnosis":"","notes":"","specialInstructions":"","patientBlock":"","medicationBlock":""}

Do not invent, substitute, or complete missing prescription facts. Leave patientBlock and medicationBlock empty — the backend fills exact SIG lines.
"""

PCP_NOTE_SYSTEM = """You are a clinical pharmacist documentation assistant drafting a brief professional communication to the patient's primary care provider following a pharmacist prescribing assessment.

The purpose is CONTINUITY OF CARE. This is NOT a full consultation note.

Use ONLY the validated pcp_payload. Return JSON only:
{"openingSentence":"","assessment":"","treatment":"","followUp":""}

treatment and followUp must ALWAYS be empty strings — the backend renders those sections.
Do not generate title, header, salutation, closing, or signature.
Do not invent clinical facts. Opening is one sentence. Assessment is 1–2 sentences.
"""

PATIENT_SUMMARY_SYSTEM = """You are creating a simple patient-facing care summary from PHARMACIST-CONFIRMED clinical information.

This is a formatting and language-rendering task. You are NOT performing a new clinical assessment.

Use only patient_summary_payload. Return JSON:
{"title":"","assessment":[],"treatment":[],"expected_response":[],"self_care":[],"seek_care":[],"follow_up":[],"questions_contact":[]}

Leave treatment empty — the backend renders display_name: patient_directions.
Counselling arrays may use only confirmed_counselling. Omit empty sections.
Do not invent advice, timeframes, brands, BID/TID, or mention SafeScribe/AI/pathways.
"""

REFERRAL_REASON_SYSTEM = """You are a clinical writing assistant drafting an editable clinician-to-clinician Reason for referral.

Begin draftReason with approvedLeadSentence exactly as supplied. Use only the supplied facts and trigger IDs. Do not invent findings, urgency, destination, diagnosis confirmation, patient agreement, appointments, or sending.

Return JSON only:
{"draftReason":"...","usedFactIds":[],"usedReferralTriggerIds":[],"needsManualReason":false,"insufficientContext":false}
"""

REFERRAL_LETTER_SYSTEM = """You draft optional clinical paragraphs for a pharmacist referral letter.

Do not generate letterhead, patient identifiers, dates, recipient, subject, canonical reason, greeting, or signature.

Return JSON only:
{"clinicalContext":[],"careProvided":[],"additionalInformation":[],"requestAndFollowUp":[],"reviewIssues":[]}

Each array item is {"text":"...","sourceIds":[]}. Empty arrays are valid. Do not invent findings, urgency, sending, agreement, or "prescribing was not initiated".
"""


def _payload_json(obj: dict[str, Any], limit: int = 24000) -> str:
    raw = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    if len(raw) <= limit:
        return raw
    logger.warning("documentation_payload_truncated chars=%d limit=%d", len(raw), limit)
    return raw[:limit]


def _format_block(
    document_formats: dict[str, Any] | None,
    only_key: str | None,
    *,
    include_writing_prompt: bool = False,
) -> str:
    if not document_formats:
        return ""
    parts: list[str] = []
    for key, meta in document_formats.items():
        if only_key and key != only_key:
            continue
        if not isinstance(meta, dict):
            continue
        name = meta.get("name") or key
        prompt = (meta.get("aiPrompt") or "").strip()
        style = (meta.get("styleNotes") or "").strip()
        schema = meta.get("responseSchema") or {}
        fields = schema.get("fields") if isinstance(schema, dict) else None
        chunk = f"### {name} (`{key}`)\n"
        if style:
            chunk += f"Style: {style}\n"
        if include_writing_prompt and prompt:
            chunk += f"{prompt}\n"
        if isinstance(fields, list) and fields:
            field_lines: list[str] = []
            for f in fields:
                if not isinstance(f, dict):
                    continue
                fk = (f.get("key") or "").strip()
                if not fk:
                    continue
                flabel = (f.get("label") or fk).strip()
                ftype = (f.get("type") or "string").strip()
                req = "required" if f.get("required") else "optional"
                desc = (f.get("description") or "").strip()
                line = f"- {fk} ({ftype}, {req}): {flabel}"
                if desc:
                    line += f" — {desc}"
                field_lines.append(line)
            if field_lines:
                chunk += "Return exactly these JSON fields for this document:\n"
                chunk += "\n".join(field_lines) + "\n"
        parts.append(chunk)
    if not parts:
        return ""
    return (
        "\n\nPer-document JSON contract from Super Admin Doc Format "
        "(the system prompt is the writing authority; this is field layout only):\n"
        + "\n".join(parts)
    )[:4000]


def _unwrap_document(parsed: dict[str, Any], key: str) -> dict[str, Any]:
    if not isinstance(parsed, dict):
        return {}
    inner = parsed.get(key)
    if isinstance(inner, dict):
        return inner
    docs = parsed.get("documents")
    if isinstance(docs, dict) and isinstance(docs.get(key), dict):
        return docs[key]
    return parsed


_HANDOUT_KEY_MAP = {
    "title": "documentTitle",
    "documentTitle": "documentTitle",
    "assessment": "assessment",
    "treatment": "treatment",
    "expected_response": "expectedResponse",
    "expectedResponse": "expectedResponse",
    "self_care": "selfCare",
    "selfCare": "selfCare",
    "seek_care": "seekCare",
    "seekCare": "seekCare",
    "follow_up": "followUp",
    "followUp": "followUp",
    "questions_contact": "questionsContact",
    "questionsContact": "questionsContact",
}


def _join_handout_value(value: Any) -> str:
    if isinstance(value, list):
        return "\n".join(str(item).strip() for item in value if str(item).strip())
    if value is None:
        return ""
    return str(value).strip()


def _flatten_handout(parsed: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in parsed.items():
        dest = _HANDOUT_KEY_MAP.get(key)
        if dest:
            out[dest] = _join_handout_value(value)
        elif isinstance(value, str) and value.strip():
            out[key] = value
    return out


def _as_adapt_handout_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _as_adapt_handout_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [line.strip() for line in value.split("\n") if line.strip()]
    return []


def _normalize_adapt_handout(parsed: dict[str, Any]) -> dict[str, Any]:
    """Preserve Adapt patient-handout narrative JSON (strings + string arrays)."""
    return {
        "what_changed": _as_adapt_handout_str(parsed.get("what_changed")),
        "why_it_changed": _as_adapt_handout_str(parsed.get("why_it_changed")),
        "how_to_use_additional_guidance": _as_adapt_handout_list(
            parsed.get("how_to_use_additional_guidance")
        ),
        "what_to_expect": _as_adapt_handout_list(parsed.get("what_to_expect")),
        "follow_up": _as_adapt_handout_list(
            parsed.get("follow_up") or parsed.get("followUp")
        ),
        "when_to_get_help": _as_adapt_handout_list(
            parsed.get("when_to_get_help")
            or parsed.get("whenToGetHelp")
            or parsed.get("seekCare")
        ),
    }


def _handout_generation_allowed(payload: dict[str, Any]) -> bool:
    status = str(payload.get("status") or "")
    treatments = payload.get("selected_treatments")
    has_treatments = isinstance(treatments, list) and len(treatments) > 0
    confirmed = payload.get("treatment_plan_confirmed")
    if confirmed is False:
        return False
    return status not in ("not_requested", "awaiting_counselling_confirmation") and has_treatments


DOCUMENTATION_SYSTEM = """You are a clinical pharmacist creating a complete professional documentation package
for a pharmacist-led minor ailment consultation. Analyze ALL consultation data provided and generate
exactly THREE audit-ready documents for the Prescribe module:
1) consultation_note — regulatory pharmacy record (DAP / province-equivalent)
2) prescriber_communication — summary for the patient’s physician or authorized prescriber
3) patient_care_summary — personalized plain-language care summary for the patient

Do NOT generate prescription, consultationSummary, medicationInstructions, followUpCare, or any other document types.

Return JSON with this exact structure:
{
  "version": 3,
  "generatedAt": "ISO-8601 timestamp",
  "revision": 1,
  "patientInfo": {
    "name": "string or empty",
    "dateOfBirth": "string or empty",
    "patientId": "string or empty"
  },
  "documents": {
    "consultation_note": {
      "documentTitle": "Pharmacist Consultation Note",
      "data": "string",
      "assessment": "string",
      "plan": "string"
    },
    "prescriber_communication": {
      "headerBlock": "string",
      "salutation": "string",
      "openingSentence": "string",
      "assessment": "string",
      "treatment": "string",
      "followUp": "string",
      "closingSentence": "This update is provided for your information and continuity of care.",
      "signatureBlock": "string"
    },
    "patient_care_summary": {
      "documentTitle": "string",
      "assessment": "string",
      "treatment": "string",
      "expectedResponse": "string",
      "selfCare": "string",
      "seekCare": "string",
      "followUp": "string",
      "questionsContact": "string"
    }
  },
  "disclaimer": "AI-generated documentation. Must be reviewed and approved by a licensed pharmacist before use."
}

Use professional clinical language for consultation_note.
consultation_note is a pharmacist DAP note: title "Pharmacist Consultation Note", then D — Data, A — Assessment, P — Plan. Use only confirmed facts. Omit empty sections and missing entries — never write that labs, vitals, medications, or allergies were not documented. Keep D concise. Do not mention SafeScribe, AI, Clinical Judgment, or pathways. Never convert missing data into negative findings. Preserve exact treatment SIG. If consultationMode is CLINICAL_JUDGMENT or DOCUMENTATION_REFERRAL, use the pharmacist working diagnosis and diagnostic certainty (do not upgrade Probable/Uncertain), pharmacist-confirmed red-flag answers (UNABLE_TO_CONFIRM is not No), prescribing readiness, and confirmed treatment rationale only — not pathway eligibility.
prescriber_communication is a brief pharmacist-to-PCP continuity-of-care letter. Use pcp_payload as the only source of truth. Return only openingSentence and assessment. treatment and followUp must be empty — the backend renders those sections. Do not generate title, header, salutation, closing, or signature. Do not mention SafeScribe, AI, or pathways. Do not ask the PCP to approve the decision.
Use simple, patient-friendly language for patient_care_summary.
patient_care_summary is a take-home care plan. Use patient_summary_payload as the only source of truth. Title "{Condition} — Your Care Plan". Assessment: one patient-friendly sentence from confirmed_assessment. Treatment: leave empty or copy "{display_name}: {patient_directions}" — never rebuild SIG, never add brand/generic/®/"generics"/"as directed". expectedResponse / selfCare / seekCare / followUp: only confirmed_counselling, omit if empty, never invent advice or timeframes. questionsContact: pharmacy name/phone only when supplied. Omit empty sections. Do not mention SafeScribe, AI, or pathways.
Include all relevant medications, dosages, and follow-up from the consultation data. Do not invent clinical facts not supported by the data."""


def _cj_red_flag_question_from_candidate(
    cand: dict[str, Any],
    *,
    question: str | None = None,
    why: str | None = None,
    selection_reason: str | None = None,
    rank: int = 1,
) -> dict[str, Any] | None:
    cid = str(cand.get("candidateId") or "").strip()
    text = (question or "").strip() or str(cand.get("questionTemplate") or "").strip()
    why_it_matters = (why or "").strip() or str(cand.get("whyItMatters") or "").strip()
    if not cid or not text or not why_it_matters:
        return None
    return {
        "candidateId": cid,
        "question": text[:180],
        "whyItMatters": why_it_matters[:240],
        "priorityRank": rank,
        "selectionReasonCode": selection_reason or "DISPOSITION_CHANGING",
        "severity": cand.get("severity"),
        "referralAction": cand.get("referralAction"),
        "ruleId": cand.get("ruleId"),
        "sourceReferences": cand.get("sourceReferences") or [],
    }


def _materialize_cj_red_flag_questions(
    approved_candidates: list[dict[str, Any]],
    parsed_questions: Any,
) -> list[dict[str, Any]]:
    """Keep only approved candidates and never return an empty question set."""
    by_id = {str(c.get("candidateId")): c for c in approved_candidates if c.get("candidateId")}
    questions: list[dict[str, Any]] = []
    seen: set[str] = set()
    raw_list = parsed_questions if isinstance(parsed_questions, list) else []
    for i, q in enumerate(raw_list[:3]):
        if not isinstance(q, dict):
            continue
        cid = str(q.get("candidateId") or "")
        cand = by_id.get(cid)
        if not cand or cid in seen:
            continue
        item = _cj_red_flag_question_from_candidate(
            cand,
            question=str(q.get("question") or ""),
            why=str(q.get("whyItMatters") or ""),
            selection_reason=str(q.get("selectionReasonCode") or "") or None,
            rank=i + 1,
        )
        if not item:
            continue
        seen.add(cid)
        questions.append(item)

    if questions:
        return questions

    for i, cand in enumerate(approved_candidates[:3]):
        item = _cj_red_flag_question_from_candidate(cand, rank=i + 1)
        if not item or item["candidateId"] in seen:
            continue
        seen.add(item["candidateId"])
        questions.append(item)
        if len(questions) >= 3:
            break
    return questions


def _parse(raw: str) -> dict[str, Any]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return {}


def _choice_text(response: Any) -> str:
    try:
        msg = response.choices[0].message
    except (IndexError, AttributeError, TypeError):
        return ""
    content = getattr(msg, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("text"):
                parts.append(str(part["text"]))
            elif hasattr(part, "text") and getattr(part, "text"):
                parts.append(str(part.text))
        return "".join(parts).strip()
    return ""


_COUNSELLING_KEYS = (
    ("MEDICATION_USE", ("medication_use", "howToUse", "how_to_use", "medicationUse")),
    ("EXPECTED_RESPONSE", ("expected_response", "whatToExpect", "what_to_expect", "expectedResponse")),
    ("SELF_CARE", ("self_care", "selfCare", "self-care")),
    ("FOLLOW_UP", ("follow_up", "followUp", "follow-up")),
)


_COUNSELLING_LIMITS = {
    "MEDICATION_USE": 3,
    "EXPECTED_RESPONSE": 2,
    "SELF_CARE": 3,
    "FOLLOW_UP": 3,
}


def _as_bullets(value: Any, limit: int = 3) -> list[str]:
    if isinstance(value, str):
        text = value.strip()
        if not text or text.lower().startswith("no additional self-care"):
            return []
        return [text]
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            text = str(item.get("point") or item.get("text") or item.get("bullet") or "").strip()
        else:
            text = ""
        if text and not text.lower().startswith("no additional self-care"):
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _normalize_counselling(parsed: dict[str, Any]) -> dict[str, Any]:
    by_key: dict[str, list[str]] = {key: [] for key, _ in _COUNSELLING_KEYS}
    sections = parsed.get("sections") if isinstance(parsed, dict) else None
    if isinstance(sections, list):
        for section in sections:
            if not isinstance(section, dict):
                continue
            label = str(section.get("section_key") or section.get("category") or "").strip().lower()
            bullets = _as_bullets(section.get("bullets") or section.get("points") or section.get("items"))
            if not label:
                continue
            for key, aliases in _COUNSELLING_KEYS:
                if label == key.lower() or label.replace(" ", "_") in aliases or any(a.replace("_", " ") in label for a in aliases):
                    by_key[key] = bullets[: _COUNSELLING_LIMITS.get(key, 3)]
                    break
            else:
                if "medication" in label or "how to use" in label:
                    by_key["MEDICATION_USE"] = bullets[: _COUNSELLING_LIMITS["MEDICATION_USE"]]
                elif "expect" in label:
                    by_key["EXPECTED_RESPONSE"] = bullets[: _COUNSELLING_LIMITS["EXPECTED_RESPONSE"]]
                elif "self" in label:
                    by_key["SELF_CARE"] = bullets[: _COUNSELLING_LIMITS["SELF_CARE"]]
                elif "follow" in label or "seek" in label:
                    by_key["FOLLOW_UP"] = bullets[: _COUNSELLING_LIMITS["FOLLOW_UP"]]
    for key, aliases in _COUNSELLING_KEYS:
        if by_key[key]:
            continue
        for alias in (key, *aliases):
            bullets = _as_bullets(
                parsed.get(alias) if isinstance(parsed, dict) else None,
                _COUNSELLING_LIMITS.get(key, 3),
            )
            if bullets:
                by_key[key] = bullets
                break
    return {
        "sections": [
            {"section_key": key, "bullets": by_key[key][: _COUNSELLING_LIMITS[key]]}
            for key, _ in _COUNSELLING_KEYS
        ]
    }


def _counselling_bullet_count(payload: dict[str, Any]) -> int:
    sections = payload.get("sections") if isinstance(payload, dict) else None
    if not isinstance(sections, list):
        return 0
    total = 0
    for section in sections:
        if isinstance(section, dict):
            total += len(_as_bullets(section.get("bullets")))
    return total


def _counselling_has_medication(payload: dict[str, Any]) -> bool:
    sections = payload.get("sections") if isinstance(payload, dict) else None
    if not isinstance(sections, list):
        return False
    for section in sections:
        if not isinstance(section, dict):
            continue
        if str(section.get("section_key") or "").upper() != "MEDICATION_USE":
            continue
        return len(_as_bullets(section.get("bullets"))) > 0
    return False


def _humanize_medication_directions(text: str) -> str:
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    if not t:
        return ""
    t = re.sub(r"^directions:\s*", "", t, flags=re.I)
    t = re.sub(r"^take\s+([^:]{1,48}):\s+", r"Take \1 ", t, flags=re.I)
    t = re.sub(r"\s*\{\s*(bid|tid|qid|qd|prn)\s*\}", "", t, flags=re.I)
    t = re.sub(r"\bBID\b", "twice daily", t)
    t = re.sub(r"\bTID\b", "three times daily", t)
    t = re.sub(r"\bQID\b", "four times daily", t)
    t = re.sub(r"\bQD\b", "once daily", t)
    t = re.sub(r"\bPRN\b", "as needed", t)
    t = re.sub(r"\bby Oral route\b", "by mouth", t, flags=re.I)
    t = re.sub(r"\bOral route\b", "by mouth", t, flags=re.I)

    def _tablets(match: re.Match) -> str:
        n = int(match.group(1))
        return "1 tablet" if n == 1 else f"{n} tablets"

    t = re.sub(r"\b(\d+)\s+tablet\(s\)", _tablets, t, flags=re.I)
    t = re.sub(r"tablet\(s\)", "tablet", t, flags=re.I)
    t = re.sub(r"capsule\(s\)", "capsule", t, flags=re.I)
    t = re.sub(r"\btablet oral\b", "tablet by mouth", t, flags=re.I)
    t = re.sub(r"\bfor 1 days\b", "for 1 day", t, flags=re.I)
    t = re.sub(r"\s{2,}", " ", t).strip()
    if t and not re.search(r"[.!?]$", t):
        t += "."
    return t[:1].upper() + t[1:] if t else ""


def _fallback_counselling_from_treatments(
    treatments: list[dict[str, Any]],
    approved: dict[str, Any],
) -> dict[str, Any]:
    how: list[str] = []
    for row in treatments[:3]:
        if not isinstance(row, dict):
            continue
        directions = str(
            row.get("directions")
            or row.get("patient_directions")
            or row.get("instructions")
            or ""
        ).strip()
        name = str(row.get("display_name") or row.get("genericName") or row.get("medicationName") or "").strip()
        if directions and "manufacturer" not in directions.lower() and not re.search(r"\b(DIN|NPN)\b", directions, re.I):
            how.append(_humanize_medication_directions(directions))
            continue
        if not name:
            continue
        bits = [name]
        dose = str(row.get("dose") or "").strip()
        route = str(row.get("route") or "").strip()
        frequency = str(row.get("frequency") or "").strip()
        duration = str(row.get("duration") or "").strip()
        if dose and not re.match(r"^(as\s+directed|n/?a|-)$", dose, re.I):
            bits.append(dose)
        if route and not re.match(r"^(as\s+directed|n/?a|-)$", route, re.I):
            bits.append("by mouth" if re.match(r"^(oral|po|oral route)$", route, re.I) else route)
        if frequency and not re.match(r"^(as\s+directed|n/?a|-)$", frequency, re.I):
            bits.append(frequency.lower())
        if duration and not re.match(r"^(as\s+directed|n/?a|-)$", duration, re.I):
            bits.append(f"for {duration}" if not re.search(r"\bday", duration, re.I) else duration)
        how.append(_humanize_medication_directions("Take " + " ".join(bits) + "."))
    def _approved(key: str, limit: int) -> list[str]:
        raw = approved.get(key) if isinstance(approved, dict) else None
        if not isinstance(raw, list):
            return []
        out: list[str] = []
        for item in raw:
            text = str(item or "").strip()
            if text:
                out.append(text if text.endswith(".") else f"{text}.")
            if len(out) >= limit:
                break
        return out
    return {
        "sections": [
            {"section_key": "MEDICATION_USE", "bullets": how[:3]},
            {"section_key": "EXPECTED_RESPONSE", "bullets": _approved("expected_response", 2)},
            {"section_key": "SELF_CARE", "bullets": _approved("self_care", 3)},
            {"section_key": "FOLLOW_UP", "bullets": (_approved("follow_up", 2) + _approved("safety_net", 2))[:3]},
        ]
    }


def _fallback_counselling(
    treatment_plan: dict[str, Any],
    pathway_counselling: list[dict[str, Any]],
) -> dict[str, Any]:
    recs = treatment_plan.get("recommendations") if isinstance(treatment_plan, dict) else []
    treatments = [row for row in recs if isinstance(row, dict)] if isinstance(recs, list) else []
    return _fallback_counselling_from_treatments(treatments, {})


def _norm_label(value: Any) -> str:
    text = str(value or "").lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_sex(raw: Any) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if not s or s in {"null", "none", "unknown", "n/a", "na"}:
        return None
    if s in {"m", "male", "man", "boy", "gentleman"} or s.startswith("male"):
        return "Male"
    if s in {"f", "female", "woman", "girl", "lady"} or s.startswith("female"):
        return "Female"
    if s in {"other", "o", "x", "non-binary", "nonbinary", "unspecified"}:
        return "Other"
    return None


def _infer_sex_from_transcript(transcript: str) -> str | None:
    lower = transcript.lower()
    if re.search(r"\b(?:sex|gender)\s*(?:is|:)?\s*female\b", lower) or re.search(r"\bfemale\b", lower):
        return "Female"
    if (re.search(r"\b(?:sex|gender)\s*(?:is|:)?\s*male\b", lower) or re.search(r"\bmale\b", lower)) and not re.search(
        r"\bfemale\b", lower
    ):
        return "Male"

    denies = bool(re.search(r"\bnot pregnant|non.?pregnant|denies pregnancy|no pregnancy\b", lower))
    if not denies and re.search(r"\bpregnan", lower):
        return "Female"
    if re.search(r"\bbreast.?feed|\blactat|\bnursing\b", lower):
        return "Female"

    has_he = bool(re.search(r"\b(?:he|him)\b", lower))
    has_she = bool(re.search(r"\b(?:she|her)\b", lower))
    if has_he and not has_she:
        return "Male"
    if has_she and not has_he:
        return "Female"
    return None


def _escape_re(value: str) -> str:
    return re.escape(value)


def _canonicalize_drug(name: str) -> str:
    text = str(name or "").strip()
    text = re.sub(r"\bamox(?:i|y)?(?:cill?in|lien|lin|line|cillan)\b", "amoxicillin", text, flags=re.I)
    text = re.sub(r"\bnovamoxin\b", "amoxicillin", text, flags=re.I)
    text = re.sub(
        r"\s+[-–—·,]?\s*(unknown(?:\s+dose)?|dose\s+unknown|n/?a|unspecified|not specified)\s*$",
        "",
        text,
        flags=re.I,
    )
    return re.sub(r"\s+", " ", text).strip()


_PLACEHOLDER_MED_FIELD = re.compile(
    r"^(unknown(?:\s+dose)?|dose\s+unknown|n/?a|n\.a\.|na|unspecified|not specified|"
    r"not known|not stated|none|null|-)$",
    re.I,
)


def _clean_optional_med_field(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text or _PLACEHOLDER_MED_FIELD.match(text):
        return None
    return text


def _is_explicitly_taking(transcript: str, drug_name: str) -> bool:
    drug = _canonicalize_drug(drug_name)
    if not transcript.strip() or len(drug) < 3:
        return False
    escaped = _escape_re(drug)
    patterns = [
        rf"\b(?:currently\s+)?(?:taking|takes|take|took|using|uses|prescribed|started|continues?\s+on)\s+[^.!?]{{0,60}}\b{escaped}\b",
        rf"\b(?:is|are|was|were|currently)\s+on\s+(?!the\b|a\b|an\b|his\b|her\b|their\b)[^.!?]{{0,40}}\b{escaped}\b",
        rf"\b{escaped}\b[^.!?]{{0,40}}\b(?:daily|od|bid|tid|qid|prn|once|twice|\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu)|units?)\b",
        rf"\b(?:current\s+)?(?:medications?|meds|medicines?)\s*[:\-][^.!?]{{0,100}}\b{escaped}\b",
        rf"\b(?:medications?|meds|medicines?)\s+(?:include|are|is)\s+[^.!?]{{0,100}}\b{escaped}\b",
    ]
    return any(re.search(p, transcript, flags=re.I) for p in patterns)


def _is_allergy_only(transcript: str, drug_name: str) -> bool:
    drug = _canonicalize_drug(drug_name)
    if not transcript.strip() or len(drug) < 3:
        return False
    if _is_explicitly_taking(transcript, drug):
        return False
    escaped = _escape_re(drug)
    return bool(
        re.search(
            rf"\b(?:allergic\s+to|allergy\s+to|allergies?(?:\s+to|:)?|hypersensitiv(?:e|ity)\s+to|"
            rf"intoleran(?:t|ce)\s+to|cannot\s+take|can't\s+take|avoid(?:s|ing)?|reacts?\s+to)\s+"
            rf"[^.!?]{{0,80}}\b{escaped}\b",
            transcript,
            flags=re.I,
        )
    )


_LAB_PATTERNS: list[tuple[re.Pattern[str], str, str | None]] = [
    (
        re.compile(
            r"\b(?:e\s*gfr|egfr|estimated\s+(?:glomerular\s+filtration\s+rate|gfr))\s*"
            r"(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(mL/min(?:/1\.73\s*m²?)?|ml/min)?",
            re.I,
        ),
        "eGFR",
        "mL/min",
    ),
    (
        re.compile(
            r"\b(?:hba1c|hb\s*a1c|a1c)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(%|percent)?",
            re.I,
        ),
        "HbA1c",
        "%",
    ),
    (
        re.compile(
            r"\b(?:serum\s+)?creatinine\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(µmol/L|umol/L|mg/dL)?",
            re.I,
        ),
        "Creatinine",
        None,
    ),
    (re.compile(r"\b(?:inr)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)", re.I), "INR", None),
]

_LAB_LIKE = re.compile(
    r"\b(?:e\s*gfr|egfr|hba1c|hb\s*a1c|\ba1c\b|creatinine|inr|potassium|sodium|"
    r"hemoglobin|haemoglobin|ldl|hdl|triglyceride|tsh|alt|ast|bilirubin|crp|wbc|platelet)\b",
    re.I,
)


def _is_lab_like_condition(label: str) -> bool:
    norm = _norm_label(label)
    if not norm:
        return False
    if _LAB_LIKE.search(norm):
        return True
    compact = re.sub(r"\s+", "", norm)
    return bool(re.match(r"^(egfr|hba1c|a1c|creatinine|inr)\d", compact))


def _extract_labs_from_text(text: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    for pattern, test, default_unit in _LAB_PATTERNS:
        for match in pattern.finditer(text or ""):
            value = (match.group(1) or "").strip()
            if not value:
                continue
            unit = (match.group(2) if match.lastindex and match.lastindex >= 2 else None) or default_unit
            key = f"{test.lower()}:{value}"
            if key in seen:
                continue
            seen.add(key)
            entry: dict[str, Any] = {"test": test, "value": value, "confidence": 88}
            if unit:
                entry["unit"] = unit
            found.append(entry)
    return found


def _lab_from_condition_label(label: str) -> dict[str, Any] | None:
    local = _extract_labs_from_text(label)
    if local:
        return local[0]
    if not _is_lab_like_condition(label):
        return None
    value_m = re.search(r"(\d+(?:\.\d+)?)", label)
    test_m = re.search(
        r"\b(e\s*gfr|egfr|hba1c|hb\s*a1c|a1c|creatinine|inr)\b",
        label,
        flags=re.I,
    )
    if not value_m or not test_m:
        return None
    raw = re.sub(r"\s+", "", test_m.group(1).lower())
    if "egfr" in raw:
        return {"test": "eGFR", "value": value_m.group(1), "unit": "mL/min", "confidence": 84}
    if "hba1c" in raw or raw == "a1c":
        return {"test": "HbA1c", "value": value_m.group(1), "unit": "%", "confidence": 84}
    if "creat" in raw:
        return {"test": "Creatinine", "value": value_m.group(1), "confidence": 84}
    if raw == "inr":
        return {"test": "INR", "value": value_m.group(1), "confidence": 84}
    return None


def _filter_past_conditions(
    conditions: list[Any],
    symptoms: list[Any],
    chief_complaint: Any,
) -> list[dict[str, Any]]:
    presenting = [_norm_label(chief_complaint)]
    for s in symptoms:
        if isinstance(s, dict):
            presenting.append(_norm_label(s.get("symptom")))
        else:
            presenting.append(_norm_label(s))
    presenting = [p for p in presenting if p]

    cleaned: list[dict[str, Any]] = []
    for c in conditions:
        if not isinstance(c, dict):
            continue
        label = str(c.get("condition") or "").strip()
        norm = _norm_label(label)
        if not norm or len(norm) < 2:
            continue
        if _is_lab_like_condition(label):
            continue
        drop = False
        for p in presenting:
            if norm == p:
                drop = True
                break
            # Short label fully contained in presenting ("cold" ⊂ "cold sore")
            if p.find(norm) >= 0 and len(norm) < len(p):
                drop = True
                break
            cond_tokens = [t for t in norm.split() if len(t) > 2]
            present_tokens = {t for t in p.split() if len(t) > 2}
            if len(cond_tokens) == 1 and cond_tokens[0] in present_tokens:
                drop = True
                break
        if drop:
            continue
        cleaned.append(
            {
                **c,
                "condition": label,
                "confidence": c.get("confidence", 70),
            }
        )
    return cleaned


def _normalize_transcript_entities(result: dict[str, Any], transcript: str) -> dict[str, Any]:
    """Post-process LLM extraction: sex/pregnancy, meds vs allergies, labs vs history."""
    if not isinstance(result, dict):
        return {}

    demo = result.get("demographics")
    if not isinstance(demo, dict):
        demo = {}

    sex = _normalize_sex(demo.get("sex")) or _infer_sex_from_transcript(transcript)
    lower = transcript.lower()
    denies = bool(re.search(r"\bnot pregnant|non.?pregnant|denies pregnancy|no pregnancy\b", lower))
    pregnant = demo.get("pregnant")
    if not denies and re.search(r"\bpregnan", lower):
        pregnant = True
        sex = sex or "Female"
    elif re.search(r"\bbreast.?feed|\blactat|\bnursing\b", lower):
        if pregnant is None:
            pregnant = False
        sex = sex or "Female"
    elif denies:
        pregnant = False
        sex = sex or "Female"

    if sex:
        demo["sex"] = sex
    if pregnant is not None:
        demo["pregnant"] = pregnant
    result["demographics"] = demo

    symptoms = result.get("symptoms") if isinstance(result.get("symptoms"), list) else []
    conditions_raw = result.get("conditions") if isinstance(result.get("conditions"), list) else []
    allergies = result.get("allergies") if isinstance(result.get("allergies"), list) else []
    medications_raw = result.get("medications") if isinstance(result.get("medications"), list) else []
    labs_raw = result.get("labValues") if isinstance(result.get("labValues"), list) else []

    allergy_norms = {
        _norm_label(_canonicalize_drug(a.get("allergen", "")))
        for a in allergies
        if isinstance(a, dict) and a.get("allergen")
    }

    cleaned_meds: list[dict[str, Any]] = []
    for m in medications_raw:
        if not isinstance(m, dict):
            continue
        name = _canonicalize_drug(str(m.get("name") or ""))
        if len(name) < 2:
            continue
        if _is_allergy_only(transcript, name):
            continue
        if _norm_label(name) in allergy_norms and not _is_explicitly_taking(transcript, name):
            continue
        if transcript.strip() and not _is_explicitly_taking(transcript, name):
            continue
        cleaned_meds.append(
            {
                **m,
                "name": name,
                "dose": _clean_optional_med_field(m.get("dose")),
                "frequency": _clean_optional_med_field(m.get("frequency")),
                "confidence": m.get("confidence", 70),
            }
        )
    result["medications"] = cleaned_meds

    labs: list[dict[str, Any]] = []
    lab_seen: set[str] = set()

    def push_lab(entry: dict[str, Any]) -> None:
        test = str(entry.get("test") or "").strip()
        value = str(entry.get("value") or "").strip()
        if not test or not value:
            return
        key = f"{test.lower()}:{value}"
        if key in lab_seen:
            return
        lab_seen.add(key)
        labs.append(entry)

    for lab in labs_raw:
        if isinstance(lab, dict):
            push_lab(lab)
    for lab in _extract_labs_from_text(transcript):
        push_lab(lab)

    kept_conditions: list[dict[str, Any]] = []
    for c in conditions_raw:
        if not isinstance(c, dict):
            continue
        label = str(c.get("condition") or "").strip()
        if not label:
            continue
        if _is_lab_like_condition(label):
            as_lab = _lab_from_condition_label(label)
            if as_lab:
                push_lab(as_lab)
            continue
        kept_conditions.append(c)

    result["conditions"] = _filter_past_conditions(
        kept_conditions,
        symptoms,
        result.get("chiefComplaint"),
    )
    result["labValues"] = labs

    cleaned_allergies: list[dict[str, Any]] = []
    for a in allergies:
        if not isinstance(a, dict):
            continue
        allergen = _canonicalize_drug(str(a.get("allergen") or ""))
        if len(allergen) < 2:
            continue
        reaction = str(a.get("reaction") or "").strip()
        allergy_type = _normalize_allergy_type(a.get("allergyType"), reaction, allergen, transcript)
        cleaned_allergies.append(
            {
                **a,
                "allergen": allergen,
                "reaction": reaction,
                "allergyType": allergy_type,
                "confidence": a.get("confidence", 70),
            }
        )
    result["allergies"] = cleaned_allergies
    return result


def _normalize_allergy_type(
    raw: Any,
    reaction: str,
    allergen: str,
    transcript: str,
) -> str:
    token = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if token in {"severe", "anaphylaxis", "high"}:
        return "severe"
    if token in {"non_severe", "nonsevere", "mild", "moderate", "low"}:
        return "non_severe"
    if token in {"unknown", "reaction_unknown", "unsure"}:
        return "unknown"

    blob = f"{reaction} {allergen}".strip()
    window = transcript
    if allergen:
        # Prefer nearby context when available
        idx = transcript.lower().find(allergen.lower())
        if idx >= 0:
            window = transcript[max(0, idx - 90) : idx + len(allergen) + 90]

    severe_re = re.compile(
        r"\b(anaphylaxi\w*|anaphylactic|angioedema|swelling|difficulty\s+breathing|"
        r"shortness\s+of\s+breath|severe\s+(?:rash|reaction|allergy)|wheez(?:e|ing))\b",
        re.I,
    )
    mild_re = re.compile(
        r"\b(rash|hives|urticaria|itch(?:ing|y)?|prurit\w*|mild|non[- ]?severe|nausea|gi\s+upset)\b",
        re.I,
    )
    for text in (blob, window):
        if severe_re.search(text):
            return "severe"
        if mild_re.search(text):
            return "non_severe"
    return "unknown"

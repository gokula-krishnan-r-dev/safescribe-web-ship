"""
Staged Clinical Pathway Generation Pipeline

1. classify_document   — metadata + suggested role
2. analyze_overlap     — pairwise similarity / role recommendations
3. extract_concepts    — clinical concepts (not questions yet)
4. normalize_concepts  — dedupe / canonicalize across sources
5. generate_pathway    — build ExtractedKnowledge from normalized concepts
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from app.config import Settings
from app.core import prompt_registry
from app.core.chunker import chunk_text
from app.core.extractor import ExtractionPipeline, STANDARD_SECTIONS

logger = logging.getLogger(__name__)

PATHWAY_PIPELINE_SYSTEM = (
    "You are an expert clinical pharmacist building SafeScribe pathways. "
    "Return ONLY valid JSON. Never invent clinical facts."
)

DOCUMENT_TYPES = [
    "CLINICAL_GUIDELINE",
    "NATIONAL_GUIDELINE",
    "PROVINCIAL_GUIDELINE",
    "CLINICAL_ALGORITHM",
    "ASSESSMENT_FORM",
    "DRUG_MONOGRAPH",
    "REVIEW_ARTICLE",
    "PATIENT_HANDOUT",
    "LOCAL_POLICY",
    "EDUCATIONAL_MATERIAL",
    "RESEARCH_ARTICLE",
    "OTHER",
]

DOCUMENT_ROLES = ["PRIMARY", "SUPPORTING", "REFERENCE_ONLY"]

CONCEPT_CATEGORIES = [
    "DIAGNOSIS",
    "HISTORY",
    "SYMPTOM",
    "RED_FLAG",
    "DIFFERENTIAL",
    "TREATMENT",
    "ELIGIBILITY",
    "COUNSELLING",
    "FOLLOW_UP",
    "LAB",
    "PHYSICAL_EXAM",
    "OTHER",
]


def _parse_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group(0))
        raise


class PathwayGenerationPipeline:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.openai_timeout,
            max_retries=1,
        )
        self._extractor = ExtractionPipeline(settings)

    # ── Step 2: Document classification ──────────────────────────────────────

    async def classify_document(
        self,
        text: str,
        file_name: str,
        condition: str,
    ) -> dict[str, Any]:
        sample = text[:12_000]
        prompt = f"""Classify this clinical document for pharmacist pathway authoring.

Condition context: {condition}
File name: {file_name}

DOCUMENT (excerpt):
---
{sample}
---

Return ONLY valid JSON:
{{
  "condition": "primary condition covered",
  "documentType": one of {DOCUMENT_TYPES},
  "authority": "issuing body e.g. medSask, CPS, Health Canada, or null",
  "publicationYear": 2024 or null,
  "evidenceLevel": "Primary|Supporting|Reference or null",
  "documentFamily": "short family label e.g. medSask Cold Sore",
  "purpose": ["Diagnosis"|"Treatment"|"Counselling"|"Assessment"|"Education"|"Other"],
  "suggestedRole": one of {DOCUMENT_ROLES},
  "confidence": 0-100,
  "rationale": "1-2 sentences why this role/type"
}}

Role guidance:
- PRIMARY: main clinical guideline for extraction (usually one).
- SUPPORTING: adds unique clinical concepts not in the primary.
- REFERENCE_ONLY: algorithms/forms/handouts derived from guidelines; keep for citation/validation, skip concept extraction.
"""
        raw = await self._chat(prompt, model=self.settings.openai_fast_model)
        data = _parse_json(raw)
        doc_type = str(data.get("documentType") or "OTHER").upper()
        if doc_type not in DOCUMENT_TYPES:
            doc_type = "OTHER"
        role = str(data.get("suggestedRole") or "SUPPORTING").upper()
        if role not in DOCUMENT_ROLES:
            role = "SUPPORTING"
        year = data.get("publicationYear")
        try:
            year = int(year) if year is not None else None
        except (TypeError, ValueError):
            year = None
        purpose = data.get("purpose") or []
        if not isinstance(purpose, list):
            purpose = []
        return {
            "condition": data.get("condition") or condition,
            "documentType": doc_type,
            "authority": data.get("authority"),
            "publicationYear": year,
            "evidenceLevel": data.get("evidenceLevel"),
            "documentFamily": data.get("documentFamily"),
            "purpose": [str(p) for p in purpose][:8],
            "suggestedRole": role,
            "confidence": float(data.get("confidence") or 70),
            "rationale": data.get("rationale") or "",
        }

    # ── Step 3: Similarity / overlap analysis ────────────────────────────────

    async def analyze_overlap(
        self,
        documents: list[dict[str, Any]],
        condition: str,
    ) -> list[dict[str, Any]]:
        """
        documents: [{ id, fileName, documentType, suggestedRole, authority, textExcerpt }]
        Returns pairwise recommendations for non-primary docs relative to the best primary candidate.
        """
        if len(documents) < 2:
            return []

        catalog = []
        for d in documents:
            catalog.append(
                {
                    "id": d["id"],
                    "fileName": d.get("fileName"),
                    "documentType": d.get("documentType"),
                    "suggestedRole": d.get("suggestedRole"),
                    "authority": d.get("authority"),
                    "excerpt": (d.get("textExcerpt") or "")[:2500],
                }
            )

        prompt = f"""Compare these clinical documents for pharmacist pathway authoring for "{condition}".

Identify which document should be PRIMARY (main extraction source).
For every other document, estimate overlap with the primary and recommend:
- PRIMARY (only if equally authoritative and should also drive extraction — rare)
- SUPPORTING (adds unique clinical concepts)
- REFERENCE_ONLY (derived/duplicate; retain for citations/validation only)

DOCUMENTS:
{json.dumps(catalog, indent=2)}

Return ONLY valid JSON:
{{
  "primaryDocumentId": "id of best primary",
  "overlaps": [
    {{
      "sourceDocumentId": "primary id",
      "targetDocumentId": "other id",
      "overlapPercent": 0-100,
      "recommendedRole": "PRIMARY|SUPPORTING|REFERENCE_ONLY",
      "rationale": "why this role / overlap explanation"
    }}
  ]
}}
"""
        raw = await self._chat(prompt, model=self.settings.openai_fast_model)
        data = _parse_json(raw)
        primary_id = data.get("primaryDocumentId") or documents[0]["id"]
        overlaps = []
        for row in data.get("overlaps") or []:
            role = str(row.get("recommendedRole") or "SUPPORTING").upper()
            if role not in DOCUMENT_ROLES:
                role = "SUPPORTING"
            try:
                pct = float(row.get("overlapPercent") or 0)
            except (TypeError, ValueError):
                pct = 0.0
            overlaps.append(
                {
                    "sourceDocumentId": row.get("sourceDocumentId") or primary_id,
                    "targetDocumentId": row.get("targetDocumentId"),
                    "overlapPercent": max(0.0, min(100.0, pct)),
                    "recommendedRole": role,
                    "rationale": row.get("rationale") or "",
                }
            )
        # Ensure every non-primary has a row
        seen = {o["targetDocumentId"] for o in overlaps}
        for d in documents:
            if d["id"] == primary_id or d["id"] in seen:
                continue
            overlaps.append(
                {
                    "sourceDocumentId": primary_id,
                    "targetDocumentId": d["id"],
                    "overlapPercent": 50.0,
                    "recommendedRole": d.get("suggestedRole") or "SUPPORTING",
                    "rationale": "Default recommendation pending deeper review.",
                }
            )
        return overlaps

    # ── Step 5–6: Concept extraction + normalization ──────────────────────────

    async def extract_and_normalize_concepts(
        self,
        documents: list[dict[str, Any]],
        pathway_name: str,
        condition: str,
    ) -> list[dict[str, Any]]:
        """
        documents: [{ id, fileName, role, text }] — REFERENCE_ONLY already filtered out by caller.
        Returns normalized concepts with sources[].

        Chunk extraction runs in parallel (bounded) so multi-doc pathways finish
        within Nest's AI_ENGINE_TIMEOUT_MS instead of aborting mid-flight.
        """
        # Fewer chunks when many docs — quality stays high, wall-clock drops sharply.
        per_doc_cap = 4 if len(documents) >= 3 else 6
        jobs: list[tuple[str, dict[str, Any], int, int]] = []
        for doc in documents:
            text = (doc.get("text") or "").strip()
            if len(text.split()) < 20:
                continue
            chunks = chunk_text(
                text,
                chunk_size=self.settings.chunk_size_chars,
                overlap=self.settings.chunk_overlap_chars,
                max_chunks=min(8, self.settings.max_chunks_per_doc),
            )
            use = chunks[:per_doc_cap]
            for i, chunk in enumerate(use):
                jobs.append((chunk, doc, i, len(use)))

        if not jobs:
            return []

        sem = asyncio.Semaphore(max(1, self.settings.parallel_chunk_limit))

        async def _run(
            chunk: str,
            doc: dict[str, Any],
            idx: int,
            total: int,
        ) -> list[dict[str, Any]]:
            async with sem:
                return await self._extract_concepts_from_chunk(
                    chunk,
                    pathway_name,
                    condition,
                    doc["id"],
                    doc.get("fileName") or "document",
                    idx,
                    total,
                )

        logger.info(
            "extract_concepts: %d chunk jobs across %d docs (parallel=%d, cap/doc=%d)",
            len(jobs),
            len(documents),
            self.settings.parallel_chunk_limit,
            per_doc_cap,
        )
        results = await asyncio.gather(
            *[_run(chunk, doc, idx, total) for chunk, doc, idx, total in jobs],
            return_exceptions=True,
        )

        raw_concepts: list[dict[str, Any]] = []
        failures = 0
        for res in results:
            if isinstance(res, Exception):
                failures += 1
                logger.warning("Concept chunk failed: %s", res)
                continue
            raw_concepts.extend(res)

        if failures:
            logger.warning(
                "extract_concepts: %d/%d chunks failed — continuing with %d concepts",
                failures,
                len(jobs),
                len(raw_concepts),
            )

        if not raw_concepts:
            return []

        return await self._normalize_concepts(raw_concepts, pathway_name, condition)

    async def _extract_concepts_from_chunk(
        self,
        chunk: str,
        pathway_name: str,
        condition: str,
        document_id: str,
        file_name: str,
        idx: int,
        total: int,
    ) -> list[dict[str, Any]]:
        prompt = f"""Extract clinical CONCEPTS (not pathway questions) from section {idx + 1}/{total}
of "{file_name}" for pathway "{pathway_name}" / condition "{condition}".

Extract ONLY facts stated in the document. Prefer structured coverage of:
- RED_FLAG: warning signs needing referral / stop-prescribing / emergency care (HIGH importance)
- DIFFERENTIAL: alternate diagnoses to rule out
- COUNSELLING: patient education, self-care, when to seek care, lifestyle advice
- ELIGIBILITY: inclusion/exclusion / contraindications for pharmacist prescribing
- TREATMENT: drugs/therapies with dosing when stated
- FOLLOW_UP: reassess / return precautions
- DIAGNOSIS / HISTORY / SYMPTOM / LAB / PHYSICAL_EXAM as assessment concepts

DOCUMENT SECTION:
---
{chunk}
---

Return ONLY valid JSON:
{{
  "concepts": [
    {{
      "category": one of {CONCEPT_CATEGORIES},
      "label": "short clinical concept label",
      "description": "optional detail from the document",
      "importance": "HIGH|MEDIUM|LOW",
      "metadata": {{"dose": null, "action": null, "severity": null, "timeframe": null, "category": null}},
      "sourceExcerpt": "short quote from this section",
      "sourcePage": null,
      "confidence": 0-100
    }}
  ]
}}

Do not invent concepts. If the section has red flags, differentials, or counselling, extract them
explicitly with the matching category — do not bury them under OTHER.

Selectivity: extract at most 6 high-value concepts from this section. Skip low-value or repetitive
phrases. Prefer HIGH importance for safety / referral / eligibility items.
"""
        try:
            raw = await self._chat(prompt, model=self.settings.openai_fast_model)
            data = _parse_json(raw)
        except Exception:
            logger.exception("Concept extraction failed for chunk %d of %s", idx, file_name)
            return []

        out: list[dict[str, Any]] = []
        for c in data.get("concepts") or []:
            label = (c.get("label") or "").strip()
            if not label:
                continue
            cat = str(c.get("category") or "OTHER").upper()
            if cat not in CONCEPT_CATEGORIES:
                cat = "OTHER"
            out.append(
                {
                    "category": cat,
                    "label": label,
                    "description": c.get("description"),
                    "importance": c.get("importance") or "MEDIUM",
                    "metadata": c.get("metadata") if isinstance(c.get("metadata"), dict) else {},
                    "confidence": float(c.get("confidence") or 75),
                    "aliases": [label],
                    "sources": [
                        {
                            "documentId": document_id,
                            "sourceExcerpt": c.get("sourceExcerpt"),
                            "sourcePage": c.get("sourcePage"),
                        }
                    ],
                }
            )
        return out

    async def _normalize_concepts(
        self,
        raw_concepts: list[dict[str, Any]],
        pathway_name: str,
        condition: str,
    ) -> list[dict[str, Any]]:
        # Cap payload size for the normalizer
        payload = raw_concepts[:200]
        prompt = f"""Deduplicate and normalize clinical concepts for "{pathway_name}" ({condition}).

Merge synonyms into ONE canonical concept (e.g. "Previous cold sore", "History of HSV",
"Recurrent HSV" → "History of previous cold sore"). Preserve all source document IDs.

INPUT CONCEPTS:
{json.dumps(payload, indent=2)[:80_000]}

Return ONLY valid JSON:
{{
  "concepts": [
    {{
      "category": one of {CONCEPT_CATEGORIES},
      "label": "canonical label",
      "description": "optional",
      "importance": "HIGH|MEDIUM|LOW",
      "metadata": {{}},
      "confidence": 0-100,
      "aliases": ["raw phrases merged"],
      "sources": [{{"documentId":"...","sourceExcerpt":null,"sourcePage":null}}]
    }}
  ]
}}

Keep clinically distinct concepts separate. Prefer HIGH importance for red flags and safety criteria.

HARD LIMIT: return at most 20 concepts — the minimum set a pharmacist needs to run this pathway
(red flags, eligibility, key differentials, core treatments, essential counselling). Drop LOW
importance and redundant assessment noise.
"""
        try:
            raw = await self._chat(prompt, model=self.settings.openai_model)
            data = _parse_json(raw)
            concepts = data.get("concepts") or []
        except Exception:
            logger.exception("Concept normalization failed — falling back to naive merge")
            return self._select_priority_concepts(self._naive_merge(raw_concepts))

        normalized: list[dict[str, Any]] = []
        for c in concepts:
            label = (c.get("label") or "").strip()
            if not label:
                continue
            cat = str(c.get("category") or "OTHER").upper()
            if cat not in CONCEPT_CATEGORIES:
                cat = "OTHER"
            sources = c.get("sources") or []
            if not isinstance(sources, list):
                sources = []
            # Dedupe sources by documentId
            by_doc: dict[str, dict[str, Any]] = {}
            for s in sources:
                did = s.get("documentId")
                if did and did not in by_doc:
                    by_doc[did] = {
                        "documentId": did,
                        "sourceExcerpt": s.get("sourceExcerpt"),
                        "sourcePage": s.get("sourcePage"),
                    }
            aliases = c.get("aliases") or [label]
            if not isinstance(aliases, list):
                aliases = [label]
            normalized.append(
                {
                    "category": cat,
                    "label": label,
                    "description": c.get("description"),
                    "importance": c.get("importance") or "MEDIUM",
                    "metadata": c.get("metadata") if isinstance(c.get("metadata"), dict) else {},
                    "confidence": float(c.get("confidence") or 80),
                    "aliases": [str(a) for a in aliases][:20],
                    "sources": list(by_doc.values()),
                }
            )
        return self._select_priority_concepts(normalized)

    def _select_priority_concepts(
        self,
        concepts: list[dict[str, Any]],
        max_concepts: int = 20,
    ) -> list[dict[str, Any]]:
        """Keep a balanced shortlist of the most important concepts (max 20)."""
        if len(concepts) <= max_concepts:
            return concepts

        importance_rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        category_rank = {
            "RED_FLAG": 0,
            "ELIGIBILITY": 1,
            "DIFFERENTIAL": 2,
            "TREATMENT": 3,
            "DIAGNOSIS": 4,
            "SYMPTOM": 5,
            "HISTORY": 6,
            "COUNSELLING": 7,
            "FOLLOW_UP": 8,
            "LAB": 9,
            "PHYSICAL_EXAM": 10,
            "OTHER": 11,
        }
        soft_cap = {
            "RED_FLAG": 5,
            "ELIGIBILITY": 3,
            "DIFFERENTIAL": 3,
            "TREATMENT": 3,
            "DIAGNOSIS": 2,
            "SYMPTOM": 3,
            "HISTORY": 2,
            "COUNSELLING": 2,
            "FOLLOW_UP": 2,
            "LAB": 1,
            "PHYSICAL_EXAM": 1,
            "OTHER": 1,
        }

        sorted_concepts = sorted(
            concepts,
            key=lambda c: (
                importance_rank.get(str(c.get("importance") or "MEDIUM").upper(), 1),
                category_rank.get(str(c.get("category") or "OTHER").upper(), 11),
                -(float(c.get("confidence") or 0)),
            ),
        )

        selected: list[dict[str, Any]] = []
        per_cat: dict[str, int] = {}
        deferred: list[dict[str, Any]] = []

        for c in sorted_concepts:
            if len(selected) >= max_concepts:
                break
            cat = str(c.get("category") or "OTHER").upper()
            used = per_cat.get(cat, 0)
            if used >= soft_cap.get(cat, 1):
                deferred.append(c)
                continue
            selected.append(c)
            per_cat[cat] = used + 1

        for c in deferred:
            if len(selected) >= max_concepts:
                break
            selected.append(c)

        logger.info(
            "Curated concepts %d → %d (max %d)",
            len(concepts),
            len(selected),
            max_concepts,
        )
        return selected

    def _naive_merge(self, raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
        by_key: dict[str, dict[str, Any]] = {}
        for c in raw:
            key = f"{c.get('category')}|{(c.get('label') or '').lower().strip()}"
            if key not in by_key:
                by_key[key] = {**c, "sources": list(c.get("sources") or [])}
            else:
                existing = by_key[key]
                seen = {s["documentId"] for s in existing["sources"]}
                for s in c.get("sources") or []:
                    if s.get("documentId") and s["documentId"] not in seen:
                        existing["sources"].append(s)
                        seen.add(s["documentId"])
                aliases = set(existing.get("aliases") or [])
                aliases.update(c.get("aliases") or [])
                existing["aliases"] = list(aliases)[:20]
        return list(by_key.values())

    # ── Step 7: Pathway generation from concepts ─────────────────────────────

    async def generate_pathway_from_concepts(
        self,
        concepts: list[dict[str, Any]],
        pathway_name: str,
        condition: str,
        limits: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        limits = {
            "diagnosisConfirmation": 5,
            "additionalAssessment": 5,
            "treatmentEligibility": 5,
            "redFlags": 8,
            "differentials": 8,
            "rules": 12,
            "counselling": 10,
            "followup": 5,
            **(limits or {}),
        }
        compact = [
            {
                "category": c.get("category"),
                "label": c.get("label"),
                "description": c.get("description"),
                "importance": c.get("importance"),
                "metadata": c.get("metadata"),
                "aliases": c.get("aliases"),
                "sourceExcerpt": ((c.get("sources") or [{}])[0] or {}).get("sourceExcerpt"),
                "sourceCount": len(c.get("sources") or []),
            }
            for c in concepts
        ]
        cat_counts = {cat: 0 for cat in CONCEPT_CATEGORIES}
        for c in concepts:
            cat = str(c.get("category") or "OTHER").upper()
            if cat in cat_counts:
                cat_counts[cat] += 1

        prompt = f"""Generate a pharmacist clinical pathway from NORMALIZED clinical concepts.
Do NOT invent clinical facts. Every item MUST be grounded in the concepts below
(use concept labels / sourceExcerpt as sourceReference).

Pathway: {pathway_name}
Condition: {condition}

Concept inventory (must map into pathway entities — do not leave these empty if count > 0):
- RED_FLAG: {cat_counts['RED_FLAG']} → redFlags[] (+ safety rules)
- DIFFERENTIAL: {cat_counts['DIFFERENTIAL']} → differentials[]
- COUNSELLING: {cat_counts['COUNSELLING']} → counselling[] (Patient Education)
- ELIGIBILITY: {cat_counts['ELIGIBILITY']} → treatmentEligibility questions + rules
- TREATMENT: {cat_counts['TREATMENT']} → treatments[]
- FOLLOW_UP: {cat_counts['FOLLOW_UP']} → followup[]
- DIAGNOSIS/HISTORY/SYMPTOM/LAB/PHYSICAL_EXAM → assessment questions

Limits (maximum items):
- diagnosisConfirmation questions: {limits['diagnosisConfirmation']}
- additionalAssessment questions: {limits['additionalAssessment']}
- treatmentEligibility questions: {limits['treatmentEligibility']}
- redFlags: {limits['redFlags']}
- differentials: {limits['differentials']}
- rules: {limits['rules']}
- counselling: {limits['counselling']}
- followup: {limits['followup']}

CONCEPTS:
{json.dumps(compact, indent=2)[:90_000]}

Return ONLY valid JSON with this exact structure:
{{
  "sections": [
    {{"name":"diagnosisConfirmation","displayName":"Diagnosis Confirmation","description":"...","order":0}},
    {{"name":"additionalAssessment","displayName":"Additional Assessment","description":"...","order":1}},
    {{"name":"treatmentEligibility","displayName":"Treatment Eligibility","description":"...","order":2}}
  ],
  "questions": [
    {{
      "section":"diagnosisConfirmation|additionalAssessment|treatmentEligibility",
      "question":"clear pharmacist/patient-facing question",
      "description":null,
      "helpText":null,
      "type":"YES_NO|TEXT|TEXTAREA|NUMBER|DATE|SELECT|MULTI_SELECT|SCALE",
      "required":true,
      "options":null,
      "sourcePage":null,
      "sourceReference":"exact concept label used",
      "confidence":90,
      "clinicalReason":"why this matters"
    }}
  ],
  "rules": [
    {{
      "questionRef":"MUST equal the exact question text of a generated YES_NO question",
      "condition":"when this rule fires (from concept)",
      "operator":"equals|not_equals|greater_than|less_than|contains|yes|no",
      "value":"true",
      "action":"URGENT_REFERRAL|STOP_PRESCRIBING|SHOW_WARNING|REQUIRE_DOCUMENTATION|ADJUST_DOSE|CONTRAINDICATED",
      "severity":"INFO|WARNING|CRITICAL|STOP",
      "message":"concise pharmacist message",
      "details":"clinical explanation from concept"
    }}
  ],
  "treatments": [
    {{
      "medicationName": "required drug, OTC product, supplement, or non-drug recommendation name",
      "genericName": "active ingredient when applicable",
      "brandName": null,
      "category": "PRESCRIPTION|OTC|SUPPLEMENT|NON_DRUG",
      "recommendationLevel": "FIRST_LINE|SECOND_LINE|ALTERNATIVE|ADJUNCTIVE|SUPPORTIVE_CARE|SPECIALIST",
      "dose": null,
      "route": null,
      "frequency": null,
      "duration": null,
      "maxDose": null,
      "clinicalIndication": null,
      "eligibility": null,
      "warnings": [],
      "interactions": [],
      "monitoring": null
    }}
  ],
  "counselling": [
    {{
      "category":"Medication counselling|Non-drug advice|Prevention|Follow-up|When to seek urgent care|Handouts",
      "point":"concise patient education point from concept",
      "detail":"optional longer detail from concept description"
    }}
  ],
  "followup": [
    {{
      "timeframe":"e.g. 48-72 hours",
      "condition":"when or why to follow up",
      "action":"what to do at follow-up",
      "urgency":"ROUTINE|URGENT|EMERGENCY"
    }}
  ],
  "redFlags": [
    {{
      "title":"short warning sign name from RED_FLAG concept",
      "description":"what the pharmacist should look for",
      "severity":"WARNING|CRITICAL|EMERGENCY",
      "action":"IMMEDIATE_REFERRAL|SAME_DAY_PHYSICIAN|EMERGENCY|PATHWAY_EXCLUDED|PHARMACIST_DISCRETION",
      "sourceReference":"concept label or sourceExcerpt"
    }}
  ],
  "differentials": [
    {{
      "condition":"alternative condition from DIFFERENTIAL concept",
      "question":"screening question (yes → consider this differential)",
      "whyItMatters":"clinical rationale",
      "suggestedPathway":null,
      "keySymptoms":"typical presenting features",
      "distinguishingFeatures":"how to tell it apart",
      "recommendedAction":"what to do if suspected",
      "likelihood":"COMMON|LESS_COMMON|RARE"
    }}
  ]
}}

MAPPING REQUIREMENTS (critical):
1. Every RED_FLAG concept → one redFlags[] item (up to limit). Prefer HIGH importance first.
2. Every DIFFERENTIAL concept → one differentials[] item (up to limit).
3. Every COUNSELLING concept → one counselling[] item (Patient Education).
4. Build rules[] for RED_FLAG and ELIGIBILITY safety concepts: pair each with a YES_NO question
   and set questionRef to that question's exact text; operator "yes"; value "true".
5. FOLLOW_UP concepts → followup[].
6. Treatments: every TREATMENT concept must become a treatment with non-empty medicationName.
7. Never return empty redFlags/differentials/counselling/rules when matching concepts exist.

Treatments:
- medicationName is required (drug, product, or non-drug therapy label).
- OTC → category OTC; non-pharmacological → NON_DRUG.
"""
        raw = await self._chat(prompt, model=self.settings.openai_model)
        knowledge = _parse_json(raw)

        # Guarantee standard sections
        if not knowledge.get("sections"):
            knowledge["sections"] = list(STANDARD_SECTIONS)
        for key in (
            "questions",
            "rules",
            "treatments",
            "counselling",
            "followup",
            "redFlags",
            "differentials",
        ):
            if not isinstance(knowledge.get(key), list):
                knowledge[key] = []

        # Sanitize treatments — drop / repair missing medicationName
        cleaned_treatments: list[dict[str, Any]] = []
        for t in knowledge["treatments"]:
            if not isinstance(t, dict):
                continue
            name = (
                t.get("medicationName")
                or t.get("medication_name")
                or t.get("name")
                or t.get("drugName")
                or t.get("label")
                or t.get("treatment")
            )
            if not name or not str(name).strip():
                continue
            t["medicationName"] = str(name).strip()
            cleaned_treatments.append(t)
        knowledge["treatments"] = cleaned_treatments

        # Deterministic backfill from document-derived concepts when LLM omits entities
        knowledge = self._backfill_entities_from_concepts(knowledge, concepts, limits)

        logger.info(
            "generate_pathway_from_concepts: Q=%d R=%d T=%d C=%d RF=%d DDx=%d FU=%d",
            len(knowledge.get("questions") or []),
            len(knowledge.get("rules") or []),
            len(knowledge.get("treatments") or []),
            len(knowledge.get("counselling") or []),
            len(knowledge.get("redFlags") or []),
            len(knowledge.get("differentials") or []),
            len(knowledge.get("followup") or []),
        )

        knowledge["summary"] = await self._extractor._summarise(  # noqa: SLF001
            pathway_name, condition, knowledge,
        )
        knowledge["_chunks_processed"] = 0
        return knowledge

    def _backfill_entities_from_concepts(
        self,
        knowledge: dict[str, Any],
        concepts: list[dict[str, Any]],
        limits: dict[str, int],
    ) -> dict[str, Any]:
        """Fill RF / DDx / counselling / rules / follow-up from concept categories.

        Concepts are already document-grounded — this prevents empty UI sections when
        the LLM returns questions/treatments but omits other arrays.
        """

        def _norm(s: str) -> str:
            return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

        def _excerpt(c: dict[str, Any]) -> str | None:
            for s in c.get("sources") or []:
                ex = (s or {}).get("sourceExcerpt")
                if ex and str(ex).strip():
                    return str(ex).strip()[:400]
            return None

        def _meta(c: dict[str, Any]) -> dict[str, Any]:
            m = c.get("metadata")
            return m if isinstance(m, dict) else {}

        def _rf_severity(raw: Any, importance: Any) -> str:
            text = f"{raw or ''} {importance or ''}".upper()
            if "EMERGENCY" in text or "LIFE" in text:
                return "EMERGENCY"
            if "WARN" in text or importance == "MEDIUM":
                return "WARNING"
            return "CRITICAL"

        def _rf_action(raw: Any) -> str:
            text = str(raw or "").lower()
            if "emergency" in text or "ed" in text.split() or "911" in text:
                return "EMERGENCY"
            if "same" in text and "day" in text:
                return "SAME_DAY_PHYSICIAN"
            if "exclud" in text or "not eligible" in text or "do not treat" in text:
                return "PATHWAY_EXCLUDED"
            if "discretion" in text:
                return "PHARMACIST_DISCRETION"
            return "IMMEDIATE_REFERRAL"

        def _counselling_category(raw: Any, label: str, desc: str) -> str:
            text = f"{raw or ''} {label} {desc}".lower()
            if any(k in text for k in ("urgent", "er ", "emergency", "seek care", "red flag")):
                return "When to seek urgent care"
            if any(k in text for k in ("follow", "return", "reassess", "48", "72")):
                return "Follow-up"
            if any(k in text for k in ("prevent", "avoid trigger", "sun", "hygiene", "wash")):
                return "Prevention"
            if any(k in text for k in ("handout", "leaflet", "brochure")):
                return "Handouts"
            if any(k in text for k in ("dose", "tablet", "cream", "ointment", "medication", "drug", "take")):
                return "Medication counselling"
            return "Non-drug advice"

        by_cat: dict[str, list[dict[str, Any]]] = {cat: [] for cat in CONCEPT_CATEGORIES}
        for c in concepts:
            cat = str(c.get("category") or "OTHER").upper()
            if cat not in by_cat:
                cat = "OTHER"
            by_cat[cat].append(c)

        importance_rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        for cat in by_cat:
            by_cat[cat].sort(
                key=lambda c: (
                    importance_rank.get(str(c.get("importance") or "MEDIUM").upper(), 1),
                    -float(c.get("confidence") or 0),
                )
            )

        # ── Red flags ────────────────────────────────────────────────────────
        rf_list = [x for x in knowledge.get("redFlags") or [] if isinstance(x, dict)]
        seen_rf = {_norm(str(x.get("title") or x.get("name") or "")) for x in rf_list}
        for c in by_cat["RED_FLAG"]:
            if len(rf_list) >= limits.get("redFlags", 8):
                break
            label = str(c.get("label") or "").strip()
            if not label or _norm(label) in seen_rf:
                continue
            meta = _meta(c)
            rf_list.append(
                {
                    "title": label,
                    "description": (c.get("description") or label),
                    "severity": _rf_severity(meta.get("severity"), c.get("importance")),
                    "action": _rf_action(meta.get("action") or c.get("description")),
                    "sourceReference": _excerpt(c) or label,
                }
            )
            seen_rf.add(_norm(label))
        knowledge["redFlags"] = rf_list

        # ── Differentials ────────────────────────────────────────────────────
        ddx_list = [x for x in knowledge.get("differentials") or [] if isinstance(x, dict)]
        seen_ddx = {_norm(str(x.get("condition") or x.get("name") or "")) for x in ddx_list}
        for c in by_cat["DIFFERENTIAL"]:
            if len(ddx_list) >= limits.get("differentials", 8):
                break
            label = str(c.get("label") or "").strip()
            if not label or _norm(label) in seen_ddx:
                continue
            desc = str(c.get("description") or "").strip()
            ddx_list.append(
                {
                    "condition": label,
                    "question": f"Does the presentation suggest {label}?",
                    "whyItMatters": desc or f"Rule out {label} before treating under this pathway.",
                    "suggestedPathway": None,
                    "keySymptoms": desc or None,
                    "distinguishingFeatures": None,
                    "recommendedAction": "Do not treat under this pathway; refer or redirect as indicated.",
                    "likelihood": "LESS_COMMON",
                }
            )
            seen_ddx.add(_norm(label))
        knowledge["differentials"] = ddx_list

        # ── Patient education (counselling) ───────────────────────────────────
        edu_list = [x for x in knowledge.get("counselling") or [] if isinstance(x, dict)]
        seen_edu = {_norm(str(x.get("point") or x.get("label") or "")) for x in edu_list}
        for c in by_cat["COUNSELLING"]:
            if len(edu_list) >= limits.get("counselling", 10):
                break
            label = str(c.get("label") or "").strip()
            desc = str(c.get("description") or "").strip()
            if not label or _norm(label) in seen_edu:
                continue
            meta = _meta(c)
            edu_list.append(
                {
                    "category": _counselling_category(meta.get("category"), label, desc),
                    "point": label,
                    "detail": desc or _excerpt(c),
                }
            )
            seen_edu.add(_norm(label))
        knowledge["counselling"] = edu_list

        # ── Follow-up ────────────────────────────────────────────────────────
        fu_list = [x for x in knowledge.get("followup") or [] if isinstance(x, dict)]
        seen_fu = {_norm(str(x.get("action") or x.get("condition") or "")) for x in fu_list}
        for c in by_cat["FOLLOW_UP"]:
            if len(fu_list) >= limits.get("followup", 5):
                break
            label = str(c.get("label") or "").strip()
            desc = str(c.get("description") or "").strip()
            if not label:
                continue
            key = _norm(f"{label} {desc}")
            if key in seen_fu:
                continue
            fu_list.append(
                {
                    "timeframe": (_meta(c).get("timeframe") or "As clinically indicated"),
                    "condition": desc or label,
                    "action": label,
                    "urgency": "ROUTINE",
                }
            )
            seen_fu.add(key)
        knowledge["followup"] = fu_list

        # ── Clinical rules from red-flag / eligibility concepts ───────────────
        rule_list = [x for x in knowledge.get("rules") or [] if isinstance(x, dict)]
        questions = [x for x in knowledge.get("questions") or [] if isinstance(x, dict)]
        q_by_ref = {
            _norm(str(q.get("sourceReference") or "")): q for q in questions if q.get("sourceReference")
        }
        q_by_text = {_norm(str(q.get("question") or "")): q for q in questions}
        seen_rule_msgs = {_norm(str(r.get("message") or r.get("condition") or "")) for r in rule_list}

        def _ensure_yes_no_question(concept: dict[str, Any], section: str) -> str | None:
            label = str(concept.get("label") or "").strip()
            if not label:
                return None
            # Match existing question by sourceReference or similar text
            existing = q_by_ref.get(_norm(label))
            if existing and existing.get("question"):
                return str(existing["question"])
            for q in questions:
                qt = str(q.get("question") or "")
                if _norm(label) and _norm(label) in _norm(qt):
                    return qt
            q_text = f"Is the following present: {label}?"
            if _norm(q_text) in q_by_text:
                return q_text
            new_q = {
                "section": section,
                "question": q_text,
                "description": concept.get("description"),
                "helpText": None,
                "type": "YES_NO",
                "required": True,
                "options": None,
                "sourcePage": None,
                "sourceReference": label,
                "confidence": float(concept.get("confidence") or 80),
                "clinicalReason": concept.get("description") or label,
            }
            questions.append(new_q)
            q_by_ref[_norm(label)] = new_q
            q_by_text[_norm(q_text)] = new_q
            return q_text

        for c in by_cat["RED_FLAG"] + by_cat["ELIGIBILITY"]:
            if len(rule_list) >= limits.get("rules", 12):
                break
            label = str(c.get("label") or "").strip()
            if not label:
                continue
            msg = str(c.get("description") or label).strip()
            if _norm(msg) in seen_rule_msgs or _norm(label) in seen_rule_msgs:
                continue
            section = (
                "treatmentEligibility"
                if str(c.get("category")).upper() == "ELIGIBILITY"
                else "additionalAssessment"
            )
            q_text = _ensure_yes_no_question(c, section)
            if not q_text:
                continue
            meta = _meta(c)
            action_raw = str(meta.get("action") or msg)
            if str(c.get("category")).upper() == "ELIGIBILITY" and any(
                k in f"{label} {msg}".lower() for k in ("exclu", "contra", "not eligible", "do not")
            ):
                action = "CONTRAINDICATED"
                severity = "STOP"
            elif "emergency" in action_raw.lower():
                action = "URGENT_REFERRAL"
                severity = "CRITICAL"
            else:
                action = "URGENT_REFERRAL" if str(c.get("category")).upper() == "RED_FLAG" else "SHOW_WARNING"
                severity = "CRITICAL" if str(c.get("importance")).upper() == "HIGH" else "WARNING"
            rule_list.append(
                {
                    "questionRef": q_text,
                    "condition": label,
                    "operator": "yes",
                    "value": "true",
                    "action": action,
                    "severity": severity,
                    "message": msg if msg != label else f"{label} — refer / do not prescribe under this pathway.",
                    "details": _excerpt(c) or msg,
                }
            )
            seen_rule_msgs.add(_norm(msg))
            seen_rule_msgs.add(_norm(label))

        knowledge["questions"] = questions
        knowledge["rules"] = rule_list
        return knowledge

    # ── Helpers ──────────────────────────────────────────────────────────────

    async def _chat(self, prompt: str, *, model: str) -> str:
        resp = await self.client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": prompt_registry.get_prompt(
                        "PATHWAY_PIPELINE_ASSISTANT",
                        PATHWAY_PIPELINE_SYSTEM,
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content or "{}"

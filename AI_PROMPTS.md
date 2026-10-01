# SafeScribe — AI Prompts Catalog (OpenAI)

Complete inventory of every OpenAI system/user prompt used in SafeScribe: where it lives, when it runs, why it exists, and the exact message payload shape for Chat Completions.

> **Principle:** Pharmacists stay in control; AI assists; rules govern. All AI output is assistive and must be reviewable by a licensed pharmacist.

---

## Architecture

```
apps/web (Next.js)
    │
    ▼
apps/api (NestJS)
    ├──► apps/ai-engine (FastAPI) ──► OpenAI   ← primary path
    ├──► AiPipelineService (NestJS) ──► OpenAI ← pathway extraction fallback
    └──► LabReportExtractorService ──► OpenAI ← labs always direct
```

| Layer | Path | Role |
|-------|------|------|
| **Primary LLM** | `apps/ai-engine/` | Pathway guideline extraction + all consultation AI steps |
| **Fallback LLM** | `apps/api/.../ai-pipeline.service.ts` | Pathway extraction when Python ai-engine is unavailable |
| **Direct LLM** | `apps/api/.../lab-report-extractor.service.ts` | Lab report OCR/parse (never via ai-engine) |
| **Non-LLM** | NestJS + web heuristics | Regex fallbacks when AI is down |

### Models (env)

| Env var | Default | Used for |
|---------|---------|----------|
| `OPENAI_MODEL` / `openai_model` | `gpt-4o` | Synthesis, red flags, eligibility, treatment, docs, labs |
| `OPENAI_FAST_MODEL` / `openai_fast_model` | `gpt-4o-mini` | Chunk extraction, transcript, pathways, Q&A, counselling |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embeddings (config; not used as chat prompts) |

Most chat calls use `response_format: { type: "json_object" }` and low temperature (`0.1`–`0.3`).

---

## Quick index

| # | Feature | System prompt constant | Source file | Model |
|---|---------|------------------------|-------------|-------|
| 1 | Pathway chunk extraction | `SYSTEM_PROMPT` | `apps/ai-engine/app/core/prompts.py` | gpt-4o-mini |
| 2 | Pathway summary | `SUMMARY_SYSTEM` | same | gpt-4o |
| 3 | Pathway chunk extraction (fallback) | `SYSTEM_PROMPT` | `apps/api/.../ai-pipeline.service.ts` | gpt-4o-mini |
| 4 | Pathway summary (fallback) | inline | same | gpt-4o |
| 5 | Section regenerate (unused) | inline | same | gpt-4o |
| 6 | Transcript analysis | `TRANSCRIPT_SYSTEM` | `apps/ai-engine/app/core/consultation_ai.py` | gpt-4o-mini |
| 7 | Pathway recommendation | `PATHWAY_SYSTEM` | same | gpt-4o-mini |
| 8 | Question pre-fill | `QA_SYSTEM` | same | gpt-4o-mini |
| 9 | Red-flag screening | `RED_FLAG_SYSTEM` | same | gpt-4o |
| 10 | Eligibility | `ELIGIBILITY_SYSTEM` | same | gpt-4o |
| 11 | Treatment recommendation | `TREATMENT_SYSTEM` | same | gpt-4o |
| 12 | Counselling | `COUNSELLING_SYSTEM` | same | gpt-4o-mini |
| 13 | Documentation package | `DOCUMENTATION_SYSTEM` | same | gpt-4o |
| 14 | Lab report extraction | `EXTRACTION_PROMPT` | `apps/api/.../lab-report-extractor.service.ts` | gpt-4o |

---

# Part A — Pathway guideline extraction

**Why:** Admin uploads clinical guideline PDFs/DOCX against a pathway. AI turns prose into structured knowledge (questions, rules, treatments, red flags, differentials, counselling) that powers the consultation wizard.

**Flow:** Upload → NestJS `ClinicalPathwaysService` → prefer Python `POST /api/v1/extract` (or `/extract-text`) → else NestJS `AiPipelineService.analyzeDocument()`.

---

## A1. Chunk extraction (canonical — Python ai-engine)

| | |
|--|--|
| **Where** | `apps/ai-engine/app/core/prompts.py` → `ExtractionPipeline._extract_chunk()` in `extractor.py` |
| **API** | `POST /api/v1/extract`, `POST /api/v1/extract-text` |
| **Triggered by** | Pathway document upload: `POST /api/v1/clinical-pathways/:id/upload` |
| **Why** | Extract structured clinical knowledge **per document chunk** without inventing facts; enforce action/severity enums and rich assessment questions |

### OpenAI messages

```json
{
  "model": "gpt-4o-mini",
  "temperature": 0.1,
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT below>" },
    { "role": "user", "content": "<build_chunk_prompt below>" }
  ]
}
```

### System prompt (`SYSTEM_PROMPT`)

```
You are an expert clinical pharmacist with 20+ years of experience in prescribing pathways and clinical decision-support systems.

Your task is to extract structured clinical knowledge from guideline document sections.

RULES:
1. Extract ONLY information explicitly stated — never invent clinical facts.
2. Set confidence < 85 when information is ambiguous or incomplete.
3. Every question must relate to patient safety or a treatment decision.
4. Return ONLY valid JSON — no markdown fences, no prose.
5. Prefer filling questions/redFlags/differentials when the chunk supports them — only return empty arrays when the chunk truly has no clinical assessment content.
6. For rules.action use ONLY these exact strings (never invent synonyms):
   URGENT_REFERRAL | STOP_PRESCRIBING | SHOW_WARNING | REQUIRE_DOCUMENTATION | ADJUST_DOSE | CONTRAINDICATED
   Map "refer to specialist/dermatologist/ED" → URGENT_REFERRAL; "do not prescribe" → STOP_PRESCRIBING;
   "contraindicated" → CONTRAINDICATED; "caution/monitor" → SHOW_WARNING.
7. For rules.severity use ONLY: INFO | WARNING | CRITICAL | STOP

ASSESSMENT QUESTIONS (critical — do not under-extract):
- Turn inclusion/exclusion criteria, history items, symptom checks, severity grading, prior treatments, allergies, pregnancy/breastfeeding, contraindications, and red-flag screens into pharmacist-facing questions.
- Prefer YES_NO for checklist-style criteria; use SELECT/MULTI_SELECT when the guideline lists discrete options; use NUMBER/SCALE for counts, ages, lesion scores.
- Target 4–12 questions per chunk whenever assessment/safety/eligibility content is present.
- Assign each question.section to one of: diagnosisConfirmation, additionalAssessment, treatmentEligibility.
- question text must be a clear patient/pharmacist question (not a guideline heading).

RED FLAGS & DIFFERENTIALS:
- Extract every warning sign requiring referral, urgent care, or stop-prescribing as a redFlag.
- Extract alternate diagnoses the pharmacist must rule out as differentials.
```

### User prompt (`build_chunk_prompt`)

```
Analyse section {idx+1}/{total} of the "{pathway_name}" clinical guideline for the condition "{condition}".

DOCUMENT SECTION:
---
{chunk}
---

Prioritise exhaustive clinical assessment questions, red flags, differentials, decision rules, and treatments from THIS section.
Return JSON matching this exact structure:
{CHUNK_SCHEMA}
```

### Expected JSON schema (`CHUNK_SCHEMA`)

```json
{
  "sections": [
    {"name":"camelCaseId","displayName":"Human Readable Name","description":"string","order":0}
  ],
  "questions": [
    {
      "section":"sectionName",
      "question":"patient-facing question text",
      "description":"clinical context for pharmacist",
      "helpText":"guidance for pharmacist",
      "type":"YES_NO|TEXT|TEXTAREA|NUMBER|DATE|SELECT|MULTI_SELECT|SCALE",
      "required":true,
      "options":[{"label":"","value":""}],
      "sourcePage":null,
      "sourceReference":"exact quote from guideline",
      "confidence":90,
      "clinicalReason":"why this question matters clinically"
    }
  ],
  "rules": [
    {
      "questionRef":"the question text this rule applies to",
      "condition":"human description of trigger condition",
      "operator":"equals|not_equals|greater_than|less_than|contains|yes|no",
      "value":"string",
      "action":"URGENT_REFERRAL|STOP_PRESCRIBING|SHOW_WARNING|REQUIRE_DOCUMENTATION|ADJUST_DOSE|CONTRAINDICATED",
      "severity":"INFO|WARNING|CRITICAL|STOP",
      "message":"concise message to display to the pharmacist",
      "details":"full clinical explanation"
    }
  ],
  "treatments": [
    {
      "medicationName":"",
      "genericName":null,
      "dose":null,
      "route":null,
      "frequency":null,
      "duration":null,
      "maxDose":null,
      "eligibility":null,
      "contraindications":null,
      "renalAdjustment":null,
      "hepaticAdjustment":null,
      "pregnancyNotes":null,
      "breastfeedingNotes":null,
      "warnings":[],
      "interactions":[],
      "monitoring":null
    }
  ],
  "counselling": [
    {
      "category":"Medication|Lifestyle|Hygiene|Prevention|Other",
      "point":"concise counselling point",
      "detail":null
    }
  ],
  "followup": [
    {
      "timeframe":"e.g. 48-72 hours",
      "condition":"when or why to follow up",
      "action":"what to do at follow-up",
      "urgency":"ROUTINE|URGENT|EMERGENCY"
    }
  ],
  "redFlags": [
    {
      "title":"short name of the warning sign",
      "description":"what the pharmacist should look for",
      "severity":"WARNING|CRITICAL|EMERGENCY",
      "action":"recommended action (e.g. refer urgently, do not prescribe)",
      "sourceReference":"exact quote from guideline"
    }
  ],
  "differentials": [
    {
      "condition":"alternative condition to consider",
      "keySymptoms":"typical presenting features of this condition",
      "distinguishingFeatures":"how to tell it apart from the primary condition",
      "recommendedAction":"what to do if this is suspected",
      "likelihood":"COMMON|LESS_COMMON|RARE"
    }
  ]
}
```

Schema notes appended in the prompt:

```
RED FLAGS = warning signs/symptoms that require urgent referral, stopping treatment, or emergency care.
DIFFERENTIALS = other conditions the pharmacist should consider or rule out before treating.
```

---

## A2. Pathway summary (canonical — Python)

| | |
|--|--|
| **Where** | `SUMMARY_SYSTEM` + `build_summary_prompt()` in `prompts.py` → `ExtractionPipeline._summarise()` |
| **When** | Final phase after all chunks are merged |
| **Why** | Short pharmacist-facing overview of the extracted pathway for the admin UI |

### OpenAI messages

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a senior clinical pharmacist. Write concise, professional clinical summaries."
    },
    {
      "role": "user",
      "content": "Write a 2–3 sentence clinical summary for the \"{pathway_name}\" prescribing pathway for {condition}.\nSections covered: {section_names}.\n{q_count} clinical questions · {t_count} treatment options · {r_count} decision rules · {c_count} counselling points.\nWrite from a pharmacist's perspective. Be professional and clinically precise."
    }
  ]
}
```

**Output:** plain text (2–3 sentences), not JSON.

---

## A3. Chunk extraction (NestJS fallback)

| | |
|--|--|
| **Where** | `apps/api/src/modules/clinical-pathways/ai-pipeline.service.ts` |
| **When** | Python ai-engine unavailable; `AiPipelineService.extractChunk()` |
| **Why** | Same job as A1 with a shorter system prompt so pathway upload still works |

### System prompt

```
You are an expert clinical pharmacist with 20+ years of experience in prescribing pathways and clinical decision support.

Extract structured clinical knowledge from guideline document sections.

RULES:
1. Extract ONLY information explicitly stated — never infer or assume
2. Confidence < 85 if information is ambiguous or incomplete
3. Every question must relate to patient safety or treatment decisions
4. Return ONLY valid JSON (no markdown, no explanation)
5. Empty arrays for sections with no relevant content
```

### User prompt (`buildChunkPrompt`)

```
Analyze this section ({idx+1}/{total}) of the "{pathwayName}" clinical guideline for "{condition}".

DOCUMENT SECTION:
---
{chunk}
---

Return JSON with this exact structure:
{
  "sections": [{"name":"camelCaseId","displayName":"Human Name","description":"string","order":0}],
  "questions": [{
    "section":"diagnosisConfirmation|additionalAssessment|treatmentEligibility","question":"patient-facing text","description":"why it matters",
    "helpText":"pharmacist tip","type":"YES_NO|TEXT|TEXTAREA|NUMBER|DATE|SELECT|MULTI_SELECT|SCALE",
    "required":true,"options":[{"label":"","value":""}],"sourcePage":null,"sourceReference":"quote",
    "confidence":90,"clinicalReason":"why this matters"
  }],
  "rules": [{
    "questionRef":"question text","condition":"condition desc",
    "operator":"equals|not_equals|greater_than|less_than|contains|yes|no","value":"string",
    "action":"URGENT_REFERRAL|STOP_PRESCRIBING|SHOW_WARNING|REQUIRE_DOCUMENTATION|ADJUST_DOSE|CONTRAINDICATED",
    "severity":"INFO|WARNING|CRITICAL|STOP","message":"pharmacist message","details":"explanation"
  }],
  "treatments": [{
    "medicationName":"","genericName":null,"strength":null,"dose":null,"route":null,"frequency":null,"duration":null,
    "maxDose":null,"eligibility":null,"contraindications":null,"renalAdjustment":null,
    "hepaticAdjustment":null,"pregnancyNotes":null,"breastfeedingNotes":null,
    "warnings":[],"interactions":[],"monitoring":null
  }],
  "counselling": [{"category":"Medication counselling|Non-drug advice|Prevention|Follow-up|When to seek urgent care|Handouts","point":"concise point","detail":null}],
  "followup": [{"timeframe":"48-72 hours","condition":"when/why","action":"what to do","urgency":"ROUTINE|URGENT|EMERGENCY"}],
  "redFlags": [{
    "title":"short warning sign name","description":"what to look for",
    "severity":"WARNING|CRITICAL|EMERGENCY",
    "action":"IMMEDIATE_REFERRAL|SAME_DAY_PHYSICIAN|EMERGENCY|PATHWAY_EXCLUDED|PHARMACIST_DISCRETION",
    "sourceReference":"quote from document"
  }],
  "differentials": [{
    "condition":"alternative condition name","question":"screening question (yes → this differential)",
    "whyItMatters":"clinical rationale","suggestedPathway":"alternate pathway name if known",
    "keySymptoms":"typical presenting features",
    "distinguishingFeatures":"how to tell it apart from the primary condition",
    "recommendedAction":"what to do if suspected","likelihood":"COMMON|LESS_COMMON|RARE"
  }]
}

RED FLAGS: warning signs/symptoms that require urgent referral, stopping treatment, or emergency care.
DIFFERENTIALS: other conditions the pharmacist should consider or rule out before treating.
```

> Note: fallback schema differs slightly from Python (e.g. redFlag `action` enums, differential fields, counselling categories). Prefer the Python engine in production.

---

## A4. Pathway summary (NestJS fallback)

Same intent as A2; inline in `generateSummary()`:

**System:** `You are a senior clinical pharmacist. Write concise, professional clinical summaries.`

**User:** same 2–3 sentence summary template with pathway name, condition, section names, and counts.

---

## A5. Section regeneration (defined, unused)

| | |
|--|--|
| **Where** | `AiPipelineService.regenerateSection()` |
| **Status** | No callers found in the codebase |
| **Why (intended)** | Re-run one pathway section with pharmacist instructions |

**System:**

```
You are an expert clinical pharmacist. Regenerate the specified section of a clinical pathway.
```

**User:**

```
Regenerate the "{sectionName}" section.

Original context:
{originalText.slice(0, 3000)}

Instructions: {instructions}

Return JSON matching the clinical pathway extraction format.
```

---

# Part B — Consultation AI (wizard steps)

**Where (prompts):** `apps/ai-engine/app/core/consultation_ai.py`  
**Where (HTTP):** `apps/ai-engine/app/api/routes/consultations.py`  
**Proxied by:** NestJS `ConsultationsService` → `AiEngineClient`  
**UI:** Consultation wizard (`apps/web/src/features/consultations/`)

| Wizard step | NestJS API | ai-engine API | Method |
|-------------|------------|---------------|--------|
| Step 1 — Analyse transcript | `POST .../consultations/:id/ai/analyze-transcript` | `/api/v1/consultations/analyze-transcript` | `analyze_transcript` |
| Step 2 — Recommend pathways | `.../ai/recommend-pathways` | `/recommend-pathways` | `recommend_pathways` |
| Steps 3–4 — Prefill questions | `.../ai/answer-questions` | `/answer-questions` | `answer_questions` |
| Step 5 — Red flags | `.../ai/screen-red-flags` | `/screen-red-flags` | `screen_red_flags` |
| Step 6 — Eligibility | `.../ai/assess-eligibility` | `/assess-eligibility` | `assess_eligibility` |
| Step 7 — Treatment | `.../ai/recommend-treatment` | `/recommend-treatment` | `recommend_treatment` |
| Step 8 — Counselling | `.../ai/generate-counselling` | `/generate-counselling` | `generate_counselling` |
| Step 9 — Documentation | `.../ai/generate-documentation` | `/generate-documentation` | `generate_documentation` |

---

## B1. Transcript entity extraction

| | |
|--|--|
| **Constant** | `TRANSCRIPT_SYSTEM` |
| **Why** | Turn free-text patient conversation into structured entities for prefill and downstream steps |
| **Model** | `gpt-4o-mini` · temp `0.1` · max_tokens `2000` |
| **Fallback** | `TranscriptExtractorService` (regex, no LLM) |

### OpenAI messages

```json
{
  "model": "gpt-4o-mini",
  "temperature": 0.1,
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "<TRANSCRIPT_SYSTEM>" },
    { "role": "user", "content": "Analyze this patient consultation transcript:\n\n{transcript[:6000]}" }
  ]
}
```

### System prompt

```
You are an expert clinical pharmacist AI assistant.
Analyze patient consultation transcripts and extract structured clinical information.

Return JSON with this structure:
{
  "chiefComplaint": "string",
  "symptoms": [{"symptom": "string", "duration": "string", "severity": "mild|moderate|severe", "confidence": 90}],
  "medications": [{"name": "string", "dose": "string", "frequency": "string", "confidence": 90}],
  "allergies": [{"allergen": "string", "reaction": "string", "confidence": 90}],
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
}
```

---

## B2. Pathway recommendation

| | |
|--|--|
| **Constant** | `PATHWAY_SYSTEM` |
| **Why** | Rank tenant pathways against symptoms/entities so the pharmacist picks the right minor-ailment pathway |
| **Model** | `gpt-4o-mini` |

### User prompt template

```
Transcript summary:
{transcript[:2000]}

Extracted entities:
{entities JSON}

Available pathways:
- {name} ({condition}) [id:{id}]
...

Return JSON with key 'pathways' containing ranked recommendations.
```

### System prompt

```
You are an expert clinical pharmacist AI.
Given patient symptoms and extracted clinical entities, rank the available clinical pathways by match confidence.

Return JSON:
{
  "pathways": [
    {
      "id": "pathway_id",
      "name": "pathway name",
      "confidence": 95,
      "matchedSymptoms": ["symptom1", "symptom2"],
      "reasoning": "clinical explanation",
      "priority": 1
    }
  ]
}
```

---

## B3. Clinical question pre-fill

| | |
|--|--|
| **Constant** | `QA_SYSTEM` |
| **Why** | Prefill pathway assessment questions from transcript/entities; leave uncertain answers null |
| **Model** | `gpt-4o-mini` |
| **Fallback** | Local heuristics in NestJS / `ai-prefill.ts` |

### User prompt template

```
Transcript:
{transcript[:3000]}

Extracted entities:
{entities JSON}

Questions to answer:
[{ "id", "question", "type" }, ...]

Return JSON with key 'answers' — array of {id, answer, confidence, source}.
```

### System prompt

```
You are an expert clinical pharmacist AI.
Using the transcript and extracted entities, answer clinical consultation questions.

For each question return:
- answer: the extracted answer (string, boolean, number as appropriate)
- confidence: 0-100
- source: "transcript" | "entity" | "inferred"
- answerText: human-readable version

Only answer if you have clear evidence. Leave null if uncertain (confidence < 60).

Return JSON: {"answers": [{id, answer, answerText, confidence, source}]}
```

---

## B4. Red-flag screening

| | |
|--|--|
| **Constant** | `RED_FLAG_SYSTEM` |
| **Why** | Safety gate — surface emergency signs, contraindications, and high-risk situations before treatment |
| **Model** | `gpt-4o` |

### User prompt

```
Clinical data:
{ JSON: entities, demographics, responses, clinical_rules }

Identify all red flags and safety concerns.
```

### System prompt

```
You are a clinical safety expert pharmacist.
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
}
```

---

## B5. Treatment eligibility

| | |
|--|--|
| **Constant** | `ELIGIBILITY_SYSTEM` |
| **Why** | Decide ELIGIBLE / NOT_ELIGIBLE / CONDITIONAL from demographics, red flags, and pathway treatments |
| **Model** | `gpt-4o` |

### User prompt

```
Patient clinical data:
{ JSON: entities, demographics, red_flags, treatments }
```

### System prompt

```
You are a clinical pharmacist expert in treatment eligibility assessment.
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
}
```

---

## B6. Treatment recommendation

| | |
|--|--|
| **Constant** | `TREATMENT_SYSTEM` |
| **Why** | Suggest medications, non-drug options, referral, and follow-up from pathway treatments + patient profile |
| **Model** | `gpt-4o` · temp `0.2` |

### User prompt

```
Patient data:
{ JSON: entities, demographics, eligibility, available_treatments }
```

### System prompt

```
You are an expert clinical pharmacist with deep knowledge of evidence-based prescribing.
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
}
```

---

## B7. Patient counselling

| | |
|--|--|
| **Constant** | `COUNSELLING_SYSTEM` |
| **Why** | Generate patient education points (med use, side effects, when to seek help) for counselling step |
| **Model** | `gpt-4o-mini` · temp `0.3` |

### User prompt

```
Treatment context:
{ JSON: treatment_plan, entities, pathway_counselling }
```

### System prompt

```
You are a clinical pharmacist expert in patient education and counselling.
Generate comprehensive patient counselling instructions.

Return JSON:
{
  "sections": [
    {
      "category": "Medication Use|Side Effects|Warning Signs|Home Care|Diet & Lifestyle|Follow-Up",
      "points": [
        {"point": "instruction text", "important": false}
      ]
    }
  ],
  "keyMessages": ["top 3-5 most important messages"],
  "whenToSeekHelp": ["symptom or situation"],
  "followUpAdvice": "string"
}
```

---

## B8. Documentation package

| | |
|--|--|
| **Constant** | `DOCUMENTATION_SYSTEM` |
| **Why** | Produce audit-ready DAP note, physician letter, patient handout, prescription text, follow-up care — pharmacist must approve |
| **Model** | `gpt-4o` · temp `0.2` · max_tokens `8000` |
| **Input limit** | Consultation JSON truncated to 5000 chars |

### User prompt

```
Complete consultation data:
{consultation_data JSON truncated to 5000 chars}
```

### System prompt

```
You are a clinical pharmacist creating a complete professional documentation package
for a pharmacist-led minor ailment consultation. Analyze ALL consultation data provided and generate
comprehensive, audit-ready documents suitable for pharmacy records, physician communication, and patient education.

Return JSON with this exact structure:
{
  "version": 2,
  "generatedAt": "ISO-8601 timestamp",
  "patientInfo": {
    "name": "string or empty",
    "dateOfBirth": "string or empty",
    "patientId": "string or empty"
  },
  "documents": {
    "dapNote": {
      "patientInformation": "string",
      "consultationInformation": "string",
      "subjectiveFindings": "string",
      "objectiveFindings": "string",
      "assessment": "string",
      "clinicalDecision": "string",
      "treatmentPlan": "string",
      "medications": "string",
      "counselingNotes": "string",
      "followUpPlan": "string",
      "pharmacistInformation": "string"
    },
    "physicianLetter": {
      "subject": "string",
      "salutation": "Dear Doctor,",
      "patientDetails": "string",
      "consultationSummary": "string",
      "clinicalFindings": "string",
      "assessment": "string",
      "medicationsPrescribed": "string",
      "recommendations": "string",
      "followUpRequired": "string",
      "closing": "string",
      "pharmacistDetails": "string"
    },
    "patientHandout": {
      "diagnosis": "string",
      "whatItMeans": "string",
      "medicationInstructions": "string",
      "homeCareAdvice": "string",
      "foodsToAvoid": "string",
      "thingsToWatchFor": "string",
      "whenToVisitDoctor": "string",
      "emergencyWarningSigns": "string",
      "followUpInstructions": "string",
      "pharmacyContact": "string"
    },
    "prescription": {
      "diagnosis": "string",
      "medications": [
        {
          "name": "string",
          "dosage": "string",
          "frequency": "string",
          "duration": "string",
          "route": "string",
          "quantity": "string",
          "instructions": "string"
        }
      ],
      "specialInstructions": "string"
    },
    "consultationSummary": {
      "summary": "string",
      "chiefComplaint": "string",
      "diagnosis": "string",
      "treatmentProvided": "string",
      "outcome": "string"
    },
    "medicationInstructions": {
      "overview": "string",
      "medications": [
        {
          "name": "string",
          "howToTake": "string",
          "whenToTake": "string",
          "sideEffects": "string",
          "warnings": "string"
        }
      ],
      "generalAdvice": "string"
    },
    "followUpCare": {
      "timeframe": "string",
      "instructions": "string",
      "monitoringPoints": "string",
      "whenToReturn": "string",
      "contactInformation": "string"
    }
  },
  "disclaimer": "AI-generated documentation. Must be reviewed and approved by a licensed pharmacist before use."
}

Use professional clinical language for clinical documents and simple, patient-friendly language for the patient handout.
Include all relevant medications, dosages, and follow-up from the consultation data. Do not invent clinical facts not supported by the data.
```

---

# Part C — Lab report extraction

| | |
|--|--|
| **Where** | `apps/api/src/modules/consultations/lab-report-extractor.service.ts` |
| **API** | `POST /api/v1/consultations/:id/extract-lab-values` |
| **UI** | Patient assessment — lab upload |
| **Why** | Parse image/PDF lab reports into structured values for the consultation (does **not** go through ai-engine) |
| **Model** | `gpt-4o` · Redis-cached 24h by file hash |

### System prompt (`EXTRACTION_PROMPT`)

```
You are a clinical laboratory report parser for pharmacists.
Extract every laboratory test result from the provided lab report content.

Return ONLY valid JSON in this exact shape:
{
  "labValues": [
    {
      "test": "HbA1c",
      "value": "7.2",
      "unit": "%",
      "referenceRange": "4.0-5.6",
      "confidence": 95
    }
  ],
  "summary": "Brief clinical summary of notable findings",
  "reportDate": "YYYY-MM-DD or null",
  "patientName": "string or null",
  "warnings": ["any readability issues"]
}

Rules:
- confidence is 0-100 per value based on OCR clarity
- use standard test abbreviations where possible (HbA1c, eGFR, ALT, etc.)
- if a value is unclear, include it with confidence below 70
- if no lab values found, return labValues as empty array and add warning
- never invent values not present in the report
```

### User — image (vision)

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Extract all laboratory values from this lab report image." },
    { "type": "image_url", "image_url": { "url": "data:{mime};base64,{base64}", "detail": "high" } }
  ]
}
```

### User — PDF (text)

```
Extract all laboratory values from this lab report text ({numpages} page(s)):

{text.slice(0, 12000)}
```

---

# Part D — OpenAI Chat Completions cheat sheet

Copy-paste shape used across the app:

```ts
await openai.chat.completions.create({
  model: "gpt-4o" | "gpt-4o-mini",
  temperature: 0.1, // counselling 0.3; treatment/docs 0.2
  max_tokens: /* varies */,
  response_format: { type: "json_object" }, // omitted for pathway summary (plain text)
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: USER_PROMPT },
  ],
});
```

Python equivalent (`AsyncOpenAI`) in `extractor.py` and `consultation_ai.py`.

---

# Part E — Non-LLM / docs-only (no OpenAI chat prompt)

| Location | What it does |
|----------|----------------|
| `apps/api/.../transcript-extractor.service.ts` | Regex transcript parse when ai-engine down |
| `apps/web/.../ai-prefill.ts` | Client-side regex prefill for demographics/meds |
| `pathway.md` (§ example prompt ~lines 328–371) | Architecture guide example — **not wired to runtime** |

Example from `pathway.md` (documentation only):

```
You are an experienced pharmacist.

Read this clinical guideline.

Do NOT summarise it.

Instead identify every piece of clinical information needed
to assess a patient safely.

Return structured JSON only.

Extract:
Presenting complaints, History questions, Risk factors, Typical symptoms,
Exclusion criteria, Red flags, Eligibility, Contraindications, Assessment questions,
Required patient information, Treatment options, Dosing, Counselling, Follow up, Documentation
```

---

# Part F — Source file map

```
apps/ai-engine/app/core/prompts.py              ← pathway SYSTEM + chunk + summary
apps/ai-engine/app/core/extractor.py            ← calls OpenAI with prompts.py
apps/ai-engine/app/core/consultation_ai.py      ← all consultation *_SYSTEM prompts
apps/ai-engine/app/api/routes/extract.py        ← /extract, /extract-text, /parse
apps/ai-engine/app/api/routes/consultations.py  ← consultation AI routes
apps/ai-engine/app/config.py                    ← model names / OpenAI settings

apps/api/src/modules/clinical-pathways/ai-pipeline.service.ts  ← fallback extraction prompts
apps/api/src/modules/clinical-pathways/ai-engine.client.ts     ← HTTP client to ai-engine
apps/api/src/modules/consultations/lab-report-extractor.service.ts
apps/api/src/modules/consultations/consultations.service.ts    ← proxies consultation AI
apps/api/src/modules/consultations/consultations.controller.ts ← NestJS AI endpoints
```

---

# Part G — Design rules shared by all prompts

1. **Role framing:** always “clinical pharmacist” / safety expert — domain-aligned system identity.
2. **No invention:** extract or infer only with evidence; prefer null / empty / low confidence when unsure.
3. **Structured JSON:** most features return JSON schemas embedded in the system prompt.
4. **Pharmacist-in-the-loop:** documentation disclaimer and UI flows require human review.
5. **Two-tier models:** fast (`gpt-4o-mini`) for high-volume extraction/prefill; `gpt-4o` for safety-critical and synthesis steps.

---

*Generated from the SafeScribe codebase. Update this file when prompts in `prompts.py`, `consultation_ai.py`, `ai-pipeline.service.ts`, or `lab-report-extractor.service.ts` change.*

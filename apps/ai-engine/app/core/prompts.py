"""Centralised prompt templates for the AI extraction pipeline."""
from __future__ import annotations

SYSTEM_PROMPT = """\
You are an expert clinical pharmacist with 20+ years of experience in prescribing \
pathways and clinical decision-support systems.

Your task is to extract structured clinical knowledge from guideline document sections.

RULES:
1. Extract ONLY information explicitly stated — never invent clinical facts.
2. Set confidence < 85 when information is ambiguous or incomplete.
3. Every question must relate to patient safety or a treatment decision.
4. Return ONLY valid JSON — no markdown fences, no prose.
5. Prefer filling questions/redFlags/differentials when the chunk supports them \
— only return empty arrays when the chunk truly has no clinical assessment content.
6. For rules.action use ONLY these exact strings (never invent synonyms):
   URGENT_REFERRAL | STOP_PRESCRIBING | SHOW_WARNING | REQUIRE_DOCUMENTATION | ADJUST_DOSE | CONTRAINDICATED
   Map "refer to specialist/dermatologist/ED" → URGENT_REFERRAL; "do not prescribe" → STOP_PRESCRIBING;
   "contraindicated" → CONTRAINDICATED; "caution/monitor" → SHOW_WARNING.
7. For rules.severity use ONLY: INFO | WARNING | CRITICAL | STOP

ASSESSMENT QUESTIONS (critical — do not under-extract):
- Turn inclusion/exclusion criteria, history items, symptom checks, severity grading, \
prior treatments, allergies, pregnancy/breastfeeding, contraindications, and red-flag \
screens into pharmacist-facing questions.
- Prefer YES_NO for checklist-style criteria; use SELECT/MULTI_SELECT when the guideline \
lists discrete options; use NUMBER/SCALE for counts, ages, lesion scores.
- Target 4–12 questions per chunk whenever assessment/safety/eligibility content is present.
- Assign each question.section to one of: diagnosisConfirmation, additionalAssessment, treatmentEligibility.
- question text must be a clear patient/pharmacist question (not a guideline heading).

RED FLAGS & DIFFERENTIALS:
- Extract every warning sign requiring referral, urgent care, or stop-prescribing as a redFlag.
- Extract alternate diagnoses the pharmacist must rule out as differentials.
"""

CHUNK_SCHEMA = """\
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

RED FLAGS = warning signs/symptoms that require urgent referral, stopping treatment, or emergency care.
DIFFERENTIALS = other conditions the pharmacist should consider or rule out before treating."""


def build_chunk_prompt(
    chunk: str,
    pathway_name: str,
    condition: str,
    idx: int,
    total: int,
) -> str:
    return (
        f'Analyse section {idx + 1}/{total} of the "{pathway_name}" clinical guideline '
        f'for the condition "{condition}".\n\n'
        f"DOCUMENT SECTION:\n---\n{chunk}\n---\n\n"
        "Prioritise exhaustive clinical assessment questions, red flags, differentials, "
        "decision rules, and treatments from THIS section.\n"
        f"Return JSON matching this exact structure:\n{CHUNK_SCHEMA}"
    )


SUMMARY_SYSTEM = (
    "You are a senior clinical pharmacist. Write concise, professional clinical summaries."
)


def build_summary_prompt(
    pathway_name: str,
    condition: str,
    section_names: list[str],
    q_count: int,
    t_count: int,
    r_count: int,
    c_count: int,
) -> str:
    return (
        f'Write a 2–3 sentence clinical summary for the "{pathway_name}" prescribing pathway '
        f"for {condition}.\n"
        f"Sections covered: {', '.join(section_names)}.\n"
        f"{q_count} clinical questions · {t_count} treatment options · "
        f"{r_count} decision rules · {c_count} counselling points.\n"
        "Write from a pharmacist's perspective. Be professional and clinically precise."
    )

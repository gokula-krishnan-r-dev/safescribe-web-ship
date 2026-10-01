/**
 * Professional ChatGPT prompts + expected response formats for pathway authoring.
 * Shown in the Import dialog so admins can copy → paste into ChatGPT → import the result.
 */

import { buildTreatmentsChatGptPrompt } from './treatments-chatgpt-prompt';
export { buildTreatmentsChatGptPrompt } from './treatments-chatgpt-prompt';

export type ChatGptImportTarget =
  | 'overview'
  | 'concepts'
  | 'assessment'
  | 'red-flags'
  | 'differentials'
  | 'rules'
  | 'treatments'
  | 'counselling'
  | 'references';

export interface ChatGptImportConfig {
  target: ChatGptImportTarget;
  title: string;
  description: string;
  /** Prompt the admin copies into ChatGPT */
  promptTemplate: (ctx: { pathwayName: string; condition: string; province?: string }) => string;
  /** Example of what ChatGPT should return (shown in modal) */
  exampleOutput: string;
}

function baseContext(ctx: { pathwayName: string; condition: string; province?: string }) {
  return [
    `Pathway name: ${ctx.pathwayName || '[Pathway name]'}`,
    `Medical condition: ${ctx.condition || '[Condition]'}`,
    ctx.province ? `Province / jurisdiction: ${ctx.province}` : 'Jurisdiction: Canada (pharmacist prescribing)',
    'Audience: Canadian community pharmacists using SafeScribe clinical pathways.',
    'Tone: precise, guideline-aligned, clinically conservative. Prefer CPS / provincial protocol language.',
    'Do not invent drug doses unless standard; mark uncertain items clearly.',
  ].join('\n');
}

export function buildRedFlagsChatGptPrompt(ctx: {
  pathwayName: string;
  condition: string;
  province?: string;
}): string {
  const pathwayName = ctx.pathwayName?.trim() || '[Pathway name]';
  const condition = ctx.condition?.trim() || '[Condition]';
  const provinces = ctx.province?.trim() || 'Canada';

  return `You are assisting with creation of a pharmacist-facing structured clinical pathway for SafeScribe.

Pathway name: ${pathwayName}
Medical condition: ${condition}
Province / jurisdiction: ${provinces}
Audience: Canadian community pharmacists using SafeScribe clinical pathways.

Tone: precise, guideline-aligned, clinically conservative.

Prefer Canadian evidence where available, especially:
- CPS / Canadian Pharmacists Association
- Health Canada
- provincial pharmacist protocols or regulator guidance
- Canadian specialty-society guidelines
- authoritative product monographs

Use high-quality international guidelines only when appropriate Canadian guidance is unavailable.

IMPORTANT CONTEXT

The pharmacist has already:
1. assessed the patient,
2. entered their clinical assessment,
3. selected the relevant pathway, and
4. completed Presentation Review and Differential Review.

SafeScribe is NOT diagnosing the patient.

This section is:

## Red Flags & Safety Screening

Its purpose is to identify findings that may require:
- urgent medical attention,
- referral,
- additional assessment,
- stopping treatment through this structured pathway, or
- explicit pharmacist clinical judgment before proceeding.

Do not include routine medication-safety checks such as:
- drug allergies,
- drug interactions,
- renal dose adjustment,
- hepatic dose adjustment,
- medication-specific pregnancy/lactation contraindications,
unless the clinical finding itself is a pathway-level red flag independent of the selected medication.

---

## TASK

Create the minimum number of clinically important red flags needed for this pathway.

Focus on findings that are meaningful enough to change management.

Prefer approximately 4–8 red flags, but use fewer if clinically sufficient.

Do NOT add low-value warning items simply to increase the count.

For each red flag provide:

1. **Title**
2. **Question**
3. **Severity:** CRITICAL or WARNING
4. **Why this matters:** 1–2 concise sentences
5. **Recommended action:** one of:
   - IMMEDIATE_REFERRAL
   - SAME_DAY_PHYSICIAN
   - EMERGENCY
   - PATHWAY_EXCLUDED
   - PHARMACIST_DISCRETION
6. **Action note:** short pharmacist-facing explanation of the recommended action
7. **Required:** true / false
8. **References:** reference IDs supporting this exact red flag

---

# RED FLAG DESIGN RULES

- Keep the title short.
- Keep the question answerable as YES / NO.
- One clinical safety concept per red flag.
- Avoid duplicate or substantially overlapping red flags.
- Do not turn ordinary differential diagnoses into red flags.
- Do not include routine counselling or follow-up items.
- Do not include medication doses.
- Do not imply that SafeScribe makes the final clinical decision.
- The pharmacist remains responsible for assessment, referral, and treatment decisions.

Severity meaning:

### CRITICAL
Use when the finding strongly suggests urgent referral, immediate assessment, emergency evaluation, or that the pathway should not be used without further assessment.

### WARNING
Use when the finding is clinically important and may require same-day assessment, additional evaluation, referral, or pharmacist judgment before proceeding.

Do not use severity merely to make an item appear more important.

---

# EVIDENCE REQUIREMENTS

Every red flag should be linked to at least one authoritative reference when a suitable source exists.

Use the SAME reference ID when one source supports multiple red flags.

Examples:

- R1
- R2
- R3

Do not create duplicate entries for the same source.

### Preferred evidence hierarchy

Prefer sources in this order where appropriate:

1. Canadian clinical guideline / CPS
2. Health Canada guidance or authoritative product monograph
3. provincial clinical protocol or regulator guidance
4. Canadian specialty-society guideline
5. high-quality international specialty guideline or systematic evidence source

### Reference accuracy

DO NOT invent:
- guideline titles
- authors
- publication years
- editions
- URLs
- DOIs
- organizations

If you are not confident about an exact bibliographic detail:
- provide only the details you are confident about
- add \`Verification required: true\`

Do not fabricate a URL to make a citation look complete.

References will undergo clinical review before publication.

---

# SECTION-LEVEL EVIDENCE

After the red flags, provide:

## Section Evidence

List the reference IDs that broadly support the Red Flags & Safety Screening section as a whole.

This may include references already linked to individual red flags.

Do not add unrelated references merely to increase the number of sources.

---

# REFERENCE LIBRARY

At the end, provide one deduplicated reference library.

Use this format:

### R1
- Title:
- Organization / publisher:
- Guideline / document type:
- Year / edition:
- Jurisdiction:
- URL: [only if confidently known; otherwise leave blank]
- DOI: [only if applicable and confidently known]
- Verification required: true / false

Repeat for R2, R3, etc.

---

# REQUIRED OUTPUT FORMAT

Return ONLY markdown in this exact structure:

## Red Flag

### 1. [Short red-flag title]
- Question: [YES/NO clinical question]
- Severity: CRITICAL
- Why this matters: [brief rationale]
- Recommended action: IMMEDIATE_REFERRAL
- Action note: [brief pharmacist-facing action explanation]
- Required: true
- References: R1, R2

### 2. [Short red-flag title]
- Question: [YES/NO clinical question]
- Severity: WARNING
- Why this matters: [brief rationale]
- Recommended action: SAME_DAY_PHYSICIAN
- Action note: [brief pharmacist-facing action explanation]
- Required: true
- References: R1

[Continue as needed]

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: [...]
- Organization / publisher: [...]
- Guideline / document type: [...]
- Year / edition: [...]
- Jurisdiction: [...]
- URL: [...]
- DOI: [...]
- Verification required: false

### R2
- Title: [...]
- Organization / publisher: [...]
- Guideline / document type: [...]
- Year / edition: [...]
- Jurisdiction: [...]
- URL: [...]
- DOI: [...]
- Verification required: true

---

FINAL CHECK BEFORE RESPONDING

Confirm internally that:
- each red flag can meaningfully change management;
- routine medication-safety checks were excluded;
- differential diagnoses were not incorrectly converted into red flags;
- overlapping red flags were merged;
- every recommended action is clinically conservative;
- every cited reference genuinely supports the red flag it is mapped to;
- no reference details were invented;
- Section Evidence contains only relevant sources.`;
}

export const RED_FLAGS_IMPORT_EXAMPLE = `## Red Flag

### 1. Ocular involvement
- Question: Does the patient have a lesion near the eye or eye pain, redness, light sensitivity, excessive tearing, or changes in vision?
- Severity: CRITICAL
- Why this matters: Ocular involvement may indicate a complication requiring urgent medical assessment.
- Recommended action: IMMEDIATE_REFERRAL
- Action note: Refer for urgent medical assessment.
- Required: true
- References: R1, R2

### 2. Persistent or non-healing lesion
- Question: Has the lesion been present longer than expected without healing or failed to improve with treatment?
- Severity: WARNING
- Why this matters: Persistent or atypical lesions may require further assessment to exclude another condition.
- Recommended action: SAME_DAY_PHYSICIAN
- Action note: Arrange further assessment before routine pathway treatment continues.
- Required: true
- References: R1

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: [source title]
- Organization / publisher: [organization]
- Guideline / document type: Clinical reference
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true

### R2
- Title: [second source title]
- Organization / publisher: [organization]
- Guideline / document type: Product monograph
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true`;

export function buildDifferentialsChatGptPrompt(ctx: {
  pathwayName: string;
  condition: string;
  province?: string;
}): string {
  const pathwayName = ctx.pathwayName?.trim() || '[Pathway name]';
  const condition = ctx.condition?.trim() || '[Condition]';
  const provinces = ctx.province?.trim() || 'Canada';

  return `You are assisting with creation of a pharmacist-facing structured clinical pathway for SafeScribe.

Pathway name: ${pathwayName}
Medical condition: ${condition}
Province / jurisdiction: ${provinces}
Audience: Canadian community pharmacists using SafeScribe clinical pathways.

Tone: precise, guideline-aligned, clinically conservative.

Prefer Canadian evidence where available, especially:
- CPS / Canadian Pharmacists Association
- Health Canada
- provincial pharmacist protocols or regulator guidance
- Canadian specialty-society guidelines
- authoritative Canadian clinical references

Use high-quality international guidelines only when appropriate Canadian guidance is unavailable.

IMPORTANT CONTEXT

The pharmacist has already:
1. assessed the patient,
2. entered their clinical assessment,
3. deliberately selected this pathway, and
4. completed Presentation Review.

SafeScribe is NOT diagnosing the patient.

This section is:

## Differential Review

Its purpose is to help the pharmacist briefly consider clinically important alternative diagnoses that could better explain the patient's presentation before proceeding to Red Flags & Safety Screening.

The differential list must support pharmacist clinical reasoning without constraining the pharmacist to only the conditions listed.

---

## TASK

Create the minimum number of clinically important differential diagnoses that a Canadian community pharmacist should consider for this pathway.

Prioritize alternatives that:
- are commonly confused with the selected condition,
- require meaningfully different treatment,
- may alter whether the current pathway remains appropriate, or
- have distinguishing features that are practical for a pharmacist to assess.

Prefer approximately 3–6 differentials.

Use fewer if clinically sufficient.

Do NOT include low-value or extremely remote alternatives merely to increase the count.

---

## DO NOT INCLUDE

Do not include:
- red flags or urgent referral criteria as standalone differentials,
- medication-specific contraindications,
- drug allergies,
- drug interactions,
- renal or hepatic medication-safety checks,
- treatment doses,
- routine counselling,
- routine follow-up,
- the selected pathway condition itself as a differential.

If an alternative condition is itself a red-flag presentation requiring urgent referral, include it here only if it is genuinely an important competing diagnosis; keep urgent management details concise because referral logic belongs in Red Flags & Safety Screening.

---

## DIFFERENTIAL DESIGN RULES

For each differential provide:

1. **Condition**
2. **Likelihood:** COMMON / LESS_COMMON / RARE
3. **Screening question:** concise YES/NO question the pharmacist can ask
4. **Why this matters:** 1–2 concise sentences
5. **If yes → suggested result:** short condition/result label
6. **Key symptoms / features:** brief, high-yield distinguishing findings
7. **How to distinguish:** brief comparison with the selected pathway
8. **Suggested next step:** short pharmacist-facing action if this alternative appears more likely
9. **Required in screening:** true / false
10. **References:** reference IDs supporting this exact differential

Rules:
- Keep each screening question focused on one clinical concept.
- Avoid duplicate or substantially overlapping differentials.
- Do not imply SafeScribe has made the diagnosis.
- Do not automatically instruct the pharmacist to switch pathways.
- Suggested next steps should support pharmacist judgment, referral, or reassessment as appropriate.
- Do not use AI confidence percentages.
- Likelihood labels describe relative relevance/commonality only; they are not patient-specific probability estimates.

---

# EVIDENCE REQUIREMENTS

Every differential should be linked to at least one authoritative reference when suitable evidence exists.

Use the SAME reference ID when one source supports multiple differentials.

Examples:

- R1
- R2
- R3

Do not create duplicate entries for the same source.

### Preferred evidence hierarchy

Prefer sources in this order where appropriate:

1. Canadian clinical guideline / CPS
2. Health Canada guidance
3. provincial pharmacist protocol or regulator guidance
4. Canadian specialty-society guideline
5. high-quality international specialty guideline / clinical evidence source

### Reference accuracy

DO NOT invent:
- guideline titles
- authors
- organizations
- publication years
- editions
- URLs
- DOIs

If you are not confident about an exact bibliographic detail:
- provide only the details you are confident about
- set \`Verification required: true\`

Do not fabricate a URL to make the citation look complete.

References will undergo SafeScribe clinical review before publication.

---

# SECTION-LEVEL EVIDENCE

After the differential items, provide:

## Section Evidence

List the reference IDs that broadly support the Differential Review section as a whole.

This may include references already linked to individual differentials.

Do not add unrelated references merely to increase the number of sources.

---

# REFERENCE LIBRARY

At the end, provide one deduplicated reference library.

Use this format:

### R1
- Title:
- Organization / publisher:
- Guideline / document type:
- Year / edition:
- Jurisdiction:
- URL: [only if confidently known; otherwise leave blank]
- DOI: [only if applicable and confidently known]
- Verification required: true / false

Repeat for R2, R3, etc.

---

# REQUIRED OUTPUT FORMAT

Return ONLY markdown in this exact structure:

## Differential Review

### 1. [Condition]
- Likelihood: COMMON
- Screening question: [YES/NO question]
- Why this matters: [brief rationale]
- If yes → suggested result: [condition/result]
- Key symptoms / features: [brief]
- How to distinguish: [brief]
- Suggested next step: [brief]
- Required in screening: true
- References: R1, R2

### 2. [Condition]
- Likelihood: LESS_COMMON
- Screening question: [YES/NO question]
- Why this matters: [brief rationale]
- If yes → suggested result: [condition/result]
- Key symptoms / features: [brief]
- How to distinguish: [brief]
- Suggested next step: [brief]
- Required in screening: true
- References: R1

[Continue as needed]

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: [...]
- Organization / publisher: [...]
- Guideline / document type: [...]
- Year / edition: [...]
- Jurisdiction: [...]
- URL: [...]
- DOI: [...]
- Verification required: false

### R2
- Title: [...]
- Organization / publisher: [...]
- Guideline / document type: [...]
- Year / edition: [...]
- Jurisdiction: [...]
- URL: [...]
- DOI: [...]
- Verification required: true

---

FINAL CHECK BEFORE RESPONDING

Confirm internally that:
- only clinically meaningful differentials were included;
- the selected pathway condition itself was not repeated as a differential;
- red flags were not used merely as substitute differential diagnoses;
- duplicate or overlapping differentials were removed;
- each screening question is practical for a community pharmacist;
- suggested next steps preserve pharmacist judgment;
- every cited reference genuinely supports the differential it is mapped to;
- no bibliographic details were invented;
- Section Evidence contains only relevant sources.`;
}

export const DIFFERENTIALS_IMPORT_EXAMPLE = `## Differential Review

### 1. Aphthous ulcer (Canker sore)
- Likelihood: COMMON
- Screening question: Is the sore located inside the mouth rather than on the outer lip border, without preceding vesicles?
- Why this matters: Aphthous ulcers can resemble herpes labialis but differ in typical location and lesion pattern.
- If yes → suggested result: Canker sore (Aphthous stomatitis)
- Key symptoms / features: Painful round or oval oral ulcer with a pale centre and erythematous border.
- How to distinguish: Usually occurs on oral mucosa and is not preceded by grouped vesicles.
- Suggested next step: Assess and manage as aphthous ulcer if appropriate; refer if atypical, severe, or persistent.
- Required in screening: true
- References: R1, R2

### 2. Angular cheilitis
- Likelihood: COMMON
- Screening question: Is the problem mainly cracking, redness, or soreness at one or both corners of the mouth without grouped fluid-filled blisters?
- Why this matters: Angular cheilitis may be mistaken for herpes labialis but has a different distribution and management approach.
- If yes → suggested result: Angular cheilitis
- Key symptoms / features: Fissuring, erythema, soreness or crusting at the oral commissures.
- How to distinguish: Typically localized to the corners of the mouth rather than the vermilion border.
- Suggested next step: Assess contributing factors and manage or refer as appropriate.
- Required in screening: true
- References: R1

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: [source title]
- Organization / publisher: [organization]
- Guideline / document type: Clinical reference
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true

### R2
- Title: [second source title]
- Organization / publisher: [organization]
- Guideline / document type: Clinical reference
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true`;

export function buildPresentationReviewChatGptPrompt(ctx: {
  pathwayName: string;
  condition: string;
  province?: string;
}): string {
  const pathwayName = ctx.pathwayName?.trim() || '[Pathway name]';
  const condition = ctx.condition?.trim() || '[Condition]';
  const provinces = ctx.province?.trim() || 'Canada';

  return `You are assisting with creation of a pharmacist-facing structured clinical pathway for SafeScribe.

Pathway name: ${pathwayName}
Medical condition: ${condition}
Province / jurisdiction: ${provinces}
Audience: Canadian community pharmacists using SafeScribe clinical pathways.

Tone: precise, guideline-aligned, clinically conservative.
Prefer Canadian evidence where available, especially:
- CPS / Canadian Pharmacists Association
- Health Canada
- provincial pharmacist protocols or regulator guidance
- Canadian specialty-society guidelines
- authoritative product monographs
Use high-quality international guidelines only when appropriate Canadian guidance is unavailable.

IMPORTANT CONTEXT

The pharmacist has already:
1. assessed the patient,
2. entered their clinical assessment, and
3. deliberately selected this pathway.

SafeScribe is NOT diagnosing the patient.

This section is called:

## Presentation Review

Its purpose is to help the pharmacist quickly confirm that the patient's presentation is reasonably consistent with the selected pathway before proceeding to:
- Differential Review
- Red Flags & Safety Screening
- Treatment Options

Do NOT create separate "Diagnosis Confirmation" or "Treatment Eligibility" sections.

---

## TASK

Create the minimum number of pharmacist-facing Presentation Review questions needed for this pathway.

Include only clinically useful questions relating to:

- characteristic signs and symptoms
- location / appearance where relevant
- onset or duration
- recurrence or usual pattern where relevant
- episode status
- treatment-timing information that is clinically relevant before treatment options are reviewed

Merge overlapping concepts into a single question whenever possible.

Prefer approximately 3–6 questions, but use fewer if clinically sufficient.

---

## DO NOT INCLUDE

Do not include questions primarily relating to:

- differential diagnoses
- red flags or referral criteria
- emergency symptoms
- drug allergies
- drug interactions
- renal or hepatic drug-safety checks
- medication-specific contraindications
- pregnancy or lactation if it is only relevant to medication safety
- treatment selection
- medication doses
- counselling
- follow-up

Those belong in other SafeScribe modules.

---

## QUESTION DESIGN RULES

- Prefer YES / NO questions.
- One clinical concept per question.
- Keep wording concise and practical for a busy pharmacist.
- Do not use "Unable to determine" or "Not applicable" routinely.
- If a question only applies in certain circumstances, provide conditional display logic instead.
- Avoid duplicate or substantially overlapping questions.
- Do not imply that answering the questions establishes or confirms a diagnosis.
- Do not use AI confidence scores.

For each question provide:

1. **Question**
2. **Answer type:** YES_NO
3. **Required:** true / false
4. **Expected pathway-consistent answer:** YES / NO / EITHER
5. **Why this matters:** 1–2 concise sentences
6. **Pharmacist tip:** one brief practical clarification, if useful
7. **Conditional display:** null OR a short rule describing when the question should appear
8. **References:** reference IDs supporting this exact question

---

# EVIDENCE REQUIREMENTS

Every clinical question should be linked to at least one authoritative reference when a suitable source exists.

Use the SAME reference ID when the same source supports multiple questions.

Examples:

- R1
- R2
- R3

Do not create duplicate entries for the same source.

### Reference quality

Prefer sources in this order where appropriate:

1. Canadian clinical guideline / CPS
2. Health Canada product monograph or official Health Canada guidance
3. provincial clinical protocol or regulator guidance
4. Canadian specialty-society guideline
5. high-quality international guideline or systematic evidence source

### Reference accuracy

DO NOT invent:
- guideline titles
- authors
- publication years
- editions
- URLs
- DOIs
- organizations

If you are not confident about an exact bibliographic detail:
- provide only the details you are confident about
- add \`Verification required: true\`

Do not fabricate a URL to make the citation look complete.

References will undergo clinical review before publication.

---

# SECTION-LEVEL EVIDENCE

After the questions, provide:

## Section Evidence

List the reference IDs that broadly support the Presentation Review section as a whole.

This may include references already linked to individual questions.

Do not add unrelated sources merely to increase the number of references.

---

# REFERENCE LIBRARY

At the end, provide a single deduplicated reference library.

Use this format:

### R1
- Title:
- Organization / publisher:
- Guideline / document type:
- Year / edition:
- Jurisdiction:
- URL: [only if confidently known; otherwise leave blank]
- DOI: [only if applicable and confidently known]
- Verification required: true / false

Repeat for R2, R3, etc.

---

# REQUIRED OUTPUT FORMAT

Return ONLY markdown in this exact structure:

## Presentation Review

### 1. [Question]
- Answer type: YES_NO
- Required: true
- Expected pathway-consistent answer: YES
- Why this matters: [text]
- Pharmacist tip: [text or None]
- Conditional display: null
- References: R1, R2

### 2. [Question]
- Answer type: YES_NO
- Required: true
- Expected pathway-consistent answer: YES
- Why this matters: [text]
- Pharmacist tip: [text or None]
- Conditional display: [rule or null]
- References: R1

[Continue as needed]

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: [...]
- Organization / publisher: [...]
- Guideline / document type: [...]
- Year / edition: [...]
- Jurisdiction: [...]
- URL: [...]
- DOI: [...]
- Verification required: false

### R2
- Title: [...]
- Organization / publisher: [...]
- Guideline / document type: [...]
- Year / edition: [...]
- Jurisdiction: [...]
- URL: [...]
- DOI: [...]
- Verification required: true

---

FINAL CHECK BEFORE RESPONDING

Confirm internally that:
- Diagnosis Confirmation and Treatment Eligibility were merged into one Presentation Review.
- Questions are not duplicates.
- Red flags were excluded.
- Medication-safety questions were excluded.
- Every cited reference genuinely supports the question it is mapped to.
- No reference details were invented.
- Section Evidence contains only relevant sources.`;
}

export const PRESENTATION_REVIEW_IMPORT_EXAMPLE = `## Presentation Review

### 1. Does the patient have typical prodromal symptoms before the lesion appears?
- Answer type: YES_NO
- Required: true
- Expected pathway-consistent answer: YES
- Why this matters: Prodromal tingling or burning may precede visible lesions in recurrent herpes labialis.
- Pharmacist tip: Ask when symptoms first began, not only when the blister became visible.
- Conditional display: null
- References: R1

### 2. Is the lesion on or near the vermilion border of the lip?
- Answer type: YES_NO
- Required: true
- Expected pathway-consistent answer: YES
- Why this matters: Typical location helps support consistency with herpes labialis.
- Pharmacist tip: Confirm whether lesions are external/perioral rather than only intraoral.
- Conditional display: null
- References: R1, R2

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: [source title]
- Organization / publisher: [organization]
- Guideline / document type: Clinical reference
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true

### R2
- Title: [second source title]
- Organization / publisher: [organization]
- Guideline / document type: Product monograph
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true`;

export const CHATGPT_IMPORT_CONFIGS: Record<ChatGptImportTarget, ChatGptImportConfig> = {
  overview: {
    target: 'overview',
    title: 'Import overview from ChatGPT',
    description:
      'Generate a clinical pathway summary and notes, then paste the response here to fill Overview fields.',
    promptTemplate: (ctx) => `${baseContext(ctx)}

Task: Write professional Overview content for this pharmacist clinical pathway.

Return ONLY this markdown (no preamble):

## Description
[2–4 sentences: what this pathway covers, typical presentation, pharmacist scope]

## Notes
[Internal clinical notes for pathway authors: key exclusions, age/sex considerations, guideline sources]

## Age range
Min: [number or leave blank]
Max: [number or leave blank]

Keep language suitable for Canadian pharmacy practice.`,
    exampleOutput: `## Description
Pharmacist-managed assessment and treatment pathway for [condition] in eligible adults, aligned with provincial minor-ailment prescribing.

## Notes
Exclude immunocompromised patients and those with red-flag features. Prefer first-line non-drug advice where appropriate.

## Age range
Min: 12
Max: 65`,
  },

  concepts: {
    target: 'concepts',
    title: 'Import concepts from ChatGPT',
    description:
      'Import a focused shortlist of clinical concepts (max 20) — red flags, eligibility, key treatments, and counselling.',
    promptTemplate: (ctx) => `${baseContext(ctx)}

Task: List the MOST IMPORTANT clinical concepts for this pharmacist pathway (from typical Canadian guidelines).

HARD LIMIT: return at most 20 concepts total across all sections. Prefer HIGH-value items only:
red flags, eligibility/exclusions, key differentials, core treatments, essential counselling.
Skip minor or redundant assessment noise.

Return ONLY markdown with these section headings. One concept per bullet.

## RED_FLAG
- [concept] — [short description]

## ELIGIBILITY
- [concept] — [short description]

## DIFFERENTIAL
- [concept] — [short description]

## SYMPTOM
- [concept] — [short description]

## TREATMENT
- [concept] — [short description]

## COUNSELLING
- [concept] — [short description]

## FOLLOW_UP
- [concept] — [short description]

Use only relevant categories. Keep labels short and searchable. Total bullets ≤ 20.`,
    exampleOutput: `## RED_FLAG
- Immunocompromised — Referral required
- Eye involvement — Urgent ophthalmology

## ELIGIBILITY
- Age ≥ 12 years — Typical pharmacist scope

## SYMPTOM
- Localized lesion — Typical presentation site
- Burning / tingling prodrome — Early warning symptom

## TREATMENT
- Acyclovir — First-line antiviral option

## COUNSELLING
- Contagion precautions — Avoid kissing while lesions active`,
  },

  assessment: {
    target: 'assessment',
    title: 'Import Presentation Review from ChatGPT',
    description:
      'Paste ChatGPT output or upload a Word/text file. Questions, rationale, conditional logic, and references can be imported for review.',
    promptTemplate: (ctx) => buildPresentationReviewChatGptPrompt(ctx),
    exampleOutput: PRESENTATION_REVIEW_IMPORT_EXAMPLE,
  },

  'red-flags': {
    target: 'red-flags',
    title: 'Import red flags from ChatGPT',
    description:
      'Generate red-flag criteria, recommended actions, and supporting references for clinical review.',
    promptTemplate: (ctx) => buildRedFlagsChatGptPrompt(ctx),
    exampleOutput: RED_FLAGS_IMPORT_EXAMPLE,
  },

  differentials: {
    target: 'differentials',
    title: 'Import differentials from ChatGPT',
    description:
      'Generate relevant alternative diagnoses, distinguishing features, and supporting references for clinical review.',
    promptTemplate: (ctx) => buildDifferentialsChatGptPrompt(ctx),
    exampleOutput: DIFFERENTIALS_IMPORT_EXAMPLE,
  },

  rules: {
    target: 'rules',
    title: 'Import clinical rules from ChatGPT',
    description:
      'Generate decision rules (warnings, stop prescribing, referral) linked to assessment answers.',
    promptTemplate: (ctx) => `${baseContext(ctx)}

Task: Create clinical decision rules for this pathway.

Return ONLY markdown:

## Rule
Condition: [question text or clinical condition key]
Operator: equals | not_equals | contains | greater_than | less_than
Value: [expected answer, e.g. yes / no / true]
Action: URGENT_REFERRAL | STOP_PRESCRIBING | SHOW_WARNING | REQUIRE_DOCUMENTATION | ADJUST_DOSE | CONTRAINDICATED
Severity: INFO | WARNING | CRITICAL | STOP
Message: [pharmacist-facing message]
Details: [optional rationale]

Create 6–12 high-value rules for ${ctx.condition || 'the condition'}.`,
    exampleOutput: `## Rule
Condition: Is the patient pregnant or breastfeeding?
Operator: equals
Value: yes
Action: STOP_PRESCRIBING
Severity: CRITICAL
Message: Pharmacist prescribing is not appropriate in pregnancy/breastfeeding for this pathway.
Details: Refer to physician or appropriate specialist.`,
  },

  treatments: {
    target: 'treatments',
    title: 'Import treatments from ChatGPT',
    description:
      'Generate pathway-supported prescription, OTC, supplement, and non-drug treatment options with evidence and structured safety fields.',
    promptTemplate: (ctx) => buildTreatmentsChatGptPrompt(ctx),
    exampleOutput: `## Treatment
Medication: Acyclovir 400 mg
Generic: acyclovir
Brand: Zovirax
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Strength: 400 mg
Product form: Tablet
Dose: 1
Administration unit: Tablet(s)
Route: Oral
Frequency: Five times daily
Duration: 5
Duration unit: Days
Quantity: 25 tablets
Directions: Take 1 tablet by mouth five times daily for 5 days.
Clinical indication: Typical herpes labialis in immunocompetent adults within 72 hours of onset
Why this option?: Guideline-supported first-line oral antiviral for episodic therapy
Eligibility: Immunocompetent adults with typical presentation
Age restriction: ≥12 years
Province availability: ALL
Evidence strength: Strong
Contraindications: Hypersensitivity to acyclovir or valacyclovir
Interactions: Probenecid may increase acyclovir levels
Pregnancy: Yes
Pregnancy reason: Limited human data in pregnancy — confirm benefit outweighs risk; prefer specialist advice in first trimester
Breastfeeding: Yes
Breastfeeding reason: Compatible with breastfeeding at standard doses; monitor infant for unusual drowsiness
Renal adjustment: Yes
Renal source basis: CrCl
Renal reason: Source provides CrCl-based adjustment; no validated eGFR mapping supplied for automatic SafeScribe dose adjustment; pharmacist review is required.
Renal dosing basis: NONE
Renal dosing rules: []
Hepatic adjustment: No
Monitoring: Yes
Monitoring reason: Recheck symptoms in 48–72 hours; seek care if lesions worsen or fever develops
Counselling notes: Start at first tingle or blister; complete the full course even if lesions improve
Follow-up advice: Return if not improving after 3 days or if lesions involve the eye
Warnings: Hydration recommended
References: R1, R2
Documentation reference: R1

## Treatment
Medication: Docosanol 10% cream
Generic: docosanol
Brand: Abreva
Category: OTC
Recommendation: ALTERNATIVE
Strength: 10%
Product form: Cream
Dose: 1
Administration unit: Application(s)
Route: Topical
Frequency: Five times daily
Duration: 1
Duration unit: Days
Quantity: 2 g tube
Directions: Apply a thin layer to the affected area five times daily until healed.
Clinical indication: Early cold sore when prescription therapy is declined or unavailable
Why this option?: Topical supportive option when oral therapy is declined or unavailable
Eligibility: Adults and adolescents with typical cold sore
Province availability: ALL
Evidence strength: Moderate
Pregnancy: No
Breastfeeding: No
Renal adjustment: No
Renal source basis: NONE
Renal reason:
Renal dosing basis: NONE
Renal dosing rules: []
Hepatic adjustment: No
Monitoring: No
Counselling notes: Most effective when started at the tingling stage
Follow-up advice: Seek care if lesions spread or do not improve
Warnings:
References: R1
Documentation reference:

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: CPS — Herpes Labialis
- Organization / publisher: Canadian Pharmacists Association
- Guideline / document type: Clinical reference
- Year / edition: 2024
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: false

### R2
- Title: Health Canada product monograph — acyclovir
- Organization / publisher: Health Canada
- Guideline / document type: Product monograph
- Year / edition: 2023
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true`,
  },

  counselling: {
    target: 'counselling',
    title: 'Import patient guidance from ChatGPT',
    description:
      'Copy the prompt, paste ChatGPT’s response, then import education, self-care, and follow-up points. Review and approve before they appear in counselling.',
    promptTemplate: (ctx) => `${baseContext(ctx)}

Task: Write pharmacist-facing Patient Guidance for this pathway.

These items are the controlled clinical source for counselling cards 2–4:
- What to expect
- Self-care & non-drug measures
- Follow-up & when to seek care

Card 1 (How to use your medicine) is generated from the confirmed prescription — do NOT include dosing or SIG here.

Return ONLY markdown with these exact headings:

## Education & what to expect
- [short patient-facing point] — [optional detail: expected course or treatment response]

## Self-care & non-drug measures
- [short patient-facing point] — [optional detail: lifestyle, hygiene, symptom relief, prevention]

## Follow-up & when to seek care
- [short patient-facing point] — [optional detail: reassessment, treatment failure, or urgent-care advice]

Rules:
- 3–6 bullets per section. Short, Canada-appropriate, patient-facing instructions.
- Do not invent drug doses, brand names, or timeframes that are not standard for this condition.
- Do not include medication directions (take/apply/dose) — those belong on the prescription.
- Urgent-care bullets belong under Follow-up & when to seek care.
- No handouts, no assessment questions, no preamble.`,
    exampleOutput: `## Education & what to expect
- Cold sores usually crust and settle over several days — Healing time varies from person to person
- Mild tingling or tightness can occur as the lesion heals

## Self-care & non-drug measures
- Keep the area clean and dry — Avoid sharing towels, lip products, or drinks
- Wash hands after touching the lesion

## Follow-up & when to seek care
- Return if the lesion is not improving after a few days of treatment
- Seek urgent care if lesions spread toward the eye, or if fever or severe swelling develops`,
  },

  references: {
    target: 'references',
    title: 'Import references from ChatGPT',
    description:
      'Generate a structured reference list for this pathway. Imported references must be reviewed before they can be verified or published.',
    promptTemplate: (ctx) => {
      const provinces =
        ctx.province?.trim() || 'Canada (pharmacist prescribing)';
      const pathwayLabel = ctx.pathwayName || '[Pathway name]';
      return `You are assisting with creation and maintenance of the central evidence library for a SafeScribe pharmacist-facing clinical pathway.

Pathway name: ${pathwayLabel}
Medical condition: ${ctx.condition || '[Condition]'}
Province / jurisdiction: ${provinces}

Audience:
Canadian community pharmacists using SafeScribe clinical pathways.

# PURPOSE

Generate a concise, authoritative, deduplicated reference library for this SafeScribe clinical pathway.

The references may support:

- Presentation Review
- Differential Review
- Red Flags & Safety Screening
- Treatment Options
- Patient Guidance
- Adapt and other medication-management workflows when the reference contains clinically relevant information such as dosing, renal adjustment, interactions, formulation, therapeutic substitution, monitoring, or counselling.

SafeScribe uses approved references to:

- support question-level and item-level \`Why?\` explanations;
- support section-level \`Evidence & review\`;
- support treatment rationale;
- support Adapt clinical checks;
- support medication-specific rationale;
- support clinical governance and review;
- support documentation reference selection.

This task is for:

1. evidence discovery;
2. structured bibliographic drafting;
3. pathway-section mapping;
4. automatic clinical-use tagging;
5. documentation-reference candidate identification.

All generated mappings and tags are suggestions and will undergo SafeScribe clinical review before publication.

Do NOT create:

- reviewer names;
- internal review records;
- external peer-review records;
- approval decisions;
- pathway versions;
- patient-specific documentation;
- patient-specific treatment recommendations.

---

# SOURCE PRIORITY

Prefer authoritative Canadian sources whenever appropriate.

Use this preference order:

1. CPS / Canadian Pharmacists Association
2. Health Canada guidance
3. current Canadian product monographs
4. applicable provincial pharmacist protocols or regulator guidance
5. Canadian specialty-society clinical guidelines
6. Canadian public-health guidance
7. high-quality international specialty guidelines only when suitable Canadian evidence is unavailable
8. systematic reviews or authoritative evidence summaries when useful

Avoid weak secondary sources when a stronger primary or authoritative guideline source is available.

Do not add sources merely to increase the number of references.

---

# REFERENCE SELECTION RULES

Include only references that materially support one or more SafeScribe clinical functions.

Prefer approximately 5–12 high-value references for a typical pathway.

Use fewer if sufficient.

A single reference may support:

- multiple pathway sections;
- multiple clinical-use tags;
- Prescribe;
- Adapt;
- documentation;
- counselling;
- safety checks.

Do NOT duplicate a reference simply because it supports multiple functions.

For medication-treatment pathways:

- include current Canadian product monographs when they materially support dose, duration, contraindications, renal/hepatic adjustment, route/formulation, interactions, monitoring, or important safety information;
- include pathway-level clinical guidance where it supports treatment selection or place in therapy;
- do not include every available product monograph unless it materially contributes to the pathway.

For Red Flags:

- include references supporting actual referral criteria, contraindications, urgent assessment triggers, or clinically important exclusions.

For Differential Review:

- include references supporting relevant alternative diagnoses and distinguishing clinical features.

For Patient Guidance:

- include references supporting expected course, self-care, transmission/prevention, follow-up, counselling, or when to seek care.

---

# CRITICAL ACCURACY RULES

DO NOT invent or guess:

- source titles
- authors
- organizations
- publisher names
- publication years
- editions
- URLs
- DOIs
- document identifiers
- guideline versions

If you are not confident a bibliographic detail is exact:

- leave the field blank when possible;
- set \`Verification required: true\`.

Do not fabricate a URL simply to make a citation appear complete.

If you are not confident a source exists exactly as named, omit it.

Do not label a source as Canadian if it is not Canadian.

Do not label a source as current unless you are reasonably confident it is current.

Prefer the official publisher or regulator URL.

All references will undergo SafeScribe clinical review before publication.

---

# DOCUMENT TYPE VALUES

Use ONLY one of these values:

- Clinical reference
- Guideline
- Product monograph
- Regulatory guidance
- Specialty guideline
- Public-health guidance
- Systematic review
- Other

---

# JURISDICTION VALUES

Use ONLY one of these values:

- Canada
- Alberta
- British Columbia
- Ontario
- Other Canadian province/territory
- International

Choose the jurisdiction of the reference itself, not the jurisdiction of the pathway.

---

# APPLICABLE CONDITION / PATHWAY

Each reference must be linked to the pathway or condition it supports.

For this task, use:

\`${pathwayLabel}\`

as the applicable pathway unless another pathway is explicitly supplied in this prompt.

Do NOT invent additional SafeScribe pathway names.

---

# PATHWAY SECTION NAMES

Use ONLY these section names:

- Presentation Review
- Differential Review
- Red Flags
- Treatment Options
- Patient Guidance
- Section-wide

Do not create additional section names.

---

# CLINICAL USE TAGS

For each reference, automatically assign all clinically relevant SafeScribe clinical-use tags.

Use ONLY these controlled tags:

- Assessment
- Differential diagnosis
- Red flags / referral
- Treatment / place in therapy
- Dose
- Age / weight
- Renal
- Hepatic
- Pregnancy / lactation
- Contraindications / precautions
- Allergies / hypersensitivity
- Drug interactions
- Dosage form / formulation
- Route / administration
- Regimen / frequency
- Therapeutic substitution
- Adherence / use
- Monitoring / follow-up
- Counselling / patient guidance

Do NOT create additional tag names.

Assign a clinical-use tag only when the source materially supports that topic.

Do not assign a tag simply because the topic appears somewhere in the document.

Examples:

A Canadian product monograph may reasonably receive:

\`Dose, Renal, Hepatic, Pregnancy / lactation, Contraindications / precautions, Drug interactions, Dosage form / formulation, Route / administration, Monitoring / follow-up\`

A condition-specific clinical guideline may receive:

\`Assessment, Differential diagnosis, Red flags / referral, Treatment / place in therapy, Dose, Monitoring / follow-up, Counselling / patient guidance\`

A public-health information source may receive:

\`Red flags / referral, Counselling / patient guidance\`

A source supporting switching between therapeutically appropriate agents may receive:

\`Treatment / place in therapy, Therapeutic substitution\`

Do not automatically give every treatment source:

- Dose
- Renal
- Drug interactions
- Therapeutic substitution

unless the source actually supports those topics.

---

# ADAPT-SPECIFIC TAGGING

Pay particular attention to whether a reference could support Adapt.

## Dose adaptation
Consider tags such as:

- Dose
- Age / weight
- Renal
- Hepatic
- Drug interactions
- Monitoring / follow-up

## Dosage form / formulation adaptation
Consider:

- Dosage form / formulation
- Route / administration
- Adherence / use
- Counselling / patient guidance

## Regimen / frequency adaptation
Consider:

- Regimen / frequency
- Dose
- Adherence / use
- Monitoring / follow-up

## Route adaptation
Consider:

- Route / administration
- Dosage form / formulation
- Contraindications / precautions

## Therapeutic substitution
Consider:

- Therapeutic substitution
- Treatment / place in therapy
- Contraindications / precautions
- Allergies / hypersensitivity
- Drug interactions
- Monitoring / follow-up

Only add these tags if the source actually contains meaningful evidence supporting them.

---

# DOCUMENTATION REFERENCE CANDIDATE

For each source indicate whether it could reasonably serve as the pathway's concise primary documentation reference.

Use:

\`Documentation reference candidate: YES | NO\`

A good documentation-reference candidate should generally be:

- authoritative;
- concise to identify in a pharmacist record;
- directly relevant to the pathway;
- preferably Canadian;
- broad enough to support the primary assessment/treatment decision.

Do not select SafeScribe itself.

Do not mark many sources as YES.

Typically only 1–3 references should be strong candidates.

SafeScribe administrators will make the final selection.

---

# VERIFICATION REQUIRED

Use:

\`Verification required: true | false\`

Set \`Verification required: true\` if any important bibliographic information needs manual confirmation.

Examples:

- exact title uncertain;
- publication year uncertain;
- current edition uncertain;
- official URL uncertain;
- DOI uncertain;
- source appears valid but current status is uncertain.

Set \`Verification required: false\` only when you are reasonably confident the bibliographic information is correct.

---

# STATUS

All newly imported reference records must use:

\`Status: Needs review\`

Do not assign Approved, Published, or Rejected.

AI does not make governance decisions.

---

# NOTES

Add a short note only when useful.

Examples:

- why this source is particularly relevant;
- whether it is primarily useful for dose, safety, counselling, etc.;
- whether an edition/version should be confirmed;
- whether the source is supplemental rather than primary.

Do not repeat information already captured in the structured fields.

If no useful note is needed, leave blank.

---

# REQUIRED OUTPUT FORMAT

Return ONLY markdown.

Use exactly this structure:

## Reference Library

### R1

- Title: [exact title]
- Organization / publisher: [exact organization]
- Document type: Clinical reference | Guideline | Product monograph | Regulatory guidance | Specialty guideline | Public-health guidance | Systematic review | Other
- Year / edition: [exact year or edition if confidently known; otherwise blank]
- Jurisdiction: Canada | Alberta | British Columbia | Ontario | Other Canadian province/territory | International
- URL: [exact official URL only if confidently known; otherwise blank]
- DOI: [exact DOI only if applicable and confidently known; otherwise blank]
- Applicable condition(s) / pathway(s): ${pathwayLabel}
- Suggested pathway sections: [comma-separated allowed pathway-section names]
- Clinical use tags: [comma-separated controlled clinical-use tags]
- Documentation reference candidate: YES | NO
- Verification required: true | false
- Status: Needs review
- Notes: [short note if useful; otherwise blank]

### R2

- Title: [...]
- Organization / publisher: [...]
- Document type: [...]
- Year / edition: [...]
- Jurisdiction: [...]
- URL: [...]
- DOI: [...]
- Applicable condition(s) / pathway(s): ${pathwayLabel}
- Suggested pathway sections: [...]
- Clinical use tags: [...]
- Documentation reference candidate: YES | NO
- Verification required: true | false
- Status: Needs review
- Notes: [...]

[Continue as needed]

---

# DEDUPLICATION

Before returning results:

1. Compare titles.
2. Compare organizations.
3. Compare publication year/edition.
4. Compare URL/DOI.
5. Remove duplicate or substantially duplicate versions unless there is a clear clinical reason to retain both.

If an older version and a newer version of the same guideline are identified:

- prefer the current version;
- omit the older version unless specifically needed.

---

# FINAL CHECK BEFORE RESPONDING

Confirm internally that:

- every reference is materially relevant;
- duplicate references were removed;
- Canadian evidence was preferred where appropriate;
- treatment monographs were included only when clinically useful;
- exact bibliographic details were not invented;
- uncertain fields are blank rather than guessed;
- uncertain references have \`Verification required: true\`;
- pathway-section mappings use only the approved section names;
- clinical-use tags use only the approved controlled vocabulary;
- clinical-use tags reflect material evidence support;
- Adapt-relevant tags were added where genuinely supported;
- no source was over-tagged;
- no source was duplicated simply because it supports multiple modules;
- Applicable condition(s) / pathway(s) is populated;
- Status is always \`Needs review\`;
- Documentation reference candidate is YES only for strong candidates;
- URLs and DOIs are exact or blank;
- no reviewer names or approval decisions were generated.

Return ONLY the requested markdown.`;
    },
    exampleOutput: `## Reference Library

### R1
- Title: Herpes simplex infections
- Organization / publisher: Canadian Pharmacists Association
- Document type: Clinical reference
- Year / edition: 2024
- Jurisdiction: Canada
- URL:
- DOI:
- Applicable condition(s) / pathway(s): Cold sores (oral herpes labialis)
- Suggested pathway sections: Treatment Options, Red Flags, Presentation Review
- Clinical use tags: Assessment, Treatment / place in therapy, Dose, Monitoring / follow-up, Counselling / patient guidance
- Documentation reference candidate: YES
- Verification required: true
- Status: Needs review
- Notes: Useful pathway-level clinical reference; bibliographic details require verification.

### R2
- Title: Product monograph — Valacyclovir
- Organization / publisher: Health Canada
- Document type: Product monograph
- Year / edition: Current
- Jurisdiction: Canada
- URL:
- DOI:
- Applicable condition(s) / pathway(s): Cold sores (oral herpes labialis)
- Suggested pathway sections: Treatment Options, Red Flags
- Clinical use tags: Dose, Renal, Hepatic, Pregnancy / lactation, Contraindications / precautions, Drug interactions, Dosage form / formulation, Route / administration, Monitoring / follow-up
- Documentation reference candidate: NO
- Verification required: true
- Status: Needs review
- Notes: Useful for antiviral dosing and safety checks; confirm current Health Canada monograph details.
`,
  },
};

export function getChatGptImportConfig(target: ChatGptImportTarget): ChatGptImportConfig {
  return CHATGPT_IMPORT_CONFIGS[target];
}

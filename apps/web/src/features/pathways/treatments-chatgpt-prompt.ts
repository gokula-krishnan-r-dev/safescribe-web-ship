/**
 * Canonical ChatGPT treatments extraction prompt (SafeScribe pathway authoring).
 * Field names, order, evidence IDs, and one-line JSON renal rules are a parse
 * contract with treatments ChatGPT import / `extractRenalDosingFromMarkdown`.
 */
export function buildTreatmentsChatGptPrompt(ctx: {
  pathwayName: string;
  condition: string;
  province?: string;
  /** When set, generate only this medication/class; otherwise all appropriate options. */
  treatmentName?: string;
}): string {
  const pathway = ctx.pathwayName?.trim() || '[Pathway name]';
  const condition = ctx.condition?.trim() || '[Condition]';
  const provinces = ctx.province?.trim() || 'Canada (pharmacist prescribing)';
  const treatmentScope =
    ctx.treatmentName?.trim() ||
    'all clinically appropriate first-line and alternative treatments for this condition';

  return `You are assisting with creation of pharmacist-facing treatment options for a structured SafeScribe clinical pathway.

Pathway name: ${pathway}
Medical condition: ${condition}
Province / jurisdiction: ${provinces}

Treatment to generate:
${treatmentScope}

Audience:
Canadian community pharmacists using SafeScribe clinical pathways.

Tone:
Precise, guideline-aligned, clinically conservative.

IMPORTANT CONTEXT

The pharmacist has already:
1. assessed the patient,
2. entered their clinical assessment,
3. selected this pathway,
4. completed Presentation Review,
5. reviewed relevant differential diagnoses, and
6. completed Red Flags & Safety Screening.

SafeScribe is NOT selecting treatment for the pharmacist.

This section provides pathway-supported treatment options.
The pharmacist chooses the treatment.

---

# SOURCE PREFERENCE

Prefer Canadian evidence where available.

Prioritize:
1. CPS / Canadian Pharmacists Association
2. current Health Canada-authorized Canadian product monographs
3. Health Canada clinical/product information
4. applicable provincial pharmacist prescribing protocols
5. Canadian specialty-society guidelines
6. high-quality international guidance only when appropriate Canadian guidance is unavailable

Use indication-specific dosing whenever available.

DO NOT invent:
- doses
- strengths
- treatment durations
- dosage forms
- contraindications
- interactions
- monitoring requirements
- renal adjustments
- hepatic adjustments
- pregnancy/lactation information
- evidence hierarchy
- bibliographic details
- guideline titles
- monograph titles
- organizations
- publication years
- editions
- URLs
- DOIs

If a treatment cannot be supported with a reliable regimen and evidence, omit it.

Generate only treatments clinically appropriate for ${condition}.

Do not add marginal options simply to increase the number of treatments.

---

# TASK

Create complete treatment records for the clinically appropriate first-line and alternative treatments for ${condition} in Canadian community-pharmacy practice.

Include Prescription, OTC, Supplement, or Non-drug options only when clinically appropriate and evidence-supported.

For every treatment:
- provide one clear primary regimen;
- identify its actual place in therapy;
- provide a concise Why this option? rationale;
- link the exact references supporting its use, regimen, and place in therapy;
- provide structured renal dosing rules only when a definite eGFR-based rule can be safely supported.

Return ONLY markdown.

---

# REQUIRED OUTPUT STRUCTURE

Return one ## Treatment block per treatment option.

After all treatment blocks, return:

## Section Evidence

followed by:

## Reference Library

Do not add introductory text, conclusions, tables, or explanatory prose outside these sections.

---

# IMPORTANT FORMAT RULES

- Use the exact field names and exact field order below.
- Put EVERY field on ONE physical line.
- Do not use multiline bullets within a field.
- When a field contains several instructions, separate them with semicolons.
- Renal reason, Hepatic reason, Interactions, Counselling notes, Follow-up advice, and Warnings must each remain on one physical line.
- Renal dosing rules must contain valid JSON on ONE physical line.
- Structured regimen values must be directly importable into SafeScribe.
- Do not put narrative clinical information into Dose, Frequency, Duration, Duration unit, Route, Product form, or Administration unit.
- All structured regimen fields must be internally consistent.

## Treatment
Medication: [pharmacist-facing medication or treatment name including useful strength]
Generic: [active ingredient / generic name; blank only when not applicable]
Brand: [common Canadian brand when clinically useful; otherwise blank]
Category: PRESCRIPTION | OTC | SUPPLEMENT | NON_DRUG
Recommendation: FIRST_LINE | SECOND_LINE | ALTERNATIVE | ADJUNCTIVE | SUPPORTIVE_CARE
Strength: [clinically appropriate marketed strength]
Product form: Tablet | Capsule | Cream | Ointment | Gel | Foam | Solution | Drop | Spray | Nasal spray | Metered-dose inhaler | Patch | Suppository | Lozenge | Injection
Dose: [numeric administered amount only]
Administration unit: Tablet(s) | Capsule(s) | Application(s) | Drop(s) | Spray(s) | Puff(s) | Patch(es) | mL | Sachet(s) | Injection(s)
Route: Oral | Topical | Ophthalmic | Otic | Nasal | Inhalation | Transdermal | Rectal | Intramuscular | Subcutaneous
Frequency: Once daily | Twice daily (BID) | Three times daily (TID) | Four times daily (QID) | Five times daily | Every 4 hours | Every 6 hours | Every 8 hours | Every 12 hours | Single dose | Other
Duration: [numeric value only]
Duration unit: Days | Weeks | Months
Quantity: [complete dispense quantity including unit]
Directions: [complete patient-facing SIG matching the structured regimen]
Clinical indication: [when this treatment is used for the current condition]
Why this option?: [concise pharmacist-facing explanation of why this option is first-line, alternative, adjunctive, or supportive]
Eligibility: [appropriate patient criteria for this treatment]
Age restriction: [specific age restriction when applicable]
Province availability: ALL or AB,BC,MB,NB,NL,NS,NT,NU,ON,PE,QC,SK,YT
Evidence strength: Strong | Moderate | Limited | Expert opinion
Contraindications: [clinically important absolute or major relative contraindications]
Interactions: [clinically important interactions only; include exact dose modification when an interaction changes the regimen]
Pregnancy: Yes | No
Pregnancy reason: [required when Pregnancy is Yes; concise pharmacist-facing explanation]
Breastfeeding: Yes | No
Breastfeeding reason: [required when Breastfeeding is Yes; concise pharmacist-facing explanation]
Renal adjustment: Yes | No
Renal source basis: CrCl | eGFR | OTHER | NONE
Renal reason: [human-readable SafeScribe operational eGFR configuration; all supported tiers on one physical line separated by semicolons; if no validated eGFR mapping exists, state that pharmacist review is required]
Renal dosing basis: eGFR | NONE
Renal dosing rules: [valid single-line JSON array containing SafeScribe eGFR dosing rules; use [] when no safe structured eGFR rule can be supported]
Hepatic adjustment: Yes | No
Hepatic reason: [exact indication-specific hepatic information when supported]
Monitoring: Yes | No
Monitoring reason: [clinically meaningful laboratory or measurable parameter monitoring only]
Counselling notes: [key treatment-specific counselling points]
Follow-up advice: [reassessment, treatment failure, recurrence, or clinical follow-up]
Warnings: [clinically important warnings]
References: [comma-separated reference IDs supporting this treatment, e.g. R1, R2]
Documentation reference: [ONE reference ID suitable for concise DAP documentation; leave blank if no treatment-specific override is needed]

---

# TREATMENT SELECTION RULES

- Include only treatments relevant to ${condition}.
- Prefer treatments suitable for Canadian community-pharmacy practice and pharmacist prescribing where applicable.
- Prefer Canadian generic names, brand names, and marketed strengths.
- Respect applicable jurisdiction-specific pharmacist scope and product availability.
- Recommendation level must reflect the treatment's actual place in therapy.
- Do not use FIRST_LINE unless the evidence supports first-line status.
- Do not describe SafeScribe as recommending a treatment.
- The treatment record is pathway content; the pharmacist remains the treatment decision-maker.

---

# STRUCTURED REGIMEN RULES

- Generate one clear primary regimen for each treatment.
- Strength, Dose, Administration unit, Product form, Route, Frequency, Duration, Quantity, and Directions must agree.
- Dose must contain the numeric administered amount only.
- Example: Dose: 2 and Administration unit: Tablet(s).
- Do NOT write Dose: 2 tablets.
- Strength describes the product strength.
- Dose describes the number of administration units per dosing event when the dosage form can be represented this way.
- Duration must contain a numeric value only.
- Duration unit must be supplied separately.
- Do not put clinical prose into structured regimen fields.
- Do not leave structured regimen fields blank when a standard regimen exists.
- If a reliable regimen cannot be determined, omit the treatment.

---

# FIXED-COURSE TREATMENTS

- Provide one definite standard dose, frequency, and duration.
- Do not use vague ranges as the primary regimen when a standard regimen can reasonably be selected.
- Pediatric, weight-based, alternate-strength, or alternate-duration information may appear in Eligibility or Counselling notes when useful, but must not make the primary regimen ambiguous.

---

# ACUTE / PRN TREATMENTS

- Acute or traditionally PRN treatments must still have a complete structured regimen.
- Use Duration: 1 and Duration unit: Days when the treatment is episodic and no longer course is standard.
- Do not use As needed (PRN) as the structured Frequency.
- Use the definite frequency that best represents the standard regimen.
- For single-dose treatment use Frequency: Single dose, Duration: 1, Duration unit: Days.
- Repeat-dose instructions belong in Directions.

---

# PATIENT DIRECTIONS

- Directions must exactly reflect the structured regimen.
- Include timing, repeat-dose instructions, maximum dose, treatment limits, and administration instructions when clinically relevant.
- Do not simplify Directions in a way that contradicts the structured regimen.
- Do not duplicate the full SIG unnecessarily in Counselling notes.

---

# WHY THIS OPTION?

Why this option? must:
- be concise;
- explain place in therapy;
- distinguish first-line vs alternative vs adjunctive/supportive roles;
- be supported by the linked treatment references;
- avoid simply repeating Clinical indication;
- avoid saying SafeScribe recommends the treatment.

Do not use unsupported comparative superiority claims.

---

# EVIDENCE REQUIREMENTS

Every treatment should be linked to at least one authoritative reference when a suitable source exists.

The linked source(s) should support as applicable:
- use for the condition;
- dose;
- frequency;
- duration;
- product/formulation;
- place in therapy;
- clinically important safety rules.

Use the SAME reference ID when one source supports multiple treatments.

Do not create duplicate entries for the same source.

If exact bibliographic details are uncertain:
- provide only details you are confident about;
- set Verification required: true.

Do not fabricate a URL.

All imported references will undergo SafeScribe review before publication.

---

# DOCUMENTATION REFERENCE

Each treatment may optionally provide:

Documentation reference: R1

Rules:
- use exactly ONE reference ID;
- choose the most appropriate concise external clinical source supporting the treatment;
- preferably use CPS, a Canadian guideline, or authoritative Canadian product monograph;
- do not use SafeScribe as the documentation reference;
- leave blank if the pathway-level primary documentation reference should be inherited;
- do not provide a bibliography here.

---

# SECTION-LEVEL EVIDENCE

After all treatment blocks provide:

## Section Evidence
- R1
- R2

List reference IDs that broadly support the overall Treatment Options section.

This may include references already linked to individual treatments.

Do not add unrelated references merely to increase the number of sources.

---

# REFERENCE LIBRARY

After Section Evidence provide one deduplicated reference library:

## Reference Library

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

Use one entry per unique source.
Do not duplicate sources under multiple IDs.

---

# RENAL DOSING POLICY — SAFESCRIBE OPERATIONAL STANDARD

SafeScribe uses eGFR as the operational renal-function value in the pharmacist-facing workflow.

Therefore Renal dosing basis must be eGFR whenever a structured renal adjustment is generated.

However, the authoritative source may use CrCl, eGFR, or another renal metric.

Renal source basis must truthfully record what the source actually uses.

Examples:

Renal source basis: CrCl
Renal dosing basis: eGFR

or:

Renal source basis: eGFR
Renal dosing basis: eGFR

Do NOT falsely state that a product monograph uses eGFR when it uses CrCl.

Renal source basis and Renal dosing basis are NOT the same concept.

---

# CRITICAL eGFR SAFETY RULE

Do not mathematically convert or directly relabel a CrCl threshold as an eGFR threshold unless:
1. the authoritative source itself provides eGFR thresholds, OR
2. an approved SafeScribe clinical rule explicitly validates the eGFR mapping for that medication, indication, and adult population.

If the authoritative source provides only CrCl-based renal dosing and no validated SafeScribe eGFR mapping is available:

Renal adjustment: Yes
Renal source basis: CrCl
Renal dosing basis: NONE
Renal dosing rules: []

and:

Renal reason: Source provides CrCl-based adjustment; no validated eGFR mapping supplied for automatic SafeScribe dose adjustment; pharmacist review is required.

Do not invent an eGFR conversion.

This rule takes precedence over generating a structured renal rule.

---

# WHEN STRUCTURED eGFR RULES MAY BE GENERATED

Generate machine-readable eGFR rules only when:
- exact thresholds are supported by an authoritative source using eGFR, OR
- a validated SafeScribe pathway rule explicitly maps the source recommendation to eGFR.

When supported:
- include all clinically relevant eGFR thresholds;
- include exact adjusted regimens;
- include the normal-function regimen when useful;
- include dialysis instructions only if supported;
- use reported eGFR in mL/min/1.73 m² unless an approved pathway rule specifies otherwise.

---

# eGFR SPECIAL-REVIEW CONDITIONS

State pharmacist review is required when relevant if:
- renal function is rapidly changing;
- acute kidney injury is suspected;
- eGFR is close to a dosing threshold;
- dialysis circumstances are uncertain;
- indexed eGFR may not reasonably represent drug clearance because of markedly unusual body size;
- the source uses CrCl but no validated eGFR mapping exists;
- pediatric renal dosing would otherwise be extrapolated from adults.

Do not automatically extrapolate adult renal rules to pediatric patients.

---

# RENAL REASON FORMAT

Renal reason is HUMAN-READABLE.
Keep it on ONE physical line.
Separate each renal tier using semicolons.

For supported eGFR rules use:
Renal reason: eGFR ≥[threshold] mL/min/1.73 m²: [regimen]; eGFR [lower] to <[upper] mL/min/1.73 m²: [regimen]; eGFR <[threshold] mL/min/1.73 m²: [regimen]; Hemodialysis: [instruction if supported]; [special pharmacist-review instructions if applicable]

If no validated eGFR mapping exists, use the pharmacist-review wording specified above.

---

# STRUCTURED eGFR DOSING RULES

Renal dosing rules are MACHINE-READABLE.
They power patient-specific renal dose suggestions in SafeScribe.
They must NEVER silently change a prescription.
A pharmacist must explicitly choose to apply the adjusted regimen.

Return valid JSON on ONE physical line.
Use JSON double quotes.
Do not use comments.
Use null for an unbounded minimum or maximum.
Use minInclusive and maxInclusive to represent exact boundaries.
Do not use artificial decimal boundaries such as 49.99 to represent <50.
Human-readable Renal reason and structured Renal dosing rules must use identical eGFR thresholds and corresponding doses.
Do not generate structured rules from vague statements such as "reduce dose in renal impairment."
Only generate rules when a sufficiently definite adjustment can be supported.

Each renal rule must use:
{"min":number|null,"minInclusive":true|false,"max":number|null,"maxInclusive":true|false,"doseAmount":number,"doseUnit":"mg|mcg|g|mL|units","frequency":"SafeScribe-compatible frequency","duration":number,"durationUnit":"Days|Weeks|Months","totalDoses":number|null,"directions":"patient-facing adjusted SIG"}

Example structure only (not a clinical recommendation):
Renal dosing rules: [{"min":30,"minInclusive":true,"max":50,"maxInclusive":false,"doseAmount":1000,"doseUnit":"mg","frequency":"Twice daily (BID)","duration":1,"durationUnit":"Days","totalDoses":2,"directions":"Take 1000 mg by mouth every 12 hours for 2 doses."}]

---

# RENAL RULE CONSISTENCY

Before returning a treatment with structured eGFR rules verify:
- no overlapping eGFR ranges;
- no contradictory boundaries;
- thresholds match Renal reason exactly;
- dose amounts match Directions;
- frequency matches Directions;
- duration matches Directions;
- totalDoses is correct when determinable;
- no unsupported gap exists between adjacent defined bands unless clinically intentional;
- source basis is truthfully recorded;
- eGFR rules are not generated from unvalidated CrCl thresholds.

---

# RENAL PRODUCT-STRENGTH SAFETY

Structured renal rules describe the required clinical dose, not an assumed tablet count.
Do not convert an adjusted mg dose into a tablet fraction unless that exact product/formulation has validated splitting support.
If a different strength is required, retain the required dose in mg and state that an appropriate product strength must be selected.
A product-strength mismatch must not prevent SafeScribe from displaying the renal recommendation.
It must prevent automatic application until the pharmacist resolves product selection.

---

# PHARMACIST DECISION RULE

SafeScribe may match patient eGFR to a structured renal rule.
SafeScribe may display the standard pathway regimen and recommended renal-adjusted regimen.
SafeScribe must NEVER silently alter the treatment.
The pharmacist must explicitly choose Apply renal-adjusted regimen.
Only after pharmacist action may SafeScribe update Dose, product, Frequency, Duration, Quantity, Directions, and other linked prescription fields.
The pharmacist remains responsible for accepting, modifying, or declining the suggestion.
Preserve the standard pathway regimen so it can be restored if needed.

---

# HEPATIC DOSING

- If Hepatic adjustment is Yes, provide exact indication-specific adjustment when supported.
- Include Child-Pugh category, maximum dose, avoidance recommendation, or contraindication threshold when available.
- Keep multiple instructions on one physical line separated by semicolons.
- Do not invent a numeric dose reduction when the source only says use with caution, not recommended, or contraindicated.
- Do not generate structured hepatic JSON rules at this time.

---

# INTERACTIONS

- Include only clinically important interactions likely to affect prescribing, treatment selection, dosing, or monitoring.
- Avoid long lists of minor theoretical interactions.
- If an interaction requires a specific dose or interval modification, state the exact supported instruction.

---

# PREGNANCY / BREASTFEEDING

- Yes means a clinically relevant consideration requiring pharmacist attention.
- Yes does not automatically mean contraindicated.
- Distinguish compatible use, caution, individualized benefit-risk assessment, avoidance, and contraindication accurately.
- Keep reasons concise and clinically useful.

---

# MONITORING

Monitoring refers primarily to clinically meaningful laboratory or measurable parameter monitoring.
Do not set Monitoring: Yes solely for routine symptom response, treatment response, or generic adverse-effect monitoring.
Routine clinical reassessment belongs under Follow-up advice.
Appropriate examples include renal function, hepatic function, INR, electrolytes, glucose, blood pressure, drug levels, or another treatment-specific measurable parameter.

---

# COUNSELLING

- Include treatment-specific information useful for patient counselling.
- May include administration technique, timing, food considerations, adherence, hydration, prevention, common important adverse effects, formulation instructions, or treatment limitations.
- Do not duplicate the full SIG unnecessarily.
- Do not include pathway red-flag questions.

---

# FOLLOW-UP

- State when treatment should be reassessed.
- Include treatment failure, persistence, recurrence, or circumstances requiring additional clinical evaluation.
- Do not duplicate routine red-flag screening from other pathway sections.

---

# SAFETY FLAGS

- Pregnancy: Yes requires Pregnancy reason.
- Breastfeeding: Yes requires Breastfeeding reason.
- Renal adjustment: Yes requires Renal source basis and Renal reason.
- Structured renal dosing requires validated eGFR support as described above.
- Hepatic adjustment: Yes requires Hepatic reason.
- Monitoring: Yes requires Monitoring reason.
- When a flag is No, the corresponding reason may be blank unless a useful explanation should be preserved.

---

# OUTPUT QUALITY CHECK

Before returning each treatment block verify:
- Medication, Generic, Brand, and Strength are internally consistent.
- Product form, Route, and Administration unit are compatible.
- Dose and Strength produce the intended regimen.
- Frequency and Duration are clinically appropriate.
- Duration is numeric.
- Duration unit is present.
- Quantity is sufficient for the stated regimen where determinable.
- Directions exactly match the structured regimen.
- Repeat-dose and maximum-dose instructions are included when relevant.
- Why this option? accurately explains place in therapy.
- Recommendation level is supported by evidence.
- Eligibility and age restrictions are appropriate.
- Province availability reflects ${provinces}.
- Contraindications and interactions contain clinically meaningful information without unnecessary alert noise.
- Pregnancy and Breastfeeding flags indicate considerations rather than simplistic safe/unsafe classification.
- Renal source basis accurately reflects the authoritative source.
- Structured renal rules are based on eGFR only.
- CrCl thresholds were NOT silently relabeled as eGFR.
- Human-readable and structured eGFR thresholds match exactly.
- Structured renal rules do not assume tablet splitting.
- Pediatric renal rules are not extrapolated from adults without support.
- Dialysis instructions are included only when supported.
- Hepatic adjustment is indication-specific.
- Monitoring is not being used for routine clinical response.
- References genuinely support the treatment/regimen.
- Documentation reference, if present, is one of the defined reference IDs.
- Every field appears on exactly one physical line.
- No unsupported dose, duration, strength, or safety information is invented.`;
}

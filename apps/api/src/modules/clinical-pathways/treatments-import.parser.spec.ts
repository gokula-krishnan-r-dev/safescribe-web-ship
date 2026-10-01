import {
  parseTreatmentsImport,
  normalizeTreatmentImportKey,
} from './treatments-import.parser';
import { parseTreatmentsScript } from './chatgpt-import.parser';

const LIBRARY = `
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
- URL: https://www.pharmacists.ca/example
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
- Verification required: true
`;

const STRUCTURED = `## Treatment
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
Contraindications: Hypersensitivity to acyclovir
Interactions: Probenecid may increase acyclovir levels
Pregnancy: Yes
Pregnancy reason: Confirm benefit outweighs risk
Breastfeeding: Yes
Breastfeeding reason: Compatible with breastfeeding at standard doses
Renal adjustment: Yes
Renal source basis: CrCl
Renal reason: Source provides CrCl-based adjustment; no validated eGFR mapping supplied for automatic SafeScribe dose adjustment; pharmacist review is required.
Renal dosing basis: NONE
Renal dosing rules: []
Hepatic adjustment: No
Monitoring: Yes
Monitoring reason: Recheck symptoms in 48–72 hours
Counselling notes: Start at first tingle
Follow-up advice: Return if not improving after 3 days
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
Clinical indication: Early cold sore when prescription therapy is declined
Why this option?: Topical supportive option when oral therapy is declined
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
Follow-up advice: Seek care if lesions spread
Warnings:
References: R1
Documentation reference:
${LIBRARY}`;

describe('parseTreatmentsImport', () => {
  it('parses treatments, Why this option?, references, section evidence, and library', () => {
    const parsed = parseTreatmentsImport(STRUCTURED);
    expect(parsed.format).toBe('structured');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]!.medicationName).toBe('Acyclovir 400 mg');
    expect(parsed.items[0]!.whyThisOption).toMatch(/first-line oral antiviral/i);
    expect(parsed.items[0]!.clinicalNotes).toMatch(/first-line oral antiviral/i);
    expect(parsed.items[0]!.importedReferenceIds).toEqual(['R1', 'R2']);
    expect(parsed.items[0]!.documentationReferenceImportId).toBe('R1');
    expect(parsed.items[0]!.renalSourceBasis).toBe('CrCl');
    expect(parsed.items[0]!.renalDosingBasis).toBe('NONE');
    expect(parsed.items[0]!.renalDosingRules).toEqual([]);
    expect(parsed.items[0]!.renalEgfrMappingStatus).toBe('requires_review');
    expect(parsed.items[0]!.renalMappingReviewRequired).toBe(true);
    expect(parsed.items[1]!.importedReferenceIds).toEqual(['R1']);
    expect(parsed.sectionEvidenceIds).toEqual(['R1', 'R2']);
    expect(parsed.references).toHaveLength(2);
    expect(parsed.references[1]!.verificationRequired).toBe(true);
    expect(parsed.blockingErrors).toEqual([]);
  });

  it('does not let Section Evidence swallow the last treatment block', () => {
    const parsed = parseTreatmentsScript(STRUCTURED);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]!.medicationName).toMatch(/Docosanol/i);
    expect(parsed[1]!.clinicalNotes).not.toMatch(/Section Evidence/i);
  });

  it('maps Why this option? onto clinical notes in the base parser', () => {
    const parsed = parseTreatmentsScript(`## Treatment
Medication: Acyclovir
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Why this option?: Place in therapy for episodic therapy
Renal adjustment: No
`);
    expect(parsed[0]!.clinicalNotes).toMatch(/Place in therapy/i);
  });

  it('blocks unknown reference IDs and undefined documentation IDs', () => {
    const parsed = parseTreatmentsImport(`## Treatment
Medication: Mystery cream
Category: OTC
Recommendation: ALTERNATIVE
Renal adjustment: No
References: R9
Documentation reference: R8

## Reference Library
### R1
- Title: Known source
- Organization / publisher: CPS
- Guideline / document type: Clinical reference
- Year / edition: 2024
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true
`);
    expect(parsed.blockingErrors.some((e) => /R9/.test(e))).toBe(true);
    expect(parsed.blockingErrors.some((e) => /R8/.test(e))).toBe(true);
  });

  it('blocks invalid category and recommendation', () => {
    const parsed = parseTreatmentsImport(`## Treatment
Medication: Mystery snack
Category: FOOD
Recommendation: BEST_EVER
Renal adjustment: No
References: R1
${LIBRARY}`);
    expect(parsed.blockingErrors.some((e) => /Category/i.test(e))).toBe(true);
    expect(parsed.blockingErrors.some((e) => /Recommendation/i.test(e))).toBe(true);
  });

  it('deactivates CrCl-only JSON rules instead of converting them to eGFR', () => {
    const parsed = parseTreatmentsImport(`## Treatment
Medication: Valacyclovir 1 g
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Why this option?: First-line oral antiviral
Renal adjustment: Yes
Renal source basis: CrCl
Renal reason: eGFR ≥50 mL/min/1.73 m²: 2000 mg every 12 hours; eGFR 30 to <50: 1000 mg every 12 hours
Renal dosing basis: eGFR
Renal dosing rules: [{"min":50,"minInclusive":true,"max":null,"maxInclusive":false,"doseAmount":2000,"doseUnit":"mg","frequency":"Twice daily (BID)","duration":1,"durationUnit":"Days","totalDoses":2,"directions":"Take 2000 mg by mouth every 12 hours for 2 doses."},{"min":30,"minInclusive":true,"max":50,"maxInclusive":false,"doseAmount":1000,"doseUnit":"mg","frequency":"Twice daily (BID)","duration":1,"durationUnit":"Days","totalDoses":2,"directions":"Take 1000 mg by mouth every 12 hours for 2 doses."}]
References: R1
${LIBRARY}`);
    const item = parsed.items[0]!;
    expect(item.renalSourceBasis).toBe('CrCl');
    expect(item.renalDosingBasis).toBe('NONE');
    expect(item.renalDosingRules).toEqual([]);
    expect(item.renalEgfrMappingStatus).toBe('requires_review');
    expect(item.importWarnings.some((w) => /Renal mapping/i.test(w))).toBe(true);
    expect(parsed.blockingErrors).toEqual([]);
  });

  it('keeps validated source-eGFR rules active', () => {
    const parsed = parseTreatmentsImport(`## Treatment
Medication: Example antiviral
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Why this option?: Source provides eGFR thresholds
Renal adjustment: Yes
Renal source basis: eGFR
Renal reason: eGFR ≥50 mL/min/1.73 m²: 400 mg five times daily; eGFR 10 to 50 mL/min/1.73 m²: 400 mg every 8 hours
Renal dosing basis: eGFR
Renal dosing rules: [{"min":50,"minInclusive":true,"max":null,"maxInclusive":false,"doseAmount":400,"doseUnit":"mg","frequency":"Five times daily","duration":5,"durationUnit":"Days","totalDoses":null,"directions":"Take 400 mg by mouth five times daily for 5 days."},{"min":10,"minInclusive":true,"max":50,"maxInclusive":false,"doseAmount":400,"doseUnit":"mg","frequency":"Every 8 hours","duration":5,"durationUnit":"Days","totalDoses":null,"directions":"Take 400 mg by mouth every 8 hours for 5 days."}]
References: R1
${LIBRARY}`);
    const item = parsed.items[0]!;
    expect(item.renalDosingBasis).toBe('eGFR');
    expect(item.renalDosingRules).toHaveLength(2);
    expect(item.renalEgfrMappingStatus).toBe('source_egfr');
    expect(item.renalMappingReviewRequired).toBe(false);
    expect(parsed.blockingErrors).toEqual([]);
  });

  it('deactivates 49.99-style boundaries without discarding the treatment', () => {
    const parsed = parseTreatmentsImport(`## Treatment
Medication: Example antiviral
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Why this option?: Needs renal review
Renal adjustment: Yes
Renal source basis: eGFR
Renal reason: eGFR ≥50: standard; eGFR <50: reduce
Renal dosing basis: eGFR
Renal dosing rules: [{"min":50,"minInclusive":true,"max":null,"maxInclusive":false,"doseAmount":400,"doseUnit":"mg","frequency":"Five times daily","duration":5,"durationUnit":"Days","totalDoses":null,"directions":"Take 400 mg five times daily."},{"min":0,"minInclusive":true,"max":49.99,"maxInclusive":true,"doseAmount":200,"doseUnit":"mg","frequency":"Twice daily (BID)","duration":5,"durationUnit":"Days","totalDoses":null,"directions":"Take 200 mg twice daily."}]
References: R1
${LIBRARY}`);
    const item = parsed.items[0]!;
    expect(item.renalDosingRules).toEqual([]);
    expect(item.renalDosingBasis).toBe('NONE');
    expect(item.importWarnings.some((w) => /49\.99|decimal/i.test(w))).toBe(true);
    expect(parsed.blockingErrors).toEqual([]);
  });

  it('blocks malformed renal JSON', () => {
    const parsed = parseTreatmentsImport(`## Treatment
Medication: Example antiviral
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Renal adjustment: Yes
Renal source basis: eGFR
Renal reason: eGFR <30 reduce
Renal dosing basis: eGFR
Renal dosing rules: [{not-json
References: R1
${LIBRARY}`);
    expect(parsed.blockingErrors.some((e) => /JSON/i.test(e))).toBe(true);
  });

  it('does not invent references from unstructured prose', () => {
    const parsed = parseTreatmentsImport(
      'Acyclovir is commonly used. See CPS 2024. I am 98% sure this is first-line.',
    );
    expect(parsed.items).toHaveLength(0);
    expect(parsed.references).toHaveLength(0);
    expect(parsed.blockingErrors.length).toBeGreaterThan(0);
    expect(parsed.warnings.some((w) => /confidence/i.test(w))).toBe(true);
  });

  it('blocks duplicate library R-IDs and missing titles', () => {
    const parsed = parseTreatmentsImport(`## Treatment
Medication: Acyclovir
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Renal adjustment: No
References: R1

## Reference Library
### R1
- Title: First
- Organization / publisher: CPS
- Guideline / document type: Clinical reference
- Year / edition: 2024
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: false

### R1
- Title:
- Organization / publisher: CPS
- Guideline / document type: Clinical reference
- Year / edition: 2024
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: false
`);
    expect(parsed.blockingErrors.some((e) => /Duplicate/i.test(e))).toBe(true);
    expect(parsed.blockingErrors.some((e) => /Title/i.test(e))).toBe(true);
  });

  it('normalizes medication keys for merge matching', () => {
    expect(normalizeTreatmentImportKey('Acyclovir 400 mg')).toBe('acyclovir 400 mg');
    expect(normalizeTreatmentImportKey('  Acyclovir   400-mg ')).toBe('acyclovir 400 mg');
  });
});

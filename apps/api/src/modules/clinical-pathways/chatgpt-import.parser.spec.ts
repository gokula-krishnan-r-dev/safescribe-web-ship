import {
  inferTreatmentProductForm,
  normalizeTreatmentRoute,
  parseRedFlagsScript,
  parseTreatmentsScript,
  preferredAdministrationUnitFor,
} from './chatgpt-import.parser';

describe('normalizeTreatmentRoute', () => {
  it('maps common ChatGPT shorthand to editor routes', () => {
    expect(normalizeTreatmentRoute('PO')).toBe('Oral');
    expect(normalizeTreatmentRoute('p.o.')).toBe('Oral');
    expect(normalizeTreatmentRoute('top')).toBe('Topical');
    expect(normalizeTreatmentRoute('IM')).toBe('Intramuscular');
  });
});

describe('inferTreatmentProductForm', () => {
  it('infers cream from product text and tablet from tablet wording', () => {
    expect(inferTreatmentProductForm('Cream', null, 'Topical', 'docosanol')).toBe('Cream');
    expect(inferTreatmentProductForm(null, '400 mg tablet', 'Oral', 'Acyclovir')).toBe('Tablet');
  });
});

describe('parseTreatmentsScript', () => {
  const sample = `## Treatment
Medication: Acyclovir
Generic: acyclovir
Brand: Zovirax
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Strength: 400 mg
Product form: Tablet
Dose: 400 mg
Administration unit: Tablet(s)
Route: PO
Frequency: Five times daily
Duration: 5 days
Quantity: 25 tablets
Directions: Take 1 tablet by mouth five times daily for 5 days.
Clinical indication: Typical herpes labialis within 72 hours
Eligibility: Immunocompetent adults
Age restriction: ≥12 years
Province availability: ALL
Guideline reference: CPS — Herpes Labialis
Evidence: Strong
Contraindications: Hypersensitivity to acyclovir
Interactions: Probenecid
Pregnancy: Yes
Pregnancy reason: Confirm benefit outweighs risk in pregnancy
Breastfeeding: Yes
Breastfeeding reason: Compatible with breastfeeding at standard doses
Renal adjustment: Yes
Renal reason: Reduce dose when eGFR < 30
Hepatic adjustment: No
Monitoring: Yes
Monitoring reason: Recheck in 48–72 hours
Counselling notes: Start at first tingle
Follow-up advice: Return if not improving after 3 days
Warnings: Hydration recommended

## Treatment
Medication: Docosanol 10% cream
Generic: docosanol
Category: OTC
Recommendation: ALTERNATIVE
Strength: 10%
Product form: Cream
Dose: Apply a thin layer
Route: Topical
Frequency: Five times daily
Duration: Until resolved
Pregnancy: No
Renal adjustment: No
Hepatic adjustment: No
Monitoring: No
`;

  it('parses all modern treatment editor fields from ChatGPT markdown', () => {
    const parsed = parseTreatmentsScript(sample);
    expect(parsed).toHaveLength(2);

    const acyclovir = parsed[0];
    expect(acyclovir.medicationName).toBe('Acyclovir');
    expect(acyclovir.genericName).toBe('acyclovir');
    expect(acyclovir.brandName).toBe('Zovirax');
    expect(acyclovir.strength).toBe('400 mg');
    expect(acyclovir.route).toBe('Oral');
    expect(acyclovir.quantity).toBe('25 tablets');
    expect(acyclovir.directions).toMatch(/five times daily/i);
    expect(acyclovir.clinicalIndication).toMatch(/herpes labialis/i);
    expect(acyclovir.ageRestriction).toBe('≥12 years');
    expect(acyclovir.guidelineReference).toMatch(/CPS/);
    expect(acyclovir.evidenceStrength).toBe('Strong');
    expect(acyclovir.pregnancyNotes).toBe('Yes');
    expect(acyclovir.pregnancyReason).toMatch(/benefit outweighs risk/i);
    expect(acyclovir.breastfeedingNotes).toBe('Yes');
    expect(acyclovir.counsellingNotes).toMatch(/tingle/i);
    expect(acyclovir.followUpAdvice).toMatch(/3 days/i);
    expect(acyclovir.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/hypersensitivity/i),
        expect.stringMatching(/hydration/i),
      ]),
    );
    expect(acyclovir.interactions).toEqual(['Probenecid']);
    expect(acyclovir.metadata.productForm).toBe('Tablet');
    expect(acyclovir.metadata.source).toBe('chatgpt-import');
    expect(acyclovir.renalAdjustment).toBe('Yes');
    expect(acyclovir.renalAdjustmentReason).toMatch(/eGFR/i);
    expect(acyclovir.metadata.regimens[0]).toMatchObject({
      label: 'Standard',
      dose: '400 mg',
      administrationUnit: 'Tablet(s)',
      productForm: 'Tablet',
      route: 'Oral',
      frequency: 'Five times daily',
      duration: '5 days',
      durationValue: '5',
      durationUnit: 'Days',
    });
  });

  it('infers administration unit and auto-builds directions when omitted', () => {
    const parsed = parseTreatmentsScript(`## Treatment
Medication: Hydrocortisone cream
Generic: hydrocortisone
Category: OTC
Recommendation: FIRST_LINE
Product form: Cream
Dose: Apply a thin layer
Route: Topical
Frequency: Twice daily (BID)
Duration: 7 days
Pregnancy: No
Renal adjustment: No
Hepatic adjustment: No
Monitoring: No
`);
    expect(parsed).toHaveLength(1);
    const t = parsed[0];
    expect(t.metadata.productForm).toBe('Cream');
    expect(t.metadata.regimens[0].administrationUnit).toBe(
      preferredAdministrationUnitFor('Cream', 'Topical'),
    );
    expect(t.directions).toMatch(/apply a thin layer/i);
    expect(t.directions).toMatch(/twice daily/i);
  });

  it('still accepts legacy minimal ChatGPT treatment blocks', () => {
    const parsed = parseTreatmentsScript(`## Treatment
Medication: Ibuprofen
Generic: ibuprofen
Category: OTC
Recommendation: FIRST_LINE
Dose: 400 mg
Route: PO
Frequency: three times daily
Duration: 5 days
Province availability: ALL
Eligibility: Adults without GI red flags
Contraindications: Active peptic ulcer
Pregnancy: Yes
Pregnancy reason: Avoid in third trimester
Renal adjustment: Yes
Renal reason: Avoid in significant renal impairment
Hepatic adjustment: No
Monitoring: No
Warnings: Take with food
`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].route).toBe('Oral');
    expect(parsed[0].metadata.productForm).toBe('Tablet');
    expect(parsed[0].warnings.some((w) => /peptic ulcer/i.test(w))).toBe(true);
    expect(parsed[0].warnings.some((w) => /take with food/i.test(w))).toBe(true);
  });

  it('extracts renal dosing basis and single-line JSON rules', () => {
    const parsed = parseTreatmentsScript(`## Treatment
Medication: Valacyclovir 1 g
Generic: valacyclovir
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Strength: 1 g
Product form: Tablet
Dose: 2
Administration unit: Tablet(s)
Route: Oral
Frequency: Twice daily (BID)
Duration: 1
Duration unit: Days
Directions: Take 2 tablets (2000 mg) by mouth at the first sign of a cold sore, then take 2 tablets approximately 12 hours later.
Renal adjustment: Yes
Renal reason: CrCl ≥50 mL/min: 2000 mg PO every 12 hours for 2 doses; CrCl 30 to <50 mL/min: 1000 mg PO every 12 hours for 2 doses
Renal dosing basis: CrCl
Renal dosing rules: [{"min":50,"minInclusive":true,"max":null,"maxInclusive":false,"doseAmount":2000,"doseUnit":"mg","frequency":"Twice daily (BID)","duration":1,"durationUnit":"Days","totalDoses":2,"directions":"Take 2000 mg by mouth every 12 hours for 2 doses."},{"min":30,"minInclusive":true,"max":50,"maxInclusive":false,"doseAmount":1000,"doseUnit":"mg","frequency":"Twice daily (BID)","duration":1,"durationUnit":"Days","totalDoses":2,"directions":"Take 1000 mg by mouth every 12 hours for 2 doses."}]
Hepatic adjustment: No
Pregnancy: No
Breastfeeding: No
Monitoring: No
`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].renalSourceBasis).toBe('CrCl');
    expect(parsed[0].renalDosingBasis).toBe('CrCl');
    expect(parsed[0].renalDosingRules).toHaveLength(2);
    expect(parsed[0].renalDosingRules[0]).toMatchObject({
      min: 50,
      minInclusive: true,
      doseAmount: 2000,
      doseUnit: 'mg',
    });
    expect(parsed[0].duration).toBe('1 Days');
    expect(parsed[0].metadata.regimens[0]).toMatchObject({
      durationValue: '1',
      durationUnit: 'Days',
    });
  });

  it('maps Why this option? and stops before Section Evidence', () => {
    const parsed = parseTreatmentsScript(`## Treatment
Medication: Acyclovir
Category: PRESCRIPTION
Recommendation: FIRST_LINE
Why this option?: First-line oral antiviral for episodic therapy
Renal adjustment: No

## Section Evidence
- R1

## Reference Library
### R1
- Title: CPS
`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].clinicalNotes).toMatch(/First-line oral antiviral/i);
    expect(parsed[0].medicationName).toBe('Acyclovir');
  });
});

describe('parseRedFlagsScript', () => {
  it('captures question, why it matters, and required without inventing references', () => {
    const parsed = parseRedFlagsScript(`## Red Flag
Title: Ocular involvement
Severity: CRITICAL
Question: Does the patient have a lesion near the eye?
Why it matters: May indicate herpes simplex keratitis.
Action: Immediate referral
Required: yes

## Red Flag
Title: Persistent lesion
Severity: WARNING
Description: Has the lesion been present for more than 14 days?
Action: SAME_DAY_PHYSICIAN
Required: optional
`);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      title: 'Ocular involvement',
      severity: 'CRITICAL',
      question: 'Does the patient have a lesion near the eye?',
      whyItMatters: 'May indicate herpes simplex keratitis.',
      action: 'IMMEDIATE_REFERRAL',
      required: true,
      approved: false,
      evidenceRefIds: [],
    });
    expect(parsed[1]).toMatchObject({
      title: 'Persistent lesion',
      question: 'Has the lesion been present for more than 14 days?',
      action: 'SAME_DAY_PHYSICIAN',
      required: false,
    });
  });
});

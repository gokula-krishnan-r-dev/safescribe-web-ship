import {
  buildCanonicalHandoutPayload,
  buildPatientSummaryPayload,
  englishHandoutFieldsFromPayload,
  fieldsFromTranslatedHandout,
  hashCanonicalHandout,
  isReusableHandoutTranslation,
  normalizeHandoutLanguage,
  restoreProtectedTokens,
  tokenizeProtectedText,
  translateCanonicalHandout,
  validateTranslatedHandout,
} from '@safescript/shared';

const source = {
  chiefComplaint: 'cold sore symptoms',
  createdAt: '2026-08-13T15:00:00.000Z',
  consultationMode: 'GUIDED_PATHWAY',
  pathway: { condition: 'cold sores (oral herpes labialis)', name: 'Cold sores' },
  selectedLanguage: 'en',
  pharmacyName: 'Example Pharmacy',
  pharmacyPhone: '780-000-0000',
  counsellingNotes: {
    counselling_status: 'confirmed',
    plan: {
      status: 'REVIEWED',
      include_detailed_handout: true,
      sections: [
        {
          section_key: 'EXPECTED_RESPONSE',
          items: [{ text: 'Symptoms should start to improve within 2 to 3 days.' }],
        },
        {
          section_key: 'SELF_CARE',
          items: [],
        },
        {
          section_key: 'FOLLOW_UP',
          items: [
            {
              text: 'Seek medical care if symptoms worsen or the sores spread to the eye.',
            },
            { text: 'Follow up with your pharmacist in 5 days if not improving.' },
          ],
        },
      ],
    },
  },
  treatmentPlan: {
    confirmStatus: 'CONFIRMED',
    confirmation: {
      confirmationId: 'c1',
      confirmedAt: '2026-08-13T15:00:00.000Z',
      planVersion: 1,
      planHash: 'tp_abc',
      selectedIndexes: [0, 1],
      selectedNames: ['valacyclovir', 'acyclovir 5% topical'],
    },
    selectedTreatments: [
      {
        medicationName: 'valacyclovir',
        genericName: 'valacyclovir',
        brandName: 'Valtrex',
        dose: '2 g',
        route: 'Oral',
        frequency: 'twice daily',
        duration: '1 day',
        instructions: 'Take 2 g by mouth twice daily for 1 day.',
      },
      {
        displayName: 'acyclovir 5% topical',
        medicationName: 'Zovirax® Cream, generics',
        genericName: 'acyclovir',
        patientDirections:
          'Apply a thin layer to the affected cold sore 5 times daily for 4 days.',
      },
    ],
  },
};

describe('Patient Care Summary multilingual translation', () => {
  it('normalizes legacy fr/zh codes to curated values', () => {
    expect(normalizeHandoutLanguage('fr')).toBe('fr-CA');
    expect(normalizeHandoutLanguage('zh')).toBe('zh-CN');
    expect(normalizeHandoutLanguage('zh-TW')).toBe('zh-TW');
    expect(normalizeHandoutLanguage('tl')).toBe('fil');
  });

  it('tokenizes medication names, doses, numbers, and controlled SIG phrases', () => {
    const { text, tokens } = tokenizeProtectedText(
      'Take valacyclovir 2 g by mouth twice daily for 1 day.',
      { names: ['valacyclovir'] },
    );
    expect(text).not.toContain('valacyclovir');
    expect(text).not.toContain('2 g');
    expect(text).not.toMatch(/\b1\b/);
    expect(text).not.toContain('twice daily');
    expect(Object.values(tokens)).toEqual(
      expect.arrayContaining(['valacyclovir', '2 g', '1', 'PHRASE:twice daily', 'PHRASE:by mouth']),
    );
    const restored = restoreProtectedTokens(text, tokens, 'fr-CA');
    expect(restored).toContain('valacyclovir');
    expect(restored).toContain('2 g');
    expect(restored).toContain('1');
    expect(restored).toContain('deux fois par jour');
    expect(restored).toContain('par la bouche');
  });

  it('preserves two confirmed treatments and empty self-care through a fake translator', async () => {
    const summary = buildPatientSummaryPayload(source);
    const canonical = buildCanonicalHandoutPayload(summary, 'pa');
    expect(canonical.treatments).toHaveLength(2);
    expect(canonical.self_care).toEqual([]);
    expect(canonical.pharmacy_details.phone).toBe('780-000-0000');

    const fake = async (texts: string[]) => texts.map((t) => `PA ${t}`);
    const result = await translateCanonicalHandout(canonical, 'pa', fake);
    expect(result.validation.ok).toBe(true);
    expect(result.payload.treatments.map((t) => t.display_name)).toEqual([
      'valacyclovir',
      'acyclovir 5% topical',
    ]);
    expect(result.payload.treatments[0].patient_directions).toContain('2 g');
    expect(result.payload.treatments[0].patient_directions).toMatch(/1/);
    expect(result.payload.treatments[1].patient_directions).toContain('5');
    expect(result.payload.treatments[1].patient_directions).toContain('4');
    expect(result.payload.self_care).toEqual([]);
    expect(result.payload.pharmacy_details.name).toBe('Example Pharmacy');
    expect(result.payload.pharmacy_details.phone).toBe('780-000-0000');
  });

  it('falls back when numbers are dropped from a translated regimen', async () => {
    const summary = buildPatientSummaryPayload(source);
    const canonical = buildCanonicalHandoutPayload(summary, 'es');
    const bad = async (texts: string[]) =>
      texts.map(() => 'Tome el medicamento por la boca.');
    const result = await translateCanonicalHandout(canonical, 'es', bad);
    expect(result.retried).toBe(true);
    expect(result.validation.ok).toBe(false);
    expect(result.validation.status).toBe('failed_fallback_en');
    const fields = fieldsFromTranslatedHandout(result.payload, summary, {
      sourceHash: hashCanonicalHandout(canonical),
      provider: 'google-cloud-translation',
      model: 'general/nmt',
      validation: result.validation,
    });
    expect(fields.handoutLanguage).toBe('en');
    expect(fields.translationFallback).toBe('true');
    expect(fields.treatment).toContain('valacyclovir: Take 2 g by mouth twice daily for 1 day.');
    expect(fields.translationMessage).toMatch(/pharmacist review/i);
  });

  it('rejects unsupported languages and does not mutate English source hash', () => {
    const summary = buildPatientSummaryPayload(source);
    const a = hashCanonicalHandout(buildCanonicalHandoutPayload(summary, 'en'));
    const b = hashCanonicalHandout(buildCanonicalHandoutPayload(summary, 'pa'));
    expect(a).toBe(b);
    const english = englishHandoutFieldsFromPayload(summary, 'en');
    expect(english.handoutSourceHash).toBe(a);
    const translated = {
      ...buildCanonicalHandoutPayload(summary, 'zz'),
      target_language: 'zz',
    };
    const validation = validateTranslatedHandout(
      buildCanonicalHandoutPayload(summary, 'en'),
      translated,
    );
    expect(validation.status).toBe('unsupported_language');
  });

  it('marks a translation stale when the canonical English source changes', () => {
    const summary = buildPatientSummaryPayload(source);
    const first = hashCanonicalHandout(buildCanonicalHandoutPayload(summary, 'en'));
    const changed = buildPatientSummaryPayload({
      ...source,
      treatmentPlan: {
        ...source.treatmentPlan,
        selectedTreatments: [source.treatmentPlan.selectedTreatments[0]],
        confirmation: {
          ...source.treatmentPlan.confirmation,
          selectedIndexes: [0],
          selectedNames: ['valacyclovir'],
        },
      },
    });
    const second = hashCanonicalHandout(buildCanonicalHandoutPayload(changed, 'en'));
    expect(first).not.toBe(second);
  });

  it('reuses a validated translation only when language and source hash match', () => {
    const fields = {
      handoutLanguage: 'pa',
      handoutSourceHash: 'abc',
      translationValidationStatus: 'ok',
      translationStale: 'false',
      translationFallback: 'false',
    };
    expect(isReusableHandoutTranslation(fields, 'pa', 'abc')).toBe(true);
    expect(isReusableHandoutTranslation(fields, 'fr-CA', 'abc')).toBe(false);
    expect(isReusableHandoutTranslation(fields, 'pa', 'changed')).toBe(false);
    expect(
      isReusableHandoutTranslation(
        { ...fields, translationStale: 'true' },
        'pa',
        'abc',
      ),
    ).toBe(false);
  });
});

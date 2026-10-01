import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyClinicalRelevancePostFilter,
  clinicallyFilterPresentingConcern,
  extractClinicalNoteLocal,
  hashConsultationNote,
  isNonClinicalText,
  noteStatusAfterEdit,
  parseRenderedConsultationNote,
  renderConsultationNote,
  renderConsultationNoteFromStructured,
  resolveRewrittenConsultationNote,
  sanitizeClinicalExtraction,
  sanitizeStructuredClinicalExtraction,
  structuredToClinicalResult,
  type ConsultationIntakePayload,
} from './clinical-extraction';

const SPEC_TRANSCRIPT = `
00:00 Pharmacist: How are you today? What brings you in?
00:05 Patient: I have tingling on my upper lip since yesterday.
00:12 Patient: I have type 2 diabetes and I take metformin.
00:19 Patient: I'm allergic to amoxicillin.
00:23 Patient: I went to school yesterday but I'm not going today because this is bothering me.
00:34 Pharmacist: Any other symptoms?
00:37 Patient: No, I don't have any other symptoms.
00:42 Pharmacist: Any other medical conditions?
00:45 Patient: No other medical conditions.
00:48 Pharmacist: Any other medications?
00:51 Patient: Just metformin.
`;

const PARKING_HOME_TRANSCRIPT = `
Patient: My lip has been tingling since yesterday.
Patient: Parking was terrible today.
Patient: I'm diabetic and take metformin.
Patient: We are also having some issues with the house.
`;

describe('extractClinicalNoteLocal', () => {
  it('extracts the spec example without diagnosis or school impact', () => {
    const result = extractClinicalNoteLocal(SPEC_TRANSCRIPT);

    assert.match(
      result.presentingConcern?.text ?? '',
      /tingling on (my )?upper lip since yesterday/i,
    );
    assert.doesNotMatch(result.presentingConcern?.text ?? '', /herpes|cold sore|labialis/i);

    const texts = result.relevantClinicalInformation.map((item) => item.text);
    for (const expected of [
      'Type 2 diabetes',
      'Metformin',
      'Amoxicillin allergy',
      'No other associated symptoms reported',
    ]) {
      assert.ok(texts.includes(expected), `missing ${expected}: ${texts.join(', ')}`);
    }
    assert.doesNotMatch(texts.join(' '), /school/i);
    assert.equal(result.extractionStatus, 'complete');
    assert.equal(result.carryForwardCandidates.allergies[0]?.text, 'Amoxicillin allergy');
    assert.ok(result.carryForwardCandidates.medications.some((m) => m.text === 'Metformin'));
  });

  it('preserves allergy uncertainty', () => {
    const result = extractClinicalNoteLocal(
      'Patient: I might be allergic to penicillin, I’m not sure.',
    );
    assert.equal(result.relevantClinicalInformation[0]?.certainty, 'uncertain');
    assert.match(result.relevantClinicalInformation[0]?.text ?? '', /uncertain/i);
  });

  it('omits parking and unrelated housing from extraction (Test 1)', () => {
    const result = extractClinicalNoteLocal(PARKING_HOME_TRANSCRIPT);
    const concern = result.presentingConcern?.text ?? '';
    const joined = [
      concern,
      ...result.relevantClinicalInformation.map((i) => i.text),
    ].join(' ');

    assert.match(concern, /tingling/i);
    assert.doesNotMatch(joined, /parking|house|housing/i);
    assert.ok(
      result.relevantClinicalInformation.some((i) => /diabetes/i.test(i.text)),
      'expected diabetes',
    );
    assert.ok(
      result.relevantClinicalInformation.some((i) => /metformin/i.test(i.text)),
      'expected metformin',
    );
  });

  it('does not infer age from malformed “Age year for 25” (Test 2)', () => {
    const result = extractClinicalNoteLocal(`
Patient: Age year for 25.
Patient: My lip feels tingly.
`);
    assert.match(result.presentingConcern?.text ?? '', /lip|tingl/i);
    assert.doesNotMatch(result.presentingConcern?.text ?? '', /age year|25/i);
    assert.doesNotMatch(
      result.relevantClinicalInformation.map((i) => i.text).join(' '),
      /^Age 25$|Age year/i,
    );
  });

  it('does not invent negatives when none were established (Test 4)', () => {
    const result = extractClinicalNoteLocal('Patient: My lip is tingling.');
    assert.doesNotMatch(
      result.relevantClinicalInformation.map((i) => i.text).join(' '),
      /no other associated symptoms/i,
    );
  });
});

describe('structured clinical extraction', () => {
  it('sanitizes structured JSON and drops non-clinical leftovers', () => {
    const structured = sanitizeStructuredClinicalExtraction({
      presenting_concern: {
        summary:
          'Tingling of the lip since yesterday. Parking was terrible today. House issues also.',
        symptoms: ['Tingling of the lip', 'Parking stress'],
        location: 'Lip',
        onset: 'Yesterday',
        duration: null,
        severity: null,
      },
      patient_context: { age: null, sex: null },
      medical_conditions: ['Diabetes'],
      current_medications: ['Metformin'],
      allergies: [],
      associated_symptoms: [],
      relevant_negatives: [],
      pregnancy_lactation: null,
      relevant_history: [],
      labs_vitals: [],
      uncertain_clinical_information: [],
      excluded_nonclinical: [],
    });

    assert.ok(structured);
    assert.match(structured!.presenting_concern.summary, /tingling/i);
    assert.doesNotMatch(structured!.presenting_concern.summary, /parking|house/i);
    assert.ok(structured!.excluded_nonclinical.some((l) => /parking/i.test(l)));
    assert.deepEqual(structured!.medical_conditions, ['Diabetes']);
    assert.deepEqual(structured!.current_medications, ['Metformin']);

    const mapped = structuredToClinicalResult(structured!);
    const rendered = renderConsultationNote(mapped);
    assert.doesNotMatch(rendered.plainText, /parking|house|excluded/i);
    assert.match(rendered.plainText, /Presenting concern/);
    assert.match(rendered.plainText, /Metformin/);
  });

  it('keeps uncertain allergy out of confirmed allergies (Test 5)', () => {
    const structured = sanitizeStructuredClinicalExtraction({
      presenting_concern: {
        summary: '',
        symptoms: [],
        location: null,
        onset: null,
        duration: null,
        severity: null,
      },
      patient_context: { age: null, sex: null },
      medical_conditions: [],
      current_medications: [],
      allergies: [],
      associated_symptoms: [],
      relevant_negatives: [],
      pregnancy_lactation: null,
      relevant_history: [],
      labs_vitals: [],
      uncertain_clinical_information: [
        'Possible amoxicillin allergy; patient uncertain',
      ],
      excluded_nonclinical: [],
    });
    assert.ok(structured);
    assert.equal(structured!.allergies.length, 0);
    assert.match(
      structured!.uncertain_clinical_information[0] ?? '',
      /possible amoxicillin allergy/i,
    );

    const note = renderConsultationNoteFromStructured(structured!);
    assert.equal(note.clinicalInformation[0]?.type, 'uncertain');
  });

  it('does not infer age from malformed patient_context strings', () => {
    const structured = sanitizeStructuredClinicalExtraction({
      presenting_concern: {
        summary: 'Lip tingling',
        symptoms: [],
        location: null,
        onset: null,
        duration: null,
        severity: null,
      },
      patient_context: { age: 'Age year for 25', sex: null },
      medical_conditions: [],
      current_medications: [],
      allergies: [],
      associated_symptoms: [],
      relevant_negatives: [],
      pregnancy_lactation: null,
      relevant_history: [],
      labs_vitals: [],
      uncertain_clinical_information: [],
      excluded_nonclinical: [],
    });
    assert.ok(structured);
    assert.equal(structured!.patient_context.age, null);
  });

  it('preserves clinically relevant affordability (social determinant)', () => {
    assert.equal(isNonClinicalText('Cannot afford medication'), false);
    const filtered = applyClinicalRelevancePostFilter({
      presenting_concern: {
        summary: 'Lip tingling',
        symptoms: [],
        location: null,
        onset: null,
        duration: null,
        severity: null,
      },
      patient_context: { age: null, sex: null },
      medical_conditions: [],
      current_medications: [],
      allergies: [],
      associated_symptoms: [],
      relevant_negatives: [],
      pregnancy_lactation: null,
      relevant_history: ['Cannot afford medication'],
      labs_vitals: [],
      uncertain_clinical_information: [],
      excluded_nonclinical: [],
    });
    assert.deepEqual(filtered.relevant_history, ['Cannot afford medication']);
  });

  it('maps legacy sanitizeClinicalExtraction through structured schema', () => {
    const result = sanitizeClinicalExtraction({
      presenting_concern: {
        summary: 'Tingling of the lip. Parking was bad.',
        symptoms: ['Tingling'],
        location: 'Lip',
        onset: null,
        duration: null,
        severity: null,
      },
      patient_context: { age: 25, sex: 'female' },
      medical_conditions: ['Type 2 diabetes'],
      current_medications: ['Metformin'],
      allergies: ['Amoxicillin allergy'],
      associated_symptoms: [],
      relevant_negatives: ['No eye pain or vision changes reported'],
      pregnancy_lactation: null,
      relevant_history: [],
      labs_vitals: [],
      uncertain_clinical_information: [],
      excluded_nonclinical: ['parking issue'],
    });

    assert.match(result.presentingConcern?.text ?? '', /tingling/i);
    assert.doesNotMatch(result.presentingConcern?.text ?? '', /parking/i);
    assert.ok(result.relevantClinicalInformation.some((i) => i.text === 'Type 2 diabetes'));
    assert.ok(result.relevantClinicalInformation.some((i) => i.category === 'allergy'));
  });
});

describe('clinicallyFilterPresentingConcern', () => {
  it('strips parking, house issues, and malformed age from mixed prose', () => {
    const filtered = clinicallyFilterPresentingConcern(
      '25-year-old female having symptoms of tingling sensation on the lips. Type 2 diabetic. Age year for 25. Says she had a parking issue today, but some house issues also. She is okay now.',
    );
    assert.match(filtered, /tingling/i);
    assert.doesNotMatch(filtered, /parking|house|age year/i);
  });
});

describe('renderConsultationNote', () => {
  it('renders only presenting concern and relevant clinical information', () => {
    const rendered = renderConsultationNote({
      presentingConcern: { text: 'Tingling on upper lip since yesterday' },
      relevantClinicalInformation: [
        {
          id: '1',
          category: 'medical_condition',
          text: 'Type 2 diabetes',
          certainty: 'confirmed',
          clinicallyRelevantReason: 'safety',
        },
        {
          id: '2',
          category: 'medication',
          text: 'Metformin',
          certainty: 'confirmed',
          clinicallyRelevantReason: 'safety',
        },
        {
          id: '3',
          category: 'allergy',
          text: 'Amoxicillin allergy',
          certainty: 'confirmed',
          clinicallyRelevantReason: 'safety',
        },
        {
          id: '4',
          category: 'relevant_negative',
          text: 'No other associated symptoms reported',
          certainty: 'confirmed',
          clinicallyRelevantReason: 'assessment',
        },
      ],
    });

    assert.match(rendered.plainText, /Presenting concern/);
    assert.match(rendered.plainText, /Relevant clinical information/);
    assert.doesNotMatch(rendered.plainText, /Patient impact/);
    assert.deepEqual(
      rendered.chipItems.map((i) => i.text),
      ['Amoxicillin allergy', 'Type 2 diabetes', 'Metformin'],
    );
    assert.deepEqual(
      rendered.proseItems.map((i) => i.text),
      ['No other associated symptoms reported'],
    );
  });
});

describe('consultation note review status', () => {
  it('revokes approval when the note hash changes', () => {
    const previous: ConsultationIntakePayload = {
      schemaVersion: 'consultation-intake-1.0',
      captureMode: 'type',
      noteReviewStatus: 'approved',
      approvedNoteHash: hashConsultationNote({
        presentingConcern: 'Lip tingling',
        items: ['Metformin'],
      }),
      carryForwardCandidates: [],
      hasTemporaryTranscript: false,
    };
    const next = hashConsultationNote({
      presentingConcern: 'Lip tingling since yesterday',
      items: ['Metformin'],
    });
    assert.equal(noteStatusAfterEdit(previous, next), 'review_required');
  });
});

describe('resolveRewrittenConsultationNote', () => {
  it('keeps a clinical spoken transcript when extraction returns an empty note', () => {
    assert.equal(
      resolveRewrittenConsultationNote({
        rewriteNote: true,
        sourceTranscript: 'Painful blister on the upper lip since yesterday.',
        renderedPlainText: '',
        itemCount: 0,
        previousNote: '',
      }),
      'Painful blister on the upper lip since yesterday.',
    );
  });

  it('strips non-clinical chatter when falling back to source transcript', () => {
    const note = resolveRewrittenConsultationNote({
      rewriteNote: true,
      sourceTranscript:
        'Lip tingling since yesterday. Parking was terrible today. Issues with the house.',
      renderedPlainText: '',
      itemCount: 0,
    });
    assert.match(note, /lip tingling/i);
    assert.doesNotMatch(note, /parking|house/i);
  });

  it('uses the structured note when extraction produced clinical content', () => {
    const rendered =
      'Presenting concern\nPainful blister on upper lip\n\nRelevant clinical information\n• Type 2 diabetes';
    assert.equal(
      resolveRewrittenConsultationNote({
        rewriteNote: true,
        sourceTranscript: 'I have a painful blister and type 2 diabetes.',
        renderedPlainText: rendered,
        itemCount: 1,
      }),
      rendered,
    );
  });

  it('does not overwrite an existing typed note when rewrite is off', () => {
    assert.equal(
      resolveRewrittenConsultationNote({
        rewriteNote: false,
        sourceTranscript: 'new dictation',
        renderedPlainText: '',
        previousNote: 'Existing typed note',
      }),
      'Existing typed note',
    );
  });
});

describe('parseRenderedConsultationNote', () => {
  it('round-trips the two default sections', () => {
    const parsed = parseRenderedConsultationNote(`Presenting concern
Tingling on upper lip since yesterday

Relevant clinical information
• Type 2 diabetes
• Metformin`);
    assert.equal(parsed.presentingConcern, 'Tingling on upper lip since yesterday');
    assert.deepEqual(parsed.bodyItems, ['Type 2 diabetes', 'Metformin']);
  });
});

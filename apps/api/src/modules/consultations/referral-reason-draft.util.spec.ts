import {
  acceptAutomatedReasonDraft,
  buildApprovedRequestSentence,
  mayApplyReasonCandidate,
} from '@safescript/shared';
import {
  buildReferralReasonDraftPackage,
  collectConfirmedFacts,
  collectQuestionResponseFacts,
  fallbackReferralReasonDraft,
  resolveReferralReasonFromAi,
  toReferralReasonLlmPayload,
} from './referral-reason-draft.util';

describe('referral reason draft util', () => {
  const pkg = buildReferralReasonDraftPackage({
    consultationId: 'c1',
    sourceRevision: 4,
    requestId: 'g1',
    pathwayCondition: 'Gout flare',
    presentingConcern: 'gout symptoms',
    destination: 'emergency_department',
    urgencyCode: 'IMMEDIATE_REFERRAL',
    urgencyDisplay: 'Immediate medical assessment required',
    triggers: [
      {
        ruleId: 'flag-1',
        questionId: 'flag-1',
        label: 'Suspected septic arthritis',
        urgencyCode: 'IMMEDIATE_REFERRAL',
        urgencyDisplay: 'Immediate medical assessment required',
      },
    ],
  });

  it('builds the screenshot request sentence from destination, urgency, and selected concern', () => {
    expect(pkg.approvedRequestSentence).toBe(
      'Please assess this patient immediately in the emergency department for suspected septic arthritis.',
    );
    expect(pkg.presentingConcern).toBe('gout symptoms');
  });

  it('falls back to a professional template when AI is unavailable', () => {
    const result = fallbackReferralReasonDraft(pkg, {
      consultationId: 'c1',
      referralId: 'r1',
      requestId: 'g1',
    });
    expect(result.origin).toBe('RULE_TEMPLATE');
    expect(result.draftReason.startsWith(pkg.approvedRequestSentence)).toBe(true);
    expect(result.promptVersion).toBeNull();
  });

  it('rejects a complaint-only AI draft even when the reason id is returned', () => {
    const resolved = resolveReferralReasonFromAi(
      {
        draftReason: 'Further assessment requested for gout symptoms.',
        usedFactIds: ['context-1'],
        usedReferralReasonIds: ['flag-1'],
        needsManualReason: false,
      },
      pkg,
    );
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.code).toBe('MISSING_REQUEST_SENTENCE');
  });

  it('accepts the Fixture E professional paragraph', () => {
    const draft = `${pkg.approvedRequestSentence} The patient presented with joint symptoms initially being evaluated as possible gout. Your assessment is requested to clarify the diagnosis and guide further management.`;
    const resolved = resolveReferralReasonFromAi(
      {
        draftReason: draft,
        usedFactIds: ['context-1'],
        usedReferralReasonIds: ['flag-1'],
        needsManualReason: false,
      },
      pkg,
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.draftReason).toBe(draft);
    expect(
      acceptAutomatedReasonDraft({
        draftReason: draft,
        approvedRequestSentence: pkg.approvedRequestSentence,
        requiredConcernLabels: ['Suspected septic arthritis'],
        requiredReasonIds: ['flag-1'],
        usedReferralReasonIds: ['flag-1'],
        knownReasonIds: ['flag-1'],
      }).ok,
    ).toBe(true);
  });

  it('does not expand a No systemic-illness answer into absence of infection', () => {
    const withNegatives = buildReferralReasonDraftPackage({
      consultationId: 'c1',
      sourceRevision: 1,
      requestId: 'g1',
      destination: 'emergency_department',
      urgencyCode: 'IMMEDIATE_REFERRAL',
      urgencyDisplay: 'Immediate medical assessment required',
      triggers: [
        {
          ruleId: 'flag-1',
          questionId: 'pathway:rf1',
          label: 'Suspected septic arthritis',
          urgencyCode: 'IMMEDIATE_REFERRAL',
          urgencyDisplay: 'Immediate medical assessment required',
        },
      ],
      redFlags: {
        acknowledgments: [
          {
            flagId: 'pathway:rf2',
            flag: 'Systemically unwell?',
            answer: 'no',
            action: 'none',
          },
        ],
      },
    });
    const fallback = fallbackReferralReasonDraft(withNegatives, {
      consultationId: 'c1',
      referralId: null,
      requestId: 'g1',
    });
    expect(fallback.draftReason.toLowerCase()).not.toMatch(/afebrile|no infection|normal vital/);
    expect(withNegatives.otherScreeningAnswers[0]?.answer).toBe('no');
  });

  it('keeps the request sentence builder destination-specific', () => {
    expect(
      buildApprovedRequestSentence({
        destination: 'walk_in_clinic',
        urgencyCode: 'FOLLOW_UP_REFERRAL',
        primaryConcern: 'First or atypical acute monoarthritis',
      }),
    ).toBe(
      'Please assess this patient for follow-up at a walk-in clinic for first or atypical acute monoarthritis.',
    );
  });

  it('applies mayApplyReasonCandidate only to the untouched matching state', () => {
    const start = {
      consultationId: 'c1',
      referralId: 'r1',
      sourceRevision: 4,
      requestId: 'g1',
      localEditVersion: 0,
    };
    const current = {
      consultationId: 'c1',
      referralId: 'r1',
      sourceRevision: 4,
      activeRequestId: 'g1',
      localEditVersion: 0,
      pristine: true,
      finalized: false,
      documentWorkflowStarted: false,
    };
    expect(mayApplyReasonCandidate(start, current)).toBe(true);
    expect(mayApplyReasonCandidate(start, { ...current, pristine: false })).toBe(false);
    expect(mayApplyReasonCandidate(start, { ...current, documentWorkflowStarted: true })).toBe(
      false,
    );
  });

  it('collects pathway answers as attributed facts without inventing findings', () => {
    const facts = collectQuestionResponseFacts({
      q1: {
        question: 'Lesion location',
        answer: 'right upper lip',
        source: 'manual',
      },
      q2: {
        question: 'Change in vision',
        answer: 'no',
        source: 'manual',
      },
    });
    expect(facts.some((f) => /right upper lip/i.test(f.renderedText))).toBe(true);
    expect(facts.some((f) => f.assertion === 'ABSENT' && /vision/i.test(f.renderedText))).toBe(
      true,
    );
    expect(facts.every((f) => f.source === 'PATHWAY_RESPONSE')).toBe(true);
  });

  it('omits identity fields from the model payload', () => {
    const payload = toReferralReasonLlmPayload(pkg);
    expect(payload.consultationId).toBeUndefined();
    expect(payload.approvedLeadSentence).toBe(pkg.approvedRequestSentence);
    expect(Array.isArray(payload.activeReferralTriggers)).toBe(true);
    expect(Array.isArray(payload.facts)).toBe(true);
  });

  it('rejects a generic AI success draft when the source is rich', () => {
    const rich = buildReferralReasonDraftPackage({
      consultationId: 'c1',
      sourceRevision: 1,
      requestId: 'g1',
      presentingConcern: 'cold sore symptoms',
      pathwayCondition: 'cold sores (oral herpes labialis)',
      destination: 'family_doctor_np',
      urgencyCode: 'SAME_DAY_REFERRAL',
      urgencyDisplay: 'Same-day medical assessment required',
      triggers: [
        {
          ruleId: 'flag-ocular',
          questionId: 'flag-ocular',
          label: 'possible ocular involvement',
          urgencyCode: 'SAME_DAY_REFERRAL',
          urgencyDisplay: 'Same-day medical assessment required',
        },
      ],
      confirmedFacts: collectConfirmedFacts({
        questionResponses: {
          q1: { question: 'Lesion location', answer: 'right upper lip', source: 'manual' },
          q2: {
            question: 'Eye symptoms',
            answer: 'right-eye irritation and light sensitivity',
            source: 'manual',
          },
        },
        treatmentsTried: ['topical cold-sore treatment once without improvement'],
      }),
    });
    const resolved = resolveReferralReasonFromAi(
      {
        draftReason: `${rich.approvedRequestSentence} The patient presented with cold sore symptoms. Further assessment is requested to clarify the diagnosis and guide appropriate management.`,
        usedFactIds: ['context-1'],
        usedReferralTriggerIds: ['flag-ocular'],
        needsManualReason: false,
        insufficientContext: false,
      },
      rich,
    );
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.code).toBe('GENERIC_FROM_RICH_SOURCE');
  });

  it('falls back to a concise cold-sore request without fabricating eye findings', () => {
    const sparse = buildReferralReasonDraftPackage({
      consultationId: 'c1',
      sourceRevision: 1,
      requestId: 'g1',
      presentingConcern: 'cold sore symptoms',
      pathwayCondition: 'cold sores (oral herpes labialis)',
      destination: 'family_doctor_np',
      urgencyCode: 'SAME_DAY_REFERRAL',
      urgencyDisplay: 'Same-day medical assessment required',
      triggers: [
        {
          ruleId: 'flag-ocular',
          questionId: 'flag-ocular',
          label: 'possible ocular involvement',
          urgencyCode: 'SAME_DAY_REFERRAL',
          urgencyDisplay: 'Same-day medical assessment required',
        },
      ],
    });
    const result = fallbackReferralReasonDraft(sparse, {
      consultationId: 'c1',
      referralId: null,
      requestId: 'g1',
    });
    expect(result.origin).toBe('RULE_TEMPLATE');
    expect(result.draftReason.startsWith(sparse.approvedRequestSentence)).toBe(true);
    expect(result.draftReason.toLowerCase()).not.toMatch(
      /keratitis|eye exam|treatment withheld|appointment|letter was sent/,
    );
    expect(result.insufficientContext).toBe(true);
  });

  it('skips eligibility screening questions and prefers recorded allergies', () => {
    const facts = collectConfirmedFacts({
      demographics: {
        allergiesNone: true,
        allergyEntries: [],
        allergies: 'No known allergies',
        medsNone: true,
        medicationEntries: [],
        currentMedications: 'None',
      },
      questionResponses: {
        qElig: {
          question:
            'Can an appropriate treatment be selected safely after reviewing renal function, gastrointestinal and cardiovascular risk, bleeding risk, allergies and current medications?',
          answer: 'yes',
          source: 'manual',
        },
        qDiff: {
          question: 'Differential review acknowledgment',
          answer: 'reviewed',
          source: 'manual',
        },
        qOnset: {
          question: 'Did the joint pain begin rapidly',
          answer: 'yes',
          source: 'manual',
        },
      },
    });
    expect(facts.some((f) => f.category === 'ALLERGY' && /no known drug allergies/i.test(f.renderedText))).toBe(
      true,
    );
    expect(facts.some((f) => /after reviewing renal function/i.test(f.renderedText))).toBe(false);
    expect(facts.some((f) => /differential review/i.test(f.renderedText))).toBe(false);
    expect(facts.some((f) => /joint pain begin rapidly/i.test(f.renderedText))).toBe(true);
  });

  it('lists structured allergy entries instead of a none sentence', () => {
    const facts = collectConfirmedFacts({
      demographics: {
        allergyEntries: [{ drug: 'Colchicine', reaction: 'GI upset' }],
        medicationEntries: [{ label: 'Allopurinol', strength: '100 mg' }],
      },
    });
    expect(facts.some((f) => f.category === 'ALLERGY' && /Colchicine/i.test(f.renderedText))).toBe(true);
    expect(facts.some((f) => f.category === 'MEDICATION' && /Allopurinol/i.test(f.renderedText))).toBe(
      true,
    );
  });
});

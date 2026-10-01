/**
 * Governed Clinical Judgment red-flag candidate catalog.
 * Candidates are versioned, approved evidence — AI may only rank/phrase from this set.
 */
export type CjRedFlagSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE';

export type CjRedFlagReferralAction =
  | 'EMERGENCY'
  | 'URGENT_SAME_DAY'
  | 'PROMPT_ASSESSMENT'
  | 'ROUTINE_REFERRAL'
  | 'OBTAIN_MORE_INFORMATION';

export type RetrievedRedFlagCandidate = {
  candidateId: string;
  canonicalLabel: string;
  criterion: string;
  questionTemplate: string;
  whyItMatters: string;
  applicableTo: string[];
  severity: CjRedFlagSeverity;
  referralAction: CjRedFlagReferralAction;
  sourceReferences: Array<{
    sourceId: string;
    sourceVersionId: string;
    locator: string;
  }>;
  ruleId: string | null;
  effectiveAt: string;
};

export const CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION = 'cj-rf-evidence-v1.0';

/** Approved red-flag candidates for Clinical Judgment generation. */
export const CJ_RED_FLAG_CANDIDATES: RetrievedRedFlagCandidate[] = [
  {
    candidateId: 'rf_resp_distress',
    canonicalLabel: 'Severe respiratory distress',
    criterion: 'Signs of severe breathing difficulty at rest or inability to speak in full sentences',
    questionTemplate:
      'Does the patient have signs of severe breathing difficulty (for example short of breath at rest or unable to speak in full sentences)?',
    whyItMatters:
      'Severe respiratory distress may indicate a life-threatening exacerbation requiring urgent medical assessment.',
    applicableTo: ['asthma', 'copd', 'dyspnea', 'shortness of breath', 'wheeze', 'respiratory', 'airway'],
    severity: 'CRITICAL',
    referralAction: 'EMERGENCY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'respiratory-distress',
      },
    ],
    ruleId: 'CJ_RF_RESP_DISTRESS',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    candidateId: 'rf_chest_syncope_hemoptysis',
    canonicalLabel: 'Chest pain, syncope, or hemoptysis',
    criterion: 'Chest pain, fainting, or coughing up blood',
    questionTemplate:
      'Does the patient have chest pain, fainting, or coughing up blood?',
    whyItMatters:
      'These symptoms may signal cardiac, thromboembolic, or serious pulmonary disease and require urgent assessment.',
    applicableTo: ['asthma', 'copd', 'chest', 'cough', 'respiratory', 'cardiac', 'pain'],
    severity: 'CRITICAL',
    referralAction: 'EMERGENCY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'chest-syncope-hemoptysis',
      },
    ],
    ruleId: 'CJ_RF_CHEST_SYNCOPE',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    candidateId: 'rf_rapid_worsening_systemic',
    canonicalLabel: 'Rapid worsening with systemic features',
    criterion: 'Rapid symptom worsening with high fever or new confusion',
    questionTemplate:
      'Has there been rapid worsening of symptoms with high fever or new confusion?',
    whyItMatters:
      'Rapid deterioration with systemic features may indicate severe infection or acute decompensation needing same-day care.',
    applicableTo: ['asthma', 'infection', 'fever', 'uti', 'sore throat', 'cough', 'general'],
    severity: 'HIGH',
    referralAction: 'URGENT_SAME_DAY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'rapid-worsening-systemic',
      },
    ],
    ruleId: 'CJ_RF_RAPID_WORSENING',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    candidateId: 'rf_anaphylaxis',
    canonicalLabel: 'Anaphylaxis or airway compromise from allergy',
    criterion: 'Throat swelling, difficulty breathing, or systemic allergic reaction',
    questionTemplate:
      'Is there throat swelling, difficulty breathing, or signs of a severe allergic reaction?',
    whyItMatters:
      'Anaphylaxis is a medical emergency and pharmacist prescribing is not appropriate.',
    applicableTo: ['allergy', 'rash', 'urticaria', 'angioedema', 'anaphylaxis'],
    severity: 'CRITICAL',
    referralAction: 'EMERGENCY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'anaphylaxis',
      },
    ],
    ruleId: 'CJ_RF_ANAPHYLAXIS',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    candidateId: 'rf_neuro_deficit',
    canonicalLabel: 'Acute neurological deficit',
    criterion: 'Sudden weakness, speech difficulty, vision loss, or facial droop',
    questionTemplate:
      'Does the patient have sudden weakness, speech difficulty, vision loss, or facial droop?',
    whyItMatters:
      'Acute neurological deficits may indicate stroke and require emergency referral.',
    applicableTo: ['headache', 'migraine', 'neurolog', 'stroke', 'dizziness', 'vertigo'],
    severity: 'CRITICAL',
    referralAction: 'EMERGENCY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'neuro-deficit',
      },
    ],
    ruleId: 'CJ_RF_NEURO',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    candidateId: 'rf_pregnancy_high_risk',
    canonicalLabel: 'Pregnancy with high-risk symptoms',
    criterion: 'Pregnancy with vaginal bleeding, severe abdominal pain, or reduced fetal movement',
    questionTemplate:
      'If the patient is pregnant, is there vaginal bleeding, severe abdominal pain, or reduced fetal movement?',
    whyItMatters:
      'These obstetric warning signs require urgent medical assessment rather than pharmacist prescribing.',
    applicableTo: ['pregnancy', 'pregnant', 'prenatal', 'obstetric'],
    severity: 'CRITICAL',
    referralAction: 'EMERGENCY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'pregnancy-high-risk',
      },
    ],
    ruleId: 'CJ_RF_PREGNANCY',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    candidateId: 'rf_uti_systemic',
    canonicalLabel: 'Complicated UTI features',
    criterion: 'Flank pain, fever, rigors, or male UTI without prior assessment',
    questionTemplate:
      'Is there flank pain, fever, rigors, or other features of a complicated urinary tract infection?',
    whyItMatters:
      'Complicated UTI features may require medical assessment beyond uncomplicated cystitis pathways.',
    applicableTo: ['uti', 'urinary', 'cystitis', 'dysuria', 'bladder'],
    severity: 'HIGH',
    referralAction: 'URGENT_SAME_DAY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'uti-complicated',
      },
    ],
    ruleId: 'CJ_RF_UTI',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    candidateId: 'rf_derm_systemic',
    canonicalLabel: 'Skin infection with systemic illness',
    criterion: 'Rapidly spreading rash with fever, hypotension, or severe pain',
    questionTemplate:
      'Is the rash spreading rapidly with fever, feeling very unwell, or severe pain out of proportion to appearance?',
    whyItMatters:
      'Systemic or rapidly progressive skin infection can indicate necrotizing or toxic processes needing urgent care.',
    applicableTo: ['rash', 'skin', 'cellulitis', 'dermat', 'impetigo', 'eczema'],
    severity: 'HIGH',
    referralAction: 'URGENT_SAME_DAY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'derm-systemic',
      },
    ],
    ruleId: 'CJ_RF_DERM',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    candidateId: 'rf_general_red_flag_triad',
    canonicalLabel: 'General serious symptom triad',
    criterion: 'Chest pain, severe shortness of breath, or new confusion',
    questionTemplate:
      'Does the patient have chest pain, severe shortness of breath, or new confusion?',
    whyItMatters:
      'These general red-flag symptoms may indicate a condition that requires medical assessment before prescribing.',
    applicableTo: ['general'],
    severity: 'HIGH',
    referralAction: 'URGENT_SAME_DAY',
    sourceReferences: [
      {
        sourceId: 'cj-rf-core',
        sourceVersionId: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        locator: 'general-triad',
      },
    ],
    ruleId: 'CJ_RF_GENERAL',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
];

export type CjRedFlagAnswer = 'NO' | 'YES';

export type CjRedFlagCheckDecision =
  | 'READY_FOR_PRESCRIBING_READINESS'
  | 'MORE_INFORMATION_REQUIRED'
  | 'DOCUMENTATION_REFERRAL'
  | 'INCOMPLETE';

export function isCjRedFlagAnswer(value: unknown): value is CjRedFlagAnswer {
  return value === 'NO' || value === 'YES';
}

/** Map persisted/legacy values. "Unable to confirm" is no longer a valid pharmacist answer. */
export function normalizeCjRedFlagAnswer(value: unknown): CjRedFlagAnswer | null {
  return isCjRedFlagAnswer(value) ? value : null;
}

export type CjRedFlagAnswerInput = {
  questionId: string;
  answer: unknown;
};

/**
 * Overlay pharmacist-submitted answers onto persisted questions.
 * Unknown question IDs and invalid answers are ignored.
 */
export function mergeCjRedFlagAnswers<
  T extends { id: string; answer: unknown },
>(
  questions: T[],
  incoming: CjRedFlagAnswerInput[] | null | undefined,
): Array<T & { answer: CjRedFlagAnswer | null }> {
  const byId = new Map<string, CjRedFlagAnswer>();
  for (const item of incoming ?? []) {
    if (!item?.questionId || !isCjRedFlagAnswer(item.answer)) continue;
    byId.set(item.questionId, item.answer);
  }
  return questions.map((q) => ({
    ...q,
    answer: byId.get(q.id) ?? normalizeCjRedFlagAnswer(q.answer),
  }));
}

export function unansweredCjRedFlagQuestionIds(
  questions: Array<{ id: string; answer: unknown }>,
): string[] {
  return questions.filter((q) => normalizeCjRedFlagAnswer(q.answer) == null).map((q) => q.id);
}

export function deriveCjRedFlagCheckDecision(input: {
  questions: Array<{ answer: CjRedFlagAnswer | null | undefined }>;
  otherUnresolvedConcern: boolean | null | undefined;
  hasActiveCriticalDeterministicRule?: boolean;
  unresolvedManualConcerns?: boolean;
}): CjRedFlagCheckDecision {
  if (input.hasActiveCriticalDeterministicRule) return 'DOCUMENTATION_REFERRAL';
  if (input.unresolvedManualConcerns) return 'DOCUMENTATION_REFERRAL';
  if (input.questions.length === 0) return 'INCOMPLETE';
  if (input.questions.some((q) => normalizeCjRedFlagAnswer(q.answer) == null)) {
    return 'INCOMPLETE';
  }
  if (input.questions.some((q) => q.answer === 'YES')) return 'DOCUMENTATION_REFERRAL';
  if (input.otherUnresolvedConcern === true) return 'DOCUMENTATION_REFERRAL';
  if (input.otherUnresolvedConcern == null) return 'INCOMPLETE';
  return 'READY_FOR_PRESCRIBING_READINESS';
}

/** Select up to N candidates relevant to clinical text (deterministic pre-filter). */
export function selectRelevantCjRedFlagCandidates(
  clinicalText: string,
  limit = 12,
): RetrievedRedFlagCandidate[] {
  const hay = clinicalText.toLowerCase();
  const scored = CJ_RED_FLAG_CANDIDATES.map((c) => {
    let score = 0;
    for (const tag of c.applicableTo) {
      if (tag === 'general') score += 1;
      else if (hay.includes(tag)) score += 10;
    }
    if (c.severity === 'CRITICAL') score += 3;
    else if (c.severity === 'HIGH') score += 2;
    return { c, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, limit).map((x) => x.c);
  if (picked.length > 0) return picked;
  return fallbackCjRedFlagCandidates([], 1);
}

/** Last-resort catalog pick so generation never returns an empty question set. */
export function fallbackCjRedFlagCandidates(
  candidates: RetrievedRedFlagCandidate[],
  max = 3,
): RetrievedRedFlagCandidate[] {
  const ranked = rankCjRedFlagCandidatesDeterministic(candidates, max);
  if (ranked.length > 0) return ranked;
  const general = CJ_RED_FLAG_CANDIDATES.find((c) => c.candidateId === 'rf_general_red_flag_triad');
  if (general) return [general];
  return CJ_RED_FLAG_CANDIDATES.slice(0, Math.max(1, max));
}

/** Deterministic top-3 when AI is unavailable. */
export function rankCjRedFlagCandidatesDeterministic(
  candidates: RetrievedRedFlagCandidate[],
  max = 3,
): RetrievedRedFlagCandidate[] {
  const severityRank: Record<CjRedFlagSeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MODERATE: 2,
  };
  return [...candidates]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, max);
}

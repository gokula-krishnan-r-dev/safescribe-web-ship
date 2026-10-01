import type { MedicationSafetyEvaluatorService } from '@/modules/medication-safety/medication-safety-evaluator.service';
import type { MedicationSafetyEvaluateResponse, SafetyFinding } from '@safescript/shared';
import {
  PATHWAY_QA_ISSUE_SOURCES,
  PATHWAY_QA_LAYERS,
  PATHWAY_QA_VERDICTS,
  type PathwayQaDisposition,
  type PathwayQaFindingSnapshot,
  type PathwayQaIssue,
  type PathwayQaPathwaySnapshot,
  type PathwayQaUniqueVariant,
  type PathwayQaVariantResult,
} from './pathway-qa.types';

const CLOCK = '2026-08-23T18:00:00.000Z';

function pLimit(concurrency: number) {
  let running = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (running < concurrency && queue.length) {
      running++;
      queue.shift()!();
    }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          });
      });
      next();
    });
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function namesOverlap(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aTokens = a.split(' ').filter((t) => t.length > 3);
  const bTokens = b.split(' ').filter((t) => t.length > 3);
  return aTokens.some((token) => bTokens.includes(token));
}

function snapshotFindings(findings: SafetyFinding[]): PathwayQaFindingSnapshot[] {
  return findings.slice(0, 8).map((finding) => ({
    findingType: finding.findingType,
    summary: finding.summary,
    detail: finding.detail,
    clinicalSeverity: finding.clinicalSeverity,
    recommendedAction: finding.recommendedAction,
    ruleCode: finding.ruleCode,
    implicatedProductName: finding.implicatedProductName,
  }));
}

export function dispositionFromFindings(
  status: string,
  findings: SafetyFinding[],
): PathwayQaDisposition {
  if (status === 'SERVICE_UNAVAILABLE') return 'UNKNOWN';
  if (status === 'INPUT_INCOMPLETE' || status === 'VERIFICATION_INCOMPLETE') {
    return 'MORE_INFORMATION_REQUIRED';
  }
  const blob = findings
    .map((f) => `${f.clinicalSeverity} ${f.recommendedAction} ${f.summary} ${f.matchType ?? ''}`)
    .join(' ')
    .toLowerCase();
  const blocking = findings.some(
    (f) =>
      f.clinicalSeverity === 'CRITICAL' ||
      /hard_stop|contraindicat|do not (initiate|add|use|renew)|must not|block/.test(
        `${f.recommendedAction} ${f.summary} ${f.matchType ?? ''}`.toLowerCase(),
      ),
  );
  if (blocking) return 'BLOCK';
  if (findings.some((f) => f.clinicalSeverity === 'HIGH' || f.clinicalSeverity === 'MODERATE')) {
    return 'WARN_REVIEW';
  }
  if (/more information|missing|incomplete|unknown/.test(blob)) return 'MORE_INFORMATION_REQUIRED';
  if (!findings.length) return 'ALLOW_BY_THIS_RULE';
  return 'WARN_REVIEW';
}

function issue(
  source: PathwayQaIssue['source'],
  title: string,
  detail: string,
  howToFix: string[],
): PathwayQaIssue {
  return { source, title, detail, howToFix };
}

function result(partial: Omit<PathwayQaVariantResult, 'durationMs'> & { durationMs?: number }): PathwayQaVariantResult {
  return { durationMs: 0, ...partial };
}

function treatmentBlob(pathway: PathwayQaPathwaySnapshot): string {
  return pathway.treatments
    .map((t) =>
      [t.medicationName, t.genericName, t.brandName, t.eligibility, t.clinicalNotes, t.followUpAdvice]
        .filter(Boolean)
        .join(' '),
    )
    .join('\n')
    .toLowerCase();
}

function findTreatments(pathway: PathwayQaPathwaySnapshot, names: string[]) {
  return pathway.treatments.filter((treatment) =>
    names.some(
      (name) =>
        namesOverlap(treatment.medicationName, name) ||
        namesOverlap(treatment.genericName ?? '', name) ||
        namesOverlap(treatment.brandName ?? '', name),
    ),
  );
}

function redFlagBlob(pathway: PathwayQaPathwaySnapshot): string {
  return [
    ...pathway.redFlags.map((flag) => `${flag.title} ${flag.description ?? ''} ${flag.action ?? ''}`),
    ...pathway.rules.map((rule) => `${rule.condition} ${rule.message} ${rule.action}`),
    ...pathway.questions.map((q) => q.question),
  ]
    .join('\n')
    .toLowerCase();
}

function extractKeywords(text: string): string[] {
  return text
    .split(/[,;/]| or /i)
    .map((part) => part.replace(/\b(selected|typical|lesion|concern)\b/gi, '').trim())
    .filter((part) => part.length > 4)
    .slice(0, 8);
}

function referralLike(value: string | null | undefined): boolean {
  return /refer|urgent|emergency|same.?day|excluded|stop/i.test(value ?? '');
}

async function runSafetyVariant(
  variant: PathwayQaUniqueVariant,
  evaluator: MedicationSafetyEvaluatorService,
  jurisdiction?: string,
): Promise<PathwayQaVariantResult> {
  const started = Date.now();
  const candidates = variant.patient.candidates.length
    ? variant.patient.candidates
    : variant.variantKey === 'NEGATIVE'
      ? []
      : [];
  const issues: PathwayQaIssue[] = [];
  const checks: PathwayQaVariantResult['checks'] = [];
  const suggestions: string[] = [];

  if (variant.variantKey !== 'NEGATIVE' && !candidates.length) {
    issues.push(
      issue(
        PATHWAY_QA_ISSUE_SOURCES.EXCEL_DATA,
        'No candidate medications in the Excel fixture',
        `Variant ${variant.variantKey} on ${variant.caseId} did not parse any candidate drug names from “${variant.fixtureText}”.`,
        [
          'Edit the yellow Test Data cell so candidates are explicit, e.g. “candidates doxycycline, topical adapalene”.',
          'Keep each variant on its own line: `1. DX-DRUG | …`.',
        ],
      ),
    );
    return result({
      uniqueKey: variant.uniqueKey,
      caseId: variant.caseId,
      layer: variant.layer,
      variantKey: variant.variantKey,
      priority: variant.priority,
      verdict: PATHWAY_QA_VERDICTS.FAIL,
      expectedDisposition: variant.expectedDisposition,
      actualDisposition: 'UNKNOWN',
      title: `${variant.caseId} · ${variant.variantKey}`,
      fixtureText: variant.fixtureText,
      expected: variant.expectedText,
      actualSummary: 'Could not build a safety evaluation because the Excel fixture has no candidate drugs.',
      issues,
      suggestions: issues.flatMap((item) => item.howToFix),
      findings: [],
      checks,
      durationMs: Date.now() - started,
    });
  }

  const selected = (candidates.length ? candidates : ['benzoyl peroxide']).map((name) => ({
    productName: name,
    genericName: name,
  }));
  const labs = [];
  if (variant.patient.egfr) {
    labs.push({ name: 'eGFR', value: variant.patient.egfr, unit: 'mL/min/1.73m2', observedAt: CLOCK });
  }
  if (variant.patient.potassium) {
    labs.push({ name: 'potassium', value: variant.patient.potassium, unit: 'mmol/L', observedAt: CLOCK });
  }

  let evalResult: Omit<MedicationSafetyEvaluateResponse, 'evaluationId'>;
  try {
    evalResult = await evaluator.evaluate({
      jurisdiction: jurisdiction || 'ALL',
      patientContext: {
        age: 28,
        allergies: variant.patient.allergies.map((substance) => ({
          substance,
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
        })),
        conditions: variant.patient.conditions,
        pregnancy: variant.patient.pregnancy
          ? {
              status:
                variant.patient.pregnancy === 'yes'
                  ? 'yes'
                  : variant.patient.pregnancy === 'no'
                    ? 'no'
                    : 'unknown',
              trimester: variant.patient.pregnancy === 'yes' ? 'first' : undefined,
            }
          : undefined,
        currentMedications: variant.patient.currentMedications.map((name) => ({
          productName: name,
          genericName: name,
        })),
        labs,
      },
      selectedMedications: selected,
    });
  } catch (err) {
    issues.push(
      issue(
        PATHWAY_QA_ISSUE_SOURCES.CODE,
        'Safety evaluator threw an exception',
        err instanceof Error ? err.message : String(err),
        [
          'Inspect API logs for MedicationSafetyEvaluatorService around this fixture.',
          'Re-run after confirming a published safety knowledge release is loaded.',
        ],
      ),
    );
    return result({
      uniqueKey: variant.uniqueKey,
      caseId: variant.caseId,
      layer: variant.layer,
      variantKey: variant.variantKey,
      priority: variant.priority,
      verdict: PATHWAY_QA_VERDICTS.FAIL,
      expectedDisposition: variant.expectedDisposition,
      actualDisposition: 'UNKNOWN',
      title: `${variant.caseId} · ${variant.variantKey}`,
      fixtureText: variant.fixtureText,
      expected: variant.expectedText,
      actualSummary: 'Evaluator exception — see issue detail.',
      issues,
      suggestions: issues.flatMap((item) => item.howToFix),
      findings: [],
      checks,
      durationMs: Date.now() - started,
    });
  }

  if (evalResult.status === 'SERVICE_UNAVAILABLE') {
    issues.push(
      issue(
        PATHWAY_QA_ISSUE_SOURCES.ENVIRONMENT,
        'No published safety knowledge release',
        'The production evaluator has no active knowledge release, so DX-DRUG / DRUG-DRUG assertions cannot be proven.',
        [
          'In Safety Alert, publish an approved knowledge release before re-running this pack.',
          'This is an environment gap, not a pathway authoring defect.',
        ],
      ),
    );
  }

  const actual = dispositionFromFindings(evalResult.status, evalResult.findings);
  const findingTypes = new Set(evalResult.findings.map((f) => f.findingType));

  if (variant.variantKey === 'DX-DRUG') {
    const expectedHit =
      actual === 'BLOCK' || actual === 'WARN_REVIEW' || actual === 'MORE_INFORMATION_REQUIRED';
    checks.push({
      id: 'dx-drug-disposition',
      ok: expectedHit,
      label: 'Disease/patient-state rule should change disposition for at least one candidate',
      detail: `Actual ${actual}; findings=${evalResult.findings.length}`,
    });
    if (!expectedHit && evalResult.status !== 'SERVICE_UNAVAILABLE') {
      const likelyRepo = evalResult.findings.length === 0;
      issues.push(
        issue(
          likelyRepo ? PATHWAY_QA_ISSUE_SOURCES.SAFETY_REPOSITORY : PATHWAY_QA_ISSUE_SOURCES.CODE,
          'DX-DRUG variant did not fire a safety restriction',
          `Fixture: ${variant.fixtureText}. Engine returned ${actual} with ${evalResult.findings.length} finding(s).`,
          likelyRepo
            ? [
                'Map this fixture to the approved canonical pregnancy / disease / renal rule in the Safety Alert repository.',
                'Confirm ingredient matching uses the canonical name (not a brand-only substring).',
                'If the Excel drug is a seed example, replace it with the product name used in the live catalog.',
              ]
            : [
                'Inspect MedicationSafetyEvaluatorService matching for this candidate and patient state.',
                'Confirm implicatedProductName is set so the UI can disable only the affected option.',
              ],
        ),
      );
    }
  } else if (variant.variantKey === 'DRUG-DRUG') {
    if (!variant.patient.currentMedications.length) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.EXCEL_DATA,
          'No current medication in the DRUG-DRUG fixture',
          `Could not parse a current therapy from “${variant.fixtureText}”.`,
          ['Write the interacting drug after “current”, e.g. “Candidate spironolactone; current ramipril”.'],
        ),
      );
    }
    const interactionHit =
      findingTypes.has('drug_interaction') ||
      actual === 'BLOCK' ||
      actual === 'WARN_REVIEW';
    checks.push({
      id: 'ddi-hit',
      ok: interactionHit && evalResult.status !== 'SERVICE_UNAVAILABLE',
      label: 'Interaction or monitoring rule should fire',
      detail: `types=${[...findingTypes].join(', ') || 'none'} disposition=${actual}`,
    });
    if (!interactionHit && evalResult.status !== 'SERVICE_UNAVAILABLE') {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.SAFETY_REPOSITORY,
          'DRUG-DRUG variant did not match an interaction rule',
          `Candidate ${candidates.join(', ') || '—'} vs current ${variant.patient.currentMedications.join(', ') || '—'}.`,
          [
            'Add or approve the pair in drug-interactions.xlsx and publish a new knowledge release.',
            'If the Excel pair is only a seed fixture, replace it with the live canonical pair for this condition.',
          ],
        ),
      );
    }
  } else if (variant.variantKey === 'NEGATIVE') {
    const falsePositive = actual === 'BLOCK';
    checks.push({
      id: 'negative-allow',
      ok: !falsePositive,
      label: 'Negative control must not hard-block the candidate',
      detail: `disposition=${actual}`,
    });
    if (falsePositive) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.CODE,
          'Negative control produced a hard block',
          'A no-allergy / no-interaction fixture should return ALLOW BY THIS RULE (other unrelated rules may still warn).',
          [
            'Check for substring matching, inactive-med false positives, or route leakage in the evaluator.',
            'Confirm the Excel NEGATIVE line is not still carrying pregnancy=yes or an interacting current med.',
          ],
        ),
      );
    }
  }

  const verdict = issues.length ? PATHWAY_QA_VERDICTS.FAIL : PATHWAY_QA_VERDICTS.PASS;
  if (verdict === PATHWAY_QA_VERDICTS.FAIL) {
    suggestions.push(...issues.flatMap((item) => item.howToFix));
  }

  return result({
    uniqueKey: variant.uniqueKey,
    caseId: variant.caseId,
    layer: variant.layer,
    variantKey: variant.variantKey,
    priority: variant.priority,
    verdict,
    expectedDisposition: variant.expectedDisposition,
    actualDisposition: actual,
    title: `${variant.caseId} · ${variant.variantKey}`,
    fixtureText: variant.fixtureText,
    expected: variant.expectedText,
    actualSummary: `${evalResult.status}: ${evalResult.findings.length} finding(s); knowledge ${evalResult.knowledgeRelease ?? 'none'}.`,
    issues,
    suggestions,
    findings: snapshotFindings(evalResult.findings),
    checks,
    durationMs: Date.now() - started,
  });
}

function runTreatmentVariant(
  variant: PathwayQaUniqueVariant,
  pathway: PathwayQaPathwaySnapshot,
): PathwayQaVariantResult {
  const started = Date.now();
  const issues: PathwayQaIssue[] = [];
  const checks: PathwayQaVariantResult['checks'] = [];
  const active = pathway.treatments.filter((t) => t.isActive);
  const named = variant.patient.candidates.length
    ? variant.patient.candidates
    : extractKeywords(variant.fixtureText).filter((k) => k.length < 40);
  const matched = findTreatments(pathway, named);
  const blob = treatmentBlob(pathway);

  if (variant.variantKey === 'VALID') {
    checks.push({
      id: 'has-treatments',
      ok: active.length > 0,
      label: 'Pathway has at least one active treatment',
      detail: `${active.length} active option(s)`,
    });
    if (!active.length) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'No active treatments on this pathway',
          'VALID regimens cannot be accepted until the Treatment Options tab has at least one live product.',
          ['Add first-line options from the Treatment Library, including route, frequency, and duration.'],
        ),
      );
    }
    const complete = active.filter((t) => t.route && t.frequency && (t.duration || t.dose));
    checks.push({
      id: 'regimen-fields',
      ok: complete.length > 0,
      label: 'At least one option has route, frequency, and dose/duration',
      detail: `${complete.length}/${active.length} complete`,
    });
    if (active.length && !complete.length) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'Regimen fields are incomplete',
          'The pack requires route, frequency, and duration before treatment can be confirmed.',
          ['Open Treatment Options and fill missing fields. Do not rely on software defaults.'],
        ),
      );
    }
    if (named.length && active.length) {
      const hit = matched.length > 0;
      checks.push({
        id: 'named-product',
        ok: hit,
        label: 'Excel-named product exists on the pathway (fuzzy)',
        detail: hit
          ? `Matched ${matched.map((t) => t.medicationName).join(', ')}`
          : `Looked for ${named.join(', ')}`,
      });
      if (!hit) {
        issues.push(
          issue(
            PATHWAY_QA_ISSUE_SOURCES.EXCEL_DATA,
            'Excel product is not on this pathway',
            `Fixture mentions ${named.join(', ')}, but no pathway treatment matched those names. The live catalog may use a different product.`,
            [
              'Replace the Excel seed name with the exact medicationName used on this pathway, or add that product if it is clinically required.',
              'This is usually an Excel/catalog mapping issue, not an evaluator bug.',
            ],
          ),
        );
      }
    }
  } else if (variant.variantKey === 'INVALID') {
    const unsupported = matched.filter((t) => t.recommendationLevel === 'FIRST_LINE');
    const hasRationale = /monotherapy|not recommended|avoid|do not|unsupported|combination|benzoyl/i.test(blob);
    checks.push({
      id: 'invalid-not-first-line',
      ok: unsupported.length === 0 || hasRationale,
      label: 'Invalid regimen is not an unrestricted first-line option',
      detail: unsupported.length
        ? `First-line overlap: ${unsupported.map((t) => t.medicationName).join(', ')}`
        : 'No first-line overlap with the invalid proposal',
    });
    if (unsupported.length && !hasRationale) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'Invalid regimen is published as first-line',
          `The Excel INVALID fixture looks like ${variant.fixtureText}. Matching first-line treatments have no eligibility/notes that reject this pattern.`,
          [
            'Remove the unsupported product from first-line, or add eligibility text that states when it must not be used alone.',
            'Do not auto-add a second product to “fix” the regimen.',
          ],
        ),
      );
    }
    if (!active.length) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'Cannot validate INVALID without any treatments',
          'Add the supported regimen first so the engine has something to contrast against.',
          ['Author at least one supported first-line option, then re-run.'],
        ),
      );
    }
  } else if (variant.variantKey === 'BOUNDARY') {
    const hasFollowUp =
      pathway.requiresFollowUp ||
      pathway.followupCount > 0 ||
      pathway.treatments.some((t) => Boolean(t.followUpAdvice?.trim())) ||
      /reassess|follow-?up|step-?up|threshold/i.test(blob);
    checks.push({
      id: 'boundary-followup',
      ok: hasFollowUp,
      label: 'Reassessment / step-up / follow-up rule exists',
    });
    if (!hasFollowUp) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'No reassessment threshold on this pathway',
          'BOUNDARY cases require a versioned follow-up or step-up rule so threshold equality is explicit.',
          [
            'Enable Requires follow-up on Overview, or add follow-up advice on the relevant treatment.',
            'State the exact day/count threshold in counselling or follow-up content (threshold−1 must not fire).',
          ],
        ),
      );
    }
  }

  const actual: PathwayQaDisposition =
    variant.variantKey === 'VALID'
      ? issues.length
        ? 'INVALID'
        : 'VALID'
      : variant.variantKey === 'INVALID'
        ? issues.length
          ? 'VALID'
          : 'INVALID'
        : issues.length
          ? 'MORE_INFORMATION_REQUIRED'
          : 'REFERRAL';

  return result({
    uniqueKey: variant.uniqueKey,
    caseId: variant.caseId,
    layer: variant.layer,
    variantKey: variant.variantKey,
    priority: variant.priority,
    verdict: issues.length ? PATHWAY_QA_VERDICTS.FAIL : PATHWAY_QA_VERDICTS.PASS,
    expectedDisposition: variant.expectedDisposition,
    actualDisposition: actual,
    title: `${variant.caseId} · ${variant.variantKey}`,
    fixtureText: variant.fixtureText,
    expected: variant.expectedText,
    actualSummary: `${active.length} treatment(s); ${matched.length} name match(es).`,
    issues,
    suggestions: issues.flatMap((item) => item.howToFix),
    findings: [],
    checks,
    durationMs: Date.now() - started,
  });
}

function runFlowVariant(
  variant: PathwayQaUniqueVariant,
  pathway: PathwayQaPathwaySnapshot,
): PathwayQaVariantResult {
  const started = Date.now();
  const issues: PathwayQaIssue[] = [];
  const checks: PathwayQaVariantResult['checks'] = [];
  const flags = redFlagBlob(pathway);

  if (variant.variantKey === 'HAPPY') {
    checks.push({
      id: 'eligible',
      ok: pathway.pharmacistPrescribingEligible,
      label: 'Pharmacist prescribing eligible',
    });
    checks.push({
      id: 'questions',
      ok: pathway.questions.length > 0,
      label: 'Assessment questions exist',
      detail: `${pathway.questions.length} question(s)`,
    });
    checks.push({
      id: 'treatments',
      ok: pathway.treatments.length > 0,
      label: 'Treatment options exist after confirmation',
      detail: `${pathway.treatments.length} option(s)`,
    });
    if (!pathway.pharmacistPrescribingEligible) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'Pathway is marked not eligible for pharmacist prescribing',
          'HAPPY path should unlock eligibility → treatment → counselling after confirmation.',
          ['Turn on Pharmacist prescribing eligible on the Overview tab if this condition is in scope.'],
        ),
      );
    }
    if (!pathway.questions.length) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'No assessment questions',
          'The happy path cannot complete required questions if none exist.',
          ['Generate or author Diagnosis confirmation and Treatment eligibility questions.'],
        ),
      );
    }
    if (!pathway.treatments.length) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'No treatments to unlock after confirmation',
          'Flow validation expects supported options only after the pharmacist confirms the pathway.',
          ['Add treatment options, then re-run. Code will still hide them until confirmation in consultations.'],
        ),
      );
    }
    if (pathway.status === 'ARCHIVED') {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'Pathway is archived',
          'Archived pathways cannot be used for a happy-path consultation.',
          ['Restore the pathway from archive before using it as a QA target.'],
        ),
      );
    }
  } else if (variant.variantKey === 'RED FLAG') {
    const keywords = extractKeywords(variant.fixtureText);
    const matched = keywords.filter((keyword) => flags.includes(keyword.toLowerCase()));
    const hasReferral =
      pathway.redFlags.some((flag) => referralLike(flag.action) || /critical|emergency/i.test(flag.severity ?? '')) ||
      pathway.rules.some((rule) =>
        ['URGENT_REFERRAL', 'STOP_PRESCRIBING', 'CONTRAINDICATED'].includes(rule.action),
      );
    checks.push({
      id: 'red-flag-content',
      ok: pathway.redFlags.length > 0 || pathway.rules.length > 0,
      label: 'Red flags or stop rules exist',
      detail: `${pathway.redFlags.length} flag(s), ${pathway.rules.length} rule(s)`,
    });
    checks.push({
      id: 'red-flag-match',
      ok: matched.length > 0 || (!keywords.length && pathway.redFlags.length > 0),
      label: 'Excel red-flag language overlaps pathway content',
      detail: matched.length ? `Matched ${matched.join(', ')}` : `Looked for ${keywords.slice(0, 4).join(', ') || 'n/a'}`,
    });
    checks.push({
      id: 'referral-action',
      ok: hasReferral,
      label: 'At least one flag/rule escalates (referral / stop)',
    });
    if (!pathway.redFlags.length && !pathway.rules.length) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'No red flags authored',
          `Excel RED FLAG fixture: ${variant.fixtureText}`,
          ['Add red flags with an action of urgent referral, same-day physician, or pathway excluded.'],
        ),
      );
    } else if (keywords.length && !matched.length) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'Red-flag wording does not match the Excel fixture',
          `None of [${keywords.slice(0, 5).join(', ')}] appear in red flags, rules, or questions.`,
          [
            'Align red-flag titles with the clinical language in the test pack, or update the Excel fixture to the approved pathway wording.',
            'If the pathway uses different but equivalent flags, this may be Excel wording — confirm clinically before changing code.',
          ],
        ),
      );
    } else if (!hasReferral) {
      issues.push(
        issue(
          PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
          'Red flags do not escalate',
          'RED FLAG variants must set referral state and suppress routine minor-ailment prescribing.',
          ['Set red-flag action to IMMEDIATE_REFERRAL / EMERGENCY, or add a URGENT_REFERRAL clinical rule.'],
        ),
      );
    }
  } else if (variant.variantKey === 'STATE') {
    const mentionsAge = /\bage\b|minimum|maximum/i.test(variant.fixtureText);
    const mentionsUncertain = /uncertain|none-of-these|low confidence|manual/i.test(variant.fixtureText);
    if (mentionsAge) {
      const hasAge = pathway.ageMin != null || pathway.ageMax != null;
      checks.push({
        id: 'age-bounds',
        ok: hasAge,
        label: 'Age bounds are set for boundary-age fixtures',
        detail: `ageMin=${pathway.ageMin ?? '—'} ageMax=${pathway.ageMax ?? '—'}`,
      });
      if (!hasAge) {
        issues.push(
          issue(
            PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
            'Age boundary is not configured',
            'STATE fixture mentions age but Overview has no ageMin/ageMax.',
            ['Set the inclusive age range on Overview. Boundary tests use equality against those stored operators.'],
          ),
        );
      }
    }
    if (mentionsUncertain) {
      checks.push({
        id: 'differentials',
        ok: pathway.differentials.length > 0,
        label: 'Differentials exist so low-confidence suggestions cannot force a pathway',
        detail: `${pathway.differentials.length} differential(s)`,
      });
      if (!pathway.differentials.length) {
        issues.push(
          issue(
            PATHWAY_QA_ISSUE_SOURCES.PATHWAY_CONTENT,
            'No differentials for manual / uncertain state',
            'When suggestion confidence is low, the pharmacist must be able to choose none-of-these-fit.',
            ['Author differential diagnoses with distinguishing features. Code already blocks treatment before confirmation.'],
          ),
        );
      }
    }
    if (!mentionsAge && !mentionsUncertain && !pathway.differentials.length && pathway.ageMin == null) {
      checks.push({
        id: 'state-structure',
        ok: true,
        label: 'STATE variant recorded (no extra structural requirement parsed)',
      });
    }
  }

  const actual: PathwayQaDisposition =
    variant.variantKey === 'HAPPY'
      ? issues.length
        ? 'NOT_ELIGIBLE'
        : 'ELIGIBLE'
      : variant.variantKey === 'RED FLAG'
        ? issues.length
          ? 'ELIGIBLE'
          : 'URGENT_REFERRAL'
        : issues.length
          ? 'ELIGIBLE'
          : 'MANUAL_SELECTION';

  return result({
    uniqueKey: variant.uniqueKey,
    caseId: variant.caseId,
    layer: variant.layer,
    variantKey: variant.variantKey,
    priority: variant.priority,
    verdict: issues.length ? PATHWAY_QA_VERDICTS.FAIL : PATHWAY_QA_VERDICTS.PASS,
    expectedDisposition: variant.expectedDisposition,
    actualDisposition: actual,
    title: `${variant.caseId} · ${variant.variantKey}`,
    fixtureText: variant.fixtureText,
    expected: variant.expectedText,
    actualSummary: `${pathway.questions.length} questions, ${pathway.redFlags.length} red flags, ${pathway.treatments.length} treatments.`,
    issues,
    suggestions: issues.flatMap((item) => item.howToFix),
    findings: [],
    checks,
    durationMs: Date.now() - started,
  });
}

export async function executeUniqueVariants(opts: {
  variants: PathwayQaUniqueVariant[];
  pathway: PathwayQaPathwaySnapshot;
  evaluator: MedicationSafetyEvaluatorService;
}): Promise<PathwayQaVariantResult[]> {
  const limit = pLimit(4);
  return Promise.all(
    opts.variants.map((variant) =>
      limit(async () => {
        if (variant.layer === PATHWAY_QA_LAYERS.SAFETY_ENGINE) {
          return runSafetyVariant(variant, opts.evaluator, opts.pathway.province);
        }
        if (variant.layer === PATHWAY_QA_LAYERS.TREATMENT) {
          return runTreatmentVariant(variant, opts.pathway);
        }
        return runFlowVariant(variant, opts.pathway);
      }),
    ),
  );
}

export function summarizeResults(results: PathwayQaVariantResult[]) {
  const failed = results.filter((r) => r.verdict === PATHWAY_QA_VERDICTS.FAIL);
  const skipped = results.filter((r) => r.verdict === PATHWAY_QA_VERDICTS.SKIPPED);
  const passed = results.filter((r) => r.verdict === PATHWAY_QA_VERDICTS.PASS);
  const byLayer: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const item of results) {
    const bucket = (byLayer[item.layer] ??= { total: 0, passed: 0, failed: 0 });
    bucket.total += 1;
    if (item.verdict === PATHWAY_QA_VERDICTS.PASS) bucket.passed += 1;
    if (item.verdict === PATHWAY_QA_VERDICTS.FAIL) bucket.failed += 1;
  }
  const bySource: Record<string, number> = {};
  for (const item of failed) {
    for (const issueRow of item.issues) {
      bySource[issueRow.source] = (bySource[issueRow.source] ?? 0) + 1;
    }
  }
  const criticalFailed = failed.filter((item) => /critical/i.test(item.priority)).length;
  return {
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    skipped: skipped.length,
    passRate: results.length ? Math.round((passed.length / results.length) * 1000) / 10 : 0,
    byLayer,
    bySource,
    criticalFailed,
  };
}

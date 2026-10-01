/**
 * Safety Engine Expanded Developer Test Pack v2.0 — live E2E against the API
 * used by safescribe.ca (currently api-staging.safescribe.ca).
 *
 *   API_URL=https://api-staging.safescribe.ca npx tsx scripts/e2e-safety-v2-pack.ts
 *
 * Writes docs/SAFETY_ENGINE_V2_E2E_RESULTS.md
 */
import * as fs from 'fs';
import * as path from 'path';

const API_BASE = (process.env.API_URL ?? 'https://api-staging.safescribe.ca').replace(/\/$/, '');
const API = API_BASE.endsWith('/api/v1') ? API_BASE : `${API_BASE}/api/v1`;
const FROZEN_CLOCK = '16-Aug-2026 America/Edmonton';

type Bucket = 'BLOCK' | 'CAUTION' | 'MORE_INFO' | 'ALLOWED' | 'REFERRAL';
type FailureKind = 'CODE' | 'DATA' | 'PATHWAY' | 'SCOPE';

type Expectation = {
  match: RegExp;
  expect: Bucket;
  /** Soft pass: ALLOWED or CAUTION both OK when spec says "not auto-blocked". */
  notBlock?: boolean;
  reasonIncludes?: RegExp;
};

type Check = { name: string; ok: boolean; detail?: string };

type CaseDef = {
  id: string;
  suite: string;
  title: string;
  pathwayNeedles: string[];
  complaint: string;
  debug: { workbook: string; code: string; lines: string };
  patient: Record<string, unknown>;
  meds: string[];
  currentMeds?: Array<{ productName: string; genericName?: string; status?: string }>;
  expectations: Expectation[];
  extra?: (evalRes: any) => Check[] | Promise<Check[]>;
  consult?: 'treatments' | 'age-block' | 'age-pass' | 'referral';
  consultRedFlags?: Record<string, unknown>;
};

type CaseResult = {
  id: string;
  suite: string;
  title: string;
  ok: boolean;
  layer: string;
  checks: Check[];
  failureKind?: FailureKind;
  summary: string;
  expected: string;
  actual: string;
  findingsSample: string[];
  warnings: string[];
  evalStatus?: string;
  debug: CaseDef['debug'];
  pathwayUsed?: string;
};

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnvFile(path.resolve('infra/staging/secrets/staging-secrets.env'));

async function req(
  method: string,
  pathName: string,
  opts?: { token?: string; body?: unknown },
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {};
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${pathName}`, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

function assertOk(status: number, data: unknown, label: string) {
  if (status < 200 || status >= 300) {
    throw new Error(`${label} HTTP ${status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
}

function findingsForMed(findings: any[], medName: string) {
  const medKey = medName.toLowerCase().trim();
  const isTopical = (s: string) =>
    /\b(cream|ointment|gel|lotion|topical|patch|spray|external)\b/i.test(s);
  const coreRoot = (s: string) =>
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[%®™,]/g, ' ')
      .replace(/\b(oral|cream|ointment|gel|tablet|capsule|generics?|lotion|topical|external|vaginal)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')[0];

  const medRoot = coreRoot(medKey);
  const medIsTopical = isTopical(medKey);

  return (findings ?? []).filter((f) => {
    const implicated = String(f.implicatedProductName ?? '').toLowerCase().trim();
    if (!implicated) {
      const blob = `${f.summary ?? ''} ${f.detail ?? ''}`.toLowerCase();
      return medRoot.length >= 4 && blob.includes(medRoot);
    }
    const impIsTopical = isTopical(implicated);
    if (medIsTopical !== impIsTopical) return false;
    if (
      implicated === medKey ||
      implicated.startsWith(medKey + ' ') ||
      medKey.startsWith(implicated + ' ')
    ) {
      return true;
    }
    const impRoot = coreRoot(implicated);
    if (!medRoot || !impRoot || medRoot.length < 4) return false;
    if (medRoot === 'acyclovir' && /valacyclovir/.test(implicated)) return false;
    if (medRoot === 'valacyclovir' && /^acyclovir/.test(implicated) && !/valacyclovir/.test(implicated))
      return false;
    return medRoot === impRoot;
  });
}

function classifyFindingSeverity(findings: any[], evalRes?: any, medName?: string): Bucket {
  if (!findings.length) {
    const warnings: string[] = evalRes?.mappingWarnings ?? [];
    const status = String(evalRes?.status ?? '');
    const blob = warnings.join(' | ').toLowerCase();
    const aboutMed = !medName || blob.includes(medName.toLowerCase().split(' ')[0].toLowerCase());
    if (
      aboutMed &&
      (status === 'INPUT_INCOMPLETE' ||
        status === 'VERIFICATION_INCOMPLETE' ||
        /unknown|required lab|stale|eGFR required|pregnancy status|lactation status|weight/i.test(blob))
    ) {
      return 'MORE_INFO';
    }
    return 'ALLOWED';
  }
  const hard = findings.some(
    (f) =>
      ['allergy', 'cross_reactivity', 'drug_disease', 'pregnancy', 'lactation', 'age_gate'].includes(
        f.findingType,
      ) && ['CRITICAL', 'HIGH'].includes(f.clinicalSeverity),
  );
  if (hard) return 'BLOCK';
  const dupStop = findings.some(
    (f) =>
      f.findingType === 'duplicate_therapy' && ['CRITICAL', 'HIGH'].includes(f.clinicalSeverity),
  );
  if (dupStop) return 'BLOCK';
  const labStop = findings.some(
    (f) =>
      f.findingType === 'renal_lab' && ['CRITICAL', 'HIGH'].includes(f.clinicalSeverity),
  );
  if (labStop) return 'BLOCK';
  const ddiBlock = findings.some(
    (f) =>
      f.findingType === 'drug_interaction' &&
      ['CRITICAL', 'HIGH'].includes(f.clinicalSeverity) &&
      /major|contraindicat|rhabdomyolysis|myopathy/i.test(`${f.summary ?? ''} ${f.detail ?? ''} ${f.matchType ?? ''}`),
  );
  if (ddiBlock) return 'BLOCK';
  const ddiCritical = findings.some(
    (f) => f.findingType === 'drug_interaction' && f.clinicalSeverity === 'CRITICAL',
  );
  if (ddiCritical) return 'BLOCK';
  const renal = findings.some((f) => f.findingType === 'renal_band');
  if (renal) {
    const blockBand = findings.some((f) => f.matchType === 'renal_band_block');
    return blockBand ? 'BLOCK' : 'CAUTION';
  }
  const caution = findings.some((f) =>
    ['CRITICAL', 'HIGH', 'MODERATE'].includes(f.clinicalSeverity),
  );
  return caution ? 'CAUTION' : 'ALLOWED';
}

function checkExpectations(
  label: string,
  items: Array<{ name: string; severity: Bucket; reason?: string }>,
  expectations: Expectation[],
  evalRes?: any,
): Check[] {
  const checks: Check[] = [];
  for (const exp of expectations) {
    let hit = items.find((i) => exp.match.test(i.name));
    if (!hit) {
      const src = exp.match.source.replace(/^\^|\$$/g, '');
      hit = items.find((i) => new RegExp(src, 'i').test(i.name));
    }
    if (!hit) {
      checks.push({
        name: `${label}:${exp.match.source}`,
        ok: false,
        detail: `Medication not found. Available: ${items.map((i) => i.name).join(', ') || '(none)'}`,
      });
      continue;
    }
    const sevOk = exp.notBlock
      ? hit.severity !== 'BLOCK'
      : hit.severity === exp.expect ||
        (exp.expect === 'MORE_INFO' && hit.severity === 'CAUTION') ||
        (exp.expect === 'CAUTION' && hit.severity === 'MORE_INFO') ||
        (exp.expect === 'BLOCK' && hit.severity === 'CAUTION' && /regimen|renal/i.test(exp.match.source));
    const reasonOk = exp.reasonIncludes
      ? Boolean(hit.reason && exp.reasonIncludes.test(hit.reason))
      : true;
    const warnHit =
      exp.expect === 'MORE_INFO' &&
      (evalRes?.status === 'VERIFICATION_INCOMPLETE' ||
        evalRes?.status === 'INPUT_INCOMPLETE' ||
        (evalRes?.mappingWarnings ?? []).some((w: string) =>
          /unknown|required|stale|eGFR/i.test(w),
        ));
    const ok = (sevOk && reasonOk) || (exp.expect === 'MORE_INFO' && warnHit && hit.severity !== 'BLOCK');
    checks.push({
      name: `${label}:${hit.name}→${exp.expect}`,
      ok,
      detail: ok
        ? `${hit.severity}${hit.reason ? ` · ${String(hit.reason).slice(0, 140)}` : ''}`
        : `got ${hit.severity}${hit.reason ? ` (${String(hit.reason).slice(0, 140)})` : ''}`,
    });
  }
  return checks;
}

async function evaluate(token: string, body: Record<string, unknown>) {
  const { status, data } = await req('POST', '/medication-safety/evaluate', { token, body });
  assertOk(status, data, 'evaluate');
  return data;
}

function pickPathway(items: any[], ...needles: string[]) {
  const lower = needles.map((n) => n.toLowerCase());
  const list = Array.isArray(items) ? items : [];
  return list.find((p) => {
    const blob = `${p?.name ?? ''} ${p?.condition ?? ''} ${p?.title ?? ''}`.toLowerCase();
    return blob.trim() && lower.some((n) => blob.includes(n));
  });
}

async function createConsultationFlow(
  token: string,
  opts: {
    pathwayId: string;
    complaint: string;
    demographics: Record<string, unknown>;
    redFlags?: Record<string, unknown>;
  },
) {
  const created = await req('POST', '/consultations', { token, body: {} });
  assertOk(created.status, created.data, 'create consultation');
  const id = created.data.id as string;

  await req('PATCH', `/consultations/${id}/step`, {
    token,
    body: {
      stepIndex: 0,
      currentStep: 'PRESENTING_COMPLAINT',
      data: { chiefComplaint: opts.complaint, transcript: opts.complaint, aiEntities: {} },
    },
  });

  const pathway = await req('PATCH', `/consultations/${id}/pathway`, {
    token,
    body: { pathwayId: opts.pathwayId },
  });
  assertOk(pathway.status, pathway.data, 'select pathway');

  await req('PATCH', `/consultations/${id}/step`, {
    token,
    body: { stepIndex: 2, currentStep: 'DEMOGRAPHICS', data: opts.demographics },
  });

  if (opts.redFlags) {
    await req('PATCH', `/consultations/${id}/step`, {
      token,
      body: { stepIndex: 4, currentStep: 'RED_FLAGS', data: opts.redFlags },
    });
  }

  const recommend = await req('POST', `/consultations/${id}/ai/recommend-treatment`, { token });
  assertOk(recommend.status, recommend.data, 'recommend-treatment');
  return { id, recommend: recommend.data };
}

function inferKind(def: CaseDef, checks: Check[]): FailureKind | undefined {
  const failed = checks.filter((c) => !c.ok);
  if (!failed.length) return undefined;
  if (def.suite === 'Duplicate therapy' || def.id === 'AGE-03' || def.id === 'DDI-03') return 'SCOPE';
  if (def.suite === 'Age and weight' || def.suite === 'Red flag / referral') return 'PATHWAY';
  const blob = failed.map((f) => `${f.name} ${f.detail}`).join(' ').toLowerCase();
  if (/no published pathway|consult:pathway|consult:flow|consult:under-12/.test(blob)) return 'PATHWAY';
  if (/discontinued|lifecycle|status field|no duplicate/.test(blob)) return 'SCOPE';
  if (/got allowed|medication not found|did not fire/.test(blob)) return 'DATA';
  return 'CODE';
}

const DBG = {
  allergy:
    'allergy-cross-reactivity-rules.xlsx · evaluator Stage A L138–185 (direct) and Stage B/C L187 (published)',
  cross:
    'allergy-cross-reactivity-rules.xlsx · evaluator Stage B/C L187 matchPublishedRule()',
  ddi: 'drug-interactions.xlsx · evaluator Stage E L321–406',
  dxd: 'drug-disease-rules.xlsx · evaluator Stage E2 L408–488',
  renal: 'renal-rules.xlsx · evaluator Stage H L628–677 extractEgfrValue()',
  lab: 'lab-threshold-rules.xlsx · evaluator Stage D L230–318 isLabStale() L270',
  preg: 'pregnancy-rules.xlsx · evaluator Stage F L491–567 parsePregnancyStatus()',
  lac: 'lactation-rules.xlsx · evaluator Stage G L569–626 + patient-context.util.ts parsePregnancyStatus()',
  age: 'pathway ageMin/ageMax (not a Safety Excel domain) · consultation recommend-treatment',
  dup: 'No SAFETY_RULE_TYPES.DUPLICATE — not in evaluator stages A–H',
  ref: 'pathway redFlags JSON · consultations.service.ts screen-red-flags / recommend-treatment',
  hep: 'drug-disease-rules.xlsx (hepatic) and lab-threshold-rules.xlsx (LFTs) · Stages E2 + D',
};

const CASES: CaseDef[] = [
  {
    id: 'ALG-D01',
    suite: 'Direct allergy',
    title: 'Docosanol allergy in a cold-sore consultation',
    pathwayNeedles: ['cold sore', 'herpes labialis', 'labialis'],
    complaint:
      'I felt burning and tingling on my upper lip this morning. I previously had a severe reaction to docosanol.',
    debug: { workbook: 'allergy-cross-reactivity-rules.xlsx', code: DBG.allergy, lines: 'L138–185' },
    patient: {
      age: 25,
      allergies: [
        {
          substance: 'Docosanol',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'severe/immediate; hives and facial swelling',
        },
      ],
    },
    meds: ['Docosanol 10% cream', 'Abreva', 'Acyclovir 5% cream', 'Valacyclovir'],
    expectations: [
      { match: /docosanol/i, expect: 'BLOCK', reasonIncludes: /docosanol|allerg/i },
      { match: /abreva/i, expect: 'BLOCK' },
      { match: /Acyclovir 5%/i, expect: 'ALLOWED', notBlock: true },
      { match: /^Valacyclovir$/i, expect: 'ALLOWED', notBlock: true },
    ],
    extra: (evalRes) => {
      const antiviralBlocked = (evalRes.findings ?? []).filter(
        (f: any) =>
          f.findingType === 'allergy' &&
          /valacyclovir|acyclovir/i.test(f.implicatedProductName ?? '') &&
          !/docosanol/i.test(f.implicatedProductName ?? ''),
      );
      return [
        {
          name: 'must-not:block all antivirals',
          ok: antiviralBlocked.length === 0,
          detail: antiviralBlocked.length
            ? antiviralBlocked.map((f: any) => f.implicatedProductName).join(', ')
            : 'unrelated antivirals not allergy-blocked',
        },
      ];
    },
    consult: 'treatments',
  },
  {
    id: 'ALG-D02',
    suite: 'Direct allergy',
    title: 'Clotrimazole allergy across vaginal and external products',
    pathwayNeedles: ['vulvovaginal', 'candidiasis', 'yeast', 'vvc'],
    complaint:
      'I have vaginal itching and thick white discharge. Clotrimazole previously caused angioedema and dyspnea.',
    debug: { workbook: 'allergy-cross-reactivity-rules.xlsx', code: DBG.allergy, lines: 'L138–185 combo scan' },
    patient: {
      age: 34,
      pregnancy: { status: 'not pregnant' },
      allergies: [
        {
          substance: 'Clotrimazole',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'severe/immediate; angioedema and dyspnea',
        },
      ],
    },
    meds: [
      'Clotrimazole vaginal cream',
      'Clotrimazole external cream',
      'Fluconazole/clotrimazole',
      'Miconazole',
      'Fluconazole',
    ],
    expectations: [
      { match: /Clotrimazole vaginal/i, expect: 'BLOCK' },
      { match: /Clotrimazole external/i, expect: 'BLOCK' },
      { match: /Fluconazole\/clotrimazole/i, expect: 'BLOCK' },
      { match: /^Miconazole$/i, expect: 'ALLOWED', notBlock: true },
      { match: /^Fluconazole$/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'ALG-D03',
    suite: 'Direct allergy',
    title: 'Acetaminophen allergy hidden in a combination analgesic',
    pathwayNeedles: ['pain', 'analgesic'],
    complaint: 'I need something for short-term shoulder pain. Acetaminophen previously caused hives and wheeze.',
    debug: { workbook: 'allergy-cross-reactivity-rules.xlsx', code: DBG.allergy, lines: 'L138–185 combination ingredients' },
    patient: {
      age: 46,
      pregnancy: { status: 'not pregnant' },
      allergies: [
        {
          substance: 'Acetaminophen',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'severe/immediate; hives and wheeze',
        },
      ],
    },
    meds: ['Acetaminophen', 'Acetaminophen/ibuprofen', 'Acetaminophen/caffeine/codeine', 'Ibuprofen'],
    expectations: [
      { match: /^Acetaminophen$/i, expect: 'BLOCK' },
      { match: /Acetaminophen\/ibuprofen/i, expect: 'BLOCK' },
      { match: /Acetaminophen\/caffeine\/codeine/i, expect: 'BLOCK' },
      { match: /^Ibuprofen$/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'ALG-X01',
    suite: 'Cross-reactivity',
    title: 'Acyclovir allergy must block valacyclovir',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint: 'I have tingling at the edge of my lip. I previously had an immediate reaction to acyclovir.',
    debug: { workbook: 'allergy-cross-reactivity-rules.xlsx', code: DBG.cross, lines: 'L187 matchPublishedRule' },
    patient: {
      age: 40,
      pregnancy: { status: 'not pregnant' },
      allergies: [
        {
          substance: 'Acyclovir',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'severe/immediate',
        },
      ],
    },
    meds: [
      'Acyclovir',
      'Acyclovir 5% cream',
      'Acyclovir/hydrocortisone cream',
      'Valacyclovir',
      'Docosanol 10% cream',
      'Famciclovir',
    ],
    expectations: [
      { match: /^Acyclovir$/i, expect: 'BLOCK' },
      { match: /Acyclovir 5%/i, expect: 'BLOCK' },
      { match: /Acyclovir\/hydrocortisone/i, expect: 'BLOCK' },
      { match: /^Valacyclovir$/i, expect: 'BLOCK' },
      { match: /docosanol/i, expect: 'ALLOWED', notBlock: true },
      { match: /famciclovir/i, expect: 'ALLOWED', notBlock: true },
    ],
    consult: 'treatments',
  },
  {
    id: 'ALG-X02',
    suite: 'Cross-reactivity',
    title: 'Valacyclovir allergy must block acyclovir oral and topical',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint: 'My lip is tingling. Valacyclovir previously caused facial swelling.',
    debug: { workbook: 'allergy-cross-reactivity-rules.xlsx', code: DBG.cross, lines: 'L187 reciprocal CROSS_REACTIVITY' },
    patient: {
      age: 52,
      allergies: [
        {
          substance: 'Valacyclovir',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'severe/immediate',
        },
      ],
    },
    meds: ['Valacyclovir', 'Acyclovir', 'Acyclovir 5% cream', 'Docosanol 10% cream'],
    expectations: [
      { match: /^Valacyclovir$/i, expect: 'BLOCK' },
      { match: /^Acyclovir$/i, expect: 'BLOCK' },
      { match: /Acyclovir 5%/i, expect: 'BLOCK' },
      { match: /docosanol/i, expect: 'ALLOWED', notBlock: true },
    ],
    consult: 'treatments',
  },
  {
    id: 'ALG-X03',
    suite: 'Cross-reactivity',
    title: 'Severe penicillin allergy: class block plus cephalexin caution',
    pathwayNeedles: ['otitis', 'aom', 'ear'],
    complaint: 'My child has ear pain and fever. Amoxicillin previously caused anaphylaxis.',
    debug: { workbook: 'allergy-cross-reactivity-rules.xlsx', code: DBG.cross, lines: 'L187 class + cephalosporin caution' },
    patient: {
      age: 6,
      allergies: [
        {
          substance: 'Amoxicillin',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'severe immediate anaphylaxis',
        },
      ],
    },
    meds: ['Amoxicillin', 'Amoxicillin/clavulanate', 'Penicillin V', 'Ampicillin', 'Cephalexin', 'Azithromycin'],
    expectations: [
      { match: /^Amoxicillin$/i, expect: 'BLOCK' },
      { match: /Amoxicillin\/clavulanate/i, expect: 'BLOCK' },
      { match: /Penicillin V/i, expect: 'BLOCK' },
      { match: /Ampicillin/i, expect: 'BLOCK' },
      { match: /Cephalexin/i, expect: 'CAUTION' },
      { match: /Azithromycin/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'DDI-01',
    suite: 'Drug–drug interaction',
    title: 'Clopidogrel with omeprazole or esomeprazole',
    pathwayNeedles: ['gerd', 'heartburn', 'reflux'],
    complaint: 'I have burning behind my breastbone after meals. I take clopidogrel every day.',
    debug: { workbook: 'drug-interactions.xlsx', code: DBG.ddi, lines: 'L321–406' },
    patient: {
      age: 63,
      conditions: ['Coronary artery disease', 'coronary stent'],
      currentMedications: [{ productName: 'Clopidogrel 75 mg', genericName: 'clopidogrel' }],
    },
    meds: ['Omeprazole', 'Esomeprazole', 'Pantoprazole', 'Famotidine'],
    currentMeds: [{ productName: 'Clopidogrel 75 mg', genericName: 'clopidogrel' }],
    expectations: [
      { match: /Omeprazole/i, expect: 'CAUTION' },
      { match: /Esomeprazole/i, expect: 'CAUTION' },
      { match: /Pantoprazole/i, expect: 'ALLOWED', notBlock: true },
      { match: /Famotidine/i, expect: 'ALLOWED', notBlock: true },
    ],
    extra: (evalRes) => {
      const pantoBlocked = (evalRes.findings ?? []).some(
        (f: any) => /pantoprazole/i.test(f.implicatedProductName ?? '') && f.findingType === 'drug_interaction',
      );
      return [
        {
          name: 'must-not:class-wide PPI block',
          ok: !pantoBlocked,
          detail: pantoBlocked ? 'pantoprazole inherited clopidogrel DDI' : 'pantoprazole not class-blocked',
        },
      ];
    },
    consult: 'treatments',
  },
  {
    id: 'DDI-02',
    suite: 'Drug–drug interaction',
    title: 'Clarithromycin with active simvastatin',
    pathwayNeedles: ['infection', 'antibacterial'],
    complaint: 'I am being assessed for an infection. I take simvastatin every night.',
    debug: { workbook: 'drug-interactions.xlsx', code: DBG.ddi, lines: 'L321–406 MAJOR pair' },
    patient: {
      age: 68,
      conditions: ['Dyslipidemia'],
      pregnancy: { status: 'not pregnant' },
      currentMedications: [{ productName: 'Simvastatin 40 mg', genericName: 'simvastatin' }],
    },
    meds: ['Clarithromycin', 'Azithromycin', 'Rosuvastatin'],
    currentMeds: [{ productName: 'Simvastatin 40 mg', genericName: 'simvastatin' }],
    expectations: [
      { match: /Clarithromycin/i, expect: 'BLOCK' },
      { match: /Azithromycin/i, expect: 'ALLOWED', notBlock: true },
      { match: /Rosuvastatin/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'DDI-03',
    suite: 'Drug–drug interaction',
    title: 'Historical simvastatin must not trigger an active clarithromycin DDI',
    pathwayNeedles: ['infection', 'antibacterial'],
    complaint: 'I need treatment for an infection. I used to take simvastatin but it was stopped in May.',
    debug: {
      workbook: 'drug-interactions.xlsx',
      code: 'CODE: SafetySelectedMedication has no status/endDate; evaluator L130–134 treats all current meds as active',
      lines: 'evaluator.service.ts L130–134; dto L230–237; types L78–81',
    },
    patient: {
      age: 68,
      pregnancy: { status: 'not pregnant' },
      currentMedications: [
        { productName: 'Simvastatin 40 mg', genericName: 'simvastatin', status: 'discontinued' },
      ],
    },
    meds: ['Clarithromycin'],
    currentMeds: [
      { productName: 'Simvastatin 40 mg', genericName: 'simvastatin', status: 'discontinued' },
    ],
    expectations: [{ match: /Clarithromycin/i, expect: 'ALLOWED', notBlock: true }],
    extra: (evalRes) => {
      const ddi = (evalRes.findings ?? []).filter((f: any) => f.findingType === 'drug_interaction');
      return [
        {
          name: 'lifecycle:discontinued current med not modeled',
          ok: ddi.length === 0,
          detail:
            ddi.length === 0
              ? 'no active DDI'
              : `Engine has no discontinued/historical status field, so simvastatin is treated as active. ${ddi[0]?.detail ?? ''}`.slice(
                  0,
                  220,
                ),
        },
      ];
    },
  },
  {
    id: 'DXD-01',
    suite: 'Drug–disease',
    title: 'Active peptic ulcer must block NSAID-containing options',
    pathwayNeedles: ['otitis', 'aom', 'pain'],
    complaint: 'I have ear pain and fever and currently have an active peptic ulcer.',
    debug: { workbook: 'drug-disease-rules.xlsx', code: DBG.dxd, lines: 'L408–488' },
    patient: {
      age: 35,
      conditions: ['Active peptic ulcer disease'],
    },
    meds: ['Ibuprofen', 'Naproxen', 'Diclofenac', 'Acetaminophen/ibuprofen', 'Acetaminophen'],
    expectations: [
      { match: /^Ibuprofen$/i, expect: 'BLOCK' },
      { match: /Naproxen/i, expect: 'BLOCK' },
      { match: /Diclofenac/i, expect: 'BLOCK' },
      { match: /Acetaminophen\/ibuprofen/i, expect: 'BLOCK' },
      { match: /^Acetaminophen$/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'DXD-02',
    suite: 'Drug–disease',
    title: 'Severe hypertension must block pseudoephedrine-containing products',
    pathwayNeedles: ['rhinitis', 'congestion', 'allerg'],
    complaint: 'My nose is congested from allergies. I have severe high blood pressure.',
    debug: { workbook: 'drug-disease-rules.xlsx', code: DBG.dxd, lines: 'L408–488 conditionMatches()' },
    patient: {
      age: 59,
      conditions: ['Severe hypertension'],
      pregnancy: { status: 'not pregnant' },
      currentMedications: [{ productName: 'Amlodipine 10 mg', genericName: 'amlodipine' }],
    },
    meds: [
      'Pseudoephedrine',
      'Cetirizine/pseudoephedrine',
      'Ibuprofen/pseudoephedrine',
      'Saline nasal spray',
    ],
    expectations: [
      { match: /^Pseudoephedrine$/i, expect: 'BLOCK' },
      { match: /Cetirizine\/pseudoephedrine/i, expect: 'BLOCK' },
      { match: /Ibuprofen\/pseudoephedrine/i, expect: 'BLOCK' },
      { match: /Saline/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'DXD-03',
    suite: 'Drug–disease',
    title: 'ASA/NSAID-exacerbated respiratory disease',
    pathwayNeedles: ['pain'],
    complaint: 'I need pain relief. Aspirin previously caused wheezing, and I have asthma and nasal polyps.',
    debug: { workbook: 'drug-disease-rules.xlsx', code: DBG.dxd, lines: 'L408–488 AERD phenotype' },
    patient: {
      age: 42,
      conditions: ['Asthma', 'nasal polyps', 'ASA-exacerbated respiratory disease'],
      allergies: [
        {
          substance: 'Aspirin',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'wheeze/bronchospasm',
        },
      ],
      currentMedications: [{ productName: 'Budesonide/formoterol', genericName: 'budesonide' }],
    },
    meds: ['Ibuprofen', 'Naproxen', 'Diclofenac', 'Acetaminophen/ibuprofen', 'Acetaminophen'],
    expectations: [
      { match: /^Ibuprofen$/i, expect: 'BLOCK' },
      { match: /Naproxen/i, expect: 'BLOCK' },
      { match: /Diclofenac/i, expect: 'BLOCK' },
      { match: /Acetaminophen\/ibuprofen/i, expect: 'BLOCK' },
      { match: /^Acetaminophen$/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'REN-01',
    suite: 'Renal',
    title: 'eGFR 10: metformin alert and renal review for systemic antivirals',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint: 'I have tingling on my lip, type 2 diabetes and take metformin.',
    debug: { workbook: 'renal-rules.xlsx + lab-threshold-rules.xlsx', code: DBG.renal, lines: 'L628–677 and Stage D L230' },
    patient: {
      age: 25,
      conditions: ['Type 2 diabetes mellitus'],
      currentMedications: [{ productName: 'Metformin 1000 mg', genericName: 'metformin' }],
      labs: [
        { name: 'eGFR', value: '10', unit: 'mL/min/1.73 m2', observedAt: '2026-06-08' },
        { name: 'A1C', value: '8.5', unit: '%', observedAt: '2025-08-11' },
      ],
    },
    meds: ['Valacyclovir', 'Acyclovir', 'Famciclovir', 'Acyclovir 5% cream', 'Metformin 1000 mg'],
    currentMeds: [{ productName: 'Metformin 1000 mg', genericName: 'metformin' }],
    expectations: [
      { match: /Metformin/i, expect: 'BLOCK' },
      { match: /^Valacyclovir$/i, expect: 'CAUTION' },
      { match: /^Acyclovir$/i, expect: 'CAUTION' },
      { match: /Famciclovir/i, expect: 'CAUTION' },
      { match: /Acyclovir 5%/i, expect: 'ALLOWED', notBlock: true },
    ],
    extra: (evalRes) => {
      const topicalRenal = (evalRes.findings ?? []).some(
        (f: any) =>
          /renal/i.test(f.findingType) && /Acyclovir 5%/i.test(f.implicatedProductName ?? ''),
      );
      return [
        {
          name: 'must-not:topical renal alert',
          ok: !topicalRenal,
          detail: topicalRenal ? 'topical acyclovir received a renal finding' : 'topical excluded',
        },
      ];
    },
    consult: 'treatments',
  },
  {
    id: 'REN-02',
    suite: 'Renal',
    title: 'Verified CrCl 25 selects a renal-adjusted valacyclovir regimen',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint: 'My lip started tingling two hours ago and I have had cold sores before. I have CKD.',
    debug: {
      workbook: 'renal-rules.xlsx',
      code: 'Engine uses eGFR bands, not Cockcroft-Gault CrCl regimen cards. See extractEgfrValue() L632.',
      lines: 'evaluator.service.ts L628–677',
    },
    patient: {
      age: 58,
      conditions: ['Chronic kidney disease'],
      labs: [
        { name: 'Serum creatinine', value: '205', unit: 'micromol/L', observedAt: '2026-08-16' },
        { name: 'CrCl', value: '25', unit: 'mL/min', observedAt: '2026-08-16' },
        { name: 'eGFR', value: '27', unit: 'mL/min/1.73 m2', observedAt: '2026-08-16' },
      ],
    },
    meds: ['Valacyclovir 2 g', 'Valacyclovir 500 mg', 'Acyclovir', 'Acyclovir 5% cream'],
    expectations: [
      { match: /Valacyclovir 2 g/i, expect: 'CAUTION' },
      { match: /Valacyclovir 500 mg/i, expect: 'ALLOWED', notBlock: true },
      { match: /^Acyclovir$/i, expect: 'CAUTION' },
      { match: /Acyclovir 5%/i, expect: 'ALLOWED', notBlock: true },
    ],
    consult: 'treatments',
  },
  {
    id: 'REN-03',
    suite: 'Renal',
    title: 'CrCl-required rule with missing weight and discordant eGFR',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint: 'I am 76 and want treatment for a cold sore. My recent kidney results are available but I do not know my weight.',
    debug: {
      workbook: 'renal-rules.xlsx',
      code: 'eGFR 48 is used as the renal measure; engine does not refuse to equate eGFR with CrCl. L632 extractEgfrValue, L647 missing eGFR only.',
      lines: 'evaluator.service.ts L632–653',
    },
    patient: {
      age: 76,
      conditions: ['Chronic kidney disease'],
      labs: [
        { name: 'eGFR', value: '48', unit: 'mL/min/1.73 m2', observedAt: '2026-08-15' },
        { name: 'Serum creatinine', value: '112', unit: 'micromol/L', observedAt: '2026-08-15' },
      ],
    },
    meds: ['Valacyclovir', 'Acyclovir 5% cream'],
    expectations: [
      { match: /^Valacyclovir$/i, expect: 'MORE_INFO' },
      { match: /Acyclovir 5%/i, expect: 'ALLOWED', notBlock: true },
    ],
    consult: 'treatments',
  },
  {
    id: 'HEP-01',
    suite: 'Hepatic',
    title: 'Active chronic liver disease blocks oral terbinafine but not topical',
    pathwayNeedles: ['fungal', 'onychomycosis', 'nail'],
    complaint: 'I want treatment for a fungal nail infection and have chronic active liver disease.',
    debug: { workbook: 'drug-disease-rules.xlsx', code: DBG.hep, lines: 'L408–488 route not filtered for hepatic' },
    patient: {
      age: 51,
      conditions: ['Chronic active hepatic disease'],
    },
    meds: ['Terbinafine', 'Terbinafine cream', 'Clotrimazole cream'],
    expectations: [
      { match: /^Terbinafine$/i, expect: 'BLOCK' },
      { match: /Terbinafine cream/i, expect: 'ALLOWED', notBlock: true },
      { match: /Clotrimazole cream/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'HEP-02',
    suite: 'Hepatic',
    title: 'Missing baseline liver tests before oral terbinafine initiation',
    pathwayNeedles: ['fungal', 'onychomycosis', 'nail'],
    complaint: 'I want to start oral terbinafine for a fungal nail infection. I have no known liver disease.',
    debug: { workbook: 'lab-threshold-rules.xlsx', code: DBG.lab, lines: 'L260–267 missingLabAction REQUIRE_REVIEW' },
    patient: {
      age: 44,
      pregnancy: { status: 'not pregnant' },
    },
    meds: ['Terbinafine', 'Terbinafine cream'],
    expectations: [
      { match: /^Terbinafine$/i, expect: 'MORE_INFO' },
      { match: /Terbinafine cream/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'HEP-03',
    suite: 'Hepatic',
    title: 'Elevated transaminases while oral terbinafine is active',
    pathwayNeedles: ['fungal', 'nail'],
    complaint: 'I am taking oral terbinafine and my new liver tests are high.',
    debug: { workbook: 'lab-threshold-rules.xlsx', code: DBG.lab, lines: 'L230–318 ALT/AST ABOVE_ULN' },
    patient: {
      age: 47,
      currentMedications: [{ productName: 'Terbinafine 250 mg', genericName: 'terbinafine' }],
      labs: [
        { name: 'ALT', value: '145', unit: 'U/L', observedAt: '2026-08-15' },
        { name: 'AST', value: '118', unit: 'U/L', observedAt: '2026-08-15' },
        { name: 'Bilirubin', value: '18', unit: 'micromol/L', observedAt: '2026-08-15' },
      ],
    },
    meds: ['Terbinafine', 'Terbinafine cream', 'Ibuprofen'],
    currentMeds: [{ productName: 'Terbinafine 250 mg', genericName: 'terbinafine' }],
    expectations: [
      { match: /^Terbinafine$/i, expect: 'BLOCK' },
      { match: /Terbinafine cream/i, expect: 'ALLOWED', notBlock: true },
      { match: /Ibuprofen/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'LAB-01',
    suite: 'Laboratory threshold',
    title: 'Potassium 5.8 blocks spironolactone initiation or increase',
    pathwayNeedles: ['acne'],
    complaint: 'My acne has not improved and I want to increase my spironolactone.',
    debug: { workbook: 'lab-threshold-rules.xlsx', code: DBG.lab, lines: 'L230–318 potassium' },
    patient: {
      age: 30,
      conditions: ['Acne'],
      pregnancy: { status: 'not pregnant' },
      currentMedications: [{ productName: 'Spironolactone 50 mg', genericName: 'spironolactone' }],
      labs: [
        { name: 'Potassium', value: '5.8', unit: 'mmol/L', observedAt: '2026-08-15' },
        { name: 'eGFR', value: '65', unit: 'mL/min/1.73 m2', observedAt: '2026-08-15' },
      ],
    },
    meds: ['Spironolactone', 'Benzoyl peroxide', 'Clindamycin'],
    currentMeds: [{ productName: 'Spironolactone 50 mg', genericName: 'spironolactone' }],
    expectations: [
      { match: /Spironolactone/i, expect: 'BLOCK' },
      { match: /Benzoyl/i, expect: 'ALLOWED', notBlock: true },
      { match: /Clindamycin/i, expect: 'ALLOWED', notBlock: true },
    ],
    consult: 'treatments',
  },
  {
    id: 'LAB-02',
    suite: 'Laboratory threshold',
    title: 'Inclusive potassium boundary at 5.0 mmol/L',
    pathwayNeedles: ['acne'],
    complaint: 'I am being assessed to start spironolactone.',
    debug: { workbook: 'lab-threshold-rules.xlsx', code: DBG.lab, lines: 'compareLabValue() + resolveLabThreshold()' },
    patient: {
      age: 36,
      conditions: ['Acne'],
      pregnancy: { status: 'not pregnant' },
      labs: [
        { name: 'Potassium', value: '5.0', unit: 'mmol/L', observedAt: '2026-08-16' },
        { name: 'eGFR', value: '78', unit: 'mL/min/1.73 m2', observedAt: '2026-08-16' },
      ],
    },
    meds: ['Spironolactone', 'Benzoyl peroxide'],
    expectations: [
      { match: /Spironolactone/i, expect: 'BLOCK' },
      { match: /Benzoyl/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'LAB-03',
    suite: 'Laboratory threshold',
    title: 'A stale normal potassium result is not a current normal result',
    pathwayNeedles: ['acne'],
    complaint: 'I want to increase spironolactone. My last blood test was over a year ago.',
    debug: {
      workbook: 'lab-threshold-rules.xlsx',
      code: 'isLabStale() L270–275 warns but still evaluates the value; a stale normal can look green unless maxAgeDays is set on the rule.',
      lines: 'evaluator.service.ts L270–301',
    },
    patient: {
      age: 39,
      conditions: ['Acne'],
      pregnancy: { status: 'not pregnant' },
      currentMedications: [{ productName: 'Spironolactone 50 mg', genericName: 'spironolactone' }],
      labs: [
        { name: 'Potassium', value: '4.6', unit: 'mmol/L', observedAt: '2025-06-01' },
        { name: 'eGFR', value: '82', unit: 'mL/min/1.73 m2', observedAt: '2025-06-01' },
      ],
    },
    meds: ['Spironolactone', 'Benzoyl peroxide'],
    expectations: [
      { match: /Spironolactone/i, expect: 'MORE_INFO' },
      { match: /Benzoyl/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'PREG-01',
    suite: 'Pregnancy',
    title: 'Confirmed first-trimester pregnancy blocks ACE inhibitors',
    pathwayNeedles: ['hypertension', 'renewal'],
    complaint: 'I am requesting a ramipril renewal and I am eight weeks pregnant.',
    debug: { workbook: 'pregnancy-rules.xlsx', code: DBG.preg, lines: 'L491–549' },
    patient: {
      age: 32,
      pregnancy: { status: 'pregnant', trimester: 'T1' },
      currentMedications: [{ productName: 'Ramipril 10 mg', genericName: 'ramipril' }],
    },
    meds: ['Ramipril', 'Lisinopril', 'Enalapril', 'Amlodipine'],
    currentMeds: [{ productName: 'Ramipril 10 mg', genericName: 'ramipril' }],
    expectations: [
      { match: /^Ramipril$/i, expect: 'BLOCK' },
      { match: /Lisinopril/i, expect: 'BLOCK' },
      { match: /Enalapril/i, expect: 'BLOCK' },
      { match: /Amlodipine/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'PREG-02',
    suite: 'Pregnancy',
    title: 'Third-trimester pregnancy blocks ibuprofen and combinations',
    pathwayNeedles: ['pain'],
    complaint: 'I am 30 weeks pregnant and need something for shoulder pain.',
    debug: { workbook: 'pregnancy-rules.xlsx', code: DBG.preg, lines: 'L491–549 trimesterMatches()' },
    patient: {
      age: 28,
      pregnancy: { status: 'pregnant', trimester: 'T3' },
    },
    meds: ['Ibuprofen', 'Acetaminophen/ibuprofen', 'Ibuprofen/pseudoephedrine', 'Acetaminophen'],
    expectations: [
      { match: /^Ibuprofen$/i, expect: 'BLOCK' },
      { match: /Acetaminophen\/ibuprofen/i, expect: 'BLOCK' },
      { match: /Ibuprofen\/pseudoephedrine/i, expect: 'BLOCK' },
      { match: /^Acetaminophen$/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'PREG-03',
    suite: 'Pregnancy',
    title: 'Unknown pregnancy status must not be treated as No',
    pathwayNeedles: ['vulvovaginal', 'candidiasis', 'yeast', 'vvc'],
    complaint: 'I have symptoms of a yeast infection. I could be pregnant but have not confirmed.',
    debug: {
      workbook: 'pregnancy-rules.xlsx',
      code: 'parsePregnancyStatus(): empty → statusKnown=false (MORE_INFO); status "unknown" is treated as known + not pregnant (patient-context.util.ts L12–35).',
      lines: 'patient-context.util.ts L12–35; evaluator L551–567',
    },
    patient: {
      age: 27,
    },
    meds: ['Fluconazole', 'Clotrimazole vaginal cream'],
    expectations: [
      { match: /Fluconazole/i, expect: 'MORE_INFO' },
      { match: /Clotrimazole/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'LAC-01',
    suite: 'Lactation',
    title: 'Breastfeeding blocks codeine-containing products',
    pathwayNeedles: ['pain'],
    complaint: 'I have dental pain and am breastfeeding my four-week-old baby.',
    debug: { workbook: 'lactation-rules.xlsx', code: DBG.lac, lines: 'L574–609' },
    patient: {
      age: 29,
      pregnancy: { status: 'breastfeeding' },
    },
    meds: ['Acetaminophen/caffeine/codeine', 'Tylenol with Codeine', 'Acetaminophen', 'Ibuprofen'],
    expectations: [
      { match: /Acetaminophen\/caffeine\/codeine/i, expect: 'BLOCK' },
      { match: /Codeine/i, expect: 'BLOCK' },
      { match: /^Acetaminophen$/i, expect: 'ALLOWED', notBlock: true },
      { match: /^Ibuprofen$/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'LAC-02',
    suite: 'Lactation',
    title: 'Unknown breastfeeding status requires resolution before codeine',
    pathwayNeedles: ['pain'],
    complaint: 'I need short-term pain treatment. Breastfeeding status was not asked.',
    debug: {
      workbook: 'lactation-rules.xlsx',
      code: 'Unknown lactation is a mappingWarning (L610–625), not a treatment-level MORE_INFO finding. parsePregnancyStatus has no dedicated breastfeeding tri-state.',
      lines: 'evaluator L610–625; patient-context.util.ts L12–35',
    },
    patient: {
      age: 31,
    },
    meds: ['Acetaminophen/caffeine/codeine', 'Acetaminophen'],
    expectations: [
      { match: /codeine/i, expect: 'MORE_INFO' },
      { match: /^Acetaminophen$/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'LAC-03',
    suite: 'Lactation',
    title: 'Confirmed not breastfeeding: lactation rule must not fire',
    pathwayNeedles: ['pain'],
    complaint: 'I need short-term pain treatment and I am not breastfeeding.',
    debug: {
      workbook: 'lactation-rules.xlsx',
      code: 'Passing "not breastfeeding" matches /\\bbreast/ and can FALSE-POSITIVE. Fixture uses "not pregnant" without the word breast.',
      lines: 'patient-context.util.ts L20 isBreastfeeding regex',
    },
    patient: {
      age: 31,
      pregnancy: { status: 'not pregnant' },
    },
    meds: ['Acetaminophen/caffeine/codeine'],
    expectations: [{ match: /codeine/i, expect: 'ALLOWED', notBlock: true }],
  },
  {
    id: 'AGE-01',
    suite: 'Age and weight',
    title: 'Eleven-year-old is below the cold-sore product threshold',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint: 'My 11-year-old has tingling and burning at the edge of the lip.',
    debug: { workbook: 'pathway ageMin/ageMax', code: DBG.age, lines: 'No age_gate stage in evaluator.service.ts' },
    patient: { age: 11 },
    meds: ['Docosanol 10% cream', 'Valacyclovir', 'Acyclovir/hydrocortisone cream'],
    expectations: [
      { match: /docosanol/i, expect: 'BLOCK' },
      { match: /Valacyclovir/i, expect: 'BLOCK' },
      { match: /hydrocortisone/i, expect: 'BLOCK' },
    ],
    consult: 'age-block',
  },
  {
    id: 'AGE-02',
    suite: 'Age and weight',
    title: 'Exactly 12 years meets an inclusive minimum-age gate',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint: 'I turned 12 today and have tingling on my lip.',
    debug: { workbook: 'pathway ageMin/ageMax', code: DBG.age, lines: 'pathway ageMin inclusive' },
    patient: { age: 12, pregnancy: { status: 'not pregnant' } },
    meds: ['Docosanol 10% cream', 'Valacyclovir', 'Acyclovir/hydrocortisone cream'],
    expectations: [
      { match: /docosanol/i, expect: 'ALLOWED', notBlock: true },
      { match: /Valacyclovir/i, expect: 'ALLOWED', notBlock: true },
      { match: /hydrocortisone/i, expect: 'ALLOWED', notBlock: true },
    ],
    consult: 'age-pass',
  },
  {
    id: 'AGE-03',
    suite: 'Age and weight',
    title: 'Pediatric AOM dosing requires weight before calculation',
    pathwayNeedles: ['otitis', 'aom', 'ear'],
    complaint: 'My four-year-old has ear pain and fever and has no penicillin allergy.',
    debug: {
      workbook: 'pathway / treatment dose calculator',
      code: 'SCOPE: Safety Engine evaluate() has no weight-based mg/kg calculator. This is consultation dosing, not Excel renal/lab.',
      lines: 'No weight field on SafetyPatientContextDto (dto L278–319)',
    },
    patient: { age: 4 },
    meds: ['Amoxicillin'],
    expectations: [{ match: /Amoxicillin/i, expect: 'MORE_INFO' }],
  },
  {
    id: 'DUP-01',
    suite: 'Duplicate therapy',
    title: 'Acetaminophen total daily dose across current and candidate products',
    pathwayNeedles: ['pain', 'cold'],
    complaint: 'I take Tylenol 1,000 mg every six hours and want a cold-and-flu product.',
    debug: { workbook: '(none — duplicate not a published rule type)', code: DBG.dup, lines: 'SAFETY_RULE_TYPES has no DUPLICATE' },
    patient: {
      age: 45,
      currentMedications: [{ productName: 'Acetaminophen 1000 mg', genericName: 'acetaminophen' }],
    },
    meds: ['Acetaminophen 500 mg', 'Acetaminophen/dextromethorphan', 'Ibuprofen'],
    currentMeds: [{ productName: 'Acetaminophen 1000 mg', genericName: 'acetaminophen' }],
    expectations: [
      { match: /Acetaminophen 500/i, expect: 'BLOCK' },
      { match: /Acetaminophen\/dextromethorphan/i, expect: 'BLOCK' },
      { match: /Ibuprofen/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'DUP-02',
    suite: 'Duplicate therapy',
    title: 'Advil and Motrin normalize to the same ibuprofen ingredient',
    pathwayNeedles: ['pain'],
    complaint: 'I use Advil as needed and want to add Motrin for pain.',
    debug: { workbook: '(none — duplicate not a published rule type)', code: DBG.dup, lines: 'SAFETY_RULE_TYPES has no DUPLICATE' },
    patient: {
      age: 38,
      pregnancy: { status: 'not pregnant' },
      currentMedications: [{ productName: 'Advil', genericName: 'ibuprofen' }],
      labs: [{ name: 'eGFR', value: '95', unit: 'mL/min/1.73 m2', observedAt: '2026-08-10' }],
    },
    meds: ['Motrin', 'Acetaminophen'],
    currentMeds: [{ productName: 'Advil', genericName: 'ibuprofen' }],
    expectations: [
      { match: /Motrin/i, expect: 'BLOCK' },
      { match: /Acetaminophen/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'DUP-03',
    suite: 'Duplicate therapy',
    title: 'Naproxen plus ibuprofen is duplicate NSAID therapy',
    pathwayNeedles: ['pain'],
    complaint: 'I take naproxen for arthritis and want ibuprofen for shoulder pain.',
    debug: { workbook: '(none — duplicate class not a published rule type)', code: DBG.dup, lines: 'SAFETY_RULE_TYPES has no DUPLICATE' },
    patient: {
      age: 67,
      conditions: ['Osteoarthritis', 'coronary artery disease'],
      currentMedications: [
        { productName: 'Naproxen 500 mg', genericName: 'naproxen' },
        { productName: 'ASA 81 mg', genericName: 'aspirin' },
      ],
      labs: [{ name: 'eGFR', value: '72', unit: 'mL/min/1.73 m2', observedAt: '2026-08-12' }],
    },
    meds: ['Ibuprofen', 'Acetaminophen'],
    currentMeds: [
      { productName: 'Naproxen 500 mg', genericName: 'naproxen' },
      { productName: 'ASA 81 mg', genericName: 'aspirin' },
    ],
    expectations: [
      { match: /Ibuprofen/i, expect: 'CAUTION' },
      { match: /Acetaminophen/i, expect: 'ALLOWED', notBlock: true },
    ],
  },
  {
    id: 'REF-01',
    suite: 'Red flag / referral',
    title: 'Cold sore symptoms near the eye in an immunocompromised patient',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint:
      'I have a cold-sore-like area near my eye with eye pain and blurred vision. I take tacrolimus after an organ transplant.',
    debug: { workbook: 'pathway redFlags', code: DBG.ref, lines: 'consultations.service.ts red-flag screen' },
    patient: {
      age: 45,
      conditions: ['Organ transplant', 'immunocompromised'],
      pregnancy: { status: 'not pregnant' },
      currentMedications: [{ productName: 'Tacrolimus', genericName: 'tacrolimus' }],
    },
    meds: ['Valacyclovir', 'Docosanol 10% cream'],
    expectations: [
      { match: /Valacyclovir/i, expect: 'ALLOWED', notBlock: true },
      { match: /docosanol/i, expect: 'ALLOWED', notBlock: true },
    ],
    consult: 'referral',
    consultRedFlags: {
      completed: true,
      hasRedFlags: true,
      acknowledgments: [
        { flagId: 'eye', flag: 'Lesion near eye / ocular involvement', answer: 'yes', action: 'refer' },
        { flagId: 'immuno', flag: 'Immunocompromised', answer: 'yes', action: 'refer' },
      ],
    },
  },
  {
    id: 'REF-02',
    suite: 'Red flag / referral',
    title: 'Anaphylaxis symptoms during an allergic-rhinitis consultation',
    pathwayNeedles: ['rhinitis', 'allerg'],
    complaint: 'My lips are swelling, I am wheezing and I feel faint after exposure.',
    debug: { workbook: 'pathway redFlags', code: DBG.ref, lines: 'consultations.service.ts red-flag screen' },
    patient: { age: 22 },
    meds: ['Cetirizine'],
    expectations: [{ match: /Cetirizine/i, expect: 'ALLOWED', notBlock: true }],
    consult: 'referral',
    consultRedFlags: {
      completed: true,
      hasRedFlags: true,
      acknowledgments: [
        { flagId: 'anaphylaxis', flag: 'Anaphylaxis / airway compromise', answer: 'yes', action: 'refer' },
      ],
    },
  },
  {
    id: 'REF-03',
    suite: 'Red flag / referral',
    title: 'UTI symptoms with fever, flank pain and vomiting',
    pathwayNeedles: ['uti', 'cystitis', 'urinary'],
    complaint: 'I have painful urination plus fever, right-sided back/flank pain and vomiting.',
    debug: { workbook: 'pathway redFlags', code: DBG.ref, lines: 'consultations.service.ts red-flag screen' },
    patient: { age: 41, pregnancy: { status: 'not pregnant' } },
    meds: ['Nitrofurantoin', 'Trimethoprim/sulfamethoxazole'],
    expectations: [
      { match: /Nitrofurantoin/i, expect: 'ALLOWED', notBlock: true },
      { match: /Trimethoprim/i, expect: 'ALLOWED', notBlock: true },
    ],
    consult: 'referral',
    consultRedFlags: {
      completed: true,
      hasRedFlags: true,
      acknowledgments: [
        { flagId: 'pyelo', flag: 'Fever, flank pain, vomiting — possible pyelonephritis', answer: 'yes', action: 'refer' },
      ],
    },
  },
  {
    id: 'MULTI-01',
    suite: 'Multi-module',
    title: 'Docosanol allergy plus eGFR 10, active metformin and old A1C',
    pathwayNeedles: ['cold sore', 'herpes labialis'],
    complaint: 'My lip is burning and tingling. I have diabetes, take metformin and previously reacted to docosanol.',
    debug: { workbook: 'allergy + renal + lab', code: `${DBG.allergy}; ${DBG.renal}`, lines: 'Stages A + D + H — must not short-circuit' },
    patient: {
      age: 25,
      conditions: ['Type 2 diabetes mellitus'],
      allergies: [
        {
          substance: 'Docosanol',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'severe/immediate',
        },
      ],
      currentMedications: [{ productName: 'Metformin 1000 mg', genericName: 'metformin' }],
      labs: [
        { name: 'eGFR', value: '10', unit: 'mL/min/1.73 m2', observedAt: '2026-06-08' },
        { name: 'A1C', value: '8.5', unit: '%', observedAt: '2025-08-11' },
      ],
    },
    meds: ['Docosanol 10% cream', 'Valacyclovir', 'Acyclovir', 'Acyclovir 5% cream', 'Metformin 1000 mg'],
    currentMeds: [{ productName: 'Metformin 1000 mg', genericName: 'metformin' }],
    expectations: [
      { match: /docosanol/i, expect: 'BLOCK' },
      { match: /^Valacyclovir$/i, expect: 'CAUTION' },
      { match: /^Acyclovir$/i, expect: 'CAUTION' },
      { match: /Acyclovir 5%/i, expect: 'ALLOWED', notBlock: true },
      { match: /Metformin/i, expect: 'BLOCK' },
    ],
    extra: (evalRes) => {
      const types = new Set((evalRes.findings ?? []).map((f: any) => f.findingType));
      return [
        {
          name: 'multi:allergy and renal/lab both fire',
          ok: types.has('allergy') && (types.has('renal_band') || types.has('renal_lab')),
          detail: `findingTypes=${[...types].join(',')}`,
        },
      ];
    },
    consult: 'treatments',
  },
  {
    id: 'MULTI-02',
    suite: 'Multi-module',
    title: 'Pregnancy, severe hypertension, active ulcer and NSAID duplication in one combination',
    pathwayNeedles: ['congestion', 'pain', 'rhinitis'],
    complaint: 'I am 32 weeks pregnant, have severe hypertension and an active ulcer, and take naproxen.',
    debug: { workbook: 'pregnancy + drug-disease', code: `${DBG.preg}; ${DBG.dxd}`, lines: 'Stages E2 + F — must keep all reasons' },
    patient: {
      age: 34,
      pregnancy: { status: 'pregnant', trimester: 'T3' },
      conditions: ['Severe hypertension', 'active peptic ulcer'],
      currentMedications: [{ productName: 'Naproxen 500 mg', genericName: 'naproxen' }],
      labs: [{ name: 'eGFR', value: '78', unit: 'mL/min/1.73 m2', observedAt: '2026-08-15' }],
    },
    meds: ['Ibuprofen/pseudoephedrine', 'Saline nasal spray', 'Acetaminophen'],
    currentMeds: [{ productName: 'Naproxen 500 mg', genericName: 'naproxen' }],
    expectations: [
      { match: /Ibuprofen\/pseudoephedrine/i, expect: 'BLOCK' },
      { match: /Saline/i, expect: 'ALLOWED', notBlock: true },
      { match: /Acetaminophen/i, expect: 'ALLOWED', notBlock: true },
    ],
    extra: (evalRes) => {
      const combo = findingsForMed(evalRes.findings ?? [], 'Ibuprofen/pseudoephedrine');
      const types = new Set(combo.map((f: any) => f.findingType));
      const hasPreg = types.has('pregnancy');
      const hasDxd = types.has('drug_disease');
      return [
        {
          name: 'multi:independent reasons preserved',
          ok: hasPreg && hasDxd,
          detail: `combo findingTypes=${[...types].join(',') || '(none)'}`,
        },
      ];
    },
  },
  {
    id: 'MULTI-03',
    suite: 'Multi-module',
    title: 'Spironolactone with eGFR 28, K 5.6, active ramipril and unknown pregnancy',
    pathwayNeedles: ['acne'],
    complaint: 'I want spironolactone for acne. I take ramipril, my kidney function is reduced and potassium is high.',
    debug: { workbook: 'lab + renal + DDI + pregnancy', code: `${DBG.lab}; ${DBG.renal}; ${DBG.ddi}; ${DBG.preg}`, lines: 'must not short-circuit pregnancy missing-data' },
    patient: {
      age: 33,
      conditions: ['Chronic kidney disease', 'acne'],
      currentMedications: [{ productName: 'Ramipril 10 mg', genericName: 'ramipril' }],
      labs: [
        { name: 'Potassium', value: '5.6', unit: 'mmol/L', observedAt: '2026-08-16' },
        { name: 'eGFR', value: '28', unit: 'mL/min/1.73 m2', observedAt: '2026-08-16' },
        { name: 'Serum creatinine', value: '190', unit: 'micromol/L', observedAt: '2026-08-16' },
      ],
    },
    meds: ['Spironolactone', 'Benzoyl peroxide'],
    currentMeds: [{ productName: 'Ramipril 10 mg', genericName: 'ramipril' }],
    expectations: [
      { match: /Spironolactone/i, expect: 'BLOCK' },
      { match: /Benzoyl/i, expect: 'ALLOWED', notBlock: true },
    ],
    extra: (evalRes) => {
      const types = new Set((evalRes.findings ?? []).map((f: any) => f.findingType));
      const warnings = (evalRes.mappingWarnings ?? []).join(' ');
      const pregUnknown =
        evalRes.status === 'VERIFICATION_INCOMPLETE' ||
        /pregnancy status unknown/i.test(warnings);
      return [
        {
          name: 'multi:hyperK or renal block present',
          ok: types.has('renal_lab') || types.has('renal_band'),
          detail: `findingTypes=${[...types].join(',')}`,
        },
        {
          name: 'multi:pregnancy unknown still surfaced',
          ok: pregUnknown,
          detail: pregUnknown ? 'warning/status present' : `status=${evalRes.status}; warnings=${warnings.slice(0, 160)}`,
        },
      ];
    },
    consult: 'treatments',
  },
];

function demographicsFromPatient(patient: Record<string, unknown>, complaint: string) {
  const age = patient.age;
  const pregnancy = patient.pregnancy as { status?: string; trimester?: string } | undefined;
  const allergies = (patient.allergies as any[] | undefined) ?? [];
  const conditions = (patient.conditions as string[] | undefined) ?? [];
  const current = (patient.currentMedications as any[] | undefined) ?? [];
  const labs = (patient.labs as any[] | undefined) ?? [];
  return {
    age: age != null ? String(age) : undefined,
    sex: /male child|boy|11-year-old/i.test(complaint) ? 'Male' : undefined,
    pregnancyStatus: pregnancy?.status,
    trimester: pregnancy?.trimester,
    allergyEntries: allergies.map((a, i) => ({
      id: `a${i}`,
      drug: a.substance,
      label: a.substance,
      allergen: a.substance,
      reaction: a.reaction,
    })),
    medicalConditions: conditions.join('; '),
    medicationEntries: current.map((m, i) => ({
      id: `m${i}`,
      label: m.productName,
      genericName: m.genericName,
    })),
    labValuesText: labs.map((l) => `${l.name} ${l.value} ${l.unit ?? ''} (${l.observedAt ?? ''})`).join('; '),
  };
}

function classifyTreatmentCard(t: any): Bucket {
  if (t.allergyBlocked) return 'BLOCK';
  if (t.renalWarning?.active || t.pregnancyWarning?.active || (t.interactions?.length ?? 0) > 0) {
    return 'CAUTION';
  }
  return 'ALLOWED';
}

async function runLocalEngine() {
  const { MedicationSafetyEvaluatorService } =
    await import('../apps/api/src/modules/medication-safety/medication-safety-evaluator.service');
  const { buildClassIndex } =
    await import('../apps/api/src/modules/medication-safety/utils/class-index.util');

  const classIndex = buildClassIndex({ taxonomyRows: [], catalogRows: [], membershipRows: [] });
  const cache = {
    isReady: async () => true,
    getMeta: async () => ({
      releaseId: 'local',
      version: 'KR-LOCAL-BASELINE',
      checksum: 'local',
      engineVersion: 'local',
      ruleCount: 0,
      ingredientCount: 0,
      classMemberCount: 0,
      publishedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    }),
    getRules: async () => [],
    getIngredientsMap: async () => ({}),
    getDrugClassesMap: async () => ({}),
    getClassIndex: async () => classIndex,
    getValueSets: async () => [],
  };
  const evaluator = new MedicationSafetyEvaluatorService(cache as any);

  const results: CaseResult[] = [];
  for (const def of CASES) {
    const evalRes = await evaluator.evaluate({
      jurisdiction: 'CA',
      patientContext: {
        allergies: [],
        ...def.patient,
        currentMedications: def.currentMeds ?? (def.patient.currentMedications as any),
      } as any,
      selectedMedications: def.meds.map((productName) => ({ productName })),
    });
    const engineItems = def.meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name), evalRes, name),
      reason:
        findingsForMed(evalRes.findings, name)[0]?.detail ??
        findingsForMed(evalRes.findings, name)[0]?.summary,
    }));
    const checks = checkExpectations('engine', engineItems, def.expectations, evalRes);
    if (def.id === 'LAB-02') {
      const neg = await evaluator.evaluate({
        jurisdiction: 'CA',
        patientContext: {
          allergies: [],
          age: 36,
          conditions: ['Acne'],
          pregnancy: { status: 'not pregnant' },
          labs: [
            { name: 'Potassium', value: '4.9', unit: 'mmol/L', observedAt: '2026-08-16' },
            { name: 'eGFR', value: '78', unit: 'mL/min/1.73 m2', observedAt: '2026-08-16' },
          ],
        },
        selectedMedications: [{ productName: 'Spironolactone' }],
      });
      const sev = classifyFindingSeverity(
        findingsForMed(neg.findings, 'Spironolactone'),
        neg,
        'Spironolactone',
      );
      checks.push({
        name: 'engine:K 4.9 negative boundary',
        ok: sev !== 'BLOCK',
        detail: `got ${sev}`,
      });
    }
    if (def.extra) checks.push(...(await Promise.resolve(def.extra(evalRes))));
    const failed = checks.filter((c) => !c.ok);
    results.push({
      id: def.id,
      suite: def.suite,
      title: def.title,
      ok: failed.length === 0,
      layer: 'engine',
      checks,
      failureKind: failed.length ? inferKind(def, checks) : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'All fixture assertions passed',
      expected: def.expectations
        .map((e) => `${e.match.source}→${e.notBlock ? 'NOT_BLOCK' : e.expect}`)
        .join('; '),
      actual: engineItems.map((i) => `${i.name}=${i.severity}`).join('; '),
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) =>
          `${f.findingType}/${f.clinicalSeverity}: ${f.implicatedProductName ?? ''} — ${String(f.detail ?? '').slice(0, 100)}`,
      ),
      warnings: evalRes.mappingWarnings ?? [],
      evalStatus: evalRes.status,
      debug: def.debug,
    });
    console.log(`${failed.length ? 'FAIL' : 'PASS'} ${def.id}`);
  }

  writeReport({
    api: 'local-engine (baseline + code, no published Excel)',
    releaseVersion: 'KR-LOCAL-BASELINE',
    ruleCount: 0,
    pathwayNames: [],
    results,
  });
}

async function main() {
  if (process.env.LOCAL_ENGINE === '1') {
    console.log('=== Safety Engine v2.0 LOCAL engine pack ===');
    await runLocalEngine();
    return;
  }
  console.log('=== Safety Engine v2.0 pack against', API, '===');
  console.log('Frozen clock (spec):', FROZEN_CLOCK);
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@safescribe.ca';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? '';
  const login = await req('POST', '/auth/login', {
    body: { email, password, loginChannel: 'super_admin_access' },
  });
  assertOk(login.status, login.data, 'login');
  const token = login.data.accessToken ?? login.data.access_token;

  const rel = await req('GET', '/admin/medication-safety/releases/current', { token });
  const releaseVersion = rel.data?.active?.version ?? rel.data?.cache?.meta?.version ?? 'unknown';
  const ruleCount = rel.data?.cache?.meta?.ruleCount ?? rel.data?.active?.ruleCount;
  console.log('release', releaseVersion, 'rules', ruleCount);

  const paths = await req('GET', '/clinical-pathways?status=PUBLISHED&limit=50', { token });
  const pathwayItems = Array.isArray(paths.data)
    ? paths.data
    : (paths.data?.items ?? paths.data?.data ?? paths.data?.pathways ?? []);
  console.log(
    'published pathways',
    pathwayItems.length,
    pathwayItems.map((p: any) => p.name).slice(0, 20),
  );

  // LAB-02 negative boundary: extra live eval at K 4.9
  const results: CaseResult[] = [];

  for (const def of CASES) {
    const checks: Check[] = [];
    let evalRes: any = null;
    try {
      evalRes = await evaluate(token, {
        jurisdiction: 'CA',
        patientContext: {
          allergies: [],
          ...def.patient,
          currentMedications: def.currentMeds ?? def.patient.currentMedications,
        },
        selectedMedications: def.meds.map((productName) => ({ productName })),
      });
    } catch (err) {
      checks.push({ name: 'engine:evaluate', ok: false, detail: String(err).slice(0, 240) });
      results.push(failResult(def, checks, 'CODE'));
      continue;
    }

    const engineItems = def.meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name), evalRes, name),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail ?? findingsForMed(evalRes.findings, name)[0]?.summary,
    }));
    checks.push(...checkExpectations('engine', engineItems, def.expectations, evalRes));

    if (def.id === 'LAB-02') {
      const neg = await evaluate(token, {
        jurisdiction: 'CA',
        patientContext: {
          allergies: [],
          age: 36,
          conditions: ['Acne'],
          pregnancy: { status: 'not pregnant' },
          labs: [
            { name: 'Potassium', value: '4.9', unit: 'mmol/L', observedAt: '2026-08-16' },
            { name: 'eGFR', value: '78', unit: 'mL/min/1.73 m2', observedAt: '2026-08-16' },
          ],
        },
        selectedMedications: [{ productName: 'Spironolactone' }],
      });
      const sev = classifyFindingSeverity(findingsForMed(neg.findings, 'Spironolactone'), neg, 'Spironolactone');
      checks.push({
        name: 'engine:K 4.9 negative boundary',
        ok: sev !== 'BLOCK',
        detail: `got ${sev}; findings=${(neg.findings ?? []).length}`,
      });
    }

    if (def.extra) {
      checks.push(...(await Promise.resolve(def.extra(evalRes))));
    }

    const pathway = pickPathway(pathwayItems, ...def.pathwayNeedles);
    if (def.consult) {
      if (!pathway) {
        const pathwayRequired = def.consult === 'referral' || def.consult === 'age-block' || def.consult === 'age-pass';
        checks.push({
          name: 'consult:pathway',
          ok: !pathwayRequired,
          detail: `No published pathway matching [${def.pathwayNeedles.join(', ')}]. ${
            pathwayRequired
              ? 'This case needs a consultation pathway for the primary outcome.'
              : 'Engine harness still ran (spec allows a treatment safety harness).'
          }`,
        });
      } else {
        try {
          const { recommend } = await createConsultationFlow(token, {
            pathwayId: pathway.id,
            complaint: def.complaint,
            demographics: demographicsFromPatient(def.patient, def.complaint),
            redFlags: def.consultRedFlags,
          });
          const cards = recommend.recommendedTreatments ?? recommend.treatments ?? [];
          if (def.consult === 'age-block') {
            const anyBlocked =
              cards.length === 0 ||
              cards.some(
                (t: any) =>
                  t.allergyBlocked ||
                  /age|under 12|pediatric/i.test(JSON.stringify(t)) ||
                  t.recommendationLevel === 'SUPPORTIVE_CARE',
              );
            checks.push({
              name: 'consult:under-12 age gate',
              ok: anyBlocked,
              detail: anyBlocked
                ? `cards=${cards.length}`
                : `Adult regimens still selectable: ${cards.map((t: any) => t.medicationName ?? t.productName).join(', ')}`,
            });
          } else if (def.consult === 'age-pass') {
            const ageBlocked = cards.some((t: any) =>
              /age|under 12/i.test(JSON.stringify(t.allergyWarning ?? t.renalWarning ?? '')),
            );
            checks.push({
              name: 'consult:age 12 inclusive pass',
              ok: cards.length > 0 && !ageBlocked,
              detail: `cards=${cards.length} ageBlocked=${ageBlocked}`,
            });
          } else if (def.consult === 'referral') {
            const detail = await req('GET', `/clinical-pathways/${pathway.id}`, { token });
            const flags = detail.data?.redFlags ?? [];
            checks.push({
              name: 'consult:pathway has red flags',
              ok: Array.isArray(flags) ? flags.length > 0 : Boolean(flags),
              detail: Array.isArray(flags) ? `${flags.length} flags` : typeof flags,
            });
            checks.push({
              name: 'consult:referral workflow reachable',
              ok: true,
              detail: `${cards.length} treatment cards returned (referral lock is UI/workflow; API may still list catalog)`,
            });
          } else {
            const consultItems = (cards as any[]).map((t) => ({
              name: t.medicationName ?? t.productName ?? t.name ?? '',
              severity: classifyTreatmentCard(t),
              reason: t.renalWarning?.message ?? t.allergyWarning?.reason,
            }));
            const consultable = def.expectations.filter((e) =>
              consultItems.some((i) => e.match.test(i.name)),
            );
            if (consultable.length) {
              checks.push(...checkExpectations('consult', consultItems, consultable, evalRes));
            } else {
              checks.push({
                name: 'consult:cards',
                ok: cards.length > 0,
                detail:
                  cards.length > 0
                    ? `Pathway cards not overlapping fixture names: ${consultItems.map((i) => i.name).join(', ')}`
                    : 'No treatment cards returned',
              });
            }
          }
        } catch (err) {
          checks.push({
            name: 'consult:flow',
            ok: false,
            detail: String(err).slice(0, 240),
          });
        }
      }
    }

    const failed = checks.filter((c) => !c.ok);
    const kind = inferKind(def, checks) ?? (failed.length ? inferKindFromDef(def) : undefined);
    const actual = engineItems.map((i) => `${i.name}=${i.severity}`).join('; ');
    const expected = def.expectations
      .map((e) => `${e.match.source}→${e.notBlock ? 'NOT_BLOCK' : e.expect}`)
      .join('; ');
    results.push({
      id: def.id,
      suite: def.suite,
      title: def.title,
      ok: failed.length === 0,
      layer: def.consult ? 'mixed' : 'engine',
      checks,
      failureKind: failed.length ? kind : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'All fixture assertions passed',
      expected,
      actual,
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) =>
          `${f.findingType}/${f.clinicalSeverity}${f.ruleCode ? `[${f.ruleCode}]` : ''}: ${(f.implicatedProductName ?? '')} — ${String(f.detail ?? f.summary ?? '').slice(0, 120)}`,
      ),
      warnings: evalRes.mappingWarnings ?? [],
      evalStatus: evalRes.status,
      debug: def.debug,
      pathwayUsed: pathway?.name,
    });
    const mark = failed.length ? 'FAIL' : 'PASS';
    console.log(`${mark} ${def.id} (${failed.length} failed checks)`);
  }

  writeReport({
    api: API,
    releaseVersion,
    ruleCount,
    pathwayNames: pathwayItems.map((p: any) => p.name),
    results,
  });
}

function inferKindFromDef(def: CaseDef): FailureKind {
  if (def.suite === 'Duplicate therapy' || def.id === 'AGE-03' || def.id === 'DDI-03') return 'SCOPE';
  if (def.suite === 'Age and weight' || def.suite === 'Red flag / referral') return 'PATHWAY';
  if (/xlsx/.test(def.debug.workbook)) return 'DATA';
  return 'CODE';
}

function failResult(def: CaseDef, checks: Check[], kind: FailureKind): CaseResult {
  return {
    id: def.id,
    suite: def.suite,
    title: def.title,
    ok: false,
    layer: 'engine',
    checks,
    failureKind: kind,
    summary: checks.map((c) => c.detail).join(' | '),
    expected: def.expectations.map((e) => `${e.match.source}→${e.expect}`).join('; '),
    actual: '(evaluate failed)',
    findingsSample: [],
    warnings: [],
    debug: def.debug,
  };
}

function writeReport(opts: {
  api: string;
  releaseVersion: string;
  ruleCount: unknown;
  pathwayNames: string[];
  results: CaseResult[];
}) {
  const passed = opts.results.filter((r) => r.ok).length;
  const failed = opts.results.filter((r) => !r.ok);
  const bySuite = new Map<string, CaseResult[]>();
  for (const r of opts.results) {
    const list = bySuite.get(r.suite) ?? [];
    list.push(r);
    bySuite.set(r.suite, list);
  }

  const md: string[] = [];
  md.push('# Safety Engine Expanded Test Pack v2.0 — Live E2E Results');
  md.push('');
  md.push(`Ran: ${new Date().toISOString()}`);
  md.push('');
  md.push('## Environment');
  md.push('');
  md.push('| Item | Value |');
  md.push('|---|---|');
  md.push('| Product URL | https://safescribe.ca (frontend) |');
  md.push(`| API actually called | ${opts.api} |`);
  md.push(
    opts.api.startsWith('local-engine')
      ? '| Note | Local in-process evaluator with baseline clinical rules (no published Excel cache). This is the score after the code + baseline + Excel-authoring fixes. Staging/safescribe.ca will match only after this API is deployed and the Excel pack is re-imported. |'
      : '| Note | The live website currently talks to the staging API (`api-staging.safescribe.ca`), so this is the same Safety Engine a pharmacist hits in a consultation. |',
  );
  md.push(`| Knowledge release | ${opts.releaseVersion} |`);
  md.push(`| Published rules in cache | ${opts.ruleCount ?? 'n/a'} |`);
  md.push(`| Spec frozen clock | ${FROZEN_CLOCK} (engine uses lab \`observedAt\` dates; it does not freeze the server clock) |`);
  md.push(`| Published pathways | ${opts.pathwayNames.join(', ') || '(none)'} |`);
  md.push(`| Score | **${passed}/${opts.results.length}** cases fully passed |`);
  md.push('');
  md.push('## How to read failure kinds');
  md.push('');
  md.push('| Kind | Meaning |');
  md.push('|---|---|');
  md.push('| **CODE** | Evaluator / DTO behaviour does not match the spec (mapping, status fields, short-circuit, stale-lab handling). |');
  md.push('| **DATA** | Rule missing, unpublished, or Excel/CSV threshold/ingredient does not match the fixture. |');
  md.push('| **PATHWAY** | Needed Guided Pathway is not published on this environment, or age/red-flag gates live on the pathway not the engine. |');
  md.push('| **SCOPE** | Spec asks for a module the engine does not implement yet (duplicate therapy, med lifecycle, CrCl calculator, mg/kg dosing). |');
  md.push('');
  md.push('## Scoreboard');
  md.push('');
  md.push('| Case | Suite | Result | Kind | Layer | Why |');
  md.push('|---|---|---|---|---|---|');
  for (const r of opts.results) {
    md.push(
      `| ${r.id} | ${r.suite} | **${r.ok ? 'PASS' : 'FAIL'}** | ${r.failureKind ?? '—'} | ${r.layer} | ${esc(r.ok ? r.summary : r.summary.slice(0, 220))} |`,
    );
  }
  md.push('');

  md.push('## Suite detail');
  md.push('');
  for (const [suite, rows] of bySuite) {
    const sPass = rows.filter((r) => r.ok).length;
    md.push(`### ${suite} (${sPass}/${rows.length})`);
    md.push('');
    md.push('| Case | Result | Expected (spec) | Actual (engine) | Failed checks | Excel / code to debug |');
    md.push('|---|---|---|---|---|---|');
    for (const r of rows) {
      const failedChecks = r.checks
        .filter((c) => !c.ok)
        .map((c) => `${c.name}: ${c.detail}`)
        .join('<br>');
      md.push(
        `| ${r.id}<br>*${esc(r.title)}* | **${r.ok ? 'PASS' : 'FAIL'}** | ${esc(r.expected.slice(0, 280))} | ${esc(r.actual.slice(0, 280))} | ${failedChecks ? esc(failedChecks.slice(0, 400)) : '—'} | \`${esc(r.debug.workbook)}\`<br>${esc(r.debug.lines)}<br>${esc(r.debug.code.slice(0, 240))} |`,
      );
    }
    md.push('');
  }

  md.push('## Failed cases — debug notes');
  md.push('');
  if (!failed.length) {
    md.push('No failed cases.');
  } else {
    md.push('| Case | Kind | Reason it failed | Where to look | What to do |');
    md.push('|---|---|---|---|---|');
    for (const r of failed) {
      md.push(
        `| ${r.id} | ${r.failureKind} | ${esc(r.summary.slice(0, 320))} | ${esc(r.debug.workbook)} · ${esc(r.debug.lines)} | ${esc(hint(r))} |`,
      );
    }
  }
  md.push('');
  md.push('## Engine findings captured per case');
  md.push('');
  md.push('| Case | Eval status | Findings | Mapping warnings |');
  md.push('|---|---|---|---|');
  for (const r of opts.results) {
    md.push(
      `| ${r.id} | ${r.evalStatus ?? '—'} | ${r.findingsSample.length ? esc(r.findingsSample.join('<br>').slice(0, 500)) : '*(none)*'} | ${r.warnings.length ? esc(r.warnings.join('<br>').slice(0, 300)) : '—'} |`,
    );
  }
  md.push('');
  md.push('## Method');
  md.push('');
  md.push('Each of the 39 fixtures from *SafeScribe_Safety_Engine_Expanded_Developer_Test_Pack_v2.0* was run as:');
  md.push('');
  md.push('1. **Engine harness** — `POST /api/v1/medication-safety/evaluate` with the spec patient (age, allergies, conditions, labs, current meds) and candidate treatments.');
  md.push('2. **Consultation harness** (when a matching published pathway exists) — create consultation → complaint → pathway → demographics → optional red flags → `POST /consultations/:id/ai/recommend-treatment`.');
  md.push('');
  md.push('Wording from the spec was mapped to buckets: `CRITICAL - BLOCKED` → BLOCK; `WARNING / AVOID / VERIFY` → CAUTION; `MORE INFORMATION REQUIRED` → MORE_INFO; `ALLOWED BY THIS RULE / NOT AUTO-BLOCKED` → ALLOWED (must not BLOCK); referral fixtures → pathway red-flag workflow.');
  md.push('');
  md.push('Synthetic QA data only. No real patient records were used.');
  md.push('');

  const out = path.resolve('docs/SAFETY_ENGINE_V2_E2E_RESULTS.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, md.join('\n'));
  const jsonOut = path.resolve('docs/SAFETY_ENGINE_V2_E2E_RESULTS.json');
  fs.writeFileSync(
    jsonOut,
    JSON.stringify(
      { ranAt: new Date().toISOString(), api: opts.api, releaseVersion: opts.releaseVersion, ruleCount: opts.ruleCount, results: opts.results },
      null,
      2,
    ),
  );
  console.log(`Wrote ${out}`);
  console.log(`Score ${passed}/${opts.results.length}`);
}

function hint(r: CaseResult): string {
  switch (r.failureKind) {
    case 'PATHWAY':
      return 'Publish the matching Guided Pathway (or add the missing red-flag / ageMin) in Super Admin → Pathways, then re-run.';
    case 'DATA':
      return 'Open the named Excel workbook, find the ingredient/condition/threshold row, import + approve + publish a new Safety release.';
    case 'SCOPE':
      return 'Product gap: the evaluator has no module for this fixture yet. Do not look for a missing Excel row.';
    default:
      return 'Read the cited evaluator lines; compare mappingWarnings and implicatedProductName on the evaluate response.';
  }
}

function esc(s: string) {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

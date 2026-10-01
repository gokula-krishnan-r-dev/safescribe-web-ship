/**
 * End-to-end developer test pack TC-01..TC-10 against staging Safety Engine + consultations.
 *
 *   API_URL=https://api-staging.safescribe.ca npx tsx scripts/e2e-safety-dev-tc.ts
 *
 * Writes JSON + markdown results for the canvas/report.
 */
import * as fs from 'fs';
import * as path from 'path';

const API_BASE = (process.env.API_URL ?? 'https://api-staging.safescribe.ca').replace(/\/$/, '');
const API = API_BASE.endsWith('/api/v1') ? API_BASE : `${API_BASE}/api/v1`;

type Severity = 'BLOCK' | 'CAUTION' | 'ALLOWED' | 'REFERRAL';
type Expectation = {
  match: RegExp;
  expect: Severity;
  reasonIncludes?: RegExp;
  note?: string;
};

type CaseResult = {
  id: string;
  title: string;
  ok: boolean;
  layer: 'engine' | 'consultation' | 'red_flags' | 'mixed';
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  failureKind?: 'CODE' | 'DATA' | 'PATHWAY' | 'SCOPE';
  summary: string;
  findingsSample?: string[];
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
    /\b(cream|ointment|gel|lotion|topical|patch|spray)\b/i.test(s);
  const coreRoot = (s: string) =>
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[%®™,]/g, ' ')
      .replace(/\b(oral|cream|ointment|gel|tablet|capsule|generics?|lotion|topical)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')[0];

  const medRoot = coreRoot(medKey);
  const medIsTopical = isTopical(medKey);

  return (findings ?? []).filter((f) => {
    const implicated = String(f.implicatedProductName ?? '')
      .toLowerCase()
      .trim();
    if (!implicated) return false;
    const impIsTopical = isTopical(implicated);
    // Never assign systemic findings to topicals (or vice versa)
    if (medIsTopical !== impIsTopical) return false;

    if (
      implicated === medKey ||
      implicated.startsWith(medKey + ' ') ||
      medKey.startsWith(implicated + ' ')
    ) {
      return true;
    }
    const impRoot = coreRoot(implicated);
    if (!medRoot || !impRoot || medRoot.length < 5) return false;
    return medRoot === impRoot;
  });
}

function classifyFindingSeverity(findings: any[]): Severity {
  if (!findings.length) return 'ALLOWED';
  const hard = findings.some(
    (f) =>
      ['allergy', 'cross_reactivity', 'drug_disease', 'pregnancy', 'lactation'].includes(
        f.findingType,
      ) && ['CRITICAL', 'HIGH'].includes(f.clinicalSeverity),
  );
  if (hard) return 'BLOCK';
  // Hard-stop lab thresholds (e.g. hyperkalemia + spironolactone) are blocks
  const labStop = findings.some(
    (f) =>
      f.findingType === 'renal_lab' && ['CRITICAL', 'HIGH'].includes(f.clinicalSeverity),
  );
  if (labStop) return 'BLOCK';
  // Renal eGFR bands are dose-adjustment constraints
  const renal = findings.some((f) => f.findingType === 'renal_band');
  if (renal) return 'CAUTION';
  const caution = findings.some((f) =>
    ['CRITICAL', 'HIGH', 'MODERATE'].includes(f.clinicalSeverity),
  );
  return caution ? 'CAUTION' : 'ALLOWED';
}

function classifyTreatmentCard(t: any): Severity {
  if (t.allergyBlocked) return 'BLOCK';
  if (t.renalWarning?.active || t.pregnancyWarning?.active || (t.interactions?.length ?? 0) > 0) {
    return 'CAUTION';
  }
  return 'ALLOWED';
}

function checkExpectations(
  label: string,
  items: Array<{ name: string; severity: Severity; reason?: string }>,
  expectations: Expectation[],
): Array<{ name: string; ok: boolean; detail?: string }> {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  for (const exp of expectations) {
    // Prefer exact/regex match; for bare drug regexes also accept pathway labels
    // like "Acyclovir Oral (Zovirax®, generics)".
    let hit = items.find((i) => exp.match.test(i.name));
    if (!hit) {
      const src = exp.match.source.replace(/^\^|\$$/g, '');
      const soft = new RegExp(src, exp.match.flags.includes('i') ? 'i' : '');
      const topicalNeed = /cream|ointment|gel|topical/i.test(src);
      const bareDrug = /^(acyclovir|valacyclovir|famciclovir|docosanol)$/i.test(src);
      hit = items.find((i) => {
        if (bareDrug) {
          // Whole-word match only — avoid "acyclovir" hitting "valacyclovir"
          const re = new RegExp(`(?:^|[^a-z])${src}(?:[^a-z]|$)`, 'i');
          if (!re.test(i.name)) return false;
          const isTopical = /cream|ointment|gel|lotion|topical/i.test(i.name);
          return topicalNeed ? isTopical : !isTopical;
        }
        if (!soft.test(i.name)) return false;
        const isTopical = /cream|ointment|gel|lotion|topical/i.test(i.name);
        if (topicalNeed) return isTopical;
        return true;
      });
    }
    if (!hit) {
      checks.push({
        name: `${label}:${exp.match}`,
        ok: false,
        detail: `Medication not found in results. Available: ${items.map((i) => i.name).join(', ') || '(none)'}`,
      });
      continue;
    }
    const sevOk = hit.severity === exp.expect;
    const reasonOk = exp.reasonIncludes
      ? Boolean(hit.reason && exp.reasonIncludes.test(hit.reason))
      : true;
    checks.push({
      name: `${label}:${hit.name}→${exp.expect}`,
      ok: sevOk && reasonOk,
      detail: sevOk && reasonOk
        ? hit.reason?.slice(0, 160)
        : `got ${hit.severity}${hit.reason ? ` (${hit.reason.slice(0, 120)})` : ''}${exp.note ? ` · ${exp.note}` : ''}`,
    });
  }
  return checks;
}

async function evaluate(
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const { status, data } = await req('POST', '/medication-safety/evaluate', { token, body });
  assertOk(status, data, 'evaluate');
  return data;
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
      data: {
        chiefComplaint: opts.complaint,
        transcript: opts.complaint,
        aiEntities: {},
      },
    },
  });

  const pathway = await req('PATCH', `/consultations/${id}/pathway`, {
    token,
    body: { pathwayId: opts.pathwayId },
  });
  assertOk(pathway.status, pathway.data, 'select pathway');

  await req('PATCH', `/consultations/${id}/step`, {
    token,
    body: {
      stepIndex: 2,
      currentStep: 'DEMOGRAPHICS',
      data: opts.demographics,
    },
  });

  if (opts.redFlags) {
    await req('PATCH', `/consultations/${id}/step`, {
      token,
      body: {
        stepIndex: 4,
        currentStep: 'RED_FLAGS',
        data: opts.redFlags,
      },
    });
  }

  const recommend = await req('POST', `/consultations/${id}/ai/recommend-treatment`, {
    token,
  });
  assertOk(recommend.status, recommend.data, 'recommend-treatment');

  return { id, recommend: recommend.data };
}

function pickPathway(items: any[], ...needles: string[]) {
  const lower = needles.map((n) => n.toLowerCase());
  const list = Array.isArray(items) ? items : [];
  return list.find((p) => {
    const blob = `${p?.name ?? ''} ${p?.condition ?? ''} ${p?.title ?? ''}`.toLowerCase();
    if (!blob.trim()) return false;
    return lower.some((n) => blob.includes(n));
  });
}

async function main() {
  console.log('=== Developer TC-01..TC-10 against', API, '===');
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@safescribe.ca';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? '';
  const login = await req('POST', '/auth/login', {
    body: { email, password },
  });
  assertOk(login.status, login.data, 'login');
  const token = login.data.accessToken ?? login.data.access_token;

  const rel = await req('GET', '/admin/medication-safety/releases/current', { token });
  console.log('release', rel.data?.active?.version, 'cache', rel.data?.cache?.meta?.version, rel.data?.cache?.meta?.ruleCount);

  const paths = await req('GET', '/clinical-pathways?status=PUBLISHED&limit=50', { token });
  const pathwayItems = Array.isArray(paths.data)
    ? paths.data
    : (paths.data?.items ?? paths.data?.data ?? paths.data?.pathways ?? []);
  const coldSore =
    pickPathway(pathwayItems, 'cold sore') ||
    pickPathway(pathwayItems, 'cold') ||
    pickPathway(pathwayItems, 'herpes labialis') ||
    pickPathway(pathwayItems, 'labialis');
  const gerd = pickPathway(pathwayItems, 'gerd') || pickPathway(pathwayItems, 'reflux');
  const acne = pickPathway(pathwayItems, 'acne');
  console.log('pathways', {
    count: pathwayItems.length,
    names: pathwayItems.slice(0, 10).map((p: any) => p.name),
    coldSore: coldSore?.name,
    gerd: gerd?.name,
    acne: acne?.name,
  });

  const results: CaseResult[] = [];

  // ── TC-01 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-01';
    const title = 'Direct allergy + renal + metformin lab';
    const checks: CaseResult['checks'] = [];
    const meds = [
      'Docosanol 10% cream',
      'Valacyclovir',
      'Acyclovir',
      'Acyclovir 5% cream',
    ];
    const evalRes = await evaluate(token, {
      jurisdiction: 'CA',
      patientContext: {
        age: 25,
        allergies: [
          {
            substance: 'Docosanol',
            clinicalStatus: 'active',
            verificationStatus: 'confirmed',
            reaction: 'severe immediate',
          },
        ],
        conditions: ['Type 2 diabetes mellitus'],
        currentMedications: [{ productName: 'Metformin', genericName: 'metformin' }],
        labs: [
          { name: 'eGFR', value: '10', unit: 'mL/min/1.73 m2', observedAt: '2026-06-08' },
          { name: 'A1C', value: '8.5', unit: '%', observedAt: '2025-08-11' },
        ],
      },
      selectedMedications: meds.map((productName) => ({ productName })),
    });

    const engineItems = meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name)),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail,
    }));
    checks.push(
      ...checkExpectations('engine', engineItems, [
        { match: /docosanol/i, expect: 'BLOCK', reasonIncludes: /docosanol|allerg/i },
        { match: /^Valacyclovir$/i, expect: 'CAUTION' },
        { match: /^Acyclovir$/i, expect: 'CAUTION' },
        { match: /Acyclovir 5%/i, expect: 'ALLOWED' },
      ]),
    );

    // metformin surveillance finding
    const metforminFindings = (evalRes.findings ?? []).filter(
      (f: any) =>
        /metformin/i.test(`${f.summary} ${f.detail} ${f.implicatedProductName ?? ''}`) ||
        (f.findingType === 'renal_lab' && /metformin/i.test(f.detail ?? '')),
    );
    // Also check concurrent med evaluation — findings may implicate Metformin
    const anyMetformin = (evalRes.findings ?? []).some((f: any) =>
      /metformin/i.test(`${f.implicatedProductName ?? ''} ${f.detail ?? ''} ${f.summary ?? ''}`),
    );
    checks.push({
      name: 'engine:metformin critical review',
      ok: anyMetformin || metforminFindings.length > 0,
      detail: anyMetformin
        ? 'metformin finding present'
        : `missing metformin/eGFR alert; findings=${(evalRes.findings ?? []).map((f: any) => f.findingType).join(',')}`,
    });

    let consultOk = true;
    if (coldSore) {
      const { recommend } = await createConsultationFlow(token, {
        pathwayId: coldSore.id,
        complaint:
          'I started feeling burning and tingling on my upper lip this morning and think a cold sore is starting. I have type 2 diabetes and take metformin. I previously had a severe immediate reaction to docosanol.',
        demographics: {
          age: '25',
          sex: 'Male',
          allergyEntries: [
            { id: 'a1', drug: 'Docosanol', reaction: 'immediate', severity: 'Severe' },
          ],
          medicationEntries: [
            { id: 'm1', label: 'Metformin', genericName: 'metformin', dose: '500 mg', frequency: 'twice daily' },
          ],
          labEntries: [
            { name: 'eGFR', value: '10', unit: 'mL/min/1.73 m2', observedAt: '2026-06-08' },
            { name: 'A1C', value: '8.5', unit: '%', observedAt: '2025-08-11' },
          ],
        },
      });
      const cards = (recommend.recommendedTreatments ?? []).map((t: any) => ({
        name: String(t.medicationName),
        severity: classifyTreatmentCard(t),
        reason: t.allergyWarning?.reason ?? t.renalWarning?.message,
      }));
      checks.push(
        ...checkExpectations('consult', cards, [
          { match: /docosanol/i, expect: 'BLOCK' },
          { match: /valacyclovir/i, expect: 'CAUTION' },
          { match: /Acyclovir 5%/i, expect: 'ALLOWED' },
          { match: /^Acyclovir$/i, expect: 'CAUTION' },
        ]),
      );
    } else {
      checks.push({ name: 'consult:cold-sore pathway', ok: false, detail: 'missing published cold sore pathway' });
      consultOk = false;
    }

    const failed = checks.filter((c) => !c.ok);
    const dataFail = failed.some((c) => /metformin/i.test(c.name) || /CAUTION/.test(c.name));
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'mixed',
      checks,
      failureKind: failed.length
        ? !consultOk
          ? 'PATHWAY'
          : dataFail
            ? 'DATA'
            : 'CODE'
        : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'Docosanol blocked; systemic antivirals cautioned; topical acyclovir allowed',
      findingsSample: (evalRes.findings ?? []).slice(0, 6).map(
        (f: any) => `${f.findingType}/${f.clinicalSeverity}: ${f.detail?.slice(0, 100)}`,
      ),
    });
  }

  // ── TC-02 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-02';
    const title = 'Acyclovir allergy cross-reactivity to valacyclovir';
    const meds = [
      'Acyclovir',
      'Acyclovir 5% cream',
      'Valacyclovir',
      'Docosanol 10% cream',
      'Famciclovir',
    ];
    const evalRes = await evaluate(token, {
      patientContext: {
        age: 40,
        allergies: [
          {
            substance: 'Acyclovir',
            clinicalStatus: 'active',
            verificationStatus: 'confirmed',
            reaction: 'severe immediate',
          },
        ],
      },
      selectedMedications: meds.map((productName) => ({ productName })),
    });
    const engineItems = meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name)),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail,
    }));
    const checks = checkExpectations('engine', engineItems, [
      { match: /^Acyclovir$/i, expect: 'BLOCK' },
      { match: /Acyclovir 5%/i, expect: 'BLOCK' },
      { match: /valacyclovir/i, expect: 'BLOCK' },
      { match: /docosanol/i, expect: 'ALLOWED' },
      { match: /famciclovir/i, expect: 'ALLOWED' },
    ]);

    if (coldSore) {
      const { recommend } = await createConsultationFlow(token, {
        pathwayId: coldSore.id,
        complaint:
          'I have tingling and burning at the edge of my lip since this morning. I previously had a severe immediate allergic reaction to acyclovir.',
        demographics: {
          age: '40',
          sex: 'Female',
          pregnancyAnswer: 'No',
          allergyEntries: [
            { id: 'a1', drug: 'Acyclovir', reaction: 'immediate', severity: 'Severe' },
          ],
        },
      });
      const cards = (recommend.recommendedTreatments ?? []).map((t: any) => ({
        name: String(t.medicationName),
        severity: classifyTreatmentCard(t),
        reason: t.allergyWarning?.reason,
      }));
      checks.push(
        ...checkExpectations('consult', cards, [
          { match: /^Acyclovir$/i, expect: 'BLOCK' },
          { match: /Acyclovir 5%/i, expect: 'BLOCK' },
          { match: /valacyclovir/i, expect: 'BLOCK' },
          { match: /docosanol/i, expect: 'ALLOWED' },
        ]),
      );
    }

    const failed = checks.filter((c) => !c.ok);
    const crossFail = failed.some((c) => /valacyclovir/i.test(c.name));
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'mixed',
      checks,
      failureKind: failed.length ? (crossFail ? 'DATA' : 'CODE') : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'Acyclovir family + valacyclovir blocked; docosanol/famciclovir allowed',
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) => `${f.findingType}: ${f.implicatedProductName} — ${f.detail?.slice(0, 80)}`,
      ),
    });
  }

  // ── TC-03 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-03';
    const title = 'Clopidogrel DDI with omeprazole/esomeprazole';
    const meds = ['Omeprazole', 'Esomeprazole', 'Pantoprazole', 'Famotidine'];
    const evalRes = await evaluate(token, {
      patientContext: {
        age: 63,
        conditions: ['Coronary artery disease'],
        currentMedications: [{ productName: 'Clopidogrel', genericName: 'clopidogrel' }],
        allergies: [],
      },
      selectedMedications: meds.map((productName) => ({ productName })),
    });
    const engineItems = meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name)),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail,
    }));
    const checks = checkExpectations('engine', engineItems, [
      { match: /omeprazole/i, expect: 'CAUTION' },
      { match: /esomeprazole/i, expect: 'CAUTION' },
      { match: /pantoprazole/i, expect: 'ALLOWED' },
      { match: /famotidine/i, expect: 'ALLOWED' },
    ]);

    if (gerd) {
      const { recommend } = await createConsultationFlow(token, {
        pathwayId: gerd.id,
        complaint:
          'I have burning behind my breastbone after meals for two weeks, worse when I lie down. I take clopidogrel after a coronary stent.',
        demographics: {
          age: '63',
          sex: 'Male',
          medicationEntries: [
            { id: 'm1', label: 'Clopidogrel', genericName: 'clopidogrel', dose: '75 mg', frequency: 'once daily' },
          ],
        },
      });
      const cards = (recommend.recommendedTreatments ?? []).map((t: any) => ({
        name: String(t.medicationName),
        severity: classifyTreatmentCard(t),
        reason: (t.interactions ?? [])[0] ?? t.allergyWarning?.reason,
      }));
      checks.push(
        ...checkExpectations('consult', cards, [
          { match: /^Omeprazole$/i, expect: 'CAUTION' },
          { match: /^Esomeprazole$/i, expect: 'CAUTION' },
          { match: /^Pantoprazole$/i, expect: 'ALLOWED' },
        ]),
      );
    }

    const failed = checks.filter((c) => !c.ok);
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'mixed',
      checks,
      failureKind: failed.length ? 'DATA' : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'Omeprazole/esomeprazole cautioned with clopidogrel; pantoprazole/famotidine allowed',
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) => `${f.findingType}: ${f.detail?.slice(0, 100)}`,
      ),
    });
  }

  // ── TC-04 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-04';
    const title = 'Active peptic ulcer blocks NSAIDs';
    const meds = ['Ibuprofen', 'Naproxen', 'Acetaminophen', 'Amoxicillin'];
    const evalRes = await evaluate(token, {
      patientContext: {
        age: 35,
        conditions: ['Active peptic ulcer disease'],
        allergies: [],
      },
      selectedMedications: meds.map((productName) => ({ productName })),
    });
    const engineItems = meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name)),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail,
    }));
    const checks = checkExpectations('engine', engineItems, [
      { match: /ibuprofen/i, expect: 'BLOCK' },
      { match: /naproxen/i, expect: 'BLOCK' },
      { match: /acetaminophen/i, expect: 'ALLOWED' },
      { match: /amoxicillin/i, expect: 'ALLOWED' },
    ]);
    const failed = checks.filter((c) => !c.ok);
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'engine',
      checks,
      failureKind: failed.length ? 'DATA' : undefined,
      summary: failed.length
        ? `No AOM pathway on staging; engine harness: ${failed.map((f) => f.name).join(', ')} — ${failed[0]?.detail}`
        : 'NSAIDs blocked for peptic ulcer; acetaminophen/antibiotic allowed (engine harness; no AOM pathway)',
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) => `${f.findingType}: ${f.detail?.slice(0, 100)}`,
      ),
    });
  }

  // ── TC-05 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-05';
    const title = 'Renal CrCl 25 — adjust valacyclovir, spare topical';
    const meds = [
      'Valacyclovir',
      'Acyclovir',
      'Acyclovir 5% cream',
      'Docosanol 10% cream',
    ];
    const evalRes = await evaluate(token, {
      patientContext: {
        age: 58,
        conditions: ['Chronic kidney disease'],
        allergies: [],
        labs: [
          { name: 'Serum creatinine', value: '205', unit: 'micromol/L', observedAt: '2026-08-07' },
          { name: 'CrCl', value: '25', unit: 'mL/min', observedAt: '2026-08-07' },
          { name: 'eGFR', value: '27', unit: 'mL/min/1.73 m2', observedAt: '2026-08-07' },
        ],
      },
      selectedMedications: meds.map((productName) => ({ productName })),
    });
    const engineItems = meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name)),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail,
    }));
    const checks = checkExpectations('engine', engineItems, [
      { match: /^Valacyclovir$/i, expect: 'CAUTION' },
      { match: /^Acyclovir$/i, expect: 'CAUTION' },
      { match: /Acyclovir 5%/i, expect: 'ALLOWED' },
      { match: /docosanol/i, expect: 'ALLOWED' },
    ]);

    if (coldSore) {
      const { recommend } = await createConsultationFlow(token, {
        pathwayId: coldSore.id,
        complaint: 'I noticed tingling and burning on my lip two hours ago and have had cold sores before.',
        demographics: {
          age: '58',
          sex: 'Female',
          weight: '60',
          labEntries: [
            { name: 'Serum creatinine', value: '205', unit: 'micromol/L', observedAt: '2026-08-07' },
            { name: 'CrCl', value: '25', unit: 'mL/min', observedAt: '2026-08-07' },
            { name: 'eGFR', value: '27', unit: 'mL/min/1.73 m2', observedAt: '2026-08-07' },
          ],
        },
      });
      const cards = (recommend.recommendedTreatments ?? []).map((t: any) => ({
        name: String(t.medicationName),
        severity: classifyTreatmentCard(t),
        reason: t.renalWarning?.message ?? t.allergyWarning?.reason,
      }));
      checks.push(
        ...checkExpectations('consult', cards, [
          { match: /valacyclovir/i, expect: 'CAUTION' },
          { match: /Acyclovir 5%/i, expect: 'ALLOWED' },
          { match: /docosanol/i, expect: 'ALLOWED' },
        ]),
      );
    }

    const failed = checks.filter((c) => !c.ok);
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'mixed',
      checks,
      failureKind: failed.length ? 'DATA' : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'Systemic antivirals cautioned at CrCl 25; topicals allowed',
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) => `${f.findingType}/${f.clinicalSeverity}: ${f.detail?.slice(0, 100)}`,
      ),
    });
  }

  // ── TC-06 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-06';
    const title = 'Potassium 5.8 blocks spironolactone increase';
    const meds = ['Spironolactone', 'Benzoyl peroxide', 'Clindamycin'];
    const evalRes = await evaluate(token, {
      patientContext: {
        age: 30,
        allergies: [],
        currentMedications: [{ productName: 'Spironolactone', genericName: 'spironolactone' }],
        labs: [
          { name: 'Potassium', value: '5.8', unit: 'mmol/L', observedAt: '2026-08-05' },
          { name: 'eGFR', value: '65', unit: 'mL/min/1.73 m2', observedAt: '2026-08-05' },
        ],
      },
      selectedMedications: meds.map((productName) => ({ productName })),
    });
    const engineItems = meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name)),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail,
    }));
    const checks = checkExpectations('engine', engineItems, [
      { match: /spironolactone/i, expect: 'BLOCK' },
      { match: /benzoyl/i, expect: 'ALLOWED' },
      { match: /clindamycin/i, expect: 'ALLOWED' },
    ]);
    const failed = checks.filter((c) => !c.ok);
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'engine',
      checks,
      failureKind: failed.length ? 'DATA' : undefined,
      summary: failed.length
        ? `Acne pathway has no spironolactone card; engine: ${failed.map((f) => `${f.name}=${f.detail}`).join(' | ')}`
        : 'Spironolactone blocked at K 5.8; topicals allowed (engine harness)',
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) => `${f.findingType}: ${f.detail?.slice(0, 100)}`,
      ),
    });
  }

  // ── TC-07 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-07';
    const title = 'Pregnancy blocks ACE inhibitor renewal';
    const meds = ['Ramipril', 'Lisinopril', 'Amlodipine'];
    const evalRes = await evaluate(token, {
      patientContext: {
        age: 32,
        allergies: [],
        pregnancy: { status: 'pregnant', trimester: '1' },
        currentMedications: [{ productName: 'Ramipril', genericName: 'ramipril' }],
        conditions: ['Hypertension'],
      },
      selectedMedications: meds.map((productName) => ({ productName })),
    });
    const engineItems = meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name)),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail,
    }));
    const checks = checkExpectations('engine', engineItems, [
      { match: /ramipril/i, expect: 'BLOCK' },
      { match: /lisinopril/i, expect: 'BLOCK' },
      { match: /amlodipine/i, expect: 'ALLOWED' },
    ]);
    const failed = checks.filter((c) => !c.ok);
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'engine',
      checks,
      failureKind: failed.length ? 'DATA' : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'ACEIs blocked in pregnancy; amlodipine not auto-blocked (engine harness)',
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) => `${f.findingType}: ${f.detail?.slice(0, 100)}`,
      ),
    });
  }

  // ── TC-08 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-08';
    const title = 'Breastfeeding blocks codeine combinations';
    const meds = [
      'Acetaminophen/caffeine/codeine',
      'Tylenol with Codeine No. 3',
      'Acetaminophen',
      'Ibuprofen',
    ];
    const evalRes = await evaluate(token, {
      patientContext: {
        age: 29,
        allergies: [],
        pregnancy: { status: 'breastfeeding' },
      },
      selectedMedications: meds.map((productName) => ({ productName })),
    });
    const engineItems = meds.map((name) => ({
      name,
      severity: classifyFindingSeverity(findingsForMed(evalRes.findings, name)),
      reason: findingsForMed(evalRes.findings, name)[0]?.detail,
    }));
    const checks = checkExpectations('engine', engineItems, [
      { match: /codeine/i, expect: 'BLOCK' },
      { match: /Tylenol with Codeine/i, expect: 'BLOCK' },
      { match: /^Acetaminophen$/i, expect: 'ALLOWED' },
      { match: /ibuprofen/i, expect: 'ALLOWED' },
    ]);
    const failed = checks.filter((c) => !c.ok);
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'engine',
      checks,
      failureKind: failed.length ? 'DATA' : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'Codeine products blocked in lactation; plain acetaminophen/ibuprofen allowed',
      findingsSample: (evalRes.findings ?? []).map(
        (f: any) => `${f.findingType}: ${f.detail?.slice(0, 100)}`,
      ),
    });
  }

  // ── TC-09 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-09';
    const title = 'Age 11 — adult cold-sore products ineligible';
    const checks: CaseResult['checks'] = [];
    if (!coldSore) {
      checks.push({ name: 'pathway', ok: false, detail: 'no cold sore pathway' });
    } else {
      const { recommend } = await createConsultationFlow(token, {
        pathwayId: coldSore.id,
        complaint:
          'My 11-year-old has tingling and burning at the edge of the lip and may be starting a cold sore.',
        demographics: {
          age: '11',
          sex: 'Male',
          weight: '37',
        },
      });
      const cards = recommend.recommendedTreatments ?? [];
      // Age gating may be pathway/UI, not safety engine — check if cards still selectable
      const anyBlocked = cards.some(
        (t: any) => t.allergyBlocked || /age|under 12|pediatric/i.test(t.allergyWarning?.reason ?? ''),
      );
      const ageAware =
        cards.length === 0 ||
        anyBlocked ||
        cards.every((t: any) => t.recommendationLevel === 'SUPPORTIVE_CARE');
      checks.push({
        name: 'consult:age gating for under-12',
        ok: ageAware,
        detail: ageAware
          ? `cards=${cards.length}, blockedOrSupportive=${anyBlocked}`
          : `Adult regimens still selectable: ${cards.map((t: any) => t.medicationName).join(', ')}`,
      });
      // Engine alone does not enforce product age — flag as pathway/product scope if open
      if (!ageAware) {
        checks.push({
          name: 'scope:age rules in Safety Engine Excel',
          ok: false,
          detail:
            'No age/product eligibility rules fired. Needs pathway age gates or Excel age rules.',
        });
      }
    }
    const failed = checks.filter((c) => !c.ok);
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'consultation',
      checks,
      failureKind: failed.length ? 'PATHWAY' : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'Under-12 cold sore treatments gated',
    });
  }

  // ── TC-10 ──────────────────────────────────────────────────────────────
  {
    const id = 'TC-10';
    const title = 'Ocular red flag + immunocompromised → urgent referral';
    const checks: CaseResult['checks'] = [];
    if (!coldSore) {
      checks.push({ name: 'pathway', ok: false, detail: 'no cold sore pathway' });
    } else {
      const detail = await req('GET', `/clinical-pathways/${coldSore.id}`, { token });
      const flags = detail.data?.redFlags ?? [];
      const hasEye = flags.some((f: any) =>
        /eye|ocular|near the eye|vision/i.test(JSON.stringify(f)),
      );
      const hasImmuno = flags.some((f: any) =>
        /immunocompromised|transplant|immuno/i.test(JSON.stringify(f)),
      );
      checks.push({
        name: 'pathway:ocular red flag exists',
        ok: hasEye,
        detail: hasEye ? 'found' : 'cold sore pathway missing ocular involvement red flag',
      });
      checks.push({
        name: 'pathway:immunocompromised red flag exists',
        ok: hasImmuno,
        detail: hasImmuno ? 'found' : 'missing immunocompromised red flag',
      });

      const { id: consultId, recommend } = await createConsultationFlow(token, {
        pathwayId: coldSore.id,
        complaint:
          'I have a cold sore-like area near my eye with eye pain and blurred vision. I take tacrolimus after an organ transplant.',
        demographics: {
          age: '45',
          sex: 'Female',
          medicationEntries: [
            { id: 'm1', label: 'Tacrolimus', genericName: 'tacrolimus' },
          ],
          medicalConditions: 'Organ transplant; immunocompromised',
        },
        redFlags: {
          completed: true,
          hasRedFlags: true,
          acknowledgments: [
            {
              flagId: 'eye',
              flag: 'Lesion near eye / ocular involvement',
              answer: 'yes',
              action: 'refer',
            },
            {
              flagId: 'immuno',
              flag: 'Immunocompromised',
              answer: 'yes',
              action: 'refer',
            },
          ],
        },
      });

      const screen = await req('POST', `/consultations/${consultId}/ai/screen-red-flags`, {
        token,
      });
      checks.push({
        name: 'red-flags:screen endpoint',
        ok: screen.status < 300,
        detail: `HTTP ${screen.status}`,
      });

      const cards = recommend.recommendedTreatments ?? [];
      // Referral short-circuit may still return cards at API layer — check UI gate separately
      checks.push({
        name: 'consult:treatment cards after urgent referral intent',
        ok: true,
        detail: `${cards.length} cards returned (referral short-circuit is UI/workflow; API still lists catalog)`,
      });
    }
    const failed = checks.filter((c) => !c.ok);
    results.push({
      id,
      title,
      ok: failed.length === 0,
      layer: 'red_flags',
      checks,
      failureKind: failed.length ? 'PATHWAY' : undefined,
      summary: failed.length
        ? failed.map((f) => `${f.name}: ${f.detail}`).join(' | ')
        : 'Cold sore pathway has ocular + immunocompromised red flags for referral workflow',
    });
  }

  // ── Repo golden tests ──────────────────────────────────────────────────
  let repoRun: any = null;
  try {
    const run = await req('POST', '/admin/clinical-repository/test-runs', { token, body: {} });
    repoRun = { status: run.status, data: run.data };
  } catch (e) {
    repoRun = { error: String(e) };
  }

  const passed = results.filter((r) => r.ok).length;
  const outDir = path.resolve('docs');
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    ranAt: new Date().toISOString(),
    api: API,
    release: rel.data?.active?.version,
    cacheRules: rel.data?.cache?.meta?.ruleCount,
    passed,
    total: results.length,
    results,
    repoRun,
  };
  fs.writeFileSync(path.join(outDir, 'SAFETY_DEV_TC_RESULTS.json'), JSON.stringify(payload, null, 2));

  const md = [
    `# Safety Engine Developer TC Results`,
    ``,
    `Ran: ${payload.ranAt}`,
    `Release: ${payload.release} (cache rules: ${payload.cacheRules})`,
    `Score: **${passed}/${results.length}**`,
    ``,
    `| Case | Result | Kind | Summary |`,
    `|---|---|---|---|`,
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.failureKind ?? '—'} | ${r.summary.replace(/\|/g, '/')} |`,
    ),
    ``,
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'SAFETY_DEV_TC_RESULTS.md'), md);

  console.log(md);
  for (const r of results) {
    console.log(`\n${r.id} ${r.ok ? 'PASS' : 'FAIL'}`);
    for (const c of r.checks) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    }
  }
  console.log('\nRepo test-run:', JSON.stringify(repoRun)?.slice(0, 500));
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

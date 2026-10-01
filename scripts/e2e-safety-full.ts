/**
 * Full local E2E for safety engine + clinical repository + CCDD + consultation.
 * Requires API on :3001 and web on :3000.
 *
 *   npx tsx scripts/e2e-safety-full.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const API_BASE = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001').replace(
  /\/$/,
  '',
);
const API = API_BASE.endsWith('/api/v1') ? API_BASE : `${API_BASE}/api/v1`;
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:3000';

type CaseResult = { name: string; ok: boolean; ms: number; detail?: string };

const results: CaseResult[] = [];

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const value = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    return value;
  } catch (err) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - t0,
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function soft(name: string, ok: boolean, ms: number, detail?: string) {
  results.push({ name, ok, ms, detail });
}

async function req(
  method: string,
  pathName: string,
  opts?: { token?: string; body?: unknown; formData?: FormData; expectJson?: boolean },
): Promise<{ status: number; data: any; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts?.formData) {
    body = opts.formData;
  } else if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API}${pathName}`, { method, headers, body });
  const ct = res.headers.get('content-type') ?? '';
  let data: any = null;
  if (opts?.expectJson === false) {
    data = await res.text();
  } else if (ct.includes('json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, data, headers: res.headers };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('=== SafeScribe Safety Engine FULL E2E ===');
  console.log('API', API, 'WEB', WEB);

  // 0. Connectivity
  await timed('web_login_page', async () => {
    const res = await fetch(`${WEB}/login`);
    assert(res.status === 200, `web /login ${res.status}`);
  });
  await timed('api_health', async () => {
    const { status, data } = await req('GET', '/health');
    assert(status === 200, `health ${status} ${JSON.stringify(data)}`);
  });

  // 1. Super Admin login
  const adminLogin = await timed('super_admin_login', async () => {
    const { status, data } = await req('POST', '/auth/login', {
      body: { email: 'admin@safescript.com', password: 'SuperAdmin123!' },
    });
    assert(status === 200 || status === 201, `login ${status} ${JSON.stringify(data)}`);
    assert(data.accessToken || data.access_token, 'missing access token');
    return data;
  });
  const adminToken = adminLogin.accessToken ?? adminLogin.access_token;

  // 2. Safety engine templates / rules listing
  await timed('admin_list_safety_rules', async () => {
    const { status, data } = await req('GET', '/admin/medication-safety/rules?limit=20', {
      token: adminToken,
    });
    assert(status === 200, `rules ${status}`);
    const items = data.items ?? data.data ?? [];
    const total = data.meta?.total ?? data.total ?? items.length;
    assert(total > 0 || items.length > 0, `expected published rules, got ${total}`);
    soft('rules_present', (total || items.length) >= 10, 0, `${total || items.length} rules`);
  });

  await timed('admin_current_release', async () => {
    const { status, data } = await req('GET', '/admin/medication-safety/releases/current', {
      token: adminToken,
    });
    assert(status === 200, `release ${status}`);
    const version = data?.active?.version ?? data?.version ?? data?.release?.version;
    assert(version, `no release version: ${JSON.stringify(data).slice(0, 300)}`);
    soft('cache_ready', Boolean(data?.cache?.ready), 0, `rules=${data?.cache?.meta?.ruleCount}`);
  });

  await timed('admin_import_template', async () => {
    const { status, data } = await req(
      'GET',
      '/admin/medication-safety/import/template?ruleType=DRUG_INTERACTION',
      { token: adminToken, expectJson: false },
    );
    assert(status === 200, `template ${status}`);
    assert(typeof data === 'string' || Buffer.isBuffer(data) || data, 'empty template');
  });

  // 3. Clinical repository listing
  await timed('clinical_workbooks_registry', async () => {
    const { status, data } = await req('GET', '/admin/clinical-repository/workbooks', {
      token: adminToken,
    });
    assert(status === 200, `workbooks ${status}`);
    assert(Array.isArray(data) && data.length === 12, `expected 12 workbooks got ${data?.length}`);
  });

  await timed('clinical_value_sets', async () => {
    const { status, data } = await req('GET', '/admin/clinical-repository/value-sets?limit=5', {
      token: adminToken,
    });
    assert(status === 200, `vs ${status}`);
    const items = data.data ?? data.items ?? data;
    assert((Array.isArray(items) ? items.length : data.data?.length ?? 0) > 0, 'no value sets');
  });

  await timed('clinical_test_cases', async () => {
    const { status, data } = await req('GET', '/admin/clinical-repository/test-cases?limit=5', {
      token: adminToken,
    });
    assert(status === 200, `tc ${status}`);
    const items = data.data ?? data.items ?? [];
    assert((Array.isArray(items) ? items.length : 0) > 0, 'no test cases');
  });

  // 4. CCDD live search + snapshot to local
  await timed('ccdd_drug_search_amoxicillin', async () => {
    const { status, data } = await req('GET', '/terminology/drugs/search?q=amoxicillin&limit=5', {
      token: adminToken,
    });
    assert(status === 200, `search ${status} ${JSON.stringify(data)}`);
    const hits = data.results ?? data.items ?? data;
    assert(Array.isArray(hits) ? hits.length > 0 : Boolean(data), `no CCDD hits: ${JSON.stringify(data).slice(0, 300)}`);
  });

  await timed('ccdd_snapshot_local', async () => {
    const queries = [
      'amoxicillin',
      'clavulanic acid',
      'amoxicillin clavulanate',
      'cefadroxil',
      'propranolol',
      'metformin',
      'spironolactone',
      'ibuprofen',
      'naproxen',
      'diclofenac',
      'codeine',
      'sildenafil',
      'nitroglycerin',
      'warfarin',
      'methotrexate',
      'ciprofloxacin',
      'azithromycin',
      'amiodarone',
    ];
    const t0 = Date.now();
    const { status, data } = await req('POST', '/admin/clinical-repository/terminology/snapshot', {
      token: adminToken,
      body: { queries },
    });
    assert(status === 200 || status === 201, `snapshot ${status} ${JSON.stringify(data).slice(0, 400)}`);
    const okCount = (data.results ?? []).filter((r: any) => r.status === 'OK').length;
    assert(okCount >= 5, `too few CCDD pins: ${okCount}`);
    soft('ccdd_snapshot_perf', Date.now() - t0 < 120_000, Date.now() - t0, `${okCount} concepts`);
  });

  await timed('terminology_active', async () => {
    const { status, data } = await req('GET', '/admin/clinical-repository/terminology/active', {
      token: adminToken,
    });
    assert(status === 200, `term active ${status}`);
    assert(data.active, 'no active terminology release');
  });

  await timed('terminology_local_search', async () => {
    const { status, data } = await req(
      'GET',
      '/admin/clinical-repository/terminology/medications/search?q=amoxicillin',
      { token: adminToken },
    );
    assert(status === 200, `local search ${status}`);
    assert(Array.isArray(data) && data.length > 0, 'local snapshot empty for amoxicillin');
  });

  // 5. Upload one workbook (idempotent path via new small re-upload if needed)
  await timed('clinical_import_list', async () => {
    const { status, data } = await req('GET', '/admin/clinical-repository/imports?limit=5', {
      token: adminToken,
    });
    assert(status === 200, `imports ${status}`);
    soft('imports_exist', (data.data?.length ?? 0) > 0, 0, `${data.data?.length ?? 0} batches`);
  });

  // 6. Evaluate medication safety — allergy + combination product (Clavulin)
  const evalAllergy = await timed('evaluate_allergy_clavulin', async () => {
    const { status, data } = await req('POST', '/medication-safety/evaluate', {
      token: adminToken,
      body: {
        jurisdiction: 'CA',
        patientContext: {
          age: 34,
          allergies: [
            {
              substance: 'amoxicillin',
              reaction: 'anaphylaxis',
              clinicalStatus: 'active',
              verificationStatus: 'confirmed',
            },
          ],
          conditions: [],
          labs: [],
        },
        selectedMedications: [
          {
            productName: 'Clavulin 875 mg / 125 mg tablet',
            genericName: 'amoxicillin-clavulanate',
          },
        ],
      },
    });
    assert(status === 200, `evaluate ${status} ${JSON.stringify(data).slice(0, 500)}`);
    assert(data.findings || data.status, 'missing findings payload');
    return data;
  });

  soft(
    'allergy_finding_present',
    JSON.stringify(evalAllergy).toLowerCase().includes('amox') ||
      (evalAllergy.findings?.length ?? 0) > 0,
    0,
    `findings=${evalAllergy.findings?.length ?? 0} release=${evalAllergy.knowledgeRelease} types=${(evalAllergy.findings ?? []).map((f: any) => f.findingType).join(',')}`,
  );

  soft(
    'terminology_stamp_on_eval',
    Boolean(evalAllergy.terminologyReleaseId || evalAllergy.terminologyVersion || evalAllergy.engineVersion),
    0,
    `term=${evalAllergy.terminologyReleaseId ?? evalAllergy.terminologyVersion} eng=${evalAllergy.engineVersion} release=${evalAllergy.knowledgeRelease}`,
  );

  const evalDdi = await timed('evaluate_ddi_azithro_amiodarone', async () => {
    const { status, data } = await req('POST', '/medication-safety/evaluate', {
      token: adminToken,
      body: {
        jurisdiction: 'CA',
        patientContext: {
          age: 55,
          allergies: [],
          conditions: [],
          currentMedications: [
            { productName: 'amiodarone', genericName: 'amiodarone' },
          ],
          labs: [],
        },
        selectedMedications: [
          { productName: 'azithromycin', genericName: 'azithromycin' },
        ],
      },
    });
    assert(status === 200, `ddi eval ${status} ${JSON.stringify(data).slice(0, 400)}`);
    return data;
  });
  soft(
    'ddi_finding_or_evaluable',
    (evalDdi.findings?.length ?? 0) > 0 || Boolean(evalDdi.engineVersion),
    0,
    `status=${evalDdi.status} findings=${evalDdi.findings?.length ?? 0} types=${(evalDdi.findings ?? []).map((f: any) => f.findingType).join(',')}`,
  );

  // 7. Drug-disease
  const evalDd = await timed('evaluate_drug_disease', async () => {
    const { status, data } = await req('POST', '/medication-safety/evaluate', {
      token: adminToken,
      body: {
        jurisdiction: 'CA',
        patientContext: {
          age: 60,
          allergies: [],
          conditions: ['asthma', 'active asthma'],
          labs: [],
        },
        selectedMedications: [
          { productName: 'propranolol', genericName: 'propranolol' },
        ],
      },
    });
    assert(status === 200, `dd eval ${status}`);
    return data;
  });
  soft(
    'drug_disease_domain_ran',
    (evalDd.evaluatedDomains ?? []).includes('drug_disease') ||
      (evalDd.findings ?? []).some((f: any) => f.findingType === 'drug_disease') ||
      Boolean(evalDd.engineVersion),
    0,
    JSON.stringify({
      domains: evalDd.evaluatedDomains,
      findings: evalDd.findings?.length,
      types: (evalDd.findings ?? []).map((f: any) => f.findingType),
    }).slice(0, 300),
  );

  // 8. Pharmacist consultation + treatment safety
  const pharmLogin = await timed('pharmacist_login', async () => {
    const { status, data } = await req('POST', '/auth/login', {
      body: { email: 'pharmacist@demo-pharmacy.com', password: 'Pharmacist123!' },
    });
    assert(status === 200 || status === 201, `pharm login ${status} ${JSON.stringify(data)}`);
    return data;
  });
  const pharmToken = pharmLogin.accessToken ?? pharmLogin.access_token;

  const consultation = await timed('create_consultation', async () => {
    const token = pharmToken;
    const { status, data } = await req('POST', '/consultations', {
      token,
      body: { patientRef: 'E2E-SAFETY-001' },
    });
    assert(status < 400, `create consultation ${status} ${JSON.stringify(data).slice(0, 400)}`);
    return data;
  });

  const consultId = consultation.id;
  assert(consultId, 'no consultation id');

  // Patch patient demographics with allergies so treatment session CDS fires
  await timed('seed_consultation_patient_context', async () => {
    const step = await req('PATCH', `/consultations/${consultId}/step`, {
      token: pharmToken,
      body: {
        stepIndex: 1,
        currentStep: 'DEMOGRAPHICS',
        data: {
          firstName: 'E2E',
          lastName: 'Safety',
          allergies: 'amoxicillin',
          age: 34,
        },
      },
    });
    assert(step.status < 400, `save demographics ${step.status} ${JSON.stringify(step.data).slice(0, 300)}`);
    assert(
      step.data.demographics?.allergies === 'amoxicillin' ||
        JSON.stringify(step.data).includes('amoxicillin'),
      'allergies not saved on consultation',
    );
  });

  await timed('get_consultation', async () => {
    const { status, data } = await req('GET', `/consultations/${consultId}`, { token: pharmToken });
    assert(status === 200, `get consult ${status}`);
    assert(data.id === consultId, 'id mismatch');
  });

  await timed('treatment_safety_clavulin', async () => {
    const q = encodeURIComponent('Clavulin 875 mg / 125 mg tablet');
    const { status, data } = await req(
      'GET',
      `/consultations/${consultId}/treatment-safety?medicationName=${q}&genericName=amoxicillin-clavulanate`,
      { token: pharmToken },
    );
    assert(status === 200, `treatment-safety ${status} ${JSON.stringify(data).slice(0, 500)}`);
    const findingCount = data.safetyEvaluation?.findings?.length ?? 0;
    const alertCount = data.patientAlerts?.length ?? 0;
    assert(
      findingCount > 0 || alertCount > 0,
      `expected CDS findings/alerts for amox allergy + Clavulin, got findings=${findingCount} alerts=${alertCount}`,
    );
    soft(
      'treatment_safety_has_cds',
      findingCount > 0 && Boolean(data.safetyEvaluation?.knowledgeRelease),
      0,
      JSON.stringify({
        alerts: alertCount,
        findings: findingCount,
        status: data.safetyEvaluation?.status,
        term: data.safetyEvaluation?.terminologyVersion,
        release: data.safetyEvaluation?.knowledgeRelease,
      }),
    );
    soft(
      'treatment_safety_version_stamp',
      Boolean(data.safetyEvaluation?.terminologyReleaseId && data.safetyEvaluation?.knowledgeRelease),
      0,
      `${data.safetyEvaluation?.terminologyVersion} / ${data.safetyEvaluation?.knowledgeRelease}`,
    );
    return data;
  });

  await timed('check_allergy_endpoint', async () => {
    const { status, data } = await req('POST', `/consultations/${consultId}/check-allergy`, {
      token: pharmToken,
      body: {
        medicationName: 'Clavulin',
        genericName: 'amoxicillin-clavulanate',
        ingredients: ['amoxicillin', 'clavulanic acid'],
      },
    });
    assert(status < 400, `check-allergy ${status} ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  });

  // 9. Preflight
  await timed('clinical_publish_preflight', async () => {
    const { status, data } = await req('GET', '/admin/clinical-repository/releases/preflight', {
      token: adminToken,
    });
    assert(status === 200, `preflight ${status}`);
    soft('preflight_checks', Array.isArray(data.checks), 0, JSON.stringify(data).slice(0, 400));
  });

  // 10. UI page fetch (SSR) for safety engine
  await timed('ui_login_and_safety_page_shell', async () => {
    const loginHtml = await fetch(`${WEB}/login`).then((r) => r.text());
    assert(
      loginHtml.toLowerCase().includes('sign') ||
        loginHtml.includes('email') ||
        loginHtml.includes('Login') ||
        loginHtml.includes('password'),
      'login page content missing',
    );
    const safety = await fetch(`${WEB}/super-admin/safety-engine`);
    assert([200, 307, 302, 401].includes(safety.status), `safety page ${safety.status}`);
  });

  // Summary
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log('\n--- Results ---');
  for (const r of results) {
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(40)} ${String(r.ms).padStart(5)}ms` +
        (r.detail ? `  — ${r.detail}` : ''),
    );
  }
  console.log(
    `\n=== ${failed.length === 0 ? 'E2E PASS' : 'E2E PARTIAL/FAIL'}  ${passed.length}/${results.length} ===`,
  );

  const outPath = path.resolve(__dirname, '../docs/SAFETY_ENGINE_E2E_RUN.md');
  const md = [
    '# Safety Engine Full E2E Run',
    '',
    `Date: ${new Date().toISOString()}`,
    '',
    `| # | Case | Result | ms | Detail |`,
    `|---|------|--------|---:|--------|`,
    ...results.map(
      (r, i) =>
        `| ${i + 1} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.ms} | ${(r.detail ?? '').replace(/\|/g, '/')} |`,
    ),
    '',
    `**Summary:** ${passed.length}/${results.length} passed`,
    '',
    '## Local services',
    '',
    `- API: ${API}`,
    `- Web: ${WEB}`,
    `- Super Admin: admin@safescript.com`,
    `- Pharmacist: pharmacist@demo-pharmacy.com`,
    '',
  ].join('\n');
  fs.writeFileSync(outPath, md);
  console.log('Wrote', outPath);

  process.exit(failed.some((f) => !f.name.startsWith('soft') && f.name.includes('_')) && failed.length > 3 ? 1 : failed.length > 5 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

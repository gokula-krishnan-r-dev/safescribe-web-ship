import * as fs from 'fs';
import * as path from 'path';

for (const line of fs
  .readFileSync(path.resolve('infra/staging/secrets/staging-secrets.env'), 'utf8')
  .split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const API = 'https://api-staging.safescribe.ca/api/v1';

async function ev(token: string, body: unknown) {
  return fetch(`${API}/medication-safety/evaluate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

async function main() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
    }),
  }).then((r) => r.json());
  const token = login.accessToken;

  const cases = [
    {
      name: 'TC-04 PUD',
      body: {
        patientContext: {
          age: 35,
          conditions: ['Active peptic ulcer disease'],
          allergies: [],
        },
        selectedMedications: [{ productName: 'Ibuprofen' }, { productName: 'Naproxen' }],
      },
    },
    {
      name: 'TC-06 K+',
      body: {
        patientContext: {
          age: 30,
          allergies: [],
          labs: [{ name: 'Potassium', value: '5.8', unit: 'mmol/L', observedAt: '2026-08-05' }],
        },
        selectedMedications: [{ productName: 'Spironolactone' }],
      },
    },
    {
      name: 'TC-07 ACEI',
      body: {
        patientContext: {
          age: 32,
          allergies: [],
          pregnancy: { status: 'pregnant', trimester: '1' },
        },
        selectedMedications: [{ productName: 'Ramipril' }, { productName: 'Lisinopril' }],
      },
    },
    {
      name: 'TC-01 metformin concurrent',
      body: {
        patientContext: {
          allergies: [],
          currentMedications: [{ productName: 'Metformin' }],
          labs: [{ name: 'eGFR', value: '10', unit: 'mL/min/1.73 m2' }],
        },
        selectedMedications: [{ productName: 'Docosanol 10% cream' }],
      },
    },
  ];

  for (const c of cases) {
    const d = await ev(token, c.body);
    console.log(`\n=== ${c.name} status=${d.status} findings=${d.findings?.length} ===`);
    for (const f of d.findings ?? []) {
      console.log(
        `- ${f.findingType}/${f.clinicalSeverity} product=${f.implicatedProductName} code=${f.ruleCode} ${(f.detail ?? '').slice(0, 100)}`,
      );
    }
    if (d.mappingWarnings?.length) console.log('warnings', d.mappingWarnings.slice(0, 5));
  }
}

main().catch(console.error);

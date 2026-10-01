import * as fs from 'fs';
import * as path from 'path';

const API = 'https://api-staging.safescribe.ca/api/v1';
for (const line of fs.readFileSync(path.resolve('infra/staging/secrets/staging-secrets.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
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
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const evalBody = {
    patientContext: {
      age: 40,
      allergies: [
        {
          substance: 'Acyclovir',
          clinicalStatus: 'active',
          verificationStatus: 'confirmed',
          reaction: 'severe',
        },
      ],
    },
    selectedMedications: [
      { productName: 'Valacyclovir' },
      { productName: 'Acyclovir' },
      { productName: 'Docosanol 10% cream' },
    ],
  };
  const ev = await fetch(`${API}/medication-safety/evaluate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(evalBody),
  }).then((r) => r.json());
  console.log('TC-02 findings:');
  for (const f of ev.findings ?? []) {
    console.log(
      `- ${f.findingType}/${f.clinicalSeverity} product=${JSON.stringify(f.implicatedProductName)} match=${f.matchType} detail=${(f.detail ?? '').slice(0, 140)}`,
    );
  }

  const met = await fetch(`${API}/medication-safety/evaluate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      patientContext: {
        allergies: [],
        currentMedications: [{ productName: 'Metformin' }],
        labs: [{ name: 'eGFR', value: '10', unit: 'mL/min/1.73 m2' }],
      },
      selectedMedications: [{ productName: 'Valacyclovir' }],
    }),
  }).then((r) => r.json());
  console.log('\nMetformin concurrent findings:', met.findings?.length);
  for (const f of met.findings ?? []) {
    console.log(`- ${f.findingType} product=${f.implicatedProductName} ${(f.detail ?? '').slice(0, 120)}`);
  }
  console.log('warnings', met.mappingWarnings);

  // List allergy/cross rules mentioning valacyclovir
  const rules = await fetch(`${API}/admin/medication-safety/rules?limit=100&search=valacyclovir`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const items = rules.items ?? rules.data ?? [];
  console.log('\nRules search valacyclovir', items.length);
  for (const r of items.slice(0, 10)) {
    console.log('-', r.code ?? r.ruleCode, r.ruleType ?? r.type, r.status, r.summary?.slice?.(0, 80));
  }
}

main().catch(console.error);

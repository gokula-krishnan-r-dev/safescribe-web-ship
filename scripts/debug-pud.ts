import * as fs from 'fs';
import * as path from 'path';

for (const line of fs
  .readFileSync(path.resolve('infra/staging/secrets/staging-secrets.env'), 'utf8')
  .split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const API = 'https://api-staging.safescribe.ca/api/v1';

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

  // force evaluate with conditions that should match peptic ulcer
  for (const condition of [
    'Active peptic ulcer disease',
    'Peptic ulcer (disorder)',
    'Peptic ulcer',
    'peptic ulcer disease',
  ]) {
    const d = await fetch(`${API}/medication-safety/evaluate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patientContext: { age: 35, conditions: [condition], allergies: [] },
        selectedMedications: [{ productName: 'Ibuprofen' }],
      }),
    }).then((r) => r.json());
    console.log(
      condition,
      '→',
      d.status,
      d.findings?.length,
      d.findings?.[0]?.ruleCode,
      d.mappingWarnings?.slice?.(0, 2),
    );
  }

  const rel = await fetch(`${API}/admin/medication-safety/releases/current`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  console.log('cache meta', rel.cache?.meta);
}

main().catch(console.error);

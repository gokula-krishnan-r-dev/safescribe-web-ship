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
  const t = login.accessToken;

  async function list(q: string) {
    const d = await fetch(
      `${API}/admin/medication-safety/rules?limit=50&search=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${t}` } },
    ).then((r) => r.json());
    const items = d.items || d.data || [];
    console.log(`\nSEARCH ${q} → ${items.length}`);
    for (const r of items.slice(0, 12)) {
      console.log(
        `- ${r.code || r.ruleCode} | ${r.ruleType || r.type} | ${r.status} | ${(r.summary || '').slice(0, 70)}`,
      );
    }
  }

  for (const q of [
    'acyclovir',
    'valacyclovir',
    'clopidogrel',
    'omeprazole',
    'ibuprofen',
    'peptic',
    'spironolactone',
    'potassium',
    'ramipril',
    'pregnancy',
    'metformin',
    'codeine',
    'CROSS',
  ]) {
    await list(q);
  }
}

main().catch(console.error);

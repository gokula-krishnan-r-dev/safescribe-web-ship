/**
 * Probe staging pathways + safety release cache.
 *   API_URL=https://api-staging.safescribe.ca npx tsx scripts/probe-staging-pathways.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const API_BASE = (process.env.API_URL ?? 'https://api-staging.safescribe.ca').replace(/\/$/, '');
const API = API_BASE.endsWith('/api/v1') ? API_BASE : `${API_BASE}/api/v1`;

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

loadEnvFile(path.resolve('infra/staging/secrets/staging-secrets.env'));

async function req(method: string, p: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@safescribe.ca';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? '';
  const login = await req('POST', '/auth/login', undefined, { email, password });
  if (login.status >= 300) throw new Error(`login ${login.status}`);
  const token = login.data.accessToken ?? login.data.access_token;

  const rel = await req('GET', '/admin/medication-safety/releases/current', token);
  console.log('release', {
    active: rel.data?.active?.version,
    rules: rel.data?.active?.ruleCount,
    cacheReady: rel.data?.cache?.ready,
    cacheVersion: rel.data?.cache?.meta?.version,
    cacheRules: rel.data?.cache?.meta?.ruleCount,
  });

  const paths = await req('GET', '/clinical-pathways?status=PUBLISHED&limit=50', token);
  const items = paths.data?.items ?? paths.data?.data ?? [];
  for (const p of items) {
    const detail = await req('GET', `/clinical-pathways/${p.id}`, token);
    const txs = detail.data?.treatments ?? [];
    const flags = detail.data?.redFlags ?? [];
    console.log(`\n=== ${p.name} | treatments=${txs.length} redFlags=${flags.length} ===`);
    for (const t of txs) {
      console.log(
        `- ${t.medicationName} | gen=${t.genericName ?? ''} | approved=${t.approved} active=${t.isActive} cat=${t.category} dose=${t.dose ?? ''}`,
      );
    }
    if (flags.length) {
      console.log(
        'redFlags sample:',
        flags.slice(0, 5).map((f: any) => f.question || f.flag || f.text || JSON.stringify(f).slice(0, 80)),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

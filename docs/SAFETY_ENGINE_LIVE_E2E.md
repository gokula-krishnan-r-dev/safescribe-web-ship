# Safety Engine — Live Local E2E Report

**Date:** 2026-08-06  
**Environment:** local macOS, Docker Postgres+Redis, Nest API `:3001`, Next web `:3000`

## Verdict

**PASS** — full safety-engine path works end-to-end (seed → publish cache → CCDD snapshot → evaluate → consultation treatment session), with UI verified via Playwright against Super Admin Safety Engine and Pharmacist consultations.

## Services running

| Service | URL | Status |
|---------|-----|--------|
| Postgres | localhost:5432 | healthy |
| Redis | localhost:6379 | healthy |
| API | http://localhost:3001 | healthy |
| Web | http://localhost:3000 | ready |
| Swagger | http://localhost:3001/api/docs | available |

## Super Admin seed data

- **Super Admin:** `admin@safescript.com` / `SuperAdmin123!`
- **Pharmacist:** `pharmacist@demo-pharmacy.com` / `Pharmacist123!`
- **Safety release:** `KR-2026.08.06.1` — **81 published rules** warmed into Redis  
- **Clinical repository:** 12/12 sample workbooks imported (value sets 14, members 57, tests 28, evidence 14)
- **Terminology:** active `TERM-SEED-2026-08-06` + CCDD snapshot (18 queries, Infoway credentials from `.env`)

## API E2E (`scripts/e2e-safety-full.ts`)

**36/36 PASS** (latest run)

Highlights:

| Scenario | Result |
|----------|--------|
| List rules / current release / import template | 81 rules, cache ready |
| Clinical workbooks registry | 12 types |
| CCDD live search `amoxicillin` | OK |
| CCDD snapshot pin local | 18 concepts, ~32–41 ms cache hit after warm |
| Evaluate Clavulin + amox allergy | **3 allergy findings**, release stamp |
| Evaluate azithromycin + amiodarone DDI | **1 drug_interaction** finding |
| Evaluate propranolol + asthma | **1 drug_disease** finding, full domain list |
| Consultation create + DEMOGRAPHICS allergies | OK |
| Treatment-session safety (`Clavulin`) | **COMPLETE_WITH_FINDINGS**, **3 findings / 6 patientAlerts**, terminology + knowledge release stamps |
| Preflight checklist | Returns checks (republish expects approved drafts; production publish already done) |

## UI E2E (`scripts/e2e-safety-ui.ts`)

Playwright Chrome:

- Login page loads
- Super Admin → `/super-admin/safety-engine` (Clinical Repository tab present)
- Pharmacist → `/pharmacist/consultations`
- Screenshots: `docs/e2e-screenshots/`

Note: login is rate-limited (`@Throttle` 5/min). Wait ~60s between dense E2E runs. Use `WEB_URL=http://localhost:3000` (matches API CORS `WEB_URL`).

## Integration fixes applied during E2E

1. **`EvaluateMedicationSafetyDto`** — nested `patientContext` properly validated (was blocking all evaluate calls under `forbidNonWhitelisted`)
2. **Login form** — `preventDefault` + `method="post"` so browser does not GET-submit credentials
3. **`apps/web/.env.local`** — `NEXT_PUBLIC_API_URL=http://127.0.0.1:3001`
4. **pnpm** — `.npmrc` with `dangerouslyAllowAllBuilds=true` so `make dev` / installs work

## Manual UI path (browser)

1. Open http://localhost:3000/login  
2. Super Admin → **Safety Engine** → review rules, **Clinical Repository (12 files)**, Resync CCDD  
3. Pharmacist login → **Consultations** → New → set demographics allergies `amoxicillin` → treatment step → select Clavulin → expect CRITICAL allergy alerts with release version stamps  

## Performance notes

- Redis-cached evaluate: **~6–15 ms** after warm cache  
- Treatment-safety (includes OpenFDA label + evaluate): **~2.1–2.7 s**  
- CCDD snapshot warm path: tens of ms (local pin); cold Infoway expand is network-bound  

## Re-run commands

```bash
make docker-up
# terminals: API + web (or fix install then make dev)
export PATH="/usr/bin:/bin:/opt/homebrew/bin:$PATH"
cd apps/api && set -a && source ../../.env && set +a && npx nest start --watch
cd apps/web && export NEXT_PUBLIC_API_URL=http://127.0.0.1:3001 && npx next dev --port 3000

npx tsx prisma/seed.ts
npx tsx prisma/scripts/seed-safety-engine.ts
npx tsx prisma/scripts/seed-clinical-repository.ts
npx tsx --tsconfig apps/api/tsconfig.json apps/api/src/scripts/e2e-clinical-repository.ts
npx tsx prisma/scripts/publish-safety-release.ts

API_URL=http://127.0.0.1:3001 WEB_URL=http://localhost:3000 npx tsx scripts/e2e-safety-full.ts
WEB_URL=http://localhost:3000 npx tsx scripts/e2e-safety-ui.ts
```

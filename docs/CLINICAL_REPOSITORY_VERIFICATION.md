# Clinical Repository + Terminology — Verification Report

**Date:** 2026-08-06  
**Status:** **PASS** (implementation + local E2E)

## Environment

| Component | Result |
|-----------|--------|
| Postgres + Redis + Mailpit | started via `make docker-up` |
| Prisma migrations | all 25 applied including `20260806163000_clinical_repository_and_terminology` |
| API TypeScript | `tsc --noEmit` pass |
| Web TypeScript | `tsc --noEmit` pass |
| API Nest build | `nest build` pass |
| Unit tests | **11/11 pass** (`clinical-repository.spec.ts`) |
| Terminology seed | `TERM-SEED-2026-08-06` active (16 concepts + Clavulin ingredient edges) |
| 12-file E2E import+promote | **12/12 PASS** |

## E2E promote counts (real sample workbooks)

| File | Rows promoted |
|------|--------------:|
| clinical-value-sets.xlsx | 14 |
| clinical-value-set-members.xlsx | 57 |
| rule-evidence.xlsx | 14 |
| allergy-cross-reactivity-rules.xlsx | 8 |
| drug-interactions.xlsx | 8 |
| drug-disease-rules.xlsx | 8 |
| renal-rules.xlsx | 10 |
| lab-threshold-rules.xlsx | 11 |
| pregnancy-rules.xlsx | 11 |
| lactation-rules.xlsx | 10 |
| test-inputs.xlsx | 58 |
| test-cases.xlsx | 28 |

**DB after promote**

- Clinical value sets: 14  
- Value-set members: 57  
- Evidence rows with link ids: 14  
- Safety rule versions (APPROVED): 66  
- Drug-disease details: 8  
- Clinical test cases: 28  
- Clinical test inputs: 58  
- Terminology concepts: 16  

## Plan phases checklist

| Todo | Status |
|------|--------|
| schema-foundation | Done |
| terminology-snapshot | Done (CCDD + local seed fallback + resolveSelector service) |
| workbook-registry | Done (12 fingerprints, parse/validate/stage/promote admin API) |
| value-sets-evidence | Done (include/exclude on import + evaluator; evidence promote + preflight) |
| drug-disease-evaluator | Done |
| test-runner-publish-gate | Done (`repository-test-runner` + publication preflight) |
| admin-ui | Done (Super Admin Safety Engine tab) |
| consultation-integration | Done (`drug_disease` + terminologyRelease stamps) |
| seed-e2e-verification | Done (this report + scripts) |

## How to re-run

```bash
make docker-up
npx prisma migrate deploy && npx prisma generate
npx tsx prisma/scripts/seed-clinical-repository.ts
npx tsx --tsconfig apps/api/tsconfig.json apps/api/src/scripts/e2e-clinical-repository.ts
cd apps/api && ./node_modules/.bin/jest --config jest.config.js clinical-repository
```

Optional live CCDD pin: Super Admin → Safety Engine → Clinical Repository → **Resync from CCDD**  
(requires `INFOWAY_CLIENT_ID` / `INFOWAY_CLIENT_SECRET`).

Optional full publish gate: Super Admin → Run tests → Publish (preflight blocks on critical test failures).

## Scripts / endpoints

- Seed: `prisma/scripts/seed-clinical-repository.ts`
- E2E: `apps/api/src/scripts/e2e-clinical-repository.ts`
- Admin API prefix: `/admin/clinical-repository/*` (`SUPER_ADMIN`)
- UI: Super Admin → Safety Engine → **Clinical Repository (12 files)**

## Notes

- `alert_severity` value `NONE` accepted and mapped to `INFO` (sample allergy row).
- Quantitative renal metrics require units; dialysis-style rows without units are allowed (warning only when thresholds present).
- Runtime remains published-cache only; import never activates rules until promote → approve → publish.

# SafeScribe Mic — production deploy checklist

## Live topology today

| Surface | URL | Host |
|---------|-----|------|
| Web (Vercel Production alias) | https://staging.safescribe.ca (cutover: https://safescribe.ca) | Vercel project `safescribe-web` |
| API (VM) | https://api-staging.safescribe.ca (cutover: https://api.safescribe.ca) | GCP VM `safescribe-staging` (`34.19.234.40`) |
| Mic companion | https://staging.safescribe.ca/mic/`{token}` | Same web app |
| Flutter API | `--dart-define=API_URL=https://api-staging.safescribe.ca` | Device build |

> Cutover target is **https://safescribe.ca** on the existing staging VM + Vercel. Keep `staging.safescribe.ca` as rollback until smoke tests pass on the apex names.

## Last successful redeploy (2026-08-10)

- API: rsynced; Mic migration `20260810120000_add_safescribe_mic` applied; PM2 healthy
- Nginx: Mic SSE + part-upload locations live on `api-staging.safescribe.ca`
- Vercel: production deployment aliased to https://staging.safescribe.ca
- Smoke: `./infra/production/scripts/smoke-test.sh staging` → **8/8 passed**

## One-command API deploy

```bash
STAGING_HOST=34.19.234.40 STAGING_USER=ubuntu \
  DEPLOY_KEY=infra/staging/secrets/deploy_key \
  ./infra/staging/scripts/remote-deploy.sh --api
```

## Web deploy (Vercel) — monorepo root

Deploy from the **repo root** (project `rootDirectory` is `apps/web`):

```bash
cd /path/to/safescript
NEXT_PUBLIC_API_URL=https://api-staging.safescribe.ca vercel deploy --prod --yes
```

Do **not** run `vercel deploy` from inside `apps/web/` (path doubles to `apps/web/apps/web`).

## Smoke tests

```bash
./infra/production/scripts/smoke-test.sh staging
```

## Phone test loop

1. Desktop: https://staging.safescribe.ca → consultation Step 1 → **Use SafeScribe Mic**
2. Phone HTTPS: scan QR → allow mic → consent → Start → End
3. Desktop: wait for draft transcript → review → Analyse

## Flutter (optional)

```bash
cd apps/safescribe-mic
flutter run --dart-define=API_URL=https://api-staging.safescribe.ca
```

## Future cutover (`app` / `api.safescribe.ca`)

1. DNS A + Vercel CNAME + TLS  
2. Mic env on prod VM from `infra/production/env/api.env.example`  
3. Vercel `NEXT_PUBLIC_API_URL=https://api.safescribe.ca`  
4. `./infra/production/scripts/remote-deploy.sh --all` + `vercel deploy --prod`

# SafeScribe Production Infrastructure

Production on the **existing Montreal GCP VM** (API + AI + data) + Vercel (Next.js).
Do **not** provision a second VM — staging is promoted in place onto `safescribe.ca`.

`staging.safescribe.ca` / `api-staging` stay live as the rollback URL on the same stack.

## Architecture

```
Internet
   │
   ├─ https://safescribe.ca                 ┐
   ├─ https://www.safescribe.ca  (301 → /)  ├─ Vercel (Next.js, region yul1)
   ├─ https://app.safescribe.ca  (301 → /)  ┘
   │
   ├─ https://api.safescribe.ca             ┐
   │                                         ├─ Existing GCP VM (Montreal)
   └─ https://ai.safescribe.ca              ┘  34.19.234.40
                                             │
                   Nginx (TLS, rate limits, headers)
                             │
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
        PM2 NestJS     systemd AI      Docker Compose
          :3001           :8000        Postgres + Redis
```

| Component | Where | Spec (recommended) |
|-----------|-------|--------------------|
| Frontend | Vercel Production | Next.js · `yul1` Montréal |
| API | GCP VM + PM2 | NestJS · Node 20 |
| AI Engine | GCP VM + systemd | FastAPI / uvicorn (2 workers) |
| Postgres 16 | Docker on VM (or Cloud SQL later) | localhost only |
| Redis 7 | Docker on VM (or Memorystore later) | password + maxmemory |
| Reverse proxy | Nginx + Certbot | Let's Encrypt |

## Canada region layout

| Component | Region |
|-----------|--------|
| GCP VM (`safescribe-staging`, promoted in place) | `northamerica-northeast1-a` (Montréal) |
| Vercel Functions / SSR | `yul1` (Montréal) |
| Current machine | `e2-small` (2 vCPU shared, 2 GB) — resize to `e2-medium` if RAM is tight |
| Disk | 30 GB pd-balanced (existing) |
| Swap | 2 GB |

## DNS records (Cloudflare CLI)

Nameservers are already Cloudflare (`dell` / `scott`). DiscoverSys owns `safescribe.ca`.

**Canada / PHI:** do not orange-cloud `api` or `ai`. Clinical traffic and pharmacy IP allowlisting must hit the Montreal VM. Web is DNS-only to Vercel `yul1` (Montréal).

```bash
wrangler login   # reads the zone; cannot write DNS
CLOUDFLARE_API_TOKEN=... ./infra/production/scripts/cloudflare-dns-setup.sh
```

Token permissions: DNS Edit + Zone Settings Edit + SSL Edit, include **only** `safescribe.ca`.

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| **A** | `api` | `34.19.234.40` (Montréal) | DNS only |
| **A** | `ai` | `34.19.234.40` (Montréal) | DNS only |
| **CNAME** | `@` | `cname.vercel-dns.com` | DNS only |
| **CNAME** | `www` | `cname.vercel-dns.com` | DNS only |
| **CNAME** | `app` | `cname.vercel-dns.com` | DNS only |

The script also sets SSL **Full (strict)**, Always HTTPS, TLS 1.2+, TLS 1.3. Leave `staging` / `api-staging` / `ai-staging` as rollback.

Apex currently serves a GoDaddy builder placeholder until `@` is the Vercel CNAME.

## Health check URLs

| Service | URL |
|---------|-----|
| API | https://api.safescribe.ca/api/v1/health |
| AI | https://ai.safescribe.ca/health |
| AI ready | https://ai.safescribe.ca/health/ready |
| Frontend | https://safescribe.ca |

## Promote from staging (recommended path)

Reuse the live VM `safescribe-staging` (`34.19.234.40`). Same Postgres, Redis, secrets, and PM2 process — production hostnames are extra nginx vhosts + DNS.

```bash
# 1. Install production HTTP vhosts + CORS (staging URLs keep working)
./infra/production/scripts/promote-from-staging.sh --prepare

# 2. Apply Cloudflare DNS (Canada, DNS-only) then issue TLS
CLOUDFLARE_API_TOKEN=... ./infra/production/scripts/cloudflare-dns-setup.sh
./infra/production/scripts/promote-from-staging.sh --certs

# 3. Switch API WEB_URL / API_URL to production hostnames
./infra/production/scripts/promote-from-staging.sh --cutover

# 4. Deploy web so hostname routing is live
NEXT_PUBLIC_API_URL=https://api.safescribe.ca vercel deploy --prod --yes

# 5. Smoke
./infra/production/scripts/smoke-test.sh production
./infra/production/scripts/smoke-test.sh staging   # rollback URL still healthy
```

A later dedicated production VM (e2-medium, separate secrets) is optional when traffic outgrows this box — not required for the `safescribe.ca` cutover.

## CI/CD

Workflow: `.github/workflows/production.yml` (push to `main` or manual).

### GitHub secrets

| Secret | Value |
|--------|-------|
| `PROD_HOST` | Production static IP |
| `PROD_USER` | `ubuntu` |
| `PROD_SSH_KEY` | Production deploy private key |
| `VERCEL_TOKEN` | Vercel token |
| `VERCEL_ORG_ID` | Team org id |
| `VERCEL_PROJECT_ID` | `safescribe-web` project id |

## Smoke test (from laptop)

```bash
./infra/production/scripts/smoke-test.sh
# or against staging:
./infra/production/scripts/smoke-test.sh staging
```

## Security differences vs staging

- Separate secrets (JWT, DB, Redis, INTERNAL_SECRET) — never copy staging
- Separate GCS bucket (`safescribe-consult-attachments-prod`)
- Stronger Nginx rate limits / HSTS preload
- Real SMTP (not MailHog)
- Prefer Cloud SQL + Memorystore when traffic grows
- Cloudflare SSL **Full (strict)**

## Rollback

```bash
sudo bash /opt/safescribe/infra/production/scripts/rollback-api.sh
```

## Access

```bash
ssh -i infra/production/secrets/deploy_key ubuntu@<PROD_HOST>
CHECK_PUBLIC=1 sudo bash /opt/safescribe/infra/production/scripts/healthcheck.sh
```

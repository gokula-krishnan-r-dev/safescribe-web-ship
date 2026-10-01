# SafeScribe Staging Infrastructure

Production-style staging on a single cheap GCP VM + Vercel frontend.

> **Promote to production:** after smoke tests pass here, use [`infra/production`](../production/README.md) (`app.safescribe.ca` / `api.safescribe.ca` / `ai.safescribe.ca`). Run `./infra/production/scripts/smoke-test.sh staging` anytime.

## Architecture

```
Internet
   │
   ├─ https://staging.safescribe.ca          → Vercel (Next.js)
   │
   ├─ https://api-staging.safescribe.ca      ┐
   │                                          ├─ GCP e2-small VM (Montreal)
   └─ https://ai-staging.safescribe.ca       ┘
                                              │
                    Nginx (TLS, rate limits, headers)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         PM2 NestJS     systemd AI      Docker Compose
           :3001           :8000        Postgres :5432
                                        Redis    :6379
```

| Component | Where | Spec |
|-----------|-------|------|
| Frontend | Vercel | Next.js · **`yul1` Montréal** |
| API | GCP VM + PM2 | NestJS on Node 20 · **Montreal** |
| AI Engine | GCP VM + systemd | FastAPI / uvicorn (1 worker) |
| Postgres 16 | Docker on VM | localhost only, 512 MB cap |
| Redis 7 | Docker on VM | password + 128 MB maxmemory |
| Reverse proxy | Nginx + Certbot | Let's Encrypt |

## Canada region layout

All staging compute stays in Canada for lower latency and data residency:

| Component | Region |
|-----------|--------|
| GCP VM (`safescribe-staging`) | `northamerica-northeast1-a` (Montréal) |
| Vercel Functions / SSR | `yul1` (Montréal) |
| VM OS timezone | `America/Toronto` |
| Postgres storage TZ | UTC (correct); UI formats in local time |

Cloudflare (if proxied) will still terminate TLS at the nearest Canadian PoP; origin remains Montréal.
## Server

| Field | Value |
|-------|-------|
| GCP project | `safescribe-488815` |
| Instance | `safescribe-staging` |
| Zone | `northamerica-northeast1-a` (Montreal) |
| Machine | `e2-small` (2 vCPU shared, 2 GB RAM) |
| Disk | 30 GB pd-balanced |
| OS | Ubuntu 24.04 LTS |
| Static IP | `34.19.234.40` |
| Swap | 2 GB |
| Est. cost | **~$15–18 / month** (compute + disk + static IP) |

## DNS records (add at registrar)

| Type | Host | Value | TTL |
|------|------|-------|-----|
| **A** | `api-staging` | `34.19.234.40` | 300 |
| **A** | `ai-staging` | `34.19.234.40` | 300 |
| **CNAME** | `staging` | `cname.vercel-dns.com` | 300 |

> After connecting the Vercel project, replace the `staging` CNAME target with the exact value Vercel shows in Domains settings if different.

Optional verification:
```text
dig +short api-staging.safescribe.ca
dig +short ai-staging.safescribe.ca
dig +short staging.safescribe.ca
```

## Health check URLs

| Service | URL |
|---------|-----|
| API | https://api-staging.safescribe.ca/api/v1/health |
| AI | https://ai-staging.safescribe.ca/health |
| AI ready | https://ai-staging.safescribe.ca/health/ready |
| Frontend | https://staging.safescribe.ca |

## First-time bootstrap

From your laptop (after VM exists):

```bash
# 1. Wait for SSH
ssh -i infra/staging/secrets/deploy_key ubuntu@34.19.234.40 'echo ok'

# 2. Copy secrets + run bootstrap (one-time)
scp -i infra/staging/secrets/deploy_key \
  infra/staging/secrets/staging-secrets.env \
  ubuntu@34.19.234.40:/tmp/staging-secrets.env

# Sync repo (includes infra/)
STAGING_HOST=34.19.234.40 STAGING_USER=ubuntu \
  DEPLOY_KEY=infra/staging/secrets/deploy_key \
  ./infra/staging/scripts/remote-deploy.sh --api --ai
# (first run: sync only may fail deploy until bootstrap — run bootstrap first)

ssh -i infra/staging/secrets/deploy_key ubuntu@34.19.234.40 \
  'sudo SECRETS_FILE=/tmp/staging-secrets.env INFRA_SRC=/opt/safescribe/infra/staging \
   bash /opt/safescribe/infra/staging/scripts/bootstrap.sh'
```

Recommended order for a clean first install:

```bash
KEY=infra/staging/secrets/deploy_key
HOST=34.19.234.40

# Sync code
rsync -az --exclude node_modules --exclude .git --exclude infra/staging/secrets \
  --exclude .env --exclude .venv --exclude .next --exclude dist \
  -e "ssh -i $KEY -o IdentitiesOnly=yes" \
  ./ ubuntu@$HOST:/tmp/safescribe-src/

ssh -i $KEY -o IdentitiesOnly=yes ubuntu@$HOST <<'EOS'
sudo mkdir -p /opt/safescribe
sudo rsync -a /tmp/safescribe-src/ /opt/safescribe/
sudo chown -R ubuntu:ubuntu /opt/safescribe
EOS

scp -i $KEY infra/staging/secrets/staging-secrets.env ubuntu@$HOST:/tmp/staging-secrets.env

ssh -i $KEY -o IdentitiesOnly=yes ubuntu@$HOST \
  'sudo SECRETS_FILE=/tmp/staging-secrets.env INFRA_SRC=/opt/safescribe/infra/staging \
   bash /opt/safescribe/infra/staging/scripts/bootstrap.sh'

# Deploy apps
STAGING_HOST=$HOST STAGING_USER=ubuntu DEPLOY_KEY=$KEY \
  ./infra/staging/scripts/remote-deploy.sh --all
```

### TLS (after DNS propagates)

```bash
ssh -i infra/staging/secrets/deploy_key ubuntu@34.19.234.40 \
  'sudo certbot --nginx -d api-staging.safescribe.ca -d ai-staging.safescribe.ca \
   --non-interactive --agree-tos -m admin@safescribe.ca --redirect'
```

Certbot renews via systemd timer automatically.

## CI/CD

Push to the **`staging`** branch (or run the workflow manually).

Workflow: `.github/workflows/staging.yml`

- Path filters deploy **only changed apps**
- Web → Vercel
- API / AI → rsync + remote deploy scripts + health checks
- Failed API health check triggers rollback to previous release

### GitHub secrets to configure

| Secret | Value |
|--------|-------|
| `STAGING_HOST` | `34.19.234.40` |
| `STAGING_USER` | `ubuntu` |
| `STAGING_SSH_KEY` | Contents of `infra/staging/secrets/deploy_key` (private) |
| `VERCEL_TOKEN` | Vercel token |
| `VERCEL_ORG_ID` | From `vercel link` / project settings |
| `VERCEL_PROJECT_ID` | From Vercel project settings |

### Vercel project setup

1. Import the GitHub repo in Vercel
2. Root Directory: `apps/web`
3. Framework: Next.js (uses `apps/web/vercel.json`)
4. Env: `NEXT_PUBLIC_API_URL=https://api-staging.safescribe.ca`
5. Add domain `staging.safescribe.ca`
6. Create git branch `staging` and connect Production/Preview as needed

## Service management

```bash
ssh -i infra/staging/secrets/deploy_key ubuntu@34.19.234.40

# API (PM2)
sudo -u safescribe pm2 status
sudo -u safescribe pm2 logs safescribe-api
sudo -u safescribe pm2 reload safescribe-api

# AI (systemd)
sudo systemctl status safescribe-ai
sudo journalctl -u safescribe-ai -f
sudo systemctl restart safescribe-ai

# Data plane
cd /opt/safescribe/docker && sudo docker compose --env-file /etc/safescribe/docker.env ps
sudo docker compose --env-file /etc/safescribe/docker.env logs -f postgres

# Nginx
sudo nginx -t && sudo systemctl reload nginx
sudo tail -f /var/log/nginx/api-staging.access.log

# Health
sudo bash /opt/safescribe/infra/staging/scripts/healthcheck.sh
CHECK_PUBLIC=1 sudo bash /opt/safescribe/infra/staging/scripts/healthcheck.sh
```

## Backup & restore

- Nightly cron: `/usr/local/bin/safescribe-backup` → `/var/backups/safescribe/`
- Keep 7 days

```bash
# Manual backup
sudo /usr/local/bin/safescribe-backup

# Restore (destructive)
sudo bash /opt/safescribe/infra/staging/scripts/restore.sh \
  /var/backups/safescribe/safescribe-YYYYMMDDTHHMMSSZ.tar.gz
```

## Rollback

```bash
# API previous release
sudo bash /opt/safescribe/infra/staging/scripts/rollback-api.sh

# AI — re-deploy last known-good commit from CI, or:
sudo systemctl restart safescribe-ai
```

## Security posture

- UFW: 22 / 80 / 443 only
- GCP firewall: same ports, tag `safescribe-staging`
- Postgres & Redis bound to `127.0.0.1`
- Redis `requirepass` + maxmemory policy
- SSH key auth (deploy key + your key)
- Fail2Ban (sshd + nginx)
- Unattended security upgrades
- Env files in `/etc/safescribe` mode `640`
- HTTPS + HSTS + security headers + Nginx rate limits
- NestJS throttling still applies at app layer

## Environment files (on server)

| Path | Purpose |
|------|---------|
| `/etc/safescribe/api.env` | NestJS |
| `/etc/safescribe/ai.env` | FastAPI |
| `/etc/safescribe/docker.env` | Compose passwords |
| `/opt/safescribe/.env` | Symlink → api.env |

Templates: `infra/staging/env/*.example`

## Scaling later

1. Resize to `e2-medium` if memory pressure:  
   `gcloud compute instances set-machine-type safescribe-staging --machine-type=e2-medium --zone=northamerica-northeast1-a` (stop instance first)
2. Move Postgres → Cloud SQL / Redis → Memorystore when leaving staging
3. Split AI onto a second VM or Cloud Run if OCR/CPU grows

## Verification status (2026-07-11)

| Check | Result |
|-------|--------|
| Postgres | OK |
| Redis | OK |
| NestJS API HTTPS | https://api-staging.safescribe.ca/api/v1/health → healthy |
| AI Engine HTTPS | https://ai-staging.safescribe.ca/health → ok |
| Let's Encrypt | Issued (auto-renew via certbot) |
| Nginx :443 | Listening |
| Cloudflare 521 | Fixed (origin TLS was missing) |
| Vercel frontend | https://safescribe-web.vercel.app (production READY) |
| Staging web domain | `staging.safescribe.ca` — add CNAME to Vercel |

### Cloudflare SSL tip

Keep SSL/TLS mode **Full** or **Full (strict)** now that origin has Let's Encrypt certs. Flexible is not needed.

### Frontend DNS (Cloudflare)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `staging` | `cname.vercel-dns.com` | DNS only (grey cloud) recommended |

After the CNAME is set, Vercel will issue the certificate for `staging.safescribe.ca`.

### Frontend env (Vercel)

Only this is required for the Next.js app:

- `NEXT_PUBLIC_API_URL=https://api-staging.safescribe.ca` (Production + Preview/staging)

Do **not** put API secrets (JWT, DATABASE_URL, etc.) on the Vercel frontend project.
## Cost estimate (CAD/USD region Montreal)

| Item | Approx / month |
|------|----------------|
| e2-small | ~$12–14 |
| 30 GB pd-balanced | ~$3 |
| Static IP (in use) | ~$3 |
| **Total** | **~$18–20** |

Vercel hobby/pro for frontend is separate (often free hobby tier for staging).

## Access

```bash
# SSH (deploy key — do not commit private key)
ssh -i infra/staging/secrets/deploy_key ubuntu@34.19.234.40

# Or your personal key (also authorized on the VM)
ssh ubuntu@34.19.234.40
```

Super-admin credentials were generated into `infra/staging/secrets/staging-secrets.env` (gitignored). Seed also created demo tenant users on the VM.
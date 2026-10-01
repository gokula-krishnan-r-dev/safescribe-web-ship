# SafeScribe

Pharmacist clinical operating system — multi-tenant admin platform.

## Quick Start

```bash
# 1. Copy environment
cp .env.example .env

# 2. Start infrastructure + install + migrate + seed
make setup

# 3. Start dev servers (API :3001, Web :3000)
make dev
```

## URLs

| Service | URL |
|---------|-----|
| Web App | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Swagger | http://localhost:3001/api/docs |
| Mailpit | http://localhost:8025 |

## Production Checklist

Before deploying, set `NODE_ENV=production` and update:

```bash
# Generate secure secrets
openssl rand -base64 48   # use for JWT_ACCESS_SECRET
openssl rand -base64 48   # use for JWT_REFRESH_SECRET

# Required in production:
# - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (min 32 chars, not defaults)
# - SUPER_ADMIN_PASSWORD (min 12 chars, upper + number + special char)
# - DATABASE_URL, REDIS_URL (managed service URLs)
# - WEB_URL, API_URL, NEXT_PUBLIC_API_URL (your domains)
```

Production migrations: `make db-migrate-deploy` (uses `prisma migrate deploy`)

## Seed Accounts (development)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@safescript.com | SuperAdmin123! |
| Pharmacist Admin | admin@demo-pharmacy.com | Admin123! |
| Pharmacist | pharmacist@demo-pharmacy.com | Pharmacist123! |

## Project Structure

```
apps/api/     NestJS REST API
apps/web/     Next.js admin panel
prisma/       Database schema & seeds
docker/       PostgreSQL, Redis, Mailpit
packages/     Shared types
```

## Commands

```bash
make install      # Install dependencies
make dev          # Start API + Web
make build        # Production build
make db-migrate   # Run migrations
make db-seed      # Seed database
make db-reset     # Reset database
make docker-up    # Start Docker services
```

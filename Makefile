.PHONY: install dev build test lint format \
        docker-up docker-down docker-build \
        db-generate db-migrate db-migrate-deploy db-seed db-seed-renew db-reset db-studio \
        ai-install ai-dev ai-start ai-worker ai-test ai-lint \
        setup setup-ai \
        deploy-staging deploy-staging-api deploy-staging-web \
        deploy-production-web

# ─── Node / pnpm ─────────────────────────────────────────────────────────────

install:
	pnpm install --dangerously-allow-all-builds

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm -r test

lint:
	pnpm lint

format:
	pnpm format

# ─── Python AI Engine ────────────────────────────────────────────────────────

ai-install:
	cd apps/ai-engine && python3 -m venv .venv && \
	.venv/bin/pip install --upgrade pip && \
	.venv/bin/pip install -r requirements.txt
	@echo "AI Engine dependencies installed in apps/ai-engine/.venv"

ai-dev:
	@echo "Starting Python AI Engine in dev/reload mode on http://localhost:8010"
	@echo "(Host port 8010 avoids clashes with other local tools on :8000)"
	cd apps/ai-engine && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload

ai-start:
	@echo "Starting Python AI Engine (production mode) on http://localhost:8010"
	cd apps/ai-engine && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers 4

ai-worker:
	@echo "Starting Celery background worker"
	cd apps/ai-engine && .venv/bin/celery -A app.workers.celery_app worker --loglevel=info --concurrency=4

ai-test:
	cd apps/ai-engine && .venv/bin/pytest tests/ -v

ai-lint:
	cd apps/ai-engine && .venv/bin/ruff check app/ && .venv/bin/mypy app/

ai-health:
	@curl -s http://localhost:8010/health | python3 -m json.tool

# ─── Docker ──────────────────────────────────────────────────────────────────

COMPOSE := docker compose --env-file .env -f docker/docker-compose.yml

docker-up:
	$(COMPOSE) up -d postgres redis mailpit
	@echo "Infrastructure (Postgres, Redis, Mailpit) started"

docker-up-all:
	$(COMPOSE) up -d
	@echo "All services started (including AI Engine in Docker on host :8010)"

docker-down:
	$(COMPOSE) down

docker-build:
	$(COMPOSE) build ai-engine

docker-logs-ai:
	$(COMPOSE) logs -f ai-engine

# ─── Database ────────────────────────────────────────────────────────────────

db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

db-migrate-deploy:
	pnpm db:migrate:deploy

db-seed:
	pnpm db:seed

db-seed-renew:
	pnpm db:seed:renew-workflow

db-seed-clinical-references:
	pnpm db:seed:clinical-references

db-reset:
	pnpm db:reset

db-studio:
	pnpm db:studio

# ─── Full setup ──────────────────────────────────────────────────────────────

setup: docker-up install db-generate db-migrate db-seed
	@echo ""
	@echo "SafeScribe Node.js stack is ready."
	@echo "Run 'make dev'    to start the Node.js apps."
	@echo "Run 'make ai-dev' to start the Python AI Engine on http://localhost:8010"
	@echo "Ensure AI_ENGINE_URL=http://localhost:8010 in .env"

setup-ai: ai-install
	@echo ""
	@echo "Python AI Engine is ready."
	@echo "Run 'make ai-dev' to start in development mode (http://localhost:8010)."
	@echo "Run 'make ai-start' for production mode."
	@echo "Set AI_ENGINE_URL=http://localhost:8010 in your root .env"

# ─── Deploy (Vercel frontend + GCP Montreal API) ─────────────────────────────
# Staging and production share the Montreal VM. Deploy API first, then web.

STAGING_HOST ?= 34.19.234.40
STAGING_USER ?= ubuntu
STAGING_DEPLOY_KEY ?= infra/staging/secrets/deploy_key
VERCEL_CLI ?= npx --yes vercel@53.1.1

deploy-staging-api:
	STAGING_HOST=$(STAGING_HOST) STAGING_USER=$(STAGING_USER) \
	DEPLOY_KEY=$(STAGING_DEPLOY_KEY) \
	./infra/staging/scripts/remote-deploy.sh --api

deploy-staging-web:
	$(VERCEL_CLI) deploy --yes \
		--build-env NEXT_PUBLIC_API_URL=https://api-staging.safescribe.ca \
		--build-env NEXT_PUBLIC_SITE_URL=https://staging.safescribe.ca \
		--build-env NEXT_PUBLIC_SAFESCRIBE_RENEW_ENABLED=true \
		--build-env NEXT_PUBLIC_SAFESCRIBE_ADAPT_ENABLED=true \
		--env NEXT_PUBLIC_API_URL=https://api-staging.safescribe.ca \
		--env NEXT_PUBLIC_SITE_URL=https://staging.safescribe.ca \
		--env NEXT_PUBLIC_SAFESCRIBE_RENEW_ENABLED=true \
		--env NEXT_PUBLIC_SAFESCRIBE_ADAPT_ENABLED=true \
		| tee /tmp/safescribe-vercel-staging.url
	@url=$$(grep -Eo 'https://safescribe-[a-z0-9-]+\.vercel\.app' /tmp/safescribe-vercel-staging.url | tail -n 1); \
	test -n "$$url" || (echo "Could not parse Vercel preview URL" >&2; exit 1); \
	$(VERCEL_CLI) alias set "$$url" staging.safescribe.ca --scope team_cH3o1Qfz2W7p2VnYqWku0vFQ

deploy-production-web:
	$(VERCEL_CLI) deploy --prod --yes \
		--build-env NEXT_PUBLIC_API_URL=https://api.safescribe.ca \
		--build-env NEXT_PUBLIC_SITE_URL=https://safescribe.ca \
		--build-env NEXT_PUBLIC_SAFESCRIBE_RENEW_ENABLED=true \
		--build-env NEXT_PUBLIC_SAFESCRIBE_ADAPT_ENABLED=true \
		--env NEXT_PUBLIC_SAFESCRIBE_RENEW_ENABLED=true \
		--env NEXT_PUBLIC_SAFESCRIBE_ADAPT_ENABLED=true

deploy-staging: deploy-staging-api deploy-staging-web
	./infra/production/scripts/smoke-test.sh staging


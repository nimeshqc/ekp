# Single entry point for dev and production (architecture.md §11).
# Secrets load from .env (git-ignored); see .env.example.

-include .env
export

COMPOSE := docker compose
VENV    := backend/.venv
PIP     := $(VENV)/bin/pip
PY      := $(VENV)/bin/python

# local dev talks to the compose postgres published on localhost
DEV_DATABASE_URL ?= postgresql://ekp:$(POSTGRES_PASSWORD)@localhost:5432/ekp

.PHONY: help dev up down logs ps migrate seed link reload certs \
        dev-install dev-migrate dev-seed dev-link build-frontend

help:
	@grep -E '^[a-z][a-zA-Z-]*:' Makefile | sed 's/:.*//' | sort | uniq

# ---------------------------------------------------------------- production

up: certs                       ## build + start the full stack
	$(COMPOSE) up -d --build
	@echo "Stack is up — https://localhost (accept the self-signed cert for local use)"

down:                           ## stop the stack
	$(COMPOSE) down

logs:                           ## tail service logs
	$(COMPOSE) logs -f --tail=100

ps:                             ## status of services
	$(COMPOSE) ps

migrate:                        ## run DB migrations (inside the api container)
	$(COMPOSE) exec api python -m app.cli migrate

seed:                           ## ingest / refresh the default corpus
	$(COMPOSE) exec api python -m app.seed

link:                           ## mint a proposal link: make link LABEL="Acme — RAG bid" [HOURS=72]
	$(COMPOSE) exec api python -m app.cli link "$(or $(LABEL),Unnamed proposal)" \
		--hours $(or $(HOURS),72) --base $(or $(BASE),https://localhost)

reload:                         ## apply config.yaml changes (restart api)
	$(COMPOSE) restart api

certs:                          ## self-signed TLS certs (replace with Let's Encrypt in production)
	@mkdir -p nginx/certs
	@test -f nginx/certs/privkey.pem || \
		openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
			-keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
			-subj "/CN=localhost" 2>/dev/null
	@echo "certs ready in nginx/certs/"

# ---------------------------------------------------------------- development

dev-install: $(VENV)            ## create venv + install backend deps, npm install
	cd frontend && npm install

$(VENV):
	python3 -m venv $(VENV)
	$(PIP) install -q --upgrade pip
	$(PIP) install -q -e backend

dev: $(VENV)                    ## hot-reload API + Vite dev server + compose postgres
	$(COMPOSE) up -d postgres
	@trap 'kill 0' EXIT INT TERM; \
	( cd backend && DATABASE_URL=$(DEV_DATABASE_URL) \
	  .venv/bin/uvicorn app.main:app --reload --port 8000 ) & \
	( cd frontend && npm run dev ) & \
	wait

dev-migrate: $(VENV)
	cd backend && DATABASE_URL=$(DEV_DATABASE_URL) .venv/bin/python -m app.cli migrate

dev-seed: $(VENV)
	cd backend && DATABASE_URL=$(DEV_DATABASE_URL) .venv/bin/python -m app.seed

dev-link: $(VENV)               ## make dev-link LABEL="Acme — RAG bid"
	cd backend && DATABASE_URL=$(DEV_DATABASE_URL) .venv/bin/python -m app.cli link \
		"$(or $(LABEL),Local test link)" --hours $(or $(HOURS),72) --base http://localhost:5173

build-frontend:
	cd frontend && npm run build

# Enterprise Knowledge Platform

Self-contained document-ingestion + RAG demo: prospects open a signed, expiring
proposal link, upload documents (or use the pre-ingested corpus), and get
grounded, cited, streamed answers — with the whole pipeline (parse → clean →
chunk → embed → index, embed-query → retrieve → generate) visualized live.

Embeddings are computed **in-house** (bge-small ONNX int8 on CPU); only answer
generation calls an external LLM (Gemini). Designed to fit a single
2 vCPU / 4 GB box. See [docs/features.md](docs/features.md) and
[docs/architecture.md](docs/architecture.md).

## Quick start (production stack)

```bash
cp .env.example .env        # fill in GEMINI_API_KEY, passwords, JWT_SECRET
make up                     # builds + starts nginx, api, postgres (TLS self-signed)
make seed                   # ingest the default demo corpus
make link LABEL="Acme Corp — RAG bid"   # mint a proposal link to share
```

Open `https://<host>/admin` for the admin portal (credentials from `.env`).

### Stopping the production stack

```bash
make down                   # stop nginx, api, postgres (containers kept, not removed)
```

## Development

```bash
cp .env.example .env
make dev-install            # backend venv + npm install
make dev                    # postgres (docker) + uvicorn --reload + vite
make dev-seed               # seed default corpus into the dev DB
make dev-link LABEL="Local test"
```

Vite serves on `http://localhost:5173` and proxies `/api` to the local API on
port 8000.

### Stopping the dev stack

`make dev` runs uvicorn and Vite in the foreground — press `Ctrl+C` to stop
both. Then stop the dev postgres container:

```bash
make dev-down                # stop the postgres container used by `make dev`
```

## Configuration

- `config.yaml` — non-secret tunables (model, chunking, retrieval threshold,
  warm-up policy, limits). Apply changes with `make reload`.
- `.env` — secrets only (API key, admin login, JWT secret, DB password).

## Layout

```
backend/          FastAPI app (ingestion pipeline, RAG, links, admin)
frontend/         React + Vite + Tailwind SPA
nginx/            reverse proxy + TLS termination
docs/             feature spec and architecture
config.yaml       system config (versioned)
Makefile          single entry point for dev + prod
```

# Enterprise Knowledge Platform — Design & Architecture

Companion to [features.md](features.md). This document fixes the technology choices
and the system design for the demo. Every decision is driven by two constraints:

1. **In-house embeddings** (no external embedding API), **external LLM** (Gemini).
2. **Single box: 2 vCPU / 4 GB RAM / 80 GB SSD** — so we minimize the number of
   running services and avoid memory-hungry components.

A third, product-level goal shapes the design as much as the constraints:
**the prospect must *feel* minimal latency** during ingestion and RAG (see §4–§5).

---

## 1. Technology Decisions (finalized)

| Concern | Choice | Why (given the constraints) |
|---------|--------|-----------------------------|
| Backend | **Python 3.11 + FastAPI + Uvicorn** | Async, native SSE streaming, first-class LangChain support. |
| Orchestration | **LangChain** | Requested; wraps loaders, splitters, retrievers, Gemini. |
| Embeddings (in-house) | **`BAAI/bge-small-en-v1.5`** via `sentence-transformers`, served through **ONNX Runtime (int8)** on CPU | 384-dim, ~130 MB. ONNX int8 roughly halves RAM and cuts CPU latency vs. raw PyTorch — important on 2 vCPU. Fallback: `all-MiniLM-L6-v2`. |
| Vector store + metadata + tracking | **PostgreSQL 16 + `pgvector`** | One database for vectors *and* app data → one fewer service to fit in 4 GB. Ample for ≤5 docs/link. |
| LLM | **Gemini** (`gemini-2.0-flash`) via `langchain-google-genai` | External API as required; flash tier = cheap, fast, streams tokens. |
| Frontend | **React + Vite + Tailwind** | Fast, static build served by nginx; easy SSE + PDF.js integration. |
| PDF rendering/highlight | **PDF.js** | Client-side render + text-layer highlight, no server render load. |
| Reverse proxy / static | **nginx** | Serves the SPA, proxies `/api`, TLS termination. |
| Packaging | **Docker Compose**, driven by a **Makefile** | 3 containers on the single VM: `nginx`, `api`, `postgres`. |
| System config | **`config.yaml`** (non-secret, versioned) | Model names, chunking, retrieval, limits — see §9. |
| Secrets | **Environment variables** (never in YAML) | API keys, passwords, JWT secret — see §9. |
| Auth (admin) | Username/password from env → short-lived **JWT** | No user store needed for a single admin. |
| Proposal links | **Signed token (JWT)** + DB-backed usage counters | Presigned-URL behavior with server-enforced caps. |

### Why pgvector over a dedicated vector DB
Qdrant/Chroma/FAISS are all fine, but each adds a process and RAM. With a hard 4 GB
ceiling and tiny per-link corpora, folding vectors into Postgres (which we already need
for metadata, tracking, links, and feedback) is the lowest-footprint, lowest-ops choice.
If the corpus ever grows beyond demo scale, swapping in Qdrant is a localized change
behind the `VectorStore` interface (§7).

---

## 2. System Overview

```
                          ┌─────────────────────────────────────────┐
                          │            Single VM (2vCPU/4GB)         │
  Prospect  ──HTTPS──►    │  ┌────────┐   ┌──────────────────────┐  │
  (proposal link)         │  │ nginx  │──►│  FastAPI (Uvicorn)    │  │
  Admin     ──HTTPS──►    │  │  :443  │   │  - /api/admin/*       │  │
                          │  │ + SPA  │   │  - /api/proposal/*    │  │
                          │  └────────┘   │  - /api/ingest (SSE)  │  │
                          │               │  - /api/query  (SSE)  │  │
                          │               │  - /api/warm   (POST) │  │
                          │               │                       │  │
                          │               │  In-proc components:  │  │
                          │               │  • ONNX bge embedder  │  │
                          │               │    (ModelManager)     │  │
                          │               │  • LangChain pipeline │  │
                          │               │  • Gemini client ─────┼──┼──► Gemini API
                          │               └──────────┬───────────┘  │
                          │                          │              │
                          │                 ┌────────▼─────────┐    │
                          │                 │ PostgreSQL +     │    │
                          │                 │ pgvector         │    │
                          │                 └──────────────────┘    │
                          └─────────────────────────────────────────┘
```

Everything except the LLM call is local. The embedder is owned by a **`ModelManager`**
whose warm-up policy is configurable (§5).

---

## 3. Request Flows

### 3.1 Ingestion (streamed pipeline)
1. Prospect uploads files → `POST /api/ingest` (validates format, size, per-link caps).
2. API opens an **SSE stream**, processing each document and emitting a stage event after
   each step: `parse → clean → chunk → embed → index → done`.
3. **Parse:** format-specific loader (PyMuPDF for pdf text, python-docx, plain read).
   Character offsets are preserved so highlights can be anchored later.
4. **Chunk:** `RecursiveCharacterTextSplitter` (config-driven size/overlap). Each chunk
   stores `{doc_id, page, char_start, char_end, text}`.
5. **Embed:** batch-encode chunks with the ONNX bge embedder on CPU.
6. **Index:** bulk-insert chunks + vectors into pgvector under the link's namespace.
7. Per-stage timings and counts (tokens, chunks, embeddings) are streamed and persisted.

### 3.2 RAG Query (streamed answer)
1. Prospect asks a question → `POST /api/query` (checks & decrements query budget).
2. API opens an **SSE stream** emitting stages: `embed-query → retrieve → generate`.
3. **Retrieve:** embed the question, cosine top-k from pgvector within namespace; apply a
   similarity threshold for the grounding guarantee.
4. **Generate:** LangChain prompt = system (cite-and-ground rules) + retrieved chunks +
   question → Gemini with `stream=True`; tokens forwarded to the client as they arrive.
5. After the answer, a second short Gemini call produces **3 follow-up questions**.
6. Response carries the answer, cited chunk ids (with offsets), follow-ups, and full stats.

### 3.3 Warm-up signal
- When the prospect first opens a proposal link, the SPA fires `POST /api/warm` (fire-and-
  forget). This triggers the `ModelManager` to ensure the embedder, DB pool, and Gemini
  client are hot **before** the prospect uploads or asks (§4, §5).

### 3.4 Source Highlight
- Citation stores `{doc_id, char_start, char_end, page}`; clicking opens a new tab that
  renders the source (PDF.js for pdf, HTML for txt/md/docx) and highlights `[start,end)`.

---

## 4. Latency Strategy — making the demo *feel* instant

Perceived latency matters more than raw throughput here. We attack it on two fronts.

### 4.1 Hide latency (perceived)
- **Predictive warm-up on link open** — `/api/warm` heats the model, DB pool, and Gemini
  TLS connection during the seconds the prospect spends reading the page and picking
  files. The costly cold path is paid *before* they click, so their first action feels
  instant. (See §5 for the model side.)
- **Token streaming (TTFT-first)** — for RAG, what the user perceives is *time to first
  token*, not total generation time. Gemini flash + `stream=True` puts words on screen in
  a few hundred ms; total length becomes irrelevant to the feel.
- **Live pipeline stages via SSE** — ingestion shows `parse → chunk → embed → index` with
  live counts. Continuous visible progress reads as "fast and working," not "frozen."
- **Optimistic / skeleton UI** — the question echoes immediately, stat panels and citation
  slots render as skeletons and fill in as data arrives.
- **Default-corpus mode has zero ingestion wait** — its embeddings are precomputed at
  build/startup, so "try it now" is instant.

### 4.2 Reduce latency (actual)
- **Keep the model warm** — the single biggest avoidable cost is loading the model; the
  `ModelManager` keeps it resident (§5).
- **ONNX Runtime int8** — quantized bge-small is markedly faster on CPU and uses less RAM
  than PyTorch, directly helping the 2 vCPU budget.
- **Batched embedding** — chunk vectors are encoded in one batched call, not per-chunk.
- **Persistent clients & pooling** — a reused Postgres connection pool and a long-lived
  Gemini client (kept warm) avoid per-request connection/TLS/DNS setup.
- **Query-embedding LRU cache** — repeated/similar questions skip re-embedding.
- **HNSW index in pgvector** — fast approximate nearest-neighbour; retrieval stays in low
  double-digit ms at demo scale.
- **Tight `top_k` + threshold** — retrieve only what's needed, keeping the LLM prompt (and
  input tokens, and latency) small.
- **Frontend `preconnect`/`prefetch`** to the API origin on link open.

---

## 5. Model Lifecycle & Warm-up

> *Your question: can the embedding model be loaded in advance the first time a presigned
> URL is accessed, and unloaded after long idle? Is that viable? What else?*

**Short answer: yes, it's viable — and we make it a configurable policy rather than a hard
choice.** A `ModelManager` owns the embedder behind a lock and supports three modes via
`config.yaml` (`embedding.warm`):

| Mode | Behavior | When to use |
|------|----------|-------------|
| **`startup`** *(recommended default)* | Load once when the API boots; stay resident for the process lifetime. | Demo box where the model *is* the app. Zero cold start, ever. |
| **`on_link_open`** *(your idea)* | Model stays unloaded until the first `/api/warm` (link opened), then loads in the background. Optional `idle_unload_seconds` frees it after inactivity; the next link-open reloads it. | You need to reclaim RAM when nobody is using the platform, and can tolerate a one-time reload cost hidden behind link-open. |
| **`lazy`** | Load on first actual ingest/query. | Lowest idle RAM, but the *first prospect action* pays the ~2–5 s load — worst perceived latency. Avoid for demos. |

**Why `startup` is the recommended default here:** there is exactly **one shared embedder
instance** for the whole box, it's small (~150–300 MB as ONNX int8), and embedding is the
platform's core function. Keeping it always-warm costs a little steady RAM but removes cold
starts entirely — the safest bet for a live sales demo where a stall in front of a prospect
is the worst outcome. Reserve idle-unload for cases where the box must share RAM with other
workloads.

**Your load-on-first-URL-access approach, refined:** it *is* a good instinct — the key
improvement is to trigger the load on **link open (`/api/warm`)**, not on the first
ingest/query. That way the load happens during the prospect's think/upload time and is
invisible, giving you the RAM savings of lazy loading without the latency penalty. Idle
teardown is then safe because the next visitor re-warms on open. Guardrails when using it:
- Serialize load/unload with a lock; queue any request that arrives mid-load rather than
  triggering a second load.
- Debounce `idle_unload` (e.g. only unload after N minutes truly idle) to avoid
  load/unload thrash.
- Never unload mid-request; the manager holds a refcount.

**Alternatives / complements considered:**
- **Always-warm + ONNX int8 (chosen default)** — simplest, most predictable.
- **Warm on link-open + idle unload (your approach, as a config option)** — RAM-adaptive.
- **Separate lightweight model process** kept warm and talked to over a local socket — more
  robust isolation, but an extra process we don't need on a single 4 GB box.
- **Precompute-only for default corpus** — regardless of mode, default-corpus vectors are
  built ahead of time so that path never waits on the model at all.

---

## 6. Data Model (PostgreSQL)

```
proposal_link
  id, token_jti, label, created_by,
  max_ingestions, max_queries,
  used_ingestions, used_queries,
  expires_at, revoked, created_at

document
  id, link_id (nullable → default corpus), corpus ('user'|'default'),
  filename, mime, size_bytes, page_count, word_count,
  status, ingested_at

chunk
  id, document_id, ordinal, page, char_start, char_end,
  text, token_count,
  embedding vector(384)          -- pgvector, hnsw index

ingestion_event   -- one row per stage, for stats
  id, document_id, stage, duration_ms, metrics_json, ts

query_log
  id, link_id, question, answer,
  retrieved_chunk_ids, retrieval_ms, ttft_ms, total_ms,
  input_tokens, output_tokens, est_cost, model, ts

feedback
  id, query_log_id, verdict ('like'|'dislike'), reason, ts
```

The `default` corpus uses `link_id = NULL`; per-link data is namespaced by `link_id`,
giving strict isolation between prospects.

---

## 7. Key Internal Interfaces (kept swappable)

```python
class Embedder:            # ONNX bge-small today; swap without touching callers
    def embed(texts: list[str]) -> list[list[float]]: ...

class ModelManager:        # owns warm-up policy from config (§5)
    def ensure_warm() -> None: ...        # called by /api/warm
    def get() -> Embedder: ...            # refcounted; blocks during load
    def maybe_unload() -> None: ...       # idle teardown, if enabled

class VectorStore:         # pgvector today; Qdrant later if needed
    def upsert(namespace, chunks): ...
    def search(namespace, query_vec, k) -> list[ScoredChunk]: ...

class LLM:                 # Gemini today
    def stream(messages) -> Iterator[str]: ...
    def complete(messages) -> str: ...
```

Isolating these means model/store/LLM choices can change with near-zero blast radius —
useful when a prospect asks "can you use *our* model / *our* vector DB?".

---

## 8. Proposal Link Security

- Token is a **signed JWT** carrying `link_id`, `jti`, `exp`; the server also checks the DB
  row for `revoked` and remaining budget on every call (JWT alone is not trusted for caps —
  counters live server-side to prevent replay/abuse).
- **Caps enforced atomically:** ingestion/query counters increment in the same transaction
  that authorizes the action, so parallel requests can't overshoot.
- **Expiry** enforced by both JWT `exp` and DB `expires_at`.
- Prospect endpoints require a valid link token; admin endpoints require the admin JWT.
- `/api/warm` is rate-limited and requires a valid link token so it can't be used to force
  model loads as a resource-exhaustion vector.
- Upload validation: extension + magic-byte sniff, size cap, and file-count cap.

---

## 9. Configuration

**Split by sensitivity:** everything non-secret and tunable lives in a versioned
`config.yaml`; every credential lives in environment variables and is **never** written to
YAML or committed.

### 9.1 `config.yaml` (system-wide, versioned)

```yaml
embedding:
  model: BAAI/bge-small-en-v1.5
  backend: onnx-int8        # onnx-int8 | torch
  device: cpu
  threads: 2                # pin to the 2 vCPUs
  batch_size: 32
  max_seq_length: 512
  warm: startup             # startup | on_link_open | lazy   (see §5)
  idle_unload_seconds: 0    # 0 = never unload; e.g. 900 for on_link_open

llm:
  provider: gemini
  model: gemini-2.0-flash
  temperature: 0.2
  max_output_tokens: 1024
  stream: true

chunking:
  splitter: recursive       # recursive | markdown | sentence
  chunk_size: 800
  chunk_overlap: 120

retrieval:
  index: hnsw
  top_k: 5
  score_threshold: 0.30     # grounding guarantee

follow_ups:
  enabled: true
  count: 3

limits:                     # defaults; admin can override per link
  default_max_ingestions: 5
  default_max_queries: 25
  max_file_mb: 25
  max_files: 5
```

Config is loaded once at startup into a validated settings object (e.g. Pydantic). A
`make reload` / container restart applies changes.

### 9.2 Environment variables (secrets — never in YAML)

```
GEMINI_API_KEY        # external LLM credential
ADMIN_USERNAME        # admin login
ADMIN_PASSWORD        # admin login (hashed at rest if stored)
JWT_SECRET            # signs admin + proposal-link tokens
POSTGRES_PASSWORD     # database credential
DATABASE_URL          # assembled DSN (may reference the above)
```

`.env.example` is committed; the real `.env` is git-ignored and loaded by Docker Compose /
the Makefile.

---

## 10. Resource Budget (fits 4 GB RAM)

| Component | Approx. RSS |
|-----------|-------------|
| PostgreSQL + pgvector | ~250–400 MB |
| FastAPI + ONNX bge embedder | ~0.5–0.9 GB |
| nginx | ~20 MB |
| OS + headroom | remainder |

Guardrails to stay safe on 2 vCPU:
- ONNX int8 embedder with `threads` pinned to 2 and a capped `batch_size`.
- Uvicorn runs **1 worker** (model loaded once; concurrency via async I/O, CPU work
  serialized) — appropriate for a demo's low concurrency and keeps memory flat.
- Small corpora (≤5 docs) keep the vector index and working set tiny.

---

## 11. Deployment & Dev Workflow

- **`docker-compose.yml`** with three services: `nginx`, `api`, `postgres` (pgvector
  image). Named volume for Postgres data on the 80 GB SSD.
- **A `Makefile` is the single entry point** for both dev and production. Representative
  targets:

  ```
  make dev        # hot-reload API + Vite dev server, local Postgres
  make up         # build + start the full prod stack (compose up -d)
  make down       # stop the stack
  make logs       # tail service logs
  make migrate    # run DB migrations
  make seed       # ingest / refresh the default corpus
  make link       # CLI helper to mint a proposal link (admin)
  make reload     # reload config.yaml (restart api)
  make ps         # status of services
  ```

- **Config vs. secrets:** `config.yaml` is mounted into the `api` container; secrets come
  from `.env` (git-ignored) via Compose `env_file`.
- **Startup sequence:** migrate → seed/verify default corpus → warm embedder (per policy).
- **TLS:** nginx with a certificate (Let's Encrypt or provided) so proposal links are HTTPS.

---

## 12. Suggested Repository Layout

```
ekp/
├─ docs/                     features.md, architecture.md
├─ config.yaml              system-wide, versioned config (§9.1)
├─ .env.example             documents required secrets (§9.2)
├─ Makefile                 dev + prod entry point (§11)
├─ docker-compose.yml
├─ backend/
│  ├─ app/
│  │  ├─ main.py             FastAPI app + routers
│  │  ├─ config.py           loads/validates config.yaml + env
│  │  ├─ api/                admin, proposal, ingest, query, warm routes
│  │  ├─ core/               model_manager, embedder, vectorstore, llm, pipeline
│  │  ├─ models/             SQLAlchemy models + migrations
│  │  └─ services/           link mgmt, stats, feedback
│  ├─ default_corpus/        shipped demo documents
│  └─ pyproject.toml
├─ frontend/                 React + Vite + Tailwind SPA (PDF.js viewer)
└─ nginx/                    nginx.conf
```

---

## 13. Build Order (recommended)

1. **UI mockup** — click-through of the prospect flow (link landing → mode choice →
   upload/ingest with live pipeline → query → streamed answer + citations + stats +
   follow-ups) and the admin portal. Locks the UX and the API contract before backend work.
2. Config plumbing (`config.yaml` + env), DB schema, `proposal_link`, admin auth, and
   link generation/enforcement.
3. Ingestion pipeline with SSE stage streaming + stats persistence.
4. `ModelManager` + warm-up policy (`/api/warm`) and pgvector retrieval.
5. Gemini streaming answers with citations + grounding guarantee.
6. Wire the mockup to live endpoints: streamed answer, live pipeline, stats panels.
7. Source viewer + highlight (PDF.js + HTML rendering).
8. Follow-up questions, like/dislike, admin dashboard.
9. Default corpus, Docker Compose, Makefile, TLS, resource/latency tuning.

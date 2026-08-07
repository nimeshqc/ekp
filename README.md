# Enterprise Knowledge Platform

## AIM

### **Document Intelligence and Knowledge Querying**:

Upload your documents (or use demo corpus), ask natural questions, and get cited answers from your own content. 

### **Transformation Flow** :

Parse and transform documets into sementaically searchable knowledge base.

### **RAG AI Agent** :

Analyse user's query, Search relevant knowledge from vector Database and Generate qualitative answer with follow up questions.

---

## Backend architecture & tech-stack

### Stack at a glance


| Layer          | Choice                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| **Framework**  | Langchain, Langgraph                                                   |
| **API**        | Python 3.11 · FastAPI · Uvicorn (async SSE)                            |
| **Embeddings** | `BAAI/bge-small-en-v1.5` via ONNX Runtime (int8) on CPU                |
| **Chunking**   | LangChain text splitters                                               |
| **LLM**        | Gemini                                                                 |
| **Database**   | PostgreSQL 16 + **pgvector** (HNSW) — vectors *and* app data in one DB |




### Runtime topology

Everything except the Gemini call stays on the box. nginx terminates TLS and serves the SPA; the API owns ingestion, retrieval, and generation in-process.

```mermaid
flowchart LR
  %% User interaction
  User["User"]
  User -->|HTTPS| App["Web App"]
  %% Web App calls API
  App -->|API Request| API["FastAPI Backend"]

  %% Ingestion and RAG (High Level)
  subgraph Ingestion["Ingestion Pipeline"]
  end

  subgraph RAG["RAG Query Flow"]
  end

  %% API orchestrates Ingestion and RAG
  API -->|Ingestion| Ingestion
  API -->|RAG Query| RAG
  API -->|Embed/Query| DB["PostgreSQL + pgvector"]
  API -->|LLM| Gemini["Gemini API"]

  classDef user fill:#f1f5f9,stroke:#334155,color:#334155
  classDef web fill:#bae6fd,stroke:#0ea5e9,color:#0369a1
  classDef api fill:#fee2e2,stroke:#ef4444,color:#991b1b
  classDef db fill:#bbf7d0,stroke:#22c55e,color:#065f46
  classDef llm fill:#fcd34d,stroke:#f59e42,color:#78350f
  classDef ingestion fill:#e0e7ff,stroke:#312e81,color:#3730a3
  classDef rag fill:#fef9c3,stroke:#ca8a04,color:#78350f

  class User user
  class App web
  class API api
  class DB db
  class Gemini llm
  class Ingestion ingestion
  class RAG rag
```





### Document ingestion workflow

Upload → validate → consume ingest budget → stream each stage over SSE (`parse → clean → chunk → embed → index`). Chunks keep character offsets so citations can highlight the source later.

```mermaid
flowchart TD
  U["POST /api/ingest<br/>multipart upload"] --> P["Parse<br/>PDF / DOCX / text"]
  P --> CC["Clean & Curate<br/>quality filter, manual/auto"]
  CC --> K["Chunk<br/>recursive splitter"]
  K --> E["Embed<br/>ONNX bge batch"]
  E --> I["Index<br/>pgvector namespace"]
  I --> VDB["Vector Database"]

  classDef step fill:#2563eb,stroke:#1e40af,color:#eff6ff
  classDef io fill:#0d9488,stroke:#115e59,color:#f0fdfa
  classDef out fill:#7c3aed,stroke:#5b21b6,color:#f5f3ff
  classDef db fill:#bbf7d0,stroke:#22c55e,color:#065f46

  class U,S io
  class P,CC,K,E step
  class I out
  class VDB db
```

### RAG query workflow

Question → consume query budget → embed (LRU-cached) → HNSW retrieve in the link’s namespace → **grounding check**. Below the similarity threshold the API refuses without calling Gemini; otherwise it streams tokens and follow-up suggestions.

```mermaid
flowchart TD
  Q["POST /api/query"] --> RW["Rewrite/Rephrase query"]
  RW --> EQ["Embed query<br/>ONNX + LRU cache"]
  EQ --> R["Retrieve top-k<br/>cosine · HNSW"]
  R --> T{"score ≥ threshold?<br/>(default 0.55)"}
  T -->|no| Refuse["Grounded refusal<br/>no LLM call"]
  T -->|yes| Gen["Gemini answer<br/>+ citation markers"]
  Gen --> FU["Follow-up questions<br/>(2nd LLM call)"]
  Refuse --> Log["Persist query_log"]
  FU --> Log
  Log --> Done["Done + stats"]

  classDef ok fill:#15803d,stroke:#14532d,color:#f0fdf4
  classDef warn fill:#b45309,stroke:#78350f,color:#fffbeb
  classDef core fill:#1d4ed8,stroke:#1e3a8a,color:#eff6ff
  classDef gate fill:#db2777,stroke:#9d174d,color:#fdf2f8

  class Q,RW,EQ,R,Gen,FU,Log,Done core
  class T gate
  class Refuse warn
```

## Quick start (production)

```bash
cp .env.example .env        # GEMINI_API_KEY, passwords, JWT_SECRET
make up                     # builds + starts nginx, api, postgres (TLS self-signed)
make seed                   # ingest the default demo corpus
make link LABEL="Acme Corp — RAG bid"   # mint a proposal link to share
```

Open `https://<host>/admin` for the admin portal (credentials from `.env`).

```bash
make down                   # stop nginx, api, postgres (containers kept)
```

## Development

```bash
cp .env.example .env
make dev-install            # backend venv + npm install
make dev                    # postgres (docker) + uvicorn --reload + vite
make dev-seed               # seed default corpus into the dev DB
make dev-link LABEL="Local test"
```

Vite serves on `http://localhost:5173` and proxies `/api` to the local API on port 8000.

`make dev` runs uvicorn and Vite in the foreground — press `Ctrl+C` to stop both, then:

```bash
make dev-down               # stop the postgres container used by `make dev`
```

## Configuration

- `config.yaml` — non-secret tunables (model, chunking, retrieval threshold, warm-up policy, limits). Apply with `make reload`.
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


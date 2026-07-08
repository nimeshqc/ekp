"""FastAPI app — single Uvicorn worker on the demo box (architecture.md §10):
the embedder loads once, request concurrency rides on async I/O, and CPU-bound
work (parse/embed) runs in the default thread pool.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import admin, ingest, proposal, query
from .config import load_settings
from .core.embedder import QueryEmbeddingCache
from .core.llm import GeminiLLM
from .core.model_manager import ModelManager
from .db import create_pool, migrate

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ekp")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    dsn = settings.secrets.database_url

    # startup sequence (§11): migrate → open pool → warm embedder per policy
    await migrate(dsn)
    pool = create_pool(dsn)
    await pool.open(wait=True)

    app.state.settings = settings
    app.state.pool = pool
    app.state.mm = ModelManager(settings.embedding)
    app.state.llm = GeminiLLM(settings.llm, settings.secrets.gemini_api_key)
    app.state.query_cache = QueryEmbeddingCache()

    if settings.embedding.warm == "startup":
        await app.state.mm.ensure_warm()
    app.state.mm.start_idle_watchdog()
    app.state.llm.warm()

    if not settings.secrets.jwt_secret:
        log.warning("JWT_SECRET is empty — set it before exposing this service")
    if not settings.secrets.gemini_api_key:
        log.warning("GEMINI_API_KEY is empty — answer generation will fail")

    log.info("EKP api ready (warm=%s, model=%s)",
             settings.embedding.warm, settings.embedding.model)
    yield

    await app.state.mm.stop()
    await pool.close()


app = FastAPI(title="Enterprise Knowledge Platform", lifespan=lifespan)

app.include_router(proposal.router)
app.include_router(ingest.router)
app.include_router(query.router)
app.include_router(admin.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

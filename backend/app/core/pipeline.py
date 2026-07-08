"""Ingestion pipeline (architecture.md §3.1): parse → clean → chunk → embed →
index, emitted as a stream of stage events matching the frontend contract
(frontend/src/api/types.ts IngestEvent). Per-stage timings and metrics are
persisted to ingestion_event as they happen.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncIterator

from ..config import Settings
from .chunking import split_text
from .model_manager import ModelManager
from .parsing import (
    MIME_BY_EXT,
    ParseError,
    clean_text,
    estimate_tokens,
    ext_of,
    join_pages,
    page_starts,
    parse_file,
)
from .vectorstore import upsert_chunks

log = logging.getLogger("ekp.pipeline")


async def ingest_document(
    pool,
    mm: ModelManager,
    settings: Settings,
    *,
    link_id: str | None,
    corpus: str,
    filename: str,
    data: bytes,
) -> AsyncIterator[dict]:
    """Process one document, yielding doc-start / stage / doc-done / error
    events. The caller handles budget consumption and SSE framing."""

    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            INSERT INTO document (link_id, corpus, filename, mime, size_bytes)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
            """,
            (link_id, corpus, filename, MIME_BY_EXT.get(ext_of(filename), ""), len(data)),
        )
        doc_id = str((await cur.fetchone())["id"])

    yield {"type": "doc-start", "docId": doc_id, "filename": filename, "sizeBytes": len(data)}

    stage_records: list[dict] = []
    t_doc = time.perf_counter()

    async def record_stage(stage: str, duration_ms: int, metrics: dict) -> None:
        stage_records.append({"stage": stage, "durationMs": duration_ms, "metrics": metrics})
        async with pool.connection() as conn:
            await conn.execute(
                """
                INSERT INTO ingestion_event (document_id, stage, duration_ms, metrics_json)
                VALUES (%s, %s, %s, %s)
                """,
                (doc_id, stage, duration_ms, json.dumps(metrics)),
            )

    try:
        # ---- parse ------------------------------------------------------
        yield {"type": "stage", "docId": doc_id, "stage": "parse", "status": "started"}
        t0 = time.perf_counter()
        parsed = await asyncio.to_thread(parse_file, filename, data)
        raw_chars = sum(len(p) for p in parsed.pages)
        word_count = sum(len(p.split()) for p in parsed.pages)
        ms = int((time.perf_counter() - t0) * 1000)
        metrics = {"words": word_count, "chars": raw_chars}
        if parsed.page_count:
            metrics = {"pages": parsed.page_count, **metrics}
        await record_stage("parse", ms, metrics)
        yield {"type": "stage", "docId": doc_id, "stage": "parse", "status": "completed",
               "durationMs": ms, "metrics": metrics}

        # ---- clean ------------------------------------------------------
        yield {"type": "stage", "docId": doc_id, "stage": "clean", "status": "started"}
        t0 = time.perf_counter()
        cleaned_pages, removed = [], 0
        for p in parsed.pages:
            cp, r = clean_text(p)
            cleaned_pages.append(cp)
            removed += r
        full_text = join_pages(cleaned_pages)
        starts = page_starts(cleaned_pages)
        ms = int((time.perf_counter() - t0) * 1000)
        metrics = {"chars": len(full_text), "removed ws": removed}
        await record_stage("clean", ms, metrics)
        yield {"type": "stage", "docId": doc_id, "stage": "clean", "status": "completed",
               "durationMs": ms, "metrics": metrics}

        if not full_text:
            raise ParseError("document is empty after cleaning")

        # ---- chunk ------------------------------------------------------
        yield {"type": "stage", "docId": doc_id, "stage": "chunk", "status": "started"}
        t0 = time.perf_counter()
        chunks = await asyncio.to_thread(
            split_text, full_text, starts, cleaned_pages, settings.chunking,
            paginated=parsed.page_count is not None,
        )
        ms = int((time.perf_counter() - t0) * 1000)
        avg_chars = round(sum(len(c.text) for c in chunks) / max(1, len(chunks)))
        metrics = {"chunks": len(chunks), "avg chars": avg_chars,
                   "overlap": settings.chunking.chunk_overlap}
        await record_stage("chunk", ms, metrics)
        yield {"type": "stage", "docId": doc_id, "stage": "chunk", "status": "completed",
               "durationMs": ms, "metrics": metrics}

        # ---- embed ------------------------------------------------------
        yield {"type": "stage", "docId": doc_id, "stage": "embed", "status": "started"}
        t0 = time.perf_counter()
        async with mm.lease() as embedder:
            vectors = await asyncio.to_thread(
                embedder.embed_passages, [c.text for c in chunks]
            )
            dim, model_name = embedder.dim, embedder.name
        ms = int((time.perf_counter() - t0) * 1000)
        metrics = {"embeddings": len(vectors), "dim": dim,
                   "batch": settings.embedding.batch_size}
        await record_stage("embed", ms, metrics)
        yield {"type": "stage", "docId": doc_id, "stage": "embed", "status": "completed",
               "durationMs": ms, "metrics": metrics}

        # ---- index ------------------------------------------------------
        yield {"type": "stage", "docId": doc_id, "stage": "index", "status": "started"}
        t0 = time.perf_counter()
        async with pool.connection() as conn:
            async with conn.transaction():
                async with conn.cursor() as cur2:
                    await cur2.executemany(
                        "INSERT INTO document_page (document_id, page, text) VALUES (%s, %s, %s)",
                        [(doc_id, i + 1, p) for i, p in enumerate(cleaned_pages)],
                    )
                await upsert_chunks(
                    conn,
                    doc_id,
                    [
                        {
                            "ordinal": c.ordinal,
                            "page": c.page,
                            "char_start": c.char_start,
                            "char_end": c.char_end,
                            "text": c.text,
                            "token_count": c.token_count,
                            "embedding": vectors[i],
                        }
                        for i, c in enumerate(chunks)
                    ],
                )
                await conn.execute(
                    """
                    UPDATE document
                    SET status = 'ready', page_count = %s, word_count = %s
                    WHERE id = %s
                    """,
                    (parsed.page_count, word_count, doc_id),
                )
        ms = int((time.perf_counter() - t0) * 1000)
        metrics = {"vectors": len(chunks), "index": settings.retrieval.index}
        await record_stage("index", ms, metrics)
        yield {"type": "stage", "docId": doc_id, "stage": "index", "status": "completed",
               "durationMs": ms, "metrics": metrics}

        # ---- done -------------------------------------------------------
        total_ms = int((time.perf_counter() - t_doc) * 1000)
        token_count = estimate_tokens(full_text)
        yield {
            "type": "doc-done",
            "docId": doc_id,
            "stats": {
                "docId": doc_id,
                "filename": filename,
                "sizeBytes": len(data),
                "pageCount": parsed.page_count,
                "wordCount": word_count,
                "chunkCount": len(chunks),
                "tokenCount": token_count,
                "embeddingCount": len(vectors),
                "vectorDim": dim,
                "embeddingModel": model_name,
                "totalMs": total_ms,
                "stages": stage_records,
            },
        }

    except ParseError as e:
        async with pool.connection() as conn:
            await conn.execute("UPDATE document SET status = 'failed' WHERE id = %s", (doc_id,))
        yield {"type": "error", "docId": doc_id, "message": f"{filename}: {e}"}
    except Exception:
        # swallow so the stream survives: remaining documents still process
        # and the client still receives the final aggregate event
        log.exception("ingestion of %s failed", filename)
        async with pool.connection() as conn:
            await conn.execute("UPDATE document SET status = 'failed' WHERE id = %s", (doc_id,))
        yield {"type": "error", "docId": doc_id,
               "message": f"{filename}: ingestion failed unexpectedly"}

"""Prospect-facing endpoints: link info, warm-up, default corpus, source docs."""

from __future__ import annotations

import asyncio
import time
import uuid

from fastapi import APIRouter, HTTPException, Request

from ..core.parsing import kind_of
from ..services.links import link_info
from .deps import bearer_or_query_token, require_link

router = APIRouter()

# /api/warm rate limit (§8): once per link per interval is plenty — it only
# needs to fire when a prospect opens the landing page.
_WARM_INTERVAL_S = 10
_warm_last: dict[str, float] = {}


@router.get("/api/proposal/info")
async def proposal_info(request: Request):
    # allow_inactive: revoked/expired links still return their metadata so the
    # UI can show the right blocked screen (enforcement happens on actions).
    link = await require_link(request, allow_inactive=True)
    return link_info(link, bearer_or_query_token(request))


@router.post("/api/warm")
async def warm(request: Request):
    """Predictive warm-up on link open (§3.3, §4.1): heat the embedder, DB
    pool, and Gemini client while the prospect is still reading the page."""
    link = await require_link(request)
    st = request.app.state

    lid = str(link["id"])
    now = time.monotonic()
    if now - _warm_last.get(lid, 0) < _WARM_INTERVAL_S:
        return {"status": "ready"}
    _warm_last[lid] = now

    async with st.pool.connection() as conn:  # DB pool is hot
        await conn.execute("SELECT 1")
    st.llm.warm()  # client construction (TLS setup happens lazily on 1st call)
    if st.settings.embedding.warm != "lazy":
        try:
            await asyncio.wait_for(st.mm.ensure_warm(), timeout=120)
        except asyncio.TimeoutError:
            raise HTTPException(503, "model warm-up timed out")
    return {"status": "ready"}


@router.get("/api/corpus/default")
async def default_corpus(request: Request):
    st = request.app.state
    async with st.pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT id, filename FROM document
            WHERE corpus = 'default' AND status = 'ready'
            ORDER BY filename
            """
        )
        rows = await cur.fetchall()
    return [
        {"docId": str(r["id"]), "filename": r["filename"], "kind": kind_of(r["filename"])}
        for r in rows
    ]


@router.get("/api/source/{doc_id}")
async def source_doc(doc_id: str, request: Request):
    """Parsed page texts for the viewer. Default-corpus docs are public;
    user docs require the owning link's token (§3.4, §8)."""
    st = request.app.state
    try:
        doc_uuid = uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(404, "document not found")
    async with st.pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, link_id, corpus, filename, status FROM document WHERE id = %s",
            (doc_uuid,),
        )
        doc = await cur.fetchone()
        if doc is None or doc["status"] != "ready":
            raise HTTPException(404, "document not found")

        if doc["corpus"] != "default":
            link = await require_link(request)
            if link["id"] != doc["link_id"]:
                raise HTTPException(403, "document belongs to another workspace")

        cur = await conn.execute(
            "SELECT page, text FROM document_page WHERE document_id = %s ORDER BY page",
            (doc_id,),
        )
        pages = await cur.fetchall()

    return {
        "docId": str(doc["id"]),
        "filename": doc["filename"],
        "kind": kind_of(doc["filename"]),
        "pages": [{"page": p["page"], "text": p["text"]} for p in pages],
    }

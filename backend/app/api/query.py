"""POST /api/query — SSE answer stream (§3.2) and POST /api/feedback (§8 of
features.md). The query budget is checked & decremented atomically before the
stream opens, so parallel requests can't overshoot the cap."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..core.rag import query_stream
from ..services.links import consume_budget
from .deps import SSE_HEADERS, require_link, sse

router = APIRouter()


class QueryBody(BaseModel):
    corpus: str = Field(pattern="^(user|default)$")
    question: str = Field(min_length=1, max_length=2000)


@router.post("/api/query")
async def query(body: QueryBody, request: Request):
    link = await require_link(request)
    st = request.app.state

    async with st.pool.connection() as conn:
        updated = await consume_budget(conn, link["id"], "query")
    if updated is None:
        raise HTTPException(429, "query budget for this link is used up")

    async def stream():
        async for event in query_stream(
            st.pool, st.mm, st.llm, st.settings, st.query_cache,
            link_id=link["id"], corpus=body.corpus, question=body.question.strip(),
        ):
            yield sse(event)

    return StreamingResponse(stream(), media_type="text/event-stream", headers=SSE_HEADERS)


class FeedbackBody(BaseModel):
    queryId: str
    verdict: str = Field(pattern="^(like|dislike)$")
    reason: str | None = Field(default=None, max_length=1000)


@router.post("/api/feedback")
async def feedback(body: FeedbackBody, request: Request):
    link = await require_link(request)
    st = request.app.state
    try:
        query_id = uuid.UUID(body.queryId)
    except ValueError:
        raise HTTPException(400, "malformed query id")
    async with st.pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id FROM query_log WHERE id = %s AND link_id = %s",
            (query_id, link["id"]),
        )
        if await cur.fetchone() is None:
            raise HTTPException(404, "query not found for this link")
        await conn.execute(
            "INSERT INTO feedback (query_log_id, verdict, reason) VALUES (%s, %s, %s)",
            (query_id, body.verdict, body.reason),
        )
    return {"status": "ok"}

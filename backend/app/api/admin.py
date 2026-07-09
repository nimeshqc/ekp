"""Admin portal endpoints: login, proposal-link management, usage dashboard."""

from __future__ import annotations

import hmac
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..services import links as link_svc
from .deps import require_admin

router = APIRouter()


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/api/admin/login")
async def login(body: LoginBody, request: Request):
    sec = request.app.state.settings.secrets
    if not sec.admin_username or not sec.admin_password:
        raise HTTPException(503, "admin credentials are not configured")
    ok = hmac.compare_digest(body.username, sec.admin_username) & hmac.compare_digest(
        body.password, sec.admin_password
    )
    if not ok:
        raise HTTPException(401, "invalid credentials")
    return {"token": link_svc.mint_admin_token(sec.jwt_secret)}


class CreateLinkBody(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    maxIngestions: int = Field(ge=1, le=100)
    maxQueries: int = Field(ge=1, le=1000)
    expiresInHours: int = Field(ge=1, le=8760)


@router.get("/api/admin/links", dependencies=[Depends(require_admin)])
async def list_links(request: Request):
    st = request.app.state
    async with st.pool.connection() as conn:
        rows = await link_svc.list_links(conn)
    secret = st.settings.secrets.jwt_secret
    return [link_svc.link_public(r, secret) for r in rows]


@router.post("/api/admin/links", dependencies=[Depends(require_admin)])
async def create_link(body: CreateLinkBody, request: Request):
    st = request.app.state
    async with st.pool.connection() as conn:
        row = await link_svc.create_link(
            conn,
            label=body.label.strip(),
            max_ingestions=body.maxIngestions,
            max_queries=body.maxQueries,
            expires_in_hours=body.expiresInHours,
        )
    return link_svc.link_public(row, st.settings.secrets.jwt_secret)


@router.post("/api/admin/links/{link_id}/revoke", dependencies=[Depends(require_admin)])
async def revoke(link_id: str, request: Request):
    try:
        lid = uuid.UUID(link_id)
    except ValueError:
        raise HTTPException(404, "link not found")
    async with request.app.state.pool.connection() as conn:
        await link_svc.revoke_link(conn, lid)
    return {"status": "ok"}


@router.get("/api/admin/dashboard", dependencies=[Depends(require_admin)])
async def dashboard(request: Request):
    """Totals + activity feed across all links (features.md §10)."""
    st = request.app.state
    async with st.pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT * FROM (
                SELECT d.id::text            AS id,
                       d.ingested_at         AS ts,
                       coalesce(pl.label, 'Default corpus') AS link_label,
                       'ingestion'           AS kind,
                       d.filename            AS detail,
                       coalesce((SELECT sum(ie.duration_ms) FROM ingestion_event ie
                                 WHERE ie.document_id = d.id), 0)::int AS latency_ms,
                       coalesce((SELECT sum(c.token_count) FROM chunk c
                                 WHERE c.document_id = d.id), 0)::int  AS tokens,
                       0::numeric            AS est_cost,
                       NULL::text            AS feedback
                FROM document d
                LEFT JOIN proposal_link pl ON pl.id = d.link_id
                WHERE d.corpus = 'user'
                UNION ALL
                SELECT q.id::text, q.ts,
                       coalesce(pl.label, '—'),
                       'query', q.question,
                       q.total_ms,
                       q.input_tokens + q.output_tokens,
                       q.est_cost,
                       (SELECT f.verdict FROM feedback f
                        WHERE f.query_log_id = q.id ORDER BY f.ts DESC LIMIT 1)
                FROM query_log q
                LEFT JOIN proposal_link pl ON pl.id = q.link_id
            ) events
            ORDER BY ts DESC
            LIMIT 100
            """
        )
        events = await cur.fetchall()

        cur = await conn.execute(
            """
            SELECT
              (SELECT count(*) FROM proposal_link
               WHERE NOT revoked AND expires_at > now())               AS active_links,
              (SELECT count(*) FROM document WHERE corpus = 'user')    AS ingestions,
              (SELECT count(*) FROM query_log)                         AS queries,
              (SELECT coalesce(sum(input_tokens + output_tokens), 0)
               FROM query_log)                                         AS query_tokens,
              (SELECT coalesce(sum(c.token_count), 0) FROM chunk c
               JOIN document d ON d.id = c.document_id
               WHERE d.corpus = 'user')                                AS ingest_tokens,
              (SELECT coalesce(sum(est_cost), 0) FROM query_log)       AS est_cost,
              (SELECT count(*) FROM feedback WHERE verdict = 'like')    AS likes,
              (SELECT count(*) FROM feedback WHERE verdict = 'dislike') AS dislikes
            """
        )
        totals = await cur.fetchone()

    return {
        "totals": {
            "activeLinks": totals["active_links"],
            "ingestions": totals["ingestions"],
            "queries": totals["queries"],
            "tokens": int(totals["query_tokens"]) + int(totals["ingest_tokens"]),
            "estCostUsd": float(totals["est_cost"]),
            "likes": totals["likes"],
            "dislikes": totals["dislikes"],
        },
        "events": [
            {
                "id": e["id"],
                "ts": e["ts"].isoformat(),
                "linkLabel": e["link_label"],
                "kind": e["kind"],
                "detail": e["detail"],
                "latencyMs": e["latency_ms"],
                "tokens": e["tokens"],
                "estCostUsd": float(e["est_cost"]),
                "feedback": e["feedback"],
            }
            for e in events
        ],
    }

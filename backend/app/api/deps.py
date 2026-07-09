"""Shared request helpers: auth extraction, SSE framing, app state access."""

from __future__ import annotations

import json

from fastapi import HTTPException, Request

from ..services.links import LinkAuthError, load_link_for_token, verify_admin_token

_AUTH_STATUS = {"invalid": 401, "revoked": 403, "expired": 403, "budget": 429}


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, separators=(',', ':'))}\n\n"


SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",  # keep nginx from buffering the stream
}


def state(request: Request):
    return request.app.state


def bearer_or_query_token(request: Request) -> str:
    """Link tokens arrive as `Authorization: Bearer …` or `?t=…` (the source
    viewer opens in a new tab where only a URL param is practical)."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.query_params.get("t", "")


async def require_link(request: Request, *, allow_inactive: bool = False) -> dict:
    token = bearer_or_query_token(request)
    if not token:
        raise HTTPException(401, "missing link token")
    st = request.app.state
    try:
        async with st.pool.connection() as conn:
            return await load_link_for_token(
                conn, token, st.settings.secrets.jwt_secret, allow_inactive=allow_inactive
            )
    except LinkAuthError as e:
        raise HTTPException(_AUTH_STATUS.get(e.code, 401), str(e)) from e


def require_admin(request: Request) -> None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "missing admin token")
    try:
        verify_admin_token(auth[7:].strip(), request.app.state.settings.secrets.jwt_secret)
    except LinkAuthError as e:
        raise HTTPException(401, "invalid admin token") from e

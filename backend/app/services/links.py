"""Proposal links: opaque token slugs + DB-backed usage counters.

architecture.md §8 — the token alone is never trusted for caps: every call
re-checks the DB row (revoked / expiry / remaining budget), and budget
consumption is a single atomic UPDATE so parallel requests can't overshoot.

The prospect URL carries the link's `token_jti` as bare hex (uuid4().hex, 32
chars) — short, unguessable, and stable for the life of the link. Auth is a
direct DB lookup on that column; no signature to decode.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

import jwt

ALGO = "HS256"

ADMIN_TOKEN_TTL_HOURS = 12


class LinkAuthError(Exception):
    """code: invalid | revoked | expired | budget"""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


# ---------------------------------------------------------------- admin JWT


def mint_admin_token(secret: str) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": "admin",
        "typ": "admin",
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(hours=ADMIN_TOKEN_TTL_HOURS)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=ALGO)


def verify_admin_token(token: str, secret: str) -> None:
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGO])
    except jwt.PyJWTError as e:
        raise LinkAuthError("invalid", "invalid admin token") from e
    if payload.get("typ") != "admin":
        raise LinkAuthError("invalid", "not an admin token")


# ---------------------------------------------------------------- link token


def link_token(link: dict) -> str:
    """The link's opaque URL slug: its token_jti as bare hex (uuid4().hex)."""
    jti = link["token_jti"]
    return jti.hex if isinstance(jti, uuid.UUID) else uuid.UUID(str(jti)).hex


# ---------------------------------------------------------------- DB access


async def create_link(
    conn,
    *,
    label: str,
    max_ingestions: int,
    max_queries: int,
    expires_in_hours: int,
) -> dict:
    expires_at = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=expires_in_hours)
    cur = await conn.execute(
        """
        INSERT INTO proposal_link (label, max_ingestions, max_queries, expires_at)
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """,
        (label, max_ingestions, max_queries, expires_at),
    )
    return await cur.fetchone()


async def load_link_for_token(
    conn, token: str, *, allow_inactive: bool = False
) -> dict:
    """Look up the link by its opaque token slug, then validate the DB row.
    With allow_inactive=True (info endpoint) revoked/expired rows are returned
    so the UI can show the right blocked screen."""
    try:
        jti = uuid.UUID(hex=token)
    except (ValueError, AttributeError, TypeError) as e:
        raise LinkAuthError("invalid", "invalid link token") from e
    cur = await conn.execute("SELECT * FROM proposal_link WHERE token_jti = %s", (jti,))
    link = await cur.fetchone()
    if link is None:
        raise LinkAuthError("invalid", "unknown link")
    if not allow_inactive:
        if link["revoked"]:
            raise LinkAuthError("revoked", "link revoked")
        if link["expires_at"] < dt.datetime.now(dt.timezone.utc):
            raise LinkAuthError("expired", "link expired")
    return link


async def consume_budget(
    conn, link_id: str, kind: Literal["ingestion", "query"]
) -> dict | None:
    """Atomically authorize + count one action. Returns the updated row, or
    None when the cap is hit / link no longer usable (§8)."""
    field = "used_ingestions" if kind == "ingestion" else "used_queries"
    cap = "max_ingestions" if kind == "ingestion" else "max_queries"
    cur = await conn.execute(
        f"""
        UPDATE proposal_link
        SET {field} = {field} + 1
        WHERE id = %s
          AND NOT revoked
          AND expires_at > now()
          AND {field} < {cap}
        RETURNING *
        """,
        (link_id,),
    )
    return await cur.fetchone()


async def revoke_link(conn, link_id: str) -> None:
    await conn.execute(
        "UPDATE proposal_link SET revoked = true WHERE id = %s", (link_id,)
    )


async def list_links(conn) -> list[dict]:
    cur = await conn.execute("SELECT * FROM proposal_link ORDER BY created_at DESC")
    return await cur.fetchall()


def link_public(link: dict) -> dict:
    """Shape a proposal_link row for the admin UI (types.ts ProposalLink)."""
    return {
        "id": str(link["id"]),
        "label": link["label"],
        "url": f"/p/{link_token(link)}",
        "createdAt": link["created_at"].isoformat(),
        "expiresAt": link["expires_at"].isoformat(),
        "maxIngestions": link["max_ingestions"],
        "usedIngestions": link["used_ingestions"],
        "maxQueries": link["max_queries"],
        "usedQueries": link["used_queries"],
        "revoked": link["revoked"],
    }


def link_info(link: dict, token: str) -> dict:
    """Shape for the prospect landing page (types.ts LinkInfo)."""
    return {
        "token": token,
        "label": link["label"],
        "expiresAt": link["expires_at"].isoformat(),
        "maxIngestions": link["max_ingestions"],
        "usedIngestions": link["used_ingestions"],
        "maxQueries": link["max_queries"],
        "usedQueries": link["used_queries"],
        "revoked": link["revoked"],
    }

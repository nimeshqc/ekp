"""Postgres access: schema migration + a single async connection pool.

One pool for the whole process (architecture.md §4.2 — persistent clients &
pooling). Connections are autocommit; multi-statement writes open explicit
transactions with `conn.transaction()`.
"""

from __future__ import annotations

from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector_async
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


async def migrate(dsn: str) -> None:
    """Apply the idempotent schema. Runs before the pool opens so the
    pgvector type is registered against an existing extension."""
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        await conn.execute(SCHEMA_PATH.read_text())


async def _configure(conn: psycopg.AsyncConnection) -> None:
    await register_vector_async(conn)


def create_pool(dsn: str) -> AsyncConnectionPool:
    return AsyncConnectionPool(
        dsn,
        min_size=1,
        max_size=4,  # single small box; concurrency is low by design
        open=False,
        configure=_configure,
        kwargs={"row_factory": dict_row, "autocommit": True},
    )

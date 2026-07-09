"""Small ops CLI (architecture.md §11).

    python -m app.cli migrate
    python -m app.cli link "Acme Corp — RAG proposal" [--ingestions N] [--queries N] [--hours H] [--base URL]
"""

from __future__ import annotations

import argparse
import asyncio

import psycopg
from psycopg.rows import dict_row

from .config import load_settings
from .db import migrate
from .services.links import create_link, link_public


async def cmd_migrate() -> None:
    settings = load_settings()
    await migrate(settings.secrets.database_url)
    print("schema up to date")


async def cmd_link(label: str, ingestions: int, queries: int, hours: int, base: str) -> None:
    settings = load_settings()
    async with await psycopg.AsyncConnection.connect(
        settings.secrets.database_url, autocommit=True, row_factory=dict_row
    ) as conn:
        row = await create_link(
            conn, label=label, max_ingestions=ingestions,
            max_queries=queries, expires_in_hours=hours,
        )
    public = link_public(row)
    print(f"label:   {public['label']}")
    print(f"expires: {public['expiresAt']}")
    print(f"caps:    {ingestions} ingestions / {queries} queries")
    print(f"url:     {base.rstrip('/')}{public['url']}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="ekp")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate", help="apply the database schema")

    p = sub.add_parser("link", help="mint a proposal link")
    p.add_argument("label")
    p.add_argument("--ingestions", type=int, default=None)
    p.add_argument("--queries", type=int, default=None)
    p.add_argument("--hours", type=int, default=72)
    p.add_argument("--base", default="https://localhost")

    args = parser.parse_args()
    if args.cmd == "migrate":
        asyncio.run(cmd_migrate())
    elif args.cmd == "link":
        limits = load_settings().limits
        asyncio.run(cmd_link(
            args.label,
            args.ingestions or limits.default_max_ingestions,
            args.queries or limits.default_max_queries,
            args.hours,
            args.base,
        ))


if __name__ == "__main__":
    main()

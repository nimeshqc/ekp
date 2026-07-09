"""VectorStore — pgvector today, swappable later (architecture.md §7).

Namespace = (link_id, corpus): user docs are strictly isolated per proposal
link; the default corpus lives under link_id NULL.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ScoredChunk:
    chunk_id: int
    document_id: str
    filename: str
    page: int | None
    char_start: int
    char_end: int
    text: str
    score: float  # cosine similarity 0..1


async def upsert_chunks(conn, document_id: str, chunks: list[dict]) -> None:
    """Bulk-insert chunk rows + vectors. chunks: dicts with ordinal, page,
    char_start, char_end, text, token_count, embedding (list[float])."""
    async with conn.cursor() as cur:
        await cur.executemany(
            """
            INSERT INTO chunk
                (document_id, ordinal, page, char_start, char_end, text, token_count, embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector)
            """,
            [
                (
                    document_id,
                    c["ordinal"],
                    c["page"],
                    c["char_start"],
                    c["char_end"],
                    c["text"],
                    c["token_count"],
                    str(c["embedding"]),
                )
                for c in chunks
            ],
        )


async def search(
    conn,
    *,
    link_id: str | None,
    corpus: str,
    query_vec: list[float],
    k: int,
) -> list[ScoredChunk]:
    """Cosine top-k within the namespace (HNSW index, §4.2)."""
    vec = str(query_vec)
    cur = await conn.execute(
        """
        SELECT c.id, c.document_id, c.page, c.char_start, c.char_end, c.text,
               d.filename,
               1 - (c.embedding <=> %s::vector) AS score
        FROM chunk c
        JOIN document d ON d.id = c.document_id
        WHERE d.link_id IS NOT DISTINCT FROM %s
          AND d.corpus = %s
          AND d.status = 'ready'
        ORDER BY c.embedding <=> %s::vector
        LIMIT %s
        """,
        (vec, link_id, corpus, vec, k),
    )
    rows = await cur.fetchall()
    return [
        ScoredChunk(
            chunk_id=r["id"],
            document_id=str(r["document_id"]),
            filename=r["filename"],
            page=r["page"],
            char_start=r["char_start"],
            char_end=r["char_end"],
            text=r["text"],
            score=float(r["score"]),
        )
        for r in rows
    ]

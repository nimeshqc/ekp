"""Chunking with exact character offsets (architecture.md §3.1 step 4).

RecursiveCharacterTextSplitter with add_start_index=True gives each chunk its
start offset into the cleaned full text; char_end = start + len(chunk). Page
attribution uses the page-start table from parsing.
"""

from __future__ import annotations

from dataclasses import dataclass

from langchain_text_splitters import (
    MarkdownTextSplitter,
    RecursiveCharacterTextSplitter,
)

from ..config import ChunkingCfg
from .parsing import estimate_tokens, page_of_offset


@dataclass
class Chunk:
    ordinal: int
    page: int | None
    char_start: int
    char_end: int
    text: str
    token_count: int


def split_text(
    full_text: str,
    starts: list[int],
    pages: list[str],
    cfg: ChunkingCfg,
    *,
    paginated: bool,
) -> list[Chunk]:
    if cfg.splitter == "markdown":
        splitter = MarkdownTextSplitter(
            chunk_size=cfg.chunk_size,
            chunk_overlap=cfg.chunk_overlap,
            add_start_index=True,
        )
    else:
        # 'sentence' falls back to recursive with sentence-ish separators
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=cfg.chunk_size,
            chunk_overlap=cfg.chunk_overlap,
            add_start_index=True,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    docs = splitter.create_documents([full_text])
    chunks: list[Chunk] = []
    for i, d in enumerate(docs):
        start = int(d.metadata.get("start_index", -1))
        if start < 0:  # defensive: locate the chunk if the splitter didn't say
            start = full_text.find(d.page_content)
            start = max(start, 0)
        chunks.append(
            Chunk(
                ordinal=i,
                page=page_of_offset(starts, pages, start) if paginated else None,
                char_start=start,
                char_end=start + len(d.page_content),
                text=d.page_content,
                token_count=estimate_tokens(d.page_content),
            )
        )
    return chunks

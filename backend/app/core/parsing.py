"""Format-specific parsing + cleaning (architecture.md §3.1).

Character offsets are the anchoring contract for source highlighting: the
cleaned page texts stored in document_page, joined with '\\n\\n', form the
global offset space that chunks (and therefore citations) index into. The
source viewer renders exactly these texts, so highlights are exact — no
re-search at click time.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass

SUPPORTED_EXTENSIONS = {"pdf", "txt", "md", "docx"}

MIME_BY_EXT = {
    "pdf": "application/pdf",
    "txt": "text/plain",
    "md": "text/markdown",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class ParseError(Exception):
    pass


@dataclass
class ParsedDoc:
    pages: list[str]  # raw text per page (single page for non-pdf)
    page_count: int | None  # None for non-pdf formats
    kind: str  # 'pdf' | 'markdown' | 'text' (viewer rendering hint)


def ext_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def kind_of(filename: str) -> str:
    ext = ext_of(filename)
    if ext == "pdf":
        return "pdf"
    if ext == "md":
        return "markdown"
    return "text"


def sniff_ok(filename: str, data: bytes) -> bool:
    """Magic-byte check on top of the extension (§8 upload validation)."""
    ext = ext_of(filename)
    head = data[:8]
    if ext == "pdf":
        return head.startswith(b"%PDF")
    if ext == "docx":
        return head.startswith(b"PK")  # zip container
    # txt/md: reject binary payloads masquerading as text
    return b"\x00" not in data[:4096]


def parse_file(filename: str, data: bytes) -> ParsedDoc:
    ext = ext_of(filename)
    if ext == "pdf":
        return _parse_pdf(data)
    if ext == "docx":
        return _parse_docx(data)
    if ext in ("txt", "md"):
        text = data.decode("utf-8", errors="replace")
        return ParsedDoc(pages=[text], page_count=None, kind=kind_of(filename))
    raise ParseError(f"unsupported format: .{ext}")


def _parse_pdf(data: bytes) -> ParsedDoc:
    import fitz  # PyMuPDF

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        raise ParseError(f"could not open pdf: {e}") from e
    try:
        pages = [page.get_text("text") for page in doc]
    finally:
        doc.close()
    if not any(p.strip() for p in pages):
        raise ParseError("pdf contains no extractable text (scanned/OCR is out of scope)")
    return ParsedDoc(pages=pages, page_count=len(pages), kind="pdf")


def _parse_docx(data: bytes) -> ParsedDoc:
    import docx

    try:
        d = docx.Document(io.BytesIO(data))
    except Exception as e:
        raise ParseError(f"could not open docx: {e}") from e
    text = "\n".join(p.text for p in d.paragraphs)
    if not text.strip():
        raise ParseError("docx contains no extractable text")
    return ParsedDoc(pages=[text], page_count=None, kind="text")


# ---------------------------------------------------------------- cleaning

_CTRL = re.compile(r"[^\S\n\t]*\n")  # trailing spaces before newlines


def clean_text(text: str) -> tuple[str, int]:
    """Normalize whitespace/control chars. Returns (cleaned, removed_chars)."""
    before = len(text)
    t = text.replace("\r\n", "\n").replace("\r", "\n")
    t = "".join(ch for ch in t if ch in ("\n", "\t") or ord(ch) >= 32)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = t.strip()
    return t, max(0, before - len(t))


def join_pages(pages: list[str]) -> str:
    """The global-offset convention shared with the frontend viewer."""
    return "\n\n".join(pages)


def page_starts(pages: list[str]) -> list[int]:
    """Global start offset of each page under the join_pages convention."""
    starts, cursor = [], 0
    for p in pages:
        starts.append(cursor)
        cursor += len(p) + 2  # '\n\n' separator
    return starts


def page_of_offset(starts: list[int], pages: list[str], offset: int) -> int:
    for i in range(len(starts) - 1, -1, -1):
        if offset >= starts[i]:
            return i + 1  # 1-based page numbers
    return 1


def estimate_tokens(text: str) -> int:
    """Cheap token estimate (~4 chars/token) for stats; not used for billing."""
    return max(1, round(len(text) / 4))

"""Seed / refresh the default corpus (architecture.md §11, `make seed`).

Ingests every file in backend/default_corpus under link_id NULL so the
"try it now" path has zero ingestion wait (§4.1). The employee-handbook PDF is
generated on first run so the demo ships a real multi-page PDF without
committing a binary.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from .config import load_settings
from .core.model_manager import ModelManager
from .core.pipeline import ingest_document
from .db import create_pool, migrate

log = logging.getLogger("ekp.seed")

CORPUS_DIR = Path(__file__).resolve().parents[1] / "default_corpus"

HANDBOOK_PAGES = [
    """Atlas Industries — Employee Handbook (2026 edition)

Welcome to Atlas Industries. This handbook summarizes the policies that apply to all full-time and part-time employees. It is reviewed annually by People Operations and supersedes all previous editions.

Paid time off. Full-time employees accrue 24 days of paid time off per year, accrued monthly at two days per month. Unused PTO up to five days rolls over into the first quarter of the following year. PTO requests are submitted through the People portal and approved by your direct manager; requests longer than ten consecutive working days additionally require department-head approval.""",
    """Remote and hybrid work. Atlas operates a hybrid-first policy: employees may work remotely up to three days per week, and fully remote arrangements require written approval from a department head. Remote employees receive a one-time 600 USD home-office stipend, claimable within the first ninety days of the arrangement.

Working hours are flexible around a core collaboration window of 11:00-15:00 local time. Teams agree on their own meeting cadence within that window.""",
    """Business expenses. Business expenses under 75 USD do not require a receipt. All expense reports must be submitted within 30 days of the purchase date and are reimbursed with the next payroll cycle. Travel must be booked through the corporate travel tool; personal card bookings are reimbursed only with prior written approval from Finance.

Questions about any policy in this handbook should be directed to people-ops@atlas.example.""",
]


def generate_handbook_pdf(path: Path) -> None:
    import fitz

    doc = fitz.open()
    for text in HANDBOOK_PAGES:
        page = doc.new_page()  # A4
        rect = fitz.Rect(56, 64, page.rect.width - 56, page.rect.height - 64)
        page.insert_textbox(rect, text, fontsize=11, fontname="helv", lineheight=1.45)
    doc.save(path)
    doc.close()
    log.info("generated %s", path.name)


async def seed() -> None:
    settings = load_settings()
    dsn = settings.secrets.database_url
    await migrate(dsn)

    CORPUS_DIR.mkdir(exist_ok=True)
    handbook = CORPUS_DIR / "atlas-employee-handbook.pdf"
    if not handbook.exists():
        generate_handbook_pdf(handbook)

    files = sorted(
        p for p in CORPUS_DIR.iterdir()
        if p.suffix.lower() in (".pdf", ".txt", ".md", ".docx")
    )
    if not files:
        log.warning("no files in %s — nothing to seed", CORPUS_DIR)
        return

    pool = create_pool(dsn)
    await pool.open(wait=True)
    mm = ModelManager(settings.embedding)
    try:
        # refresh: drop the previous default corpus, then re-ingest
        async with pool.connection() as conn:
            await conn.execute("DELETE FROM document WHERE corpus = 'default'")

        for path in files:
            log.info("ingesting %s", path.name)
            async for event in ingest_document(
                pool, mm, settings,
                link_id=None, corpus="default",
                filename=path.name, data=path.read_bytes(),
            ):
                if event["type"] == "stage" and event["status"] == "completed":
                    log.info("  %-6s %5d ms  %s",
                             event["stage"], event["durationMs"], event.get("metrics", {}))
                elif event["type"] == "error":
                    raise SystemExit(f"seed failed: {event['message']}")
                elif event["type"] == "doc-done":
                    s = event["stats"]
                    log.info("  done: %d chunks, %d embeddings, %d ms",
                             s["chunkCount"], s["embeddingCount"], s["totalMs"])
        log.info("default corpus ready (%d documents)", len(files))
    finally:
        await pool.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(seed())

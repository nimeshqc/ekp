"""POST /api/ingest — multipart upload, SSE stage stream (§3.1).

Validation (extension + magic bytes + size/count caps) happens before the
stream opens so hard failures are normal HTTP errors; per-document budget is
consumed atomically inside the stream, one unit per document.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.datastructures import UploadFile  # request.form() yields these

from ..core.parsing import SUPPORTED_EXTENSIONS, ext_of, sniff_ok
from ..services.links import consume_budget
from .deps import SSE_HEADERS, require_link, sse

router = APIRouter()


@router.post("/api/ingest")
async def ingest(request: Request):
    link = await require_link(request)
    st = request.app.state
    limits = st.settings.limits

    form = await request.form()
    uploads = [v for v in form.getlist("files") if isinstance(v, UploadFile)]
    if not uploads:
        raise HTTPException(400, "no files uploaded")
    if len(uploads) > limits.max_files:
        raise HTTPException(400, f"at most {limits.max_files} files per upload")

    max_bytes = limits.max_file_mb * 1024 * 1024
    files: list[tuple[str, bytes]] = []
    for up in uploads:
        name = up.filename or "upload"
        if ext_of(name) not in SUPPORTED_EXTENSIONS:
            raise HTTPException(400, f"{name}: unsupported format "
                                     f"(accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))})")
        data = await up.read()
        if len(data) > max_bytes:
            raise HTTPException(400, f"{name}: exceeds the {limits.max_file_mb} MB limit")
        if len(data) == 0:
            raise HTTPException(400, f"{name}: file is empty")
        if not sniff_ok(name, data):
            raise HTTPException(400, f"{name}: content does not match its extension")
        files.append((name, data))

    from ..core.pipeline import ingest_document

    async def stream():
        aggregate = {"documents": 0, "chunks": 0, "tokens": 0, "embeddings": 0, "totalMs": 0}
        import time

        t0 = time.perf_counter()
        for filename, data in files:
            # budget: one ingestion per document, counted atomically (§8)
            async with st.pool.connection() as conn:
                updated = await consume_budget(conn, link["id"], "ingestion")
            if updated is None:
                yield sse({"type": "error",
                           "message": "ingestion budget for this link is used up"})
                break

            async for event in ingest_document(
                st.pool, st.mm, st.settings,
                link_id=link["id"], corpus="user", filename=filename, data=data,
            ):
                if event["type"] == "doc-done":
                    s = event["stats"]
                    aggregate["documents"] += 1
                    aggregate["chunks"] += s["chunkCount"]
                    aggregate["tokens"] += s["tokenCount"]
                    aggregate["embeddings"] += s["embeddingCount"]
                yield sse(event)

        aggregate["totalMs"] = int((time.perf_counter() - t0) * 1000)
        yield sse({"type": "done", "aggregate": aggregate})

    return StreamingResponse(stream(), media_type="text/event-stream", headers=SSE_HEADERS)

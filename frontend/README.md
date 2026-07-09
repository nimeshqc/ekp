# EKP Frontend — UI Mockup (build-order step 1)

Click-through mockup of the Enterprise Knowledge Platform (see
[docs/architecture.md §13](../docs/architecture.md)). All data is simulated —
there is no backend yet. The mockup locks the UX and the API contract before
backend work begins.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Entry points

| URL | What it shows |
|-----|---------------|
| `/` | Mockup index (not a product page) |
| `/p/demo` | Prospect flow: landing → corpus choice → ingest → query |
| `/p/expired-demo` | Expired-link screen |
| `/admin` | Admin portal (any username/password signs in) |

## Where the API contract lives

- [`src/api/types.ts`](src/api/types.ts) — request/response and SSE event
  shapes the backend must satisfy (ingestion stages, query stream, citations,
  stats, admin objects).
- [`src/api/mock.ts`](src/api/mock.ts) — mock implementation: simulated SSE
  stage/token streaming, canned default corpus + Q&A, link budgets, and the
  admin data. State persists in `localStorage` so the source viewer (new tab)
  and admin dashboard share one world. Build-order step 6 swaps this file's
  internals for real `fetch`/`EventSource` calls; the exported signatures and
  every UI component stay unchanged.

Notes for the demo: the source viewer renders pdfs as styled page cards here;
the live build swaps in PDF.js with the same offset-anchored highlight. Mock
state can be reset by clearing the browser's localStorage for the site.

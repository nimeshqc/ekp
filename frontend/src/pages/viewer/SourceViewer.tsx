import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getSourceDoc } from '../../api/mock'
import type { SourceDoc } from '../../api/types'
import { Badge, Spinner } from '../../components/ui'

/**
 * Source viewer — opened in a new tab from a citation.
 * Highlights the cited passage via the char offsets captured at ingestion
 * time. The real build renders pdf via PDF.js with a text-layer highlight;
 * this mockup renders page cards with the same offset-anchored behavior.
 */
export default function SourceViewer() {
  const { docId = '' } = useParams()
  const [params] = useSearchParams()
  const start = Number(params.get('start') ?? -1)
  const end = Number(params.get('end') ?? -1)
  const hasHighlight = start >= 0 && end > start

  const [doc, setDoc] = useState<SourceDoc | null>(null)
  const [missing, setMissing] = useState(false)
  const markRef = useRef<HTMLElement>(null)

  useEffect(() => {
    getSourceDoc(docId).then(setDoc).catch(() => setMissing(true))
  }, [docId])

  useEffect(() => {
    if (doc && markRef.current) {
      markRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [doc])

  if (missing) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Document not found (mock store was cleared — re-ingest and try again).
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-400">
        <Spinner /> Opening source…
      </div>
    )
  }

  // global char offsets run across pages joined by '\n\n' (same as ingestion)
  let cursor = 0
  const pages = doc.pages.map((p) => {
    const pStart = cursor
    cursor += p.text.length + 2
    return { ...p, globalStart: pStart }
  })

  const kindLabel = doc.kind === 'pdf' ? 'PDF · rendered via PDF.js in the live build' : doc.kind

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
          <span className="font-medium text-slate-100">{doc.filename}</span>
          <Badge tone="slate">{kindLabel}</Badge>
          {hasHighlight && <Badge tone="indigo">cited passage highlighted · chars {start}–{end}</Badge>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-5 py-6">
        {pages.map((p) => {
          const localStart = Math.max(0, start - p.globalStart)
          const localEnd = Math.min(p.text.length, end - p.globalStart)
          const highlighted = hasHighlight && localEnd > 0 && localStart < p.text.length

          const body = highlighted ? (
            <>
              {p.text.slice(0, localStart)}
              <mark
                ref={markRef}
                className="rounded-sm bg-amber-300/90 px-0.5 py-0.5 text-slate-900 shadow-[0_0_0_3px_rgba(252,211,77,0.25)]"
              >
                {p.text.slice(localStart, localEnd)}
              </mark>
              {p.text.slice(localEnd)}
            </>
          ) : (
            p.text
          )

          return doc.kind === 'pdf' ? (
            <div key={p.page} className="rounded-md bg-slate-100 p-8 text-slate-900 shadow-xl">
              <div className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed">{body}</div>
              <div className="mt-6 text-center font-mono text-[10px] text-slate-400">
                — page {p.page} of {doc.pages.length} —
              </div>
            </div>
          ) : (
            <div
              key={p.page}
              className={`whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-900 p-6 text-sm leading-relaxed text-slate-200 ${
                doc.kind === 'text' ? 'font-mono text-[13px]' : ''
              }`}
            >
              {body}
            </div>
          )
        })}

        <p className="pb-6 text-center text-[11px] text-slate-600">
          Highlight anchored to character offsets stored per chunk at ingestion time — no re-search
          at click time.
        </p>
      </main>
    </div>
  )
}

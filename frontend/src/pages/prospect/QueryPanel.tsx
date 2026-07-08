import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CORPUS_SUMMARY, query, sendFeedback } from '../../api/mock'
import type { Citation, Corpus, QueryStage, QueryStats } from '../../api/types'
import { StageFlow, type StageState } from '../../components/StageFlow'
import { Badge, Card, SectionTitle, StatTile } from '../../components/ui'
import { fmtCost, fmtMs, fmtNum, fmtScore } from '../../utils/format'

const QUERY_STAGES: { key: QueryStage; label: string }[] = [
  { key: 'embed-query', label: 'Embed query' },
  { key: 'retrieve', label: 'Retrieve' },
  { key: 'generate', label: 'Generate' },
]

const STARTERS = [
  'How many PTO days do employees get?',
  'How is customer data encrypted?',
  'How does Nova Search keep answers grounded?',
]

interface Exchange {
  id: string
  question: string
  stages: Partial<Record<QueryStage, StageState>>
  citations: Citation[]
  answer: string
  grounded: boolean | null
  followups: string[]
  stats: QueryStats | null
  queryId: string | null
  done: boolean
}

interface Props {
  token: string
  corpus: Corpus
  userDocIds: string[]
  remaining: number
  onQueryDone: () => void
}

export default function QueryPanel({ token, corpus, userDocIds, remaining, onQueryDone }: Props) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [exchanges.length])

  const noUserDocs = corpus === 'user' && userDocIds.length === 0
  const outOfBudget = remaining <= 0
  const disabled = busy || noUserDocs || outOfBudget

  function patch(id: string, fn: (e: Exchange) => Exchange) {
    setExchanges((prev) => prev.map((e) => (e.id === id ? fn(e) : e)))
  }

  async function ask(question: string) {
    const q = question.trim()
    if (!q || disabled) return
    setInput('')
    setBusy(true)
    const id = Math.random().toString(36).slice(2)
    setExchanges((prev) => [
      ...prev,
      {
        id,
        question: q,
        stages: {},
        citations: [],
        answer: '',
        grounded: null,
        followups: [],
        stats: null,
        queryId: null,
        done: false,
      },
    ])

    await query(token, corpus, q, userDocIds, (e) => {
      switch (e.type) {
        case 'stage':
          patch(id, (x) => ({
            ...x,
            stages: {
              ...x.stages,
              [e.stage]:
                e.status === 'started'
                  ? { status: 'active' }
                  : { status: 'done', durationMs: e.durationMs, info: e.info },
            },
          }))
          break
        case 'sources':
          patch(id, (x) => ({ ...x, citations: e.citations }))
          break
        case 'grounded':
          patch(id, (x) => ({ ...x, grounded: e.grounded }))
          break
        case 'token':
          patch(id, (x) => ({ ...x, answer: x.answer + e.text }))
          break
        case 'followups':
          patch(id, (x) => ({ ...x, followups: e.questions }))
          break
        case 'done':
          patch(id, (x) => ({ ...x, stats: e.stats, queryId: e.queryId, done: true }))
          break
      }
    })

    setBusy(false)
    onQueryDone()
  }

  return (
    <Card className="flex flex-1 flex-col p-5">
      <div className="flex items-center justify-between">
        <SectionTitle>Ask the knowledge base</SectionTitle>
        <Badge tone={outOfBudget ? 'red' : 'slate'}>
          {remaining} question{remaining === 1 ? '' : 's'} left
        </Badge>
      </div>

      {exchanges.length === 0 && (
        <div className="mt-4">
          {corpus === 'default' ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {DEFAULT_CORPUS_SUMMARY.map((d) => (
                  <a
                    key={d.docId}
                    href={`/viewer/${d.docId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-300 transition hover:border-slate-600"
                  >
                    <FileIcon kind={d.kind} />
                    <span className="ml-2">{d.filename}</span>
                    <div className="mt-1 text-[11px] text-slate-500">pre-ingested · view source ↗</div>
                  </a>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    disabled={disabled}
                    className="rounded-full border border-indigo-900 bg-indigo-950/50 px-3 py-1.5 text-xs text-indigo-300 transition hover:border-indigo-600 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : noUserDocs ? (
            <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
              Ingest at least one document above, then ask your first question here.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Your corpus is indexed — ask anything covered by your documents.
            </p>
          )}
        </div>
      )}

      <div className="mt-2 space-y-6">
        {exchanges.map((x) => (
          <ExchangeView key={x.id} x={x} onFollowup={ask} followupsDisabled={disabled} />
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="mt-5 flex gap-2 border-t border-slate-800 pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder={
            outOfBudget
              ? 'Question budget for this link is used up'
              : noUserDocs
                ? 'Upload documents first…'
                : 'Ask a question about the documents…'
          }
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-600 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? 'Answering…' : 'Ask'}
        </button>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------- exchange

function ExchangeView({
  x,
  onFollowup,
  followupsDisabled,
}: {
  x: Exchange
  onFollowup: (q: string) => void
  followupsDisabled: boolean
}) {
  return (
    <div className="fade-up">
      {/* question echoes immediately (optimistic UI) */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-indigo-600/90 px-3.5 py-2 text-sm text-white">
          {x.question}
        </div>
      </div>

      <div className="mt-3">
        <StageFlow stages={QUERY_STAGES} state={x.stages} />
      </div>

      {x.grounded === false && x.done && (
        <div className="mt-3">
          <Badge tone="amber">grounding guarantee — no answer without sources</Badge>
        </div>
      )}

      {(x.answer || !x.done) && (
        <div className="mt-3 max-w-[92%] text-sm leading-relaxed text-slate-200">
          <AnswerText text={x.answer} citations={x.citations} streaming={!x.done} />
        </div>
      )}

      {x.citations.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {x.citations.map((c) => (
            <CitationCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {x.followups.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {x.followups.map((f) => (
            <button
              key={f}
              onClick={() => onFollowup(f)}
              disabled={followupsDisabled}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition hover:border-indigo-600 hover:text-indigo-300 disabled:opacity-50"
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {x.done && x.stats && (
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <StatTile label="Retrieval" value={fmtMs(x.stats.retrievalMs)} />
            <StatTile label="First token" value={fmtMs(x.stats.ttftMs)} />
            <StatTile label="Total" value={fmtMs(x.stats.totalMs)} />
            <StatTile label="Tokens in" value={fmtNum(x.stats.inputTokens)} />
            <StatTile label="Tokens out" value={fmtNum(x.stats.outputTokens)} />
            <StatTile label="Est. cost" value={fmtCost(x.stats.estCostUsd)} sub={x.stats.model} />
          </div>
          {x.queryId && <FeedbackRow queryId={x.queryId} />}
        </div>
      )}
    </div>
  )
}

/** Renders streamed answer text, turning [n] markers into clickable citation chips. */
function AnswerText({
  text,
  citations,
  streaming,
}: {
  text: string
  citations: Citation[]
  streaming: boolean
}) {
  const parts = text.split(/(\[\d+\])/g)
  return (
    <p>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/)
        const c = m ? citations.find((c) => c.id === Number(m[1])) : undefined
        return c ? <CitationChip key={i} c={c} /> : <span key={i}>{part}</span>
      })}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-indigo-400 align-text-bottom" />
      )}
    </p>
  )
}

function viewerUrl(c: Citation): string {
  const params = new URLSearchParams({ start: String(c.charStart), end: String(c.charEnd) })
  if (c.page) params.set('page', String(c.page))
  return `/viewer/${c.docId}?${params}`
}

function CitationChip({ c }: { c: Citation }) {
  return (
    <a
      href={viewerUrl(c)}
      target="_blank"
      rel="noreferrer"
      title={`${c.filename} — open source with passage highlighted`}
      className="mx-0.5 inline-flex size-4.5 -translate-y-0.5 items-center justify-center rounded bg-indigo-950 align-middle font-mono text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-800 transition hover:bg-indigo-800 hover:text-white"
    >
      {c.id}
    </a>
  )
}

function CitationCard({ c }: { c: Citation }) {
  return (
    <a
      href={viewerUrl(c)}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 transition hover:border-indigo-700"
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-indigo-950 font-mono text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-800">
        {c.id}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="font-medium text-slate-200 group-hover:text-indigo-300">{c.filename}</span>
          {c.page && <span className="text-slate-500">page {c.page}</span>}
          <span className="font-mono text-slate-500">sim {fmtScore(c.score)}</span>
          <span className="text-slate-600">chars {c.charStart}–{c.charEnd}</span>
          <span className="text-indigo-400 opacity-0 transition group-hover:opacity-100">
            open highlighted ↗
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs italic leading-relaxed text-slate-400">
          “{c.snippet}”
        </span>
      </span>
    </a>
  )
}

function FeedbackRow({ queryId }: { queryId: string }) {
  const [verdict, setVerdict] = useState<'like' | 'dislike' | null>(null)
  const [reason, setReason] = useState('')
  const [sent, setSent] = useState(false)

  async function like() {
    setVerdict('like')
    await sendFeedback(queryId, 'like')
    setSent(true)
  }

  async function submitDislike() {
    await sendFeedback(queryId, 'dislike', reason || undefined)
    setSent(true)
  }

  if (sent) {
    return (
      <p className="text-xs text-slate-500">
        Feedback recorded {verdict === 'like' ? '👍' : '👎'} — thank you.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Was this answer helpful?</span>
      <button
        onClick={like}
        className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-emerald-700 hover:text-emerald-400"
      >
        👍 Yes
      </button>
      <button
        onClick={() => setVerdict('dislike')}
        className={`rounded-md border px-2.5 py-1 text-xs transition ${
          verdict === 'dislike'
            ? 'border-red-800 text-red-400'
            : 'border-slate-700 text-slate-300 hover:border-red-800 hover:text-red-400'
        }`}
      >
        👎 No
      </button>
      {verdict === 'dislike' && (
        <span className="flex flex-1 gap-2">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitDislike()}
            placeholder="What was wrong? (optional)"
            className="min-w-40 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-600 focus:outline-none"
          />
          <button
            onClick={submitDislike}
            className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            Send
          </button>
        </span>
      )}
    </div>
  )
}

function FileIcon({ kind }: { kind: string }) {
  const label = kind === 'pdf' ? 'PDF' : kind === 'markdown' ? 'MD' : 'TXT'
  return (
    <span className="inline-flex rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400">
      {label}
    </span>
  )
}

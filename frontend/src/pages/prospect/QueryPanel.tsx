import { useEffect, useRef, useState } from 'react'
import { fetchDefaultCorpus, query, sendFeedback, type DefaultCorpusDoc } from '../../api/client'
import type { Citation, Corpus, QueryStage, QueryStats } from '../../api/types'
import { StageFlow, type StageState } from '../../components/StageFlow'
import { Badge, Card, ResponseHeading, SectionTitle, StatTile } from '../../components/ui'
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
  error: string | null
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
  const [defaultDocs, setDefaultDocs] = useState<DefaultCorpusDoc[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (corpus === 'default') {
      fetchDefaultCorpus().then(setDefaultDocs).catch(() => {})
    }
  }, [corpus])

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
        error: null,
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
        case 'error':
          patch(id, (x) => ({ ...x, error: e.message, done: true }))
          break
      }
    })

    setBusy(false)
    onQueryDone()
  }

  return (
    <Card className="flex flex-1 flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <SectionTitle>Ask the knowledge base</SectionTitle>
        <Badge tone={outOfBudget ? 'red' : 'slate'}>
          {remaining} question{remaining === 1 ? '' : 's'} left
        </Badge>
      </div>

      {exchanges.length === 0 && (
        <div className="mt-5">
          {corpus === 'default' ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {defaultDocs.map((d) => (
                  <a
                    key={d.docId}
                    href={`/viewer/${d.docId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 transition hover:border-indigo-300 hover:bg-white"
                  >
                    <FileIcon kind={d.kind} />
                    <span className="ml-2">{d.filename}</span>
                    <div className="mt-1 text-[11px] text-slate-500">pre-ingested · view source ↗</div>
                  </a>
                ))}
              </div>
              <div className="mt-5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Try asking
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      disabled={disabled}
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : noUserDocs ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Ingest at least one document above, then ask your first question here.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Your corpus is indexed — ask anything covered by your documents.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-8">
        {exchanges.map((x) => (
          <ExchangeView key={x.id} x={x} token={token} onFollowup={ask} followupsDisabled={disabled} />
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="mt-6 flex gap-2 border-t border-slate-200 pt-4"
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
              ? 'Question limit for this demo link is used up'
              : noUserDocs
                ? 'Upload documents first…'
                : 'Ask a question about the documents…'
          }
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
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
  token,
  onFollowup,
  followupsDisabled,
}: {
  x: Exchange
  token: string
  onFollowup: (q: string) => void
  followupsDisabled: boolean
}) {
  return (
    <div className="fade-up">
      {/* question echoes immediately (optimistic UI) */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm">
          {x.question}
        </div>
      </div>

      {/* response — labeled, well-spaced sections inside one surface */}
      <div className="mt-4 space-y-6 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
        <section>
          <ResponseHeading>Processing pipeline</ResponseHeading>
          <div className="mt-3">
            <StageFlow stages={QUERY_STAGES} state={x.stages} />
          </div>
        </section>

        {x.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            <span className="font-semibold">Something went wrong.</span> {x.error}
          </div>
        )}

        {x.grounded === false && x.done && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
            <span className="font-semibold">Grounding guarantee.</span> No answer is returned
            without supporting sources — the platform declined to guess.
          </div>
        )}

        {(x.answer || !x.done) && (
          <section>
            <ResponseHeading>Answer</ResponseHeading>
            <div className="mt-2 text-[15px] leading-7 text-slate-700">
              <AnswerText text={x.answer} citations={x.citations} token={token} streaming={!x.done} />
            </div>
          </section>
        )}

        {x.citations.length > 0 && (
          <section>
            <ResponseHeading>
              Sources
              <span className="rounded-full bg-slate-200 px-1.5 py-px font-mono text-[10px] text-slate-600">
                {x.citations.length}
              </span>
            </ResponseHeading>
            <div className="mt-2.5 space-y-2">
              {x.citations.map((c) => (
                <CitationCard key={c.id} c={c} token={token} />
              ))}
            </div>
          </section>
        )}

        {x.followups.length > 0 && (
          <section>
            <ResponseHeading>Suggested follow-ups</ResponseHeading>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {x.followups.map((f) => (
                <button
                  key={f}
                  onClick={() => onFollowup(f)}
                  disabled={followupsDisabled}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50"
                >
                  {f}
                </button>
              ))}
            </div>
          </section>
        )}

        {x.done && x.stats && (
          <section>
            <ResponseHeading>Query metrics</ResponseHeading>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Retrieval" value={fmtMs(x.stats.retrievalMs)} />
              <StatTile label="First token" value={fmtMs(x.stats.ttftMs)} />
              <StatTile label="Total" value={fmtMs(x.stats.totalMs)} />
              <StatTile label="Tokens in" value={fmtNum(x.stats.inputTokens)} />
              <StatTile label="Tokens out" value={fmtNum(x.stats.outputTokens)} />
              <StatTile label="Est. cost" value={fmtCost(x.stats.estCostUsd)} sub={x.stats.model} />
            </div>
            {x.queryId && (
              <div className="mt-3">
                <FeedbackRow queryId={x.queryId} token={token} />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

/** Renders streamed answer text, turning [n] markers into clickable citation chips. */
function AnswerText({
  text,
  citations,
  token,
  streaming,
}: {
  text: string
  citations: Citation[]
  token: string
  streaming: boolean
}) {
  const parts = text.split(/(\[\d+\])/g)
  return (
    <p>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/)
        const c = m ? citations.find((c) => c.id === Number(m[1])) : undefined
        return c ? <CitationChip key={i} c={c} token={token} /> : <span key={i}>{part}</span>
      })}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-indigo-500 align-text-bottom" />
      )}
    </p>
  )
}

function viewerUrl(c: Citation, token: string): string {
  const params = new URLSearchParams({ start: String(c.charStart), end: String(c.charEnd) })
  if (c.page) params.set('page', String(c.page))
  // user-corpus documents require the link token to be viewable (isolation)
  if (token) params.set('t', token)
  return `/viewer/${c.docId}?${params}`
}

function CitationChip({ c, token }: { c: Citation; token: string }) {
  return (
    <a
      href={viewerUrl(c, token)}
      target="_blank"
      rel="noreferrer"
      title={`${c.filename} — open source with passage highlighted`}
      className="mx-0.5 inline-flex size-4.5 -translate-y-0.5 items-center justify-center rounded bg-indigo-100 align-middle font-mono text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-600 hover:text-white"
    >
      {c.id}
    </a>
  )
}

function CitationCard({ c, token }: { c: Citation; token: string }) {
  return (
    <a
      href={viewerUrl(c, token)}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-indigo-300 hover:shadow-sm"
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-indigo-100 font-mono text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
        {c.id}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="font-medium text-slate-800 group-hover:text-indigo-700">{c.filename}</span>
          {c.page && <span className="text-slate-400">page {c.page}</span>}
          <span className="font-mono text-slate-400">sim {fmtScore(c.score)}</span>
          <span className="text-slate-400">chars {c.charStart}–{c.charEnd}</span>
          <span className="text-indigo-600 opacity-0 transition group-hover:opacity-100">
            open highlighted ↗
          </span>
        </span>
        <span className="mt-1 line-clamp-2 block text-xs italic leading-relaxed text-slate-500">
          “{c.snippet}”
        </span>
      </span>
    </a>
  )
}

function FeedbackRow({ queryId, token }: { queryId: string; token: string }) {
  const [verdict, setVerdict] = useState<'like' | 'dislike' | null>(null)
  const [reason, setReason] = useState('')
  const [sent, setSent] = useState(false)

  async function like() {
    setVerdict('like')
    await sendFeedback(token, queryId, 'like')
    setSent(true)
  }

  async function submitDislike() {
    await sendFeedback(token, queryId, 'dislike', reason || undefined)
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
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 transition hover:border-emerald-400 hover:text-emerald-600"
      >
        👍 Yes
      </button>
      <button
        onClick={() => setVerdict('dislike')}
        className={`rounded-md border bg-white px-2.5 py-1 text-xs transition ${
          verdict === 'dislike'
            ? 'border-red-300 text-red-600'
            : 'border-slate-300 text-slate-600 hover:border-red-400 hover:text-red-600'
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
            className="min-w-40 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={submitDislike}
            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200"
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
    <span className="inline-flex rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
      {label}
    </span>
  )
}

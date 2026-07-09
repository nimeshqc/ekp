import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getLinkInfo, warm } from '../../api/client'
import type { LinkInfo } from '../../api/types'
import { Card, CheckIcon, Spinner } from '../../components/ui'
import { expiryText } from '../../utils/format'
import { Logo } from '../Home'

export default function Landing() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [warmed, setWarmed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getLinkInfo(token)
      .then((i) => {
        if (cancelled) return
        setInfo(i)
        // predictive warm-up: heat embedder/DB/LLM while the prospect reads
        warm(token)
          .then(() => !cancelled && setWarmed(true))
          .catch(() => {})
      })
      .catch(() => !cancelled && setInvalid(true))
    return () => {
      cancelled = true
    }
  }, [token])

  if (invalid) return <BlockedScreen title="Invalid link" body="This proposal link does not exist. Please contact the person who shared it with you." />

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <Spinner /> Loading workspace…
      </div>
    )
  }

  const expiry = expiryText(info.expiresAt)
  if (info.revoked)
    return <BlockedScreen title="Link revoked" body="This proposal link has been revoked. Please request a new link." />
  if (expiry.expired)
    return (
      <BlockedScreen
        title="Link expired"
        body={`This proposal link ${expiry.text}. Links are time-limited by design — please request a fresh one.`}
      />
    )

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="font-semibold text-slate-900">Enterprise Knowledge Platform</div>
            <div className="text-xs text-slate-500">Private demo workspace</div>
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
            warmed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
          title="Embedding model, database pool and LLM client are pre-warmed when you open the link"
        >
          {warmed ? <CheckIcon className="size-3.5" /> : <Spinner className="size-3.5" />}
          {warmed ? 'Models warm — ready' : 'Warming models…'}
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center py-12">
        {/* Hero — product-focused, no client-facing labels */}
        <div className="fade-up max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700">
            Live interactive demo
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Ask your documents anything —<br className="hidden sm:block" /> get answers you can trust.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            A private retrieval platform that reads your files and answers in natural language. Every
            claim is cited to the exact source passage, embeddings are computed on-platform, and
            nothing you upload ever leaves this box.
          </p>
        </div>

        {/* Primary — the two demo entry points */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <ModeCard
            title="Try with your documents"
            body="Upload up to 5 files (pdf, txt, md, docx) and watch them get parsed, chunked, embedded and indexed live. Then ask away."
            cta="Upload documents"
            highlight
            onClick={() => navigate(`/p/${token}/w?mode=user`)}
          />
          <ModeCard
            title="Explore the default corpus"
            body="A pre-ingested demo knowledge base — company handbook, product overview and security policy. Zero setup, ask your first question in seconds."
            cta="Start asking"
            onClick={() => navigate(`/p/${token}/w?mode=default`)}
          />
        </div>

        {/* Secondary — capability showcase */}
        <div className="mt-12">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            What this platform does for you
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Capability
              title="Grounded & cited"
              body="Every sentence traces to a highlighted passage in the source — click a citation to jump straight to it."
              icon={
                <path d="M9 12l2 2 4-4m5 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeLinecap="round" strokeLinejoin="round" />
              }
            />
            <Capability
              title="Private by design"
              body="Documents are parsed and embedded on-platform. No content is ever sent to an external embedding API."
              icon={
                <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z" strokeLinecap="round" strokeLinejoin="round" />
              }
            />
            <Capability
              title="Full pipeline visibility"
              body="See parse → chunk → embed → index run live, with real timings, token counts and cost per query."
              icon={
                <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round" strokeLinejoin="round" />
              }
            />
            <Capability
              title="Refuses to guess"
              body="When retrieval confidence is low, the platform declines to answer rather than fabricate — no hallucinations."
              icon={
                <path d="M12 9v4m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" strokeLinecap="round" strokeLinejoin="round" />
              }
            />
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pb-2 pt-4 text-[11px] text-slate-400">
        <span>Isolated workspace · processed entirely on-platform · embeddings never leave this box</span>
        <span>Demo access {expiry.text}</span>
      </footer>
    </div>
  )
}

function ModeCard({
  title,
  body,
  cta,
  onClick,
  highlight = false,
}: {
  title: string
  body: string
  cta: string
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button onClick={onClick} className="group text-left">
      <Card
        className={`h-full p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-md ${
          highlight ? 'border-indigo-200 ring-1 ring-indigo-100' : 'group-hover:border-slate-300'
        }`}
      >
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
        <div className="mt-4 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white transition group-hover:bg-indigo-500">
          {cta} →
        </div>
      </Card>
    </button>
  )
}

function Capability({
  title,
  body,
  icon,
}: {
  title: string
  body: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4.5">
          {icon}
        </svg>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
    </div>
  )
}

function BlockedScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-red-50 text-red-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
            <path d="M12 9v4m0 4h.01M5 19h14L12 5 5 19z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
        <Link to="/" className="mt-5 inline-block text-xs text-indigo-600 hover:underline">
          ← Back to mockup index
        </Link>
      </Card>
    </div>
  )
}

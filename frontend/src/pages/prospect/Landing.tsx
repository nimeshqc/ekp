import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getLinkInfo, warm } from '../../api/mock'
import type { LinkInfo } from '../../api/types'
import { Badge, BudgetMeter, Card, CheckIcon, Spinner } from '../../components/ui'
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
        warm(token).then(() => !cancelled && setWarmed(true))
      })
      .catch(() => !cancelled && setInvalid(true))
    return () => {
      cancelled = true
    }
  }, [token])

  if (invalid) return <BlockedScreen title="Invalid link" body="This proposal link does not exist. Please contact the person who shared it with you." />

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-400">
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
            <div className="font-semibold text-slate-100">Enterprise Knowledge Platform</div>
            <div className="text-xs text-slate-500">Private demo workspace</div>
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 text-xs ${warmed ? 'text-emerald-400' : 'text-slate-500'}`}
          title="Embedding model, database pool and LLM client are pre-warmed when you open the link"
        >
          {warmed ? <CheckIcon className="size-3.5" /> : <Spinner className="size-3.5" />}
          {warmed ? 'Models warm — ready' : 'Warming models…'}
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center py-12">
        <div className="fade-up">
          <Badge tone="indigo">Prepared for</Badge>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50">{info.label}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Ask questions over documents and get grounded, cited answers — every claim traceable to
            a highlighted passage in the source. Embeddings are computed on-platform; nothing you
            upload leaves this box.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
            <BudgetMeter label="Document uploads" used={info.usedIngestions} max={info.maxIngestions} />
            <BudgetMeter label="Questions" used={info.usedQueries} max={info.maxQueries} />
            <Badge tone={expiry.expired ? 'red' : 'amber'}>{expiry.text}</Badge>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <ModeCard
            title="Try with your documents"
            body="Upload up to 5 files (pdf, txt, md, docx — max 25 MB each) and watch them get parsed, chunked, embedded and indexed live. Then ask away."
            cta="Upload documents"
            onClick={() => navigate(`/p/${token}/w?mode=user`)}
          />
          <ModeCard
            title="Explore the default corpus"
            body="A pre-ingested demo knowledge base — company handbook, product overview and security policy. Zero setup, ask your first question in seconds."
            cta="Start asking"
            onClick={() => navigate(`/p/${token}/w?mode=default`)}
          />
        </div>
      </main>

      <footer className="pb-2 text-center text-[11px] text-slate-600">
        Isolated workspace · usage-capped link · UI mockup (simulated data)
      </footer>
    </div>
  )
}

function ModeCard({
  title,
  body,
  cta,
  onClick,
}: {
  title: string
  body: string
  cta: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="group text-left">
      <Card className="h-full p-5 transition group-hover:border-indigo-600 group-hover:bg-slate-900">
        <h2 className="font-semibold text-slate-100">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
        <div className="mt-4 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white transition group-hover:bg-indigo-500">
          {cta} →
        </div>
      </Card>
    </button>
  )
}

function BlockedScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-red-950 text-red-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
            <path d="M12 9v4m0 4h.01M5 19h14L12 5 5 19z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-100">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
        <Link to="/" className="mt-5 inline-block text-xs text-indigo-400 hover:underline">
          ← Back to mockup index
        </Link>
      </Card>
    </div>
  )
}

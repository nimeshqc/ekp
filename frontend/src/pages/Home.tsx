import { Link } from 'react-router-dom'
import { Badge, Card } from '../components/ui'

/**
 * Root index — internal entry point. Prospects never land here: they arrive
 * on /p/<token> links minted in the admin portal.
 */
export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="flex items-center gap-3">
        <Logo />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Enterprise Knowledge Platform</h1>
          <p className="text-sm text-slate-500">
            Private RAG demo — grounded, cited answers over your documents
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card className="h-full p-5">
          <Badge tone="indigo">Prospect flow</Badge>
          <h2 className="mt-3 font-semibold text-slate-900">Proposal links</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Prospects enter through a signed, expiring <span className="font-mono text-xs">/p/&lt;token&gt;</span> link
            with per-link upload and query caps. Generate one in the admin portal and share it.
          </p>
        </Card>

        <Link to="/admin" className="group">
          <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-indigo-300 group-hover:shadow-md">
            <Badge tone="sky">Admin portal</Badge>
            <h2 className="mt-3 font-semibold text-slate-900">Admin portal</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              Generate capped, expiring proposal links; track every ingestion and query across
              links, with latency, tokens, cost and feedback.
            </p>
            <p className="mt-3 font-mono text-xs text-indigo-600">/admin →</p>
          </Card>
        </Link>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Documents are parsed, chunked and embedded on-platform — no content ever leaves this box
        except the final answer generation call.
      </p>
    </div>
  )
}

export function Logo({ className = 'size-9' }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-600 font-bold text-white ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeLinejoin="round" />
        <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

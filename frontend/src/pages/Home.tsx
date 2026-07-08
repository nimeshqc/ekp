import { Link } from 'react-router-dom'
import { Badge, Card } from '../components/ui'

/**
 * Mockup index — not part of the product. Entry points for the click-through
 * so a reviewer can reach every screen without minting links first.
 */
export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="flex items-center gap-3">
        <Logo />
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Enterprise Knowledge Platform</h1>
          <p className="text-sm text-slate-500">UI mockup — build-order step 1 · all data simulated</p>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link to="/p/demo" className="group">
          <Card className="h-full p-5 transition group-hover:border-indigo-700">
            <Badge tone="indigo">Prospect flow</Badge>
            <h2 className="mt-3 font-semibold text-slate-100">Open a proposal link</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              Landing → corpus choice → upload &amp; live ingestion pipeline → streamed, cited
              answers with stats, follow-ups and feedback.
            </p>
            <p className="mt-3 font-mono text-xs text-indigo-400">/p/demo →</p>
          </Card>
        </Link>

        <Link to="/admin" className="group">
          <Card className="h-full p-5 transition group-hover:border-indigo-700">
            <Badge tone="sky">Admin portal</Badge>
            <h2 className="mt-3 font-semibold text-slate-100">Admin portal</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              Generate capped, expiring proposal links; track every ingestion and query across
              links. Any username/password works in the mockup.
            </p>
            <p className="mt-3 font-mono text-xs text-indigo-400">/admin →</p>
          </Card>
        </Link>
      </div>

      <div className="mt-4">
        <Link
          to="/p/expired-demo"
          className="text-xs text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
        >
          Also see: what a prospect gets on an expired link →
        </Link>
      </div>
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

import { useEffect, useState } from 'react'
import { adminDashboard } from '../../api/mock'
import type { DashboardData } from '../../api/types'
import { Badge, Card, Spinner, StatTile } from '../../components/ui'
import { fmtCost, fmtMs, fmtNum, timeAgo } from '../../utils/format'

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    adminDashboard().then(setData)
  }, [])

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
        <Spinner /> Loading dashboard…
      </div>
    )
  }

  const { totals, events } = data

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-100">Usage dashboard</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Every ingestion and query across all proposal links.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Active links" value={totals.activeLinks} />
        <StatTile label="Ingestions" value={fmtNum(totals.ingestions)} />
        <StatTile label="Queries" value={fmtNum(totals.queries)} />
        <StatTile label="Tokens" value={fmtNum(totals.tokens)} />
        <StatTile label="LLM cost" value={fmtCost(totals.estCostUsd)} sub="embeddings: $0 (in-house)" />
        <StatTile label="Likes" value={<span className="text-emerald-400">{totals.likes}</span>} />
        <StatTile label="Dislikes" value={<span className="text-red-400">{totals.dislikes}</span>} />
      </div>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-175 text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Link</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Detail</th>
              <th className="px-4 py-3 text-right font-medium">Latency</th>
              <th className="px-4 py-3 text-right font-medium">Tokens</th>
              <th className="px-4 py-3 text-right font-medium">Cost</th>
              <th className="px-4 py-3 text-center font-medium">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/40">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-400">
                  {timeAgo(e.ts)}
                </td>
                <td className="max-w-44 truncate px-4 py-2.5 text-xs text-slate-300" title={e.linkLabel}>
                  {e.linkLabel}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={e.kind === 'query' ? 'sky' : 'indigo'}>{e.kind}</Badge>
                </td>
                <td className="max-w-72 truncate px-4 py-2.5 text-xs text-slate-200" title={e.detail}>
                  {e.detail}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-300">
                  {fmtMs(e.latencyMs)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-300">
                  {fmtNum(e.tokens)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-300">
                  {fmtCost(e.estCostUsd)}
                </td>
                <td className="px-4 py-2.5 text-center text-sm">
                  {e.feedback === 'like' ? '👍' : e.feedback === 'dislike' ? '👎' : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

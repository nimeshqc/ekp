import { useEffect, useState } from 'react'
import { adminDashboard } from '../../api/client'
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
      <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
        <Spinner /> Loading dashboard…
      </div>
    )
  }

  const { totals, events } = data

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Usage dashboard</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Every ingestion and query across all proposal links.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Active links" value={totals.activeLinks} />
        <StatTile label="Ingestions" value={fmtNum(totals.ingestions)} />
        <StatTile label="Queries" value={fmtNum(totals.queries)} />
        <StatTile label="Tokens" value={fmtNum(totals.tokens)} />
        <StatTile label="LLM cost" value={fmtCost(totals.estCostUsd)} sub="embeddings: $0 (in-house)" />
        <StatTile label="Likes" value={<span className="text-emerald-600">{totals.likes}</span>} />
        <StatTile label="Dislikes" value={<span className="text-red-600">{totals.dislikes}</span>} />
      </div>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-175 text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Link</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Detail</th>
              <th className="px-4 py-3 text-right font-medium">Latency</th>
              <th className="px-4 py-3 text-right font-medium">Tokens</th>
              <th className="px-4 py-3 text-right font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-500">
                  {timeAgo(e.ts)}
                </td>
                <td className="max-w-44 truncate px-4 py-2.5 text-xs text-slate-600" title={e.linkLabel}>
                  {e.linkLabel}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={e.kind === 'query' ? 'sky' : 'indigo'}>{e.kind}</Badge>
                </td>
                <td className="max-w-72 truncate px-4 py-2.5 text-xs text-slate-700" title={e.detail}>
                  {e.detail}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-600">
                  {fmtMs(e.latencyMs)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-600">
                  {fmtNum(e.tokens)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-600">
                  {fmtCost(e.estCostUsd)}
                </td>
                <td className="max-w-64 px-4 py-2.5 text-sm">
                  {e.feedback === 'like' ? (
                    <span title="Helpful">👍</span>
                  ) : e.feedback === 'dislike' ? (
                    <span className="flex items-center gap-1.5">
                      <span>👎</span>
                      {e.feedbackReason ? (
                        <span
                          className="truncate text-xs text-red-600"
                          title={e.feedbackReason}
                        >
                          {e.feedbackReason}
                        </span>
                      ) : (
                        <span className="text-xs italic text-slate-400">no reason given</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
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

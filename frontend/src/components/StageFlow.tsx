import type { StageMetrics } from '../api/types'
import { fmtMs } from '../utils/format'
import { CheckIcon, Spinner } from './ui'

export type StageStatus = 'pending' | 'active' | 'done'

export interface StageState {
  status: StageStatus
  durationMs?: number
  metrics?: StageMetrics
  info?: string
}

interface Props {
  stages: { key: string; label: string }[]
  state: Record<string, StageState | undefined>
}

/**
 * Pipeline visualization: parse → clean → chunk → embed → index.
 * Renders as an even grid so every step is the same width and height,
 * regardless of label length or how many metrics a step reports.
 */
export function StageFlow({ stages, state }: Props) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(7.5rem, 1fr))` }}
    >
      {stages.map((stage, i) => {
        const s = state[stage.key] ?? { status: 'pending' as const }
        const detail =
          s.info ||
          (s.metrics
            ? Object.entries(s.metrics)
                .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toLocaleString('en-US') : v}`)
                .join(' · ')
            : '')
        return (
          <div
            key={stage.key}
            className={`flex flex-col rounded-lg border px-3 py-2.5 transition-colors ${
              s.status === 'done'
                ? 'border-emerald-200 bg-emerald-50'
                : s.status === 'active'
                  ? 'border-indigo-200 bg-indigo-50'
                  : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-slate-400">
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.status === 'done' ? (
                <CheckIcon className="size-3.5 text-emerald-500" />
              ) : s.status === 'active' ? (
                <Spinner className="size-3.5" />
              ) : (
                <span className="size-1.5 rounded-full bg-slate-300" />
              )}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-1.5">
              <span
                className={`text-xs font-semibold ${
                  s.status === 'pending' ? 'text-slate-400' : 'text-slate-700'
                }`}
              >
                {stage.label}
              </span>
              {s.durationMs !== undefined && (
                <span className="font-mono text-[10px] text-slate-400">{fmtMs(s.durationMs)}</span>
              )}
            </div>
            <div className="mt-1 min-h-8 font-mono text-[10px] leading-4 text-slate-500">
              {detail || <span className="text-slate-300">—</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

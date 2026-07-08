import { Fragment } from 'react'
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

/** Horizontal pipeline visualization: parse → clean → chunk → embed → index */
export function StageFlow({ stages, state }: Props) {
  return (
    <div className="flex flex-wrap items-start gap-y-2">
      {stages.map((stage, i) => {
        const s = state[stage.key] ?? { status: 'pending' as const }
        return (
          <Fragment key={stage.key}>
            {i > 0 && (
              <div className="mx-1 mt-2.5 h-px w-4 shrink-0 bg-slate-700 sm:w-6" aria-hidden />
            )}
            <div
              className={`rounded-lg border px-2.5 py-1.5 transition-colors ${
                s.status === 'done'
                  ? 'border-emerald-900 bg-emerald-950/40'
                  : s.status === 'active'
                    ? 'border-indigo-800 bg-indigo-950/40'
                    : 'border-slate-800 bg-slate-900/40'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {s.status === 'done' ? (
                  <CheckIcon className="size-3.5 text-emerald-400" />
                ) : s.status === 'active' ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <span className="size-1.5 rounded-full bg-slate-600" />
                )}
                <span
                  className={`text-xs font-medium ${
                    s.status === 'pending' ? 'text-slate-500' : 'text-slate-200'
                  }`}
                >
                  {stage.label}
                </span>
                {s.durationMs !== undefined && (
                  <span className="font-mono text-[10px] text-slate-500">{fmtMs(s.durationMs)}</span>
                )}
              </div>
              {(s.metrics || s.info) && (
                <div className="mt-0.5 font-mono text-[10px] leading-4 text-slate-400">
                  {s.info}
                  {s.metrics &&
                    Object.entries(s.metrics)
                      .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toLocaleString('en-US') : v}`)
                      .join(' · ')}
                </div>
              )}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

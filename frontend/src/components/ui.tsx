import type { ReactNode } from 'react'
import { useState } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {children}
    </h3>
  )
}

type BadgeTone = 'slate' | 'green' | 'amber' | 'red' | 'indigo' | 'sky'

const badgeTones: Record<BadgeTone, string> = {
  slate: 'bg-slate-800 text-slate-300 border-slate-700',
  green: 'bg-emerald-950 text-emerald-400 border-emerald-900',
  amber: 'bg-amber-950 text-amber-400 border-amber-900',
  red: 'bg-red-950 text-red-400 border-red-900',
  indigo: 'bg-indigo-950 text-indigo-300 border-indigo-900',
  sky: 'bg-sky-950 text-sky-300 border-sky-900',
}

export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-indigo-400 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  )
}

export function CheckIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.8a1 1 0 0 1 1.4 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-700"
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  )
}

/** remaining/total budget meter, e.g. "queries 21 / 25" */
export function BudgetMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const remaining = Math.max(0, max - used)
  const pct = Math.min(100, (used / max) * 100)
  const tone = remaining === 0 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="min-w-36">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium text-slate-400">{label}</span>
        <span className="font-mono text-[11px] text-slate-300">
          {remaining}<span className="text-slate-600">/{max} left</span>
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getLinkInfo } from '../../api/mock'
import type { DocIngestStats, LinkInfo } from '../../api/types'
import { BudgetMeter, Spinner } from '../../components/ui'
import { Logo } from '../Home'
import IngestPanel from './IngestPanel'
import QueryPanel from './QueryPanel'

export default function Workspace() {
  const { token = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'user' ? 'user' : 'default'

  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [userDocs, setUserDocs] = useState<DocIngestStats[]>([])

  const refreshInfo = useCallback(() => {
    getLinkInfo(token).then(setInfo).catch(() => {})
  }, [token])

  useEffect(refreshInfo, [refreshInfo])

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-400">
        <Spinner /> Loading workspace…
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <Link to={`/p/${token}`} className="flex items-center gap-2.5">
          <Logo className="size-8" />
          <div>
            <div className="text-sm font-semibold text-slate-100">Enterprise Knowledge Platform</div>
            <div className="text-[11px] text-slate-500">{info.label}</div>
          </div>
        </Link>
        <div className="flex items-center gap-6">
          <BudgetMeter label="Uploads" used={info.usedIngestions} max={info.maxIngestions} />
          <BudgetMeter label="Questions" used={info.usedQueries} max={info.maxQueries} />
        </div>
      </header>

      <div className="mt-4 flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1 text-sm font-medium sm:w-fit">
        {(
          [
            ['default', 'Default corpus'],
            ['user', 'Your documents'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setParams({ mode: m })}
            className={`flex-1 rounded-md px-4 py-1.5 transition sm:flex-none ${
              mode === m ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="mt-5 flex flex-1 flex-col gap-5 pb-8">
        {mode === 'user' && (
          <IngestPanel
            token={token}
            remaining={info.maxIngestions - info.usedIngestions}
            docs={userDocs}
            onIngested={(docs) => {
              setUserDocs((prev) => [...prev, ...docs])
              refreshInfo()
            }}
          />
        )}
        <QueryPanel
          key={mode} // separate conversation per corpus
          token={token}
          corpus={mode}
          userDocIds={userDocs.map((d) => d.docId)}
          remaining={info.maxQueries - info.usedQueries}
          onQueryDone={refreshInfo}
        />
      </main>
    </div>
  )
}

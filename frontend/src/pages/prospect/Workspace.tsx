import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getLinkInfo } from '../../api/client'
import type { DocIngestStats, LinkInfo } from '../../api/types'
import { Spinner } from '../../components/ui'
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
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <Spinner /> Loading workspace…
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <Link to={`/p/${token}`} className="flex items-center gap-2.5">
          <Logo className="size-8" />
          <div>
            <div className="text-sm font-semibold text-slate-900">Enterprise Knowledge Platform</div>
            <div className="text-[11px] text-slate-500">Private demo workspace</div>
          </div>
        </Link>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium shadow-sm">
          {(
            [
              ['default', 'Default corpus'],
              ['user', 'Your documents'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setParams({ mode: m })}
              className={`rounded-md px-4 py-1.5 transition ${
                mode === m ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="mt-5 flex flex-1 flex-col gap-5 pb-8">
        {mode === 'user' && (
          <IngestPanel
            token={token}
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

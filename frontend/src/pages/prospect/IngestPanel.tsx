import { useRef, useState } from 'react'
import { ingest } from '../../api/mock'
import type { DocIngestStats, IngestAggregate, IngestStage } from '../../api/types'
import { StageFlow, type StageState } from '../../components/StageFlow'
import { Badge, Card, SectionTitle, StatTile } from '../../components/ui'
import { fmtBytes, fmtMs, fmtNum } from '../../utils/format'

const ACCEPTED = ['pdf', 'txt', 'md', 'docx']
const MAX_FILE_MB = 25
const PIPELINE: { key: IngestStage; label: string }[] = [
  { key: 'parse', label: 'Parse' },
  { key: 'clean', label: 'Clean' },
  { key: 'chunk', label: 'Chunk' },
  { key: 'embed', label: 'Embed' },
  { key: 'index', label: 'Index' },
]

interface LiveDoc {
  docId: string
  filename: string
  sizeBytes: number
  stages: Partial<Record<IngestStage, StageState>>
  stats?: DocIngestStats
}

interface Props {
  token: string
  remaining: number
  docs: DocIngestStats[] // previously ingested this session
  onIngested: (docs: DocIngestStats[]) => void
}

export default function IngestPanel({ token, remaining, docs, onIngested }: Props) {
  const [selected, setSelected] = useState<File[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [liveDocs, setLiveDocs] = useState<LiveDoc[]>([])
  const [aggregate, setAggregate] = useState<IngestAggregate | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(files: File[]) {
    const errs: string[] = []
    const ok: File[] = []
    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ACCEPTED.includes(ext)) {
        errs.push(`${f.name}: unsupported format (accepted: ${ACCEPTED.join(', ')})`)
      } else if (f.size > MAX_FILE_MB * 1024 * 1024) {
        errs.push(`${f.name}: exceeds ${MAX_FILE_MB} MB limit`)
      } else if (selected.some((s) => s.name === f.name)) {
        errs.push(`${f.name}: already selected`)
      } else {
        ok.push(f)
      }
    }
    const room = remaining - selected.length
    if (ok.length > room) {
      errs.push(`Upload budget allows ${room} more document${room === 1 ? '' : 's'} on this link`)
      ok.length = Math.max(0, room)
    }
    setErrors(errs)
    setSelected((prev) => [...prev, ...ok])
  }

  async function runIngest() {
    if (selected.length === 0 || running) return
    setRunning(true)
    setErrors([])
    setAggregate(null)
    const files = selected.map((f) => ({ name: f.name, sizeBytes: f.size }))
    setSelected([])
    const finished: DocIngestStats[] = []

    await ingest(token, files, (e) => {
      switch (e.type) {
        case 'doc-start':
          setLiveDocs((prev) => [
            ...prev,
            { docId: e.docId, filename: e.filename, sizeBytes: e.sizeBytes, stages: {} },
          ])
          break
        case 'stage':
          setLiveDocs((prev) =>
            prev.map((d) =>
              d.docId === e.docId
                ? {
                    ...d,
                    stages: {
                      ...d.stages,
                      [e.stage]:
                        e.status === 'started'
                          ? { status: 'active' }
                          : { status: 'done', durationMs: e.durationMs, metrics: e.metrics },
                    },
                  }
                : d,
            ),
          )
          break
        case 'doc-done':
          finished.push(e.stats)
          setLiveDocs((prev) => prev.map((d) => (d.docId === e.docId ? { ...d, stats: e.stats } : d)))
          break
        case 'done':
          setAggregate(e.aggregate)
          break
      }
    })

    setRunning(false)
    onIngested(finished)
  }

  const canAdd = !running && remaining - selected.length > 0

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <SectionTitle>Document ingestion</SectionTitle>
        <Badge tone="slate">pdf · txt · md · docx — max {MAX_FILE_MB} MB each</Badge>
      </div>

      {/* dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (canAdd) addFiles(Array.from(e.dataTransfer.files))
        }}
        onClick={() => canAdd && inputRef.current?.click()}
        className={`mt-3 cursor-pointer rounded-lg border-2 border-dashed px-4 py-7 text-center transition ${
          dragOver
            ? 'border-indigo-500 bg-indigo-950/30'
            : canAdd
              ? 'border-slate-700 hover:border-slate-500'
              : 'cursor-not-allowed border-slate-800 opacity-60'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.docx"
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <p className="text-sm text-slate-300">
          {canAdd ? (
            <>Drop files here or <span className="font-medium text-indigo-400">browse</span></>
          ) : (
            'Upload budget for this link is used up'
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {remaining - selected.length} upload{remaining - selected.length === 1 ? '' : 's'} remaining ·
          processed fully on-platform, never sent to an external API
        </p>
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-400">
          {errors.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="mt-3 space-y-2">
          {selected.map((f) => (
            <div
              key={f.name}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
            >
              <span className="truncate text-slate-200">{f.name}</span>
              <span className="ml-3 flex shrink-0 items-center gap-3">
                <span className="font-mono text-xs text-slate-500">{fmtBytes(f.size)}</span>
                <button
                  onClick={() => setSelected((prev) => prev.filter((x) => x.name !== f.name))}
                  className="text-slate-500 hover:text-red-400"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
          <button
            onClick={runIngest}
            className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Ingest {selected.length} document{selected.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {/* live pipeline per document */}
      {liveDocs.length > 0 && (
        <div className="mt-5 space-y-3">
          {liveDocs.map((d) => (
            <div key={d.docId} className="fade-up rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-slate-200">{d.filename}</span>
                  <span className="font-mono text-xs text-slate-500">{fmtBytes(d.sizeBytes)}</span>
                </div>
                {d.stats ? (
                  <Badge tone="green">indexed in {fmtMs(d.stats.totalMs)}</Badge>
                ) : (
                  <Badge tone="indigo">processing…</Badge>
                )}
              </div>
              <div className="mt-3">
                <StageFlow stages={PIPELINE} state={d.stages} />
              </div>
              {d.stats && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatTile label="Chunks" value={fmtNum(d.stats.chunkCount)} />
                  <StatTile label="Tokens" value={fmtNum(d.stats.tokenCount)} />
                  <StatTile
                    label="Embeddings"
                    value={fmtNum(d.stats.embeddingCount)}
                    sub={`${d.stats.vectorDim}-dim`}
                  />
                  <StatTile
                    label="Words"
                    value={fmtNum(d.stats.wordCount)}
                    sub={d.stats.pageCount ? `${d.stats.pageCount} pages` : undefined}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* aggregate */}
      {aggregate && (
        <div className="fade-up mt-4 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-emerald-300">
            <span className="font-semibold">Corpus ready — ask your first question below.</span>
            <span className="font-mono text-emerald-400/80">
              {aggregate.documents} docs · {fmtNum(aggregate.chunks)} chunks · {fmtNum(aggregate.tokens)}{' '}
              tokens · {fmtNum(aggregate.embeddings)} embeddings · {fmtMs(aggregate.totalMs)} total
            </span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-500/70">
            Embedded with BAAI/bge-small-en-v1.5 (onnx-int8) on local CPU — no external embedding API.
          </div>
        </div>
      )}

      {docs.length === 0 && liveDocs.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Your documents are indexed into an isolated namespace tied to this link — no other
          workspace can ever see them.
        </p>
      )}
    </Card>
  )
}

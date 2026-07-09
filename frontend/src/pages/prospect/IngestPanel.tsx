import { useRef, useState } from 'react'
import { ingest } from '../../api/client'
import type { DocIngestStats, IngestAggregate, IngestStage } from '../../api/types'
import { StageFlow, type StageState } from '../../components/StageFlow'
import { Badge, Card, SectionTitle, StatTile } from '../../components/ui'
import { fmtBytes, fmtMs, fmtNum } from '../../utils/format'

const ACCEPTED = ['pdf', 'txt', 'md', 'docx']
const MAX_FILES = 5
const MAX_TOTAL_MB = 25
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024

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
  docs: DocIngestStats[] // previously ingested this session
  onIngested: (docs: DocIngestStats[]) => void
}

export default function IngestPanel({ token, docs, onIngested }: Props) {
  const [selected, setSelected] = useState<File[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [liveDocs, setLiveDocs] = useState<LiveDoc[]>([])
  const [aggregate, setAggregate] = useState<IngestAggregate | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedBytes = selected.reduce((s, f) => s + f.size, 0)

  function addFiles(files: File[]) {
    const errs: string[] = []
    const accepted = [...selected]
    let total = selectedBytes
    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ACCEPTED.includes(ext)) {
        errs.push(`${f.name}: unsupported format (accepted: ${ACCEPTED.join(', ')})`)
      } else if (accepted.some((s) => s.name === f.name)) {
        errs.push(`${f.name}: already added`)
      } else if (accepted.length >= MAX_FILES) {
        errs.push(`Up to ${MAX_FILES} files per upload — "${f.name}" was skipped`)
      } else if (total + f.size > MAX_TOTAL_BYTES) {
        errs.push(`${f.name}: would exceed the ${MAX_TOTAL_MB} MB combined limit for this upload`)
      } else {
        accepted.push(f)
        total += f.size
      }
    }
    setErrors(errs)
    setSelected(accepted)
  }

  async function runIngest() {
    if (selected.length === 0 || running) return
    setRunning(true)
    setErrors([])
    setAggregate(null)
    const files = selected
    setSelected([])
    const finished: DocIngestStats[] = []

    await ingest(token, files, (e) => {
      switch (e.type) {
        case 'error':
          setErrors((prev) => [...prev, e.message])
          if (e.docId) {
            setLiveDocs((prev) => prev.filter((d) => d.docId !== e.docId || d.stats))
          }
          break
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

  const canAdd = !running && selected.length < MAX_FILES && selectedBytes < MAX_TOTAL_BYTES
  const filePct = Math.min(100, (selected.length / MAX_FILES) * 100)
  const bytePct = Math.min(100, (selectedBytes / MAX_TOTAL_BYTES) * 100)

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Document ingestion</SectionTitle>
        <Badge tone="slate">pdf · txt · md · docx</Badge>
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
            ? 'border-indigo-400 bg-indigo-50'
            : canAdd
              ? 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
              : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
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
        <p className="text-sm text-slate-700">
          {canAdd ? (
            <>Drop files here or <span className="font-medium text-indigo-600">browse</span></>
          ) : selected.length >= MAX_FILES ? (
            `Maximum ${MAX_FILES} files per upload reached`
          ) : (
            `${MAX_TOTAL_MB} MB combined limit reached`
          )}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Up to {MAX_FILES} files · {MAX_TOTAL_MB} MB total per upload · processed on-platform, never
          sent to an external API
        </p>
      </div>

      {/* per-upload usage against the 5-file / 25 MB limits */}
      {selected.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <UsageBar
            label="Files"
            valueText={`${selected.length} / ${MAX_FILES}`}
            pct={filePct}
          />
          <UsageBar
            label="Combined size"
            valueText={`${fmtBytes(selectedBytes)} / ${MAX_TOTAL_MB} MB`}
            pct={bytePct}
          />
        </div>
      )}

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-600">
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
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="truncate text-slate-700">{f.name}</span>
              <span className="ml-3 flex shrink-0 items-center gap-3">
                <span className="font-mono text-xs text-slate-500">{fmtBytes(f.size)}</span>
                <button
                  onClick={() => setSelected((prev) => prev.filter((x) => x.name !== f.name))}
                  className="text-slate-400 hover:text-red-500"
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
            <div key={d.docId} className="fade-up rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-slate-800">{d.filename}</span>
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
        <div className="fade-up mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-emerald-700">
            <span className="font-semibold">Corpus ready — ask your first question below.</span>
            <span className="font-mono text-emerald-600">
              {aggregate.documents} docs · {fmtNum(aggregate.chunks)} chunks · {fmtNum(aggregate.tokens)}{' '}
              tokens · {fmtNum(aggregate.embeddings)} embeddings · {fmtMs(aggregate.totalMs)} total
            </span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600/80">
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

function UsageBar({ label, valueText, pct }: { label: string; valueText: string; pct: number }) {
  const tone = pct >= 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-indigo-500'
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-slate-500">{label}</span>
        <span className="font-mono text-[11px] text-slate-600">{valueText}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

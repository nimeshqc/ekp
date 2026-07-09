import { useEffect, useState } from 'react'
import { adminCreateLink, adminListLinks, adminRevokeLink } from '../../api/client'
import type { ProposalLink } from '../../api/types'
import { Badge, Card, CopyButton, SectionTitle, Spinner } from '../../components/ui'
import { expiryText, timeAgo } from '../../utils/format'

export default function LinksPage() {
  const [links, setLinks] = useState<ProposalLink[] | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [justCreated, setJustCreated] = useState<string | null>(null)

  function refresh() {
    adminListLinks().then(setLinks)
  }
  useEffect(refresh, [])

  async function revoke(link: ProposalLink) {
    if (!window.confirm(`Revoke "${link.label}"? The prospect loses access immediately.`)) return
    await adminRevokeLink(link.id)
    refresh()
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Proposal links</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            One link per bid — signed, expiring, usage-capped, revocable.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          + Generate link
        </button>
      </div>

      {showCreate && (
        <CreateLinkForm
          onClose={() => setShowCreate(false)}
          onCreated={(link) => {
            setShowCreate(false)
            setJustCreated(link.id)
            refresh()
          }}
        />
      )}

      {!links ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <Spinner /> Loading links…
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              highlight={link.id === justCreated}
              onRevoke={() => revoke(link)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LinkRow({
  link,
  highlight,
  onRevoke,
}: {
  link: ProposalLink
  highlight: boolean
  onRevoke: () => void
}) {
  const expiry = expiryText(link.expiresAt)
  const fullUrl = `${window.location.origin}${link.url}`
  const status = link.revoked
    ? { tone: 'red' as const, label: 'revoked' }
    : expiry.expired
      ? { tone: 'amber' as const, label: expiry.text }
      : { tone: 'green' as const, label: expiry.text }

  return (
    <Card className={`p-4 ${highlight ? 'fade-up border-indigo-300 ring-1 ring-indigo-100' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{link.label}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="truncate font-mono text-xs text-indigo-600 hover:underline"
            >
              {fullUrl}
            </a>
            <CopyButton text={fullUrl} />
          </div>
        </div>

        <div className="flex items-center gap-5">
          <UsageCell label="uploads" used={link.usedIngestions} max={link.maxIngestions} />
          <UsageCell label="queries" used={link.usedQueries} max={link.maxQueries} />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">created</div>
            <div className="font-mono text-xs text-slate-600">{timeAgo(link.createdAt)}</div>
          </div>
          {!link.revoked && (
            <button
              onClick={onRevoke}
              className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-400 hover:bg-red-50"
            >
              Revoke
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

function UsageCell({ label, used, max }: { label: string; used: number; max: number }) {
  const full = used >= max
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`font-mono text-xs ${full ? 'text-amber-600' : 'text-slate-600'}`}>
        {used}<span className="text-slate-400"> / {max}</span>
      </div>
    </div>
  )
}

function CreateLinkForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (link: ProposalLink) => void
}) {
  const [label, setLabel] = useState('')
  const [maxIngestions, setMaxIngestions] = useState(5)
  const [maxQueries, setMaxQueries] = useState(25)
  const [expiresInHours, setExpiresInHours] = useState(72)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    const link = await adminCreateLink({
      label: label.trim(),
      maxIngestions,
      maxQueries,
      expiresInHours,
    })
    onCreated(link)
  }

  return (
    <Card className="fade-up mt-5 border-indigo-200 p-5">
      <SectionTitle>New proposal link</SectionTitle>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="lg:col-span-2">
          <span className="text-xs text-slate-500">Label (client / bid)</span>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Initech — support KB chatbot"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </label>
        <NumberField label="Max uploads" value={maxIngestions} onChange={setMaxIngestions} min={1} max={5} />
        <NumberField label="Max queries" value={maxQueries} onChange={setMaxQueries} min={1} max={100} />
        <NumberField label="Expires in (hours)" value={expiresInHours} onChange={setExpiresInHours} min={1} max={720} />
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            disabled={busy || !label.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy && <Spinner className="size-4 text-white" />}
            Generate signed URL
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
          >
            Cancel
          </button>
          <p className="ml-auto hidden text-[11px] text-slate-400 sm:block">
            Caps are enforced server-side per request — the token alone is never trusted.
          </p>
        </div>
      </form>
    </Card>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
}) {
  return (
    <label>
      <span className="text-xs text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  )
}

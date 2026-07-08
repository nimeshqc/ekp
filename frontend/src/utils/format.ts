export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

export function fmtCost(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(5)}`
  return `$${usd.toFixed(3)}`
}

export function fmtScore(score: number): string {
  return score.toFixed(2)
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso)
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** "expires in 2d 19h" / "expired 32h ago" */
export function expiryText(iso: string): { text: string; expired: boolean } {
  const diffMs = Date.parse(iso) - Date.now()
  const abs = Math.abs(diffMs)
  const hours = Math.floor(abs / 3_600_000)
  const days = Math.floor(hours / 24)
  const span = days > 0 ? `${days}d ${hours % 24}h` : `${Math.max(1, hours)}h`
  return diffMs > 0
    ? { text: `expires in ${span}`, expired: false }
    : { text: `expired ${span} ago`, expired: true }
}

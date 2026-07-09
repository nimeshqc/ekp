/**
 * API contract for the Enterprise Knowledge Platform.
 *
 * This file is the single source of truth the backend must satisfy
 * (architecture.md §3, §6). The mock layer (mock.ts) implements it today;
 * build-order step 6 swaps the mock for live fetch/SSE with no UI changes.
 */

// ---------- Proposal link ----------

export interface LinkInfo {
  token: string
  label: string
  expiresAt: string // ISO 8601
  maxIngestions: number
  usedIngestions: number
  maxQueries: number
  usedQueries: number
  revoked: boolean
}

export type Corpus = 'user' | 'default'

// ---------- Ingestion (SSE stream over POST /api/ingest) ----------

export type IngestStage = 'parse' | 'clean' | 'chunk' | 'embed' | 'index'

export interface StageMetrics {
  [key: string]: string | number
}

export interface DocStageRecord {
  stage: IngestStage
  durationMs: number
  metrics: StageMetrics
}

export interface DocIngestStats {
  docId: string
  filename: string
  sizeBytes: number
  pageCount: number | null
  wordCount: number
  chunkCount: number
  tokenCount: number
  embeddingCount: number
  vectorDim: number
  embeddingModel: string
  totalMs: number
  stages: DocStageRecord[]
}

export interface IngestAggregate {
  documents: number
  chunks: number
  tokens: number
  embeddings: number
  totalMs: number
}

export type IngestEvent =
  | { type: 'doc-start'; docId: string; filename: string; sizeBytes: number }
  | {
      type: 'stage'
      docId: string
      stage: IngestStage
      status: 'started' | 'completed'
      durationMs?: number
      metrics?: StageMetrics
    }
  | { type: 'doc-done'; docId: string; stats: DocIngestStats }
  | { type: 'done'; aggregate: IngestAggregate }
  | { type: 'error'; docId?: string; message: string }

// ---------- RAG query (SSE stream over POST /api/query) ----------

export type QueryStage = 'embed-query' | 'retrieve' | 'generate'

export interface Citation {
  id: number // renders as [1], [2], ...
  docId: string
  filename: string
  page: number | null
  charStart: number
  charEnd: number
  snippet: string
  score: number // cosine similarity 0..1
}

export interface QueryStats {
  retrievalMs: number
  ttftMs: number
  totalMs: number
  inputTokens: number
  outputTokens: number
  model: string
  estCostUsd: number
}

export type QueryEvent =
  | { type: 'stage'; stage: QueryStage; status: 'started' | 'completed'; durationMs?: number; info?: string }
  | { type: 'sources'; citations: Citation[] }
  | { type: 'token'; text: string }
  | { type: 'grounded'; grounded: boolean }
  | { type: 'followups'; questions: string[] }
  | { type: 'done'; queryId: string; stats: QueryStats }
  | { type: 'error'; message: string }

export type Feedback = 'like' | 'dislike'

// ---------- Source documents (viewer) ----------

export interface SourcePage {
  page: number
  text: string
}

export interface SourceDoc {
  docId: string
  filename: string
  kind: 'pdf' | 'text' | 'markdown'
  /** pdf: text per page; global char offsets run across pages in order */
  pages: SourcePage[]
}

// ---------- Admin ----------

export interface ProposalLink {
  id: string
  label: string
  url: string
  createdAt: string
  expiresAt: string
  maxIngestions: number
  usedIngestions: number
  maxQueries: number
  usedQueries: number
  revoked: boolean
}

export interface CreateLinkRequest {
  label: string
  maxIngestions: number
  maxQueries: number
  expiresInHours: number
}

export interface ActivityEvent {
  id: string
  ts: string
  linkLabel: string
  kind: 'ingestion' | 'query'
  detail: string // filename or question text
  latencyMs: number
  tokens: number
  estCostUsd: number
  feedback: Feedback | null
}

export interface DashboardData {
  totals: {
    activeLinks: number
    ingestions: number
    queries: number
    tokens: number
    estCostUsd: number
    likes: number
    dislikes: number
  }
  events: ActivityEvent[]
}

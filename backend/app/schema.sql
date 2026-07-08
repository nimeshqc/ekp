-- Enterprise Knowledge Platform schema (architecture.md §6). Idempotent:
-- applied on startup and by `make migrate`.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS proposal_link (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_jti       uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    label           text NOT NULL,
    created_by      text NOT NULL DEFAULT 'admin',
    max_ingestions  int  NOT NULL,
    max_queries     int  NOT NULL,
    used_ingestions int  NOT NULL DEFAULT 0,
    used_queries    int  NOT NULL DEFAULT 0,
    expires_at      timestamptz NOT NULL,
    revoked         boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id     uuid REFERENCES proposal_link(id) ON DELETE CASCADE,  -- NULL → default corpus
    corpus      text NOT NULL CHECK (corpus IN ('user', 'default')),
    filename    text NOT NULL,
    mime        text NOT NULL DEFAULT '',
    size_bytes  bigint NOT NULL DEFAULT 0,
    page_count  int,
    word_count  int NOT NULL DEFAULT 0,
    status      text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
    ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_link_idx ON document (link_id);

-- Cleaned page texts (global char offsets run across pages joined by '\n\n');
-- this is what the source viewer renders and what highlights anchor into.
CREATE TABLE IF NOT EXISTS document_page (
    document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    page        int  NOT NULL,
    text        text NOT NULL,
    PRIMARY KEY (document_id, page)
);

CREATE TABLE IF NOT EXISTS chunk (
    id          bigserial PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    ordinal     int  NOT NULL,
    page        int,
    char_start  int  NOT NULL,
    char_end    int  NOT NULL,
    text        text NOT NULL,
    token_count int  NOT NULL DEFAULT 0,
    embedding   vector(384) NOT NULL
);
CREATE INDEX IF NOT EXISTS chunk_document_idx ON chunk (document_id);
CREATE INDEX IF NOT EXISTS chunk_embedding_hnsw ON chunk USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS ingestion_event (
    id          bigserial PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    stage       text NOT NULL,
    duration_ms int  NOT NULL,
    metrics_json jsonb NOT NULL DEFAULT '{}',
    ts          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS query_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id             uuid REFERENCES proposal_link(id) ON DELETE CASCADE,
    corpus              text NOT NULL DEFAULT 'user',
    question            text NOT NULL,
    answer              text NOT NULL DEFAULT '',
    grounded            boolean NOT NULL DEFAULT true,
    retrieved_chunk_ids bigint[] NOT NULL DEFAULT '{}',
    retrieval_ms        int NOT NULL DEFAULT 0,
    ttft_ms             int NOT NULL DEFAULT 0,
    total_ms            int NOT NULL DEFAULT 0,
    input_tokens        int NOT NULL DEFAULT 0,
    output_tokens       int NOT NULL DEFAULT 0,
    est_cost            numeric(12, 8) NOT NULL DEFAULT 0,
    model               text NOT NULL DEFAULT '',
    ts                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
    id           bigserial PRIMARY KEY,
    query_log_id uuid NOT NULL REFERENCES query_log(id) ON DELETE CASCADE,
    verdict      text NOT NULL CHECK (verdict IN ('like', 'dislike')),
    reason       text,
    ts           timestamptz NOT NULL DEFAULT now()
);

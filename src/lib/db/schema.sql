-- Local evaluate-run store. Idempotent. No cloud/AWS objects.

CREATE TABLE IF NOT EXISTS evaluate_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subject TEXT NOT NULL,
  context TEXT,
  reference TEXT,
  rubric_id TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  scores JSONB NOT NULL,
  overall DOUBLE PRECISION NOT NULL,
  passed BOOLEAN,
  rationale TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS evaluate_runs_created_at_idx
  ON evaluate_runs (created_at DESC);

ALTER TABLE evaluate_runs ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE evaluate_runs ADD COLUMN IF NOT EXISTS fixture_id TEXT;

CREATE INDEX IF NOT EXISTS evaluate_runs_campaign_idx
  ON evaluate_runs (campaign_id);

-- User-edited rubrics (built-in default stays in code; this is the dashboard store).
CREATE TABLE IF NOT EXISTS stored_rubrics (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stored_rubrics_updated_at_idx
  ON stored_rubrics (updated_at DESC);

-- Singleton row of evaluate/agent knobs used by the dashboard and evaluate path.
CREATE TABLE IF NOT EXISTS agentic_options (
  id TEXT PRIMARY KEY DEFAULT 'default',
  judge_model TEXT NOT NULL,
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unstructured chunk store for hybrid RAG. Local only; no AWS.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT,
  content TEXT NOT NULL,
  embedding vector(32) NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
  ON rag_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS rag_chunks_tsv_gin
  ON rag_chunks USING gin (tsv);

-- Runnable eval dataset rows (ETL from root CSV).
CREATE TABLE IF NOT EXISTS eval_dataset_rows (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  context TEXT,
  reference TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_dataset_rows_source_idx
  ON eval_dataset_rows (source_file);

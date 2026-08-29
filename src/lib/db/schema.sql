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
ALTER TABLE evaluate_runs ADD COLUMN IF NOT EXISTS seed TEXT;
ALTER TABLE evaluate_runs ADD COLUMN IF NOT EXISTS model_id TEXT;
ALTER TABLE evaluate_runs ADD COLUMN IF NOT EXISTS dataset_version TEXT;

CREATE INDEX IF NOT EXISTS evaluate_runs_campaign_idx
  ON evaluate_runs (campaign_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  seed TEXT,
  model_id TEXT,
  rubric_version TEXT,
  dataset_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  embedding vector(768) NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- Live store is vector(768). Older vector(32) installs cannot ALTER in place;
-- truncate and rebuild the column, then re-ingest.
DO $$
DECLARE
  typ text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO typ
  FROM pg_attribute a
  WHERE a.attrelid = 'rag_chunks'::regclass
    AND a.attname = 'embedding'
    AND NOT a.attisdropped;
  IF typ IS DISTINCT FROM 'vector(768)' THEN
    DROP INDEX IF EXISTS rag_chunks_embedding_hnsw;
    TRUNCATE rag_chunks;
    ALTER TABLE rag_chunks DROP COLUMN IF EXISTS embedding;
    ALTER TABLE rag_chunks ADD COLUMN embedding vector(768) NOT NULL;
  END IF;
END $$;

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

-- Full-text public web pages (Wikipedia seeds first). Local only; no AWS.
CREATE TABLE IF NOT EXISTS text_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  full_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  site TEXT NOT NULL DEFAULT 'en.wikipedia.org',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  http_status INT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS text_documents_site_idx
  ON text_documents (site);

CREATE INDEX IF NOT EXISTS text_documents_fetched_at_idx
  ON text_documents (fetched_at DESC);

-- Versioned synthesized eval datasets. Items start pending (not gold).
CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  version INT NOT NULL,
  source_slug TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version)
);

CREATE INDEX IF NOT EXISTS dataset_versions_dataset_idx
  ON dataset_versions (dataset_id, version DESC);

CREATE TABLE IF NOT EXISTS dataset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
  ordinal INT NOT NULL,
  question TEXT NOT NULL,
  expected_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  difficulty TEXT,
  source_slug TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'kept', 'edited', 'rejected')),
  is_gold BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (version_id, ordinal)
);

CREATE INDEX IF NOT EXISTS dataset_items_version_idx
  ON dataset_items (version_id, ordinal);

CREATE INDEX IF NOT EXISTS dataset_items_gold_idx
  ON dataset_items (version_id)
  WHERE is_gold = true;

-- Versioned synthesis prompt templates (id + version). Built-ins also live in code.
CREATE TABLE IF NOT EXISTS synthesis_templates (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  mode TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS synthesis_templates_mode_idx
  ON synthesis_templates (mode, updated_at DESC);

# synthkit

A local kit for ingesting a corpus, synthesizing LLM eval questions, reviewing gold, and judging model answers.

[![test](https://github.com/Benj124/judge-dredd/actions/workflows/test.yml/badge.svg)](https://github.com/Benj124/judge-dredd/actions/workflows/test.yml)

The product is **synthkit**. On npm the package and the command you type are **`judge-dredd`**:

```bash
npx judge-dredd help
```

Do not `npx synth` or `npm i synthkit` — those names are unrelated packages. After a clone, `npx synth` is the local CLI alias. Live xAI keys are optional.

## First try

```bash
git clone https://github.com/Benj124/judge-dredd.git
cd judge-dredd
npm install
cp .env.example .env
docker compose up -d          # local Postgres (pgvector). Same as npm run db:up
npm run db:migrate
npm run dev                   # dashboard at http://localhost:3000
```

Or from npm (no clone): `npx judge-dredd help`. Live xAI is optional — use stubs:

```
EVAL_LLM_STUB=1     # judge / generate / synthesize without XAI_API_KEY
RAG_EMBED_STUB=1    # embeddings without a live embed API
```

- **`XAI_API_KEY`**: judge, generate-then-judge, live embeddings.
- **`XAI_API_KEY2`**: synthesis only (`synth generate` / `/api/synthesize`). Not the judge key.

Default DB URL: `postgres://judge:judge@127.0.0.1:5432/synthkit` (never AWS). If you still have an older Docker volume from a previous database name, remove it or `createdb synthkit`.

## Golden path

Ingest **one document** → **synthesize 5 items** → **review** → **run judge** → **export JSONL**. No live Wikipedia or live LLM required:

```bash
docker compose up -d
npm run db:migrate

# 1. Ingest (local fixture; swap --file for --url https://… when you have network)
npx judge-dredd ingest --file src/lib/graph/fixtures/corpus-note.md

# 2–3. Synthesize 5 questions and keep them as gold (stub LLM)
EVAL_LLM_STUB=1 npx judge-dredd generate --slug corpus-note --n 5 --keep

# 4. Run the judge / campaign
EVAL_LLM_STUB=1 npx judge-dredd run --versionId <id>

# 5. Export gold JSONL
npx judge-dredd export --versionId <id> --format jsonl
```

`generate` prints `versionId`. `--keep` marks every synthesized item gold in the same step. To review later instead: omit `--keep`, then `npx judge-dredd review --versionId <id> --keep-all`. `npm run db:migrate` is idempotent; if an older install still has `vector(32)` embeddings it truncates `rag_chunks` and you re-ingest.

CLI: `npx judge-dredd ingest|generate|review|run|export|pairwise`. After a clone, `npx synth` and `npm run synth --` are the same binary.

## Connectors (GCP data store, Databricks Unity Catalog)

Pull **articles** from a Vertex AI Search / Discovery Engine data store or a Databricks Unity Catalog vector search index into the same `text_documents` table as `--file` / `--url`. Then `synth generate` / `synth run` on those slugs. Credentials are env vars or flags — never committed files.

```bash
# GCP: bearer token OR service-account JSON path (JWT → access token)
npx judge-dredd ingest --gcp-data-store projects/P/locations/global/collections/default_collection/dataStores/DS \
  --token "$GCP_ACCESS_TOKEN"
npx judge-dredd ingest --gcp-data-store projects/P/locations/global/dataStores/DS \
  --service-account ./sa.json   # or GOOGLE_APPLICATION_CREDENTIALS

# Databricks: PAT OR service-principal client_id/client_secret
npx judge-dredd ingest --databricks-index main.corpus.articles \
  --host https://your-workspace.cloud.databricks.com \
  --token "$DATABRICKS_TOKEN"
npx judge-dredd ingest --databricks-index main.corpus.articles \
  --host https://your-workspace.cloud.databricks.com \
  --client-id "$DATABRICKS_CLIENT_ID" --client-secret "$DATABRICKS_CLIENT_SECRET" \
  --query "*" --text-column text --title-column title

EVAL_LLM_STUB=1 npx judge-dredd generate --slug <slug-from-ingest> --n 5 --keep
```

`GCP_ACCESS_TOKEN` / `GOOGLE_APPLICATION_CREDENTIALS` / `DATABRICKS_HOST` / `DATABRICKS_TOKEN` / `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET` are documented in `.env.example`.

## Demo: Wikipedia whales

Optional **demo** corpus (five public Wikipedia articles). Not required for the golden path.

```bash
npx playwright install chromium   # live scrape only
npm run graph:ingest-whales
RAG_EMBED_STUB=1 npm run rag:ingest-whales
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Unit tests with coverage report |
| `npm run db:up` | Start local Postgres (`docker compose up`) |
| `npm run db:migrate` | Apply schema |
| `npm run db:smoke` | Write then read one evaluate record |
| `npm run eval:questions` | Run the stub question set |
| `npm run synth` | CLI: ingest / generate / review / run / export / pairwise |
| `npm run ingest` | Ingest a corpus into `text_documents` |
| `npm run rag:query` | Hybrid retrieve via LangGraph (stub embedder in automated paths) |
| `npm run rag:ground` | Ground RAG corpus / checks |
| `npm run rag:ingest` | Chunk + embed stored `text_documents` |
| `npm run rag:ingest-whales` | Demo: RAG ingest the whale Wikipedia slugs |
| `npm run etl:eval-data` | ETL evaluation dataset into the app store |
| `npm run graph:ingest-whales` | Demo: scrape 5 Wikipedia whale articles (Playwright) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). CI runs `npm test` with a Postgres service.

## License

MIT. See `LICENSE`.

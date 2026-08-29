# synthkit

A local kit for ingesting a corpus, synthesizing LLM eval questions, reviewing gold, and judging model answers.

[![test](https://github.com/Benj124/judge-dredd/actions/workflows/test.yml/badge.svg)](https://github.com/Benj124/judge-dredd/actions/workflows/test.yml)

The npm package and CLI are **`synthkit` / `synth`**. Live xAI keys are optional.

## First try

```bash
npm install
cp .env.example .env
docker compose up -d          # local Postgres (pgvector). Same as npm run db:up
npm run db:migrate
npm run dev                   # dashboard at http://localhost:3000
```

Or: `npx synth help`. Live xAI is optional — use stubs:

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
npx synth ingest --file src/lib/graph/fixtures/corpus-note.md

# 2–3. Synthesize 5 questions and keep them as gold (stub LLM)
EVAL_LLM_STUB=1 npx synth generate --slug corpus-note --n 5 --keep

# 4. Run the judge / campaign
EVAL_LLM_STUB=1 npx synth run --versionId <id>

# 5. Export gold JSONL
npx synth export --versionId <id> --format jsonl
```

`generate` prints `versionId`. `--keep` marks every synthesized item gold in the same step. To review later instead: omit `--keep`, then `npx synth review --versionId <id> --keep-all`. `npm run db:migrate` is idempotent; if an older install still has `vector(32)` embeddings it truncates `rag_chunks` and you re-ingest.

CLI: `synth ingest`, `synth generate`, `synth review`, `synth run`, `synth export`, `synth pairwise`. Same as `npm run synth -- <command>`.

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

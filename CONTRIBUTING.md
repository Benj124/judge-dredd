# Contributing to synthkit

## Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm test
```

Use `EVAL_LLM_STUB=1` and `RAG_EMBED_STUB=1` so tests and the CLI golden path do not need xAI keys. `XAI_API_KEY` is for the judge and live embeddings; `XAI_API_KEY2` is for question synthesis only.

## What to change

- Eval pipeline: `src/lib/eval/`
- Postgres store: `src/lib/db/`
- Ingest / synthesize: `src/lib/graph/`
- RAG: `src/lib/rag/`
- CLI: `src/lib/cli/synth.ts`
- UI: `src/app/`, `src/components/`

Do not commit `.env`, evaluation dumps from private corpora, or live API keys. Keep `npm test` green; it expects local Postgres at `DATABASE_URL` (the workflow uses the pgvector service).

## Pull requests

Open a PR against `main` with a short description of the behavior change. GitHub Actions (`test.yml`) runs `npm test` on Ubuntu with a `pgvector/pgvector:pg16` service — that is the check that a cold clone works, not `npm test` on a laptop that already has Docker volumes and `.env` keys.

Do not add private evaluation dumps. The working tree must not contain `cfa_home_*.json` or similar curated staff sets.

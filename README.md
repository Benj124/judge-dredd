# Judge Dredd

Internal evaluation playground for judging model answers. Run fixtures or ad-hoc prompts against rubrics, compare batches, browse run history, and optionally ground retrieval with hybrid RAG. Built as a Next.js app for local use and Vercel deploy.

## Get started

```bash
npm install
cp .env.example .env   # set DATABASE_URL / XAI_API_KEY as needed
npm run db:up          # local Postgres (Docker Compose or Homebrew)
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Postgres** defaults to `postgres://judge:judge@127.0.0.1:5432/judge_dredd` (no AWS/RDS).
- **xAI** (`XAI_API_KEY`) is only needed for live model calls; unit tests use stubs.

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Unit tests with coverage report |
| `npm run db:up` | Start local Postgres |
| `npm run db:migrate` | Apply schema |
| `npm run db:smoke` | Write then read one evaluate record |
| `npm run eval:questions` | Run the stub question set |
| `npm run rag:query` | Hybrid retrieve via LangGraph (stub embedder in automated paths) |
| `npm run rag:ground` | Ground RAG corpus / checks |
| `npm run rag:ingest-whales` | Chunk + embed whale `text_documents` into hybrid `rag_chunks` |
| `npm run etl:eval-data` | ETL evaluation dataset into the app store |
| `npm run graph:ingest-whales` | Scrape 5 Wikipedia whale articles into `text_documents` (Playwright) |

## Wikipedia whale corpus

Full-text public pages are stored in Postgres `text_documents`. First seeds: blue whale, beluga whale, humpback whale, sperm whale, orca.

```bash
npx playwright install chromium   # once per machine
npm run db:migrate
npm run graph:ingest-whales
# Chunk + embed into hybrid RAG (stub embeddings for offline / CI):
RAG_EMBED_STUB=1 npm run rag:ingest-whales
# Live xAI embeddings when XAI_API_KEY is set:
# npm run rag:ingest-whales
```

ETL loads each article with headless Chromium, cleans article HTML into full text (strips infobox/nav/references), and upserts by `slug`. `rag:ingest-whales` splits each article into multiple chunks, embeds them, and replaces prior `rag_chunks` rows for those sources so re-runs stay idempotent.

## Question synthesis

Dashboard **Synthesize** tab lists stored documents and an editable prompt. Generate calls `POST /api/synthesize`, which loads full text, fills `{{title}}` / `{{url}}` / `{{full_text}}`, and runs the synthesis agent with **`XAI_API_KEY2` only** (not the primary judge key).

```bash
# .env
XAI_API_KEY2=...   # required for synthesis
# SYNTHESIS_MODEL=grok-4.20-0309-non-reasoning  # optional
```

## Deploy

Import the GitHub repo on [Vercel](https://vercel.com/new), or with the CLI:

```bash
vercel login
vercel link --yes --project judge-dredd
vercel --prod
```

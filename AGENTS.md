<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Judge Dredd — agent notes

Eval kit: ingest corpora, synthesize and review gold questions, score model answers against rubrics, compare runs, persist history, and optionally ground judgments with hybrid RAG.

## Next.js version note

This app uses **Next 16.3+**. Framework APIs and file conventions may differ from your training data. Prefer the docs bundled with the installed package:

- `node_modules/next/dist/docs/`

MCP: root `.mcp.json` registers `next-devtools-mcp`. With `npm run dev` running, agents can attach for errors, routes, and live app state.

## Where code lives

| Area | Path | Role |
| ---- | ---- | ---- |
| Eval pipeline | `src/lib/eval/` | Judge/complete/parse, campaigns, rubrics, question fixtures, CLIs |
| Database | `src/lib/db/` | Postgres pool, schema/migrate, evaluate run store, dataset CSV load |
| RAG | `src/lib/rag/` | Embed, hybrid retrieve, LangGraph query, ground CLI |
| Connectors | `src/lib/connectors/` | GCP Discovery Engine data stores and Databricks Unity Catalog vector indexes |
| UI + routes | `src/app/` | App Router pages (`/`, `/batch`, `/history`) and `api/*` handlers |
| Components | `src/components/` | Dashboard, playground, verdict, history, batch panels |

Leave pure app modules alone unless a change requires them. Human-facing overview: `README.md` (not a substitute for this file).

## Run tests and CLIs

```bash
npm test                 # tsx --test; needs local Postgres (CI provides pgvector). No live xAI.
npm run lint
npm run dev              # http://localhost:3000
npm run db:up            # local Postgres (Docker Compose or Homebrew); never AWS
npm run db:migrate
npm run db:smoke
npm run eval:questions   # stub question set CLI
npm run rag:query -- "…"
npm run rag:ground
npm run etl:eval-data    # ETL eval dataset
```

Env (gitignored `.env`): `DATABASE_URL` for local Postgres; `XAI_API_KEY` (optional `XAI_API_KEY2`) for live xAI calls. Tests often stub the LLM via `EVAL_LLM_STUB` or inject fakes—do not require network keys for `npm test`.

Default local DB URL: `postgres://judge:judge@127.0.0.1:5432/synthkit`.

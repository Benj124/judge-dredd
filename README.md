# Judge Dredd

Next.js app deployed on [Vercel](https://vercel.com).

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [React](https://react.dev) 19
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com)
- [Vercel](https://vercel.com) hosting

## Getting Started

Install dependencies (if needed) and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard lists the committed evaluation questions (run one or all) and shows `npm run dev` / `npm run eval:questions`.

## Local Postgres

Evaluation runs persist to a local Postgres database (no AWS/RDS).

```bash
cp .env.example .env   # then set DATABASE_URL if it differs
npm run db:up          # Docker Compose on localhost, or Homebrew Postgres 16
npm run db:migrate     # apply evaluate_runs schema
npm run db:smoke       # write a row and read it back
```

`db:up` never connects to AWS. Connection strings live in gitignored `.env`. Compose defaults:

`postgres://judge:judge@127.0.0.1:5432/judge_dredd`

## Hybrid RAG (setup only)

Unstructured chunks live in `rag_chunks` with a pgvector HNSW index and a GIN full-text index. Querying uses a LangGraph retrieve node and a cheap embed model (`grok-embedding-small`). Automated runs inject a stub embedder and do not call xAI.

```bash
npm run db:migrate
npm run rag:query -- "What is the capital of France?"
npm run rag:ground
```

## Scripts

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start development server             |
| `npm run build`        | Production build                     |
| `npm run start`        | Serve production build               |
| `npm run lint`         | Run ESLint                           |
| `npm run db:up`        | Start local Postgres                 |
| `npm run db:migrate`   | Apply schema                         |
| `npm run db:smoke`     | Write then read one evaluate record  |
| `npm run eval:questions` | Run the stub question set          |
| `npm run rag:query`      | Hybrid retrieve via LangGraph (stub embedder) |

## Deploy on Vercel

This repo is set up for Vercel. From a machine with the Vercel CLI logged in:

```bash
vercel login
vercel link --yes --project judge-dredd
vercel --prod
```

Or import the GitHub repo at [vercel.com/new](https://vercel.com/new) and select **Benj124/judge-dredd**. Vercel will detect Next.js automatically.

## Project structure

```
src/app/          # App Router pages and layouts
public/           # Static assets
next.config.ts    # Next.js config
```

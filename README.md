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

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Start development server |
| `npm run build` | Production build         |
| `npm run start` | Serve production build   |
| `npm run lint`  | Run ESLint               |

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

# Classboard on Cloudflare Workers

> Setup is done: the worker deploys automatically from this repo's `main` branch. See README.md for day-to-day use. This file records how the app moved from Vercel.

This repo is Classboard, moved from Vercel (classboard-v41.vercel.app) to Cloudflare Workers.

- `public/` holds the app's files, served by Workers Static Assets (free, no request limit).
- `api/` holds the original Vercel sync functions.
- `worker.js` sends `/api/*` requests to those functions through a small compatibility layer and serves everything else from `public/`.
- `public/_headers` carries over the headers from `vercel.json`.

Your data is not moved: it stays in the same database, which the Cloudflare version uses directly.

## What changed from the Vercel version

- The Vercel build patches (`_build/`) were applied once and the patched files are in `public/`, so there is no build step. `public/` is byte-identical to classboard-v41.vercel.app on 10 Oct 2026.
- `api/` is unchanged.

## Deploy (one time)

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**, pick this repo and keep the defaults (deploy command `npx wrangler deploy`).
2. Open the new Worker → **Settings → Variables and Secrets** and add these as **Secret**:

| Name | Where to get it |
|---|---|
| `DATABASE_URL` | Neon console (console.neon.tech) → project neon-charcoal-garden → Connect → copy the connection string. The same value works for Classboard, FocusRead and Menaxhuesi i Xhuzeve. |
| `CLASSBOARD_SYNC_CODE` | your class code, the one you type into Classboard to sync. You can also see it in Vercel → classboard-v4.1 → Settings → Environment Variables. |
| `AI_GATEWAY_API_KEY` (optional) | only needed for reading a book's Contents page from photos. Create one in Vercel → AI Gateway → API Keys. Without it the rest of Classboard works normally. |

3. Go to **Deployments** and redeploy once so the secrets take effect.
4. Open `https://classboard.muamer-arifi.workers.dev`. After that, every push to `main` deploys automatically.

## Good to know

- On the free Workers plan, each sync request gets 10 ms of CPU time (database waiting doesn't count). Normal syncs fit easily. A very large first sync could hit the limit; the $5/month Workers Paid plan removes it.
- Phones with the old `.vercel.app` app installed need to open the new address once and install it again. Synced data comes back after sync connects.
- Local testing: put the secrets in a `.dev.vars` file (already git-ignored) and run `npm install` then `npm run dev`.

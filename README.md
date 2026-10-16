# Classboard 5 — Prof. Muhamer

Offline-first teacher companion for Cambridge School: today's lessons, groups, pages per lesson,
the term plan, attendance, homework, tests, marks, student profiles and weekly parent reports.
Plain HTML/CSS/JS, no libraries, no CDN.

**Live:** https://classboard.muamer-arifi.workers.dev

## Deploying

This repo **is** the live app. Every push to `main` is built and deployed automatically by Cloudflare
Workers Builds (`npx wrangler deploy`) to the address above. Same domain, same data, no manual step.

- Data is not in this repo. It syncs through Neon Postgres (table `cb_kv`), reached with the
  `DATABASE_URL` secret on the Cloudflare worker. Access is protected by the class code in the
  `CLASSBOARD_SYNC_CODE` secret. A deploy never touches either.
- Optional secret `AI_GATEWAY_API_KEY`: enables reading a book's contents from a photo (`api/contents.js`).
- Keep `"name": "classboard"` in `wrangler.jsonc` (that keeps the same address) and never delete the secrets.
- To change the class code: Cloudflare → Workers & Pages → classboard → Settings → Variables and
  Secrets → edit `CLASSBOARD_SYNC_CODE`. Every device then enters the new code once.
- Manual deploy, if ever needed: `npm install` then `npx wrangler deploy`.

After changing files in `public/`, bump `CACHE` in `public/sw.js` (e.g. `classboard-v5-cf2`) so
installed apps show "Version i ri… Rifresko".

## Use it

- **Phone / computer:** open the live address → **Më shumë** → type the class code once → **Lidhu**,
  or send yourself the link from **Dërgo lidhjen**. Add it to the home screen
  (Chrome: ⋮ → Install app · iPhone Safari: Share → Add to Home Screen).
- Everything is saved on the device first, so the app always works offline. Changes sync to the other
  devices within a few seconds. If two devices change the same thing, the newer change wins; lesson
  progress and page numbers sync separately, so editing pages on one device never undoes a lesson
  marked on another.

## Layout

- `public/`: the app (`index.html`, `app.js`, `style.css`, `config.js`, `sw.js`, `manifest.json`,
  `icons/`, `_headers`). The v5 styles are injected by `app.js`, so `index.html` and `style.css`
  rarely need to change.
- `api/sync.js`: the sync API (Neon Postgres)
- `api/contents.js`: book contents from a photo (optional, needs `AI_GATEWAY_API_KEY`)
- `worker.js`: routes `/api/*` to the API and serves everything else from `public/`

## Local testing

Put the secrets in a `.dev.vars` file (git-ignored), then `npm install` and `npm run dev`.

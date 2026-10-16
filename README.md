# Classboard 4.1 — Prof. Muhamer

Offline-first teacher companion for Cambridge School. Plain HTML/CSS/JS — no libraries, no CDN.

**Live:** https://classboard-v4.vercel.app

## Use it
- **Phone / computer:** open the live address → **Më shumë** → type the class code once → **Lidhu**.
  Or send yourself the link from **Dërgo lidhjen** and open it on the other device.
  Add it to your home screen (Chrome: ⋮ → Install app · iPhone Safari: Share → Add to Home Screen).
- **Offline from this folder:** double-click `index.html`. Works with no internet; when internet is
  available it syncs through the live address (set in `config.js`).

## How sync works
- Everything is saved on the device first, so the app always works offline.
- Changes go to a small sync server in this Vercel project (`api/sync.js`) that stores them in a
  free Neon Postgres database connected to the project. Other devices pick them up within ~4 seconds.
- If two devices change the same thing, the newer change wins. Lesson progress and page numbers are
  synced separately, so editing pages on one device never undoes a lesson marked on another.
- Access is protected by the class code (Vercel environment variable `CLASSBOARD_SYNC_CODE`).
  To change the code: Vercel → classboard-v4 → Settings → Environment Variables → edit → Redeploy.
  Every device then enters the new code once.

## Deploying changes
Drag this folder into Vercel or run `vercel --prod` inside it. `vercel.json` already sets the build
(`npm run build`, output `.`). The database and code are project settings, so they carry over.
After changing app files, bump `CACHE` in `sw.js` so installed apps show "Version i ri… Rifresko".

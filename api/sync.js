// Classboard sync server — Vercel Function + Postgres (Neon).
//
// GET  /api/sync?since=N            → changes after cursor N
// POST /api/sync?since=N  {changes} → save changes (newest timestamp wins per key), then return changes after N
// GET  /api/sync?status=1           → is the server configured? (no secrets)
//
// Every request (except status) must send header  x-cb-code: <class code>  matching the
// CLASSBOARD_SYNC_CODE environment variable. The database URL comes from the Neon
// integration (DATABASE_URL / POSTGRES_URL).

const SPACE = "main";
const MAX_CHANGES = 2000;
const PAGE = 3000;
const KEY_RE = /^[gsahpl]~[^\s/]{1,200}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-cb-code",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ——— Database ———
let runQuery = null;
let ready = null;

// Tests can inject their own Postgres (e.g. PGlite).
export function __setQuery(fn) { runQuery = fn; ready = null; }

function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_PRISMA_URL || "";
}

async function query(text, params) {
  if (!runQuery) {
    const url = dbUrl();
    if (!url) { const e = new Error("no_database"); e.code = "no_database"; throw e; }
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    runQuery = (t, p) => sql.query(t, p || []);
  }
  const res = await runQuery(text, params || []);
  return Array.isArray(res) ? res : (res && res.rows) || [];
}

async function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await query("CREATE TABLE IF NOT EXISTS cb_kv (space text NOT NULL, k text NOT NULL, v jsonb, t bigint NOT NULL, d text, seq bigint NOT NULL, PRIMARY KEY (space, k))");
          await query("CREATE SEQUENCE IF NOT EXISTS cb_seq");
          await query("CREATE INDEX IF NOT EXISTS cb_kv_space_seq ON cb_kv (space, seq)");
          return;
        } catch (e) {
          if (attempt === 2) throw e; // concurrent first-time setup can race; retry
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// ——— Auth ———
function norm(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function sameCode(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function authError(request) {
  const want = process.env.CLASSBOARD_SYNC_CODE;
  if (!want) return json({ ok: false, error: "not_configured" }, 503);
  if (!sameCode(request.headers.get("x-cb-code"), want)) return json({ ok: false, error: "bad_code" }, 401);
  return null;
}

// ——— Sync ———
async function pull(since) {
  const rows = await query(
    "SELECT k, v, t, d, seq FROM cb_kv WHERE space = $1 AND seq > $2 ORDER BY seq LIMIT " + (PAGE + 1),
    [SPACE, String(since)]
  );
  const more = rows.length > PAGE;
  if (more) rows.length = PAGE;
  const changes = {};
  let seq = since;
  for (const r of rows) {
    changes[r.k] = { v: r.v === undefined ? null : r.v, t: Number(r.t), d: r.d || "" };
    if (Number(r.seq) > seq) seq = Number(r.seq);
  }
  if (!rows.length) {
    const m = await query("SELECT COALESCE(MAX(seq), 0) AS m FROM cb_kv WHERE space = $1", [SPACE]);
    seq = Math.max(since, Number((m[0] && m[0].m) || 0));
  }
  return { seq, changes, more };
}

async function push(changes) {
  const list = [];
  for (const k of Object.keys(changes || {})) {
    const c = changes[k];
    if (!KEY_RE.test(k) || !c || typeof c !== "object") continue;
    const t = Number(c.t);
    if (!Number.isFinite(t) || t <= 0) continue;
    list.push({ k, v: c.v === undefined ? null : c.v, t: Math.floor(t), d: String(c.d || "").slice(0, 40) });
    if (list.length >= MAX_CHANGES) break;
  }
  if (!list.length) return 0;
  // Last write wins per key, decided atomically inside the database.
  await query(
    "INSERT INTO cb_kv (space, k, v, t, d, seq) " +
      "SELECT $1, x.k, x.v, x.t, x.d, nextval('cb_seq') FROM jsonb_to_recordset($2::jsonb) AS x(k text, v jsonb, t bigint, d text) " +
      "ON CONFLICT (space, k) DO UPDATE SET v = EXCLUDED.v, t = EXCLUDED.t, d = EXCLUDED.d, seq = EXCLUDED.seq " +
      "WHERE cb_kv.t < EXCLUDED.t",
    [SPACE, JSON.stringify(list)]
  );
  return list.length;
}

function sinceOf(request) {
  const s = Number(new URL(request.url).searchParams.get("since") || 0);
  return Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
}

function fail(e) {
  if (e && e.code === "no_database") return json({ ok: false, error: "no_database" }, 503);
  console.error("sync error", e);
  return json({ ok: false, error: "server_error" }, 500);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("status")) {
    return json({ ok: true, database: !!(runQuery || dbUrl()), code: !!process.env.CLASSBOARD_SYNC_CODE });
  }
  const bad = authError(request);
  if (bad) return bad;
  try {
    await ensureSchema();
    const out = await pull(sinceOf(request));
    return json({ ok: true, ...out, now: Date.now() });
  } catch (e) { return fail(e); }
}

export async function POST(request) {
  const bad = authError(request);
  if (bad) return bad;
  let body;
  try {
    const text = await request.text();
    if (text.length > 4_000_000) return json({ ok: false, error: "too_large" }, 413);
    body = JSON.parse(text || "{}");
  } catch (e) { return json({ ok: false, error: "bad_json" }, 400); }
  try {
    await ensureSchema();
    const saved = await push(body.changes);
    const out = await pull(sinceOf(request));
    return json({ ok: true, saved, ...out, now: Date.now() });
  } catch (e) { return fail(e); }
}

// Classboard — read a book's Contents page(s) from photos and return the units.
//
// POST /api/contents  { images: ["data:image/jpeg;base64,..."], book: "English Plus 2" }
// Header x-cb-code must match CLASSBOARD_SYNC_CODE (same class code as sync).
// Uses Vercel AI Gateway, authenticated with the project's OIDC token (no API key to manage).
// GET /api/contents?status=1 → { ok, ai } (no secrets)

const MODEL = process.env.CLASSBOARD_AI_MODEL || "anthropic/claude-sonnet-5";
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";

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
function norm(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function sameCode(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function token(request) {
  return process.env.AI_GATEWAY_API_KEY || request.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || "";
}

const PROMPT = `These photos show the Contents page(s) of an English course book for children or teenagers used in Kosovo (for example "Family and Friends" or "English Plus").
Book name given by the teacher: "{BOOK}".

Extract EVERY unit / section that has a Student's Book page number, in order (include Starter/Welcome/Hello units, numbered units, Review / Fun Time / Culture / Project sections if they have their own page number).

For each one return:
- "u": the unit number or a short label exactly as printed ("1", "2", "Starter", "Review 1", "Culture"...)
- "from": the Student's Book page where it starts (integer)
- "t": the unit title in English as printed (short)
- "sq": ONE short, warm, natural sentence in ALBANIAN (standard Albanian, for parents) saying what the children learn in that unit, using the vocabulary, grammar and skills columns of the contents page. Mention the topic words and the grammar in simple terms; you may keep short English grammar examples in quotes (e.g. "can / can't"). Max 22 words. No full stop at the end is needed.

Return ONLY valid JSON, no explanation:
{"book":"<title as printed, if visible>","units":[{"u":"1","from":8,"t":"...","sq":"..."}]}
If a page number is unreadable, leave that unit out.`;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("status")) return json({ ok: true, ai: !!token(request), code: !!process.env.CLASSBOARD_SYNC_CODE, model: MODEL });
  return json({ ok: false, error: "use_post" }, 405);
}

export async function POST(request) {
  const want = process.env.CLASSBOARD_SYNC_CODE;
  if (!want) return json({ ok: false, error: "not_configured" }, 503);
  if (!sameCode(request.headers.get("x-cb-code"), want)) return json({ ok: false, error: "bad_code" }, 401);

  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "bad_json" }, 400); }
  const images = (Array.isArray(body.images) ? body.images : []).filter((x) => typeof x === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(x)).slice(0, 4);
  if (!images.length) return json({ ok: false, error: "no_images" }, 400);
  if (images.reduce((n, x) => n + x.length, 0) > 4_000_000) return json({ ok: false, error: "too_large" }, 413);

  const key = token(request);
  if (!key) return json({ ok: false, error: "no_ai" }, 503);

  const book = String(body.book || "").slice(0, 80);
  const content = [{ type: "text", text: PROMPT.replace("{BOOK}", book) }].concat(images.map((u) => ({ type: "image_url", image_url: { url: u } })));

  let res, data;
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, temperature: 0, messages: [{ role: "user", content }] }),
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    return json({ ok: false, error: "ai_unreachable" }, 502);
  }
  if (!res.ok) {
    const msg = (data && data.error && (data.error.message || data.error.type)) || ("HTTP " + res.status);
    return json({ ok: false, error: res.status === 401 || res.status === 403 ? "ai_auth" : res.status === 402 ? "ai_credits" : "ai_error", detail: String(msg).slice(0, 300) }, 502);
  }
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  const raw = typeof text === "string" ? text : Array.isArray(text) ? text.map((p) => p.text || "").join("") : "";
  const m = raw.match(/\{[\s\S]*\}/);
  let out;
  try { out = JSON.parse(m ? m[0] : raw); } catch (e) { return json({ ok: false, error: "ai_parse", detail: raw.slice(0, 300) }, 502); }
  const units = (Array.isArray(out.units) ? out.units : [])
    .map((r) => ({ u: String(r.u || "").slice(0, 30), from: parseInt(r.from, 10), t: String(r.t || "").slice(0, 120), sq: String(r.sq || "").slice(0, 300) }))
    .filter((r) => r.from > 0 && r.from < 1000)
    .sort((a, b) => a.from - b.from);
  return json({ ok: true, book: String(out.book || "").slice(0, 120), units });
}

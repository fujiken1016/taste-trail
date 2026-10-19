// Shared request handling for server.js (local) and functions/api/* (Cloudflare Pages): validation, rate limit, cache, safe errors.
import { makeClient } from "./qloo-client.js";
import { runAgent, LEVELS } from "./agent.js";

const cache = new Map(); // private, in-memory, per server/isolate. Never written to disk or the repo.
const hits = new Map();
const FRIENDLY = new Set(["favorites required", "no favorites could be resolved", "not enough results from Qloo for these favorites"]);
const MSG = {
  "favorites required": "Type at least one favorite.",
  "no favorites could be resolved": "Qloo did not recognise those titles. Try the official name (for example the English title).",
  "not enough results from Qloo for these favorites": "Qloo returned too little Japanese media for these favorites. Try adding a different favorite.",
};
export const getMode = (env) => makeClient(env)?.mode || "unavailable";

export async function handleTrail(bodyText, env, ip = "local") {
  const client = makeClient(env);
  if (!client) return { status: 503, body: { error: "preparing", message: "Live Qloo data is being connected. Please check back soon." } };
  const now = Date.now(); const w = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (w.length >= 12) return { status: 429, body: { error: "rate", message: "Too many requests. Please wait a minute." } };
  hits.set(ip, [...w, now]);
  let input;
  try {
    if (bodyText.length > 2000) throw new Error("bad");
    const j = JSON.parse(bodyText);
    if (!Array.isArray(j.favorites) || j.favorites.length > 5 || !LEVELS.includes(j.level)) throw new Error("bad");
    input = { level: j.level, favorites: j.favorites.map((f) => ({ name: String(f?.name ?? "").trim().slice(0, 80) })).filter((f) => f.name) };
    if (!input.favorites.length) throw new Error("bad");
  } catch { return { status: 400, body: { error: "bad", message: "Please enter 1 to 5 favorites and choose a level." } }; }
  const key = JSON.stringify(input) + client.mode; const c = cache.get(key);
  if (c && now - c.t < 3600000) return { status: 200, body: c.v };
  try {
    const v = await runAgent(input, client);
    cache.set(key, { t: now, v }); if (cache.size > 200) cache.delete(cache.keys().next().value);
    return { status: 200, body: v };
  } catch (e) {
    const m = String(e.message); // never leak upstream details (status codes, URLs) to the browser
    return { status: 422, body: { error: "failed", message: FRIENDLY.has(m) ? MSG[m] : "Could not build a trail right now. Please try again." } };
  }
}

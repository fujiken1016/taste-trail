// Qloo access layer. Two interchangeable backends: live (hackathon API) and mock (synthetic).
// The API key lives ONLY in the server environment (QLOO_API_KEY). Never ship it to the browser.
import { ENTITIES } from "../fixtures/mock-data.js";

const DEFAULT_BASE = "https://hackathon.api.qloo.com"; // hackathon keys only work here (not api.qloo.com)

// Shapes verified against live responses on 2026-10-20 (field names only; no Qloo data is stored in this repo):
//  /search   -> { results: [{ entity_id, name, types: ["urn:entity:x"], tags: [{name, tag_id, type}], properties, popularity }] }
//  /v2/insights -> { results: { entities: [{ entity_id, name, type: "urn:entity", subtype: "urn:entity:x", tags[], properties, query: { affinity, explainability? } }] } }
// NOTE: the docs say video_game, the API wants urn:entity:videogame.
export function normalizeEntity(e) {
  return {
    id: e.entity_id ?? e.id,
    name: e.name,
    type: e.subtype || (e.types && e.types[0]) || (e.type !== "urn:entity" ? e.type : null) || null,
    tags: (e.tags || []).map((t) => (typeof t === "string" ? t : t.name || t.tag_id)).filter(Boolean),
    score: e.query?.affinity ?? e.affinity ?? null,
    explain: e.query?.explainability?.["signal.interests.entities"] || null,
    country: e.properties?.release_country || null, // list; first item is the country of origin (verified: Tron Legacy lists US first)
    makers: [e.properties?.developer, e.properties?.publisher].filter(Boolean).join(" / ") || null,
  };
}

export function liveClient(apiKey, fetchImpl = fetch, base = DEFAULT_BASE) {
  const get = async (path, params) => {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    const res = await fetchImpl(url, { headers: { "X-Api-Key": apiKey } }); // header, not Bearer, not query
    if (!res.ok) throw new Error(`Qloo ${res.status} on ${path}`); // no silent fallback
    return res.json();
  };
  return {
    mode: "live",
    async search(query, type) {
      const j = await get("/search", { query, types: type, take: 5 });
      return (j.results || []).filter((r) => (r.types || []).some((t) => SEED_TYPES.has(t))).map(normalizeEntity);
    },
    async insights({ type, seedIds, take = 8, params = {} }) {
      const j = await get("/v2/insights", {
        "filter.type": type,
        "signal.interests.entities": seedIds.join(","),
        "feature.explainability": "true",
        take,
        ...params, // per-domain Japan lens, e.g. filter.release_country=Japan or filter.tags=<tag id>
      });
      return (j.results?.entities || []).map(normalizeEntity);
    },
  };
}
const SEED_TYPES = new Set(["urn:entity:tv_show", "urn:entity:movie", "urn:entity:videogame", "urn:entity:artist", "urn:entity:book", "urn:entity:podcast"]);

// Mock: overlap of tags with seeds => fake affinity. Deterministic.
export function mockClient() {
  const byId = new Map(ENTITIES.map((e) => [e.id, e]));
  return {
    mode: "mock",
    async search(query) {
      const q = query.toLowerCase();
      const hit = ENTITIES.filter((e) => e.name.toLowerCase().includes(q));
      return (hit.length ? hit : ENTITIES.filter((e) => e.lang === "en").slice(0, 1)).map(normalizeEntity);
    },
    async insights({ type, seedIds, take = 8 }) { // mock ignores the Japan-lens params (its catalogue is all 'ja')
      const seedTags = new Set(seedIds.flatMap((id) => byId.get(id)?.tags || []));
      return ENTITIES.filter((e) => e.type === type && e.lang === "ja")
        .map((e) => ({ ...normalizeEntity(e), score: e.tags.filter((t) => seedTags.has(t)).length / Math.max(1, e.tags.length) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, take);
    },
  };
}

export function makeClient(env = {}) {
  return env.QLOO_API_KEY ? liveClient(env.QLOO_API_KEY, fetch, env.QLOO_BASE_URL || DEFAULT_BASE) : mockClient();
}

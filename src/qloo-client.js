// Qloo access layer. Two interchangeable backends: live (hackathon API) and mock (synthetic).
// The API key lives ONLY in the server environment (QLOO_API_KEY). Never ship it to the browser.
import { ENTITIES } from "../fixtures/mock-data.js";

const BASE = "https://hackathon.api.qloo.com"; // hackathon keys only work here (not api.qloo.com)

// Normalise tolerant of shape differences; verify against a real response once the key arrives.
export function normalizeEntity(e) {
  return {
    id: e.entity_id ?? e.id,
    name: e.name,
    type: (e.types && e.types[0]) || e.type || null,
    tags: (e.tags || []).map((t) => (typeof t === "string" ? t : t.name || t.tag_id)).filter(Boolean),
    score: e.query?.affinity ?? e.affinity ?? null,
  };
}

export function liveClient(apiKey, fetchImpl = fetch) {
  const get = async (path, params) => {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    const res = await fetchImpl(url, { headers: { "X-Api-Key": apiKey } }); // header, not Bearer, not query
    if (!res.ok) throw new Error(`Qloo ${res.status} on ${path}`); // no silent fallback
    return res.json();
  };
  return {
    mode: "live",
    async search(query, type) {
      const j = await get("/search", { query, types: type, take: 3 });
      return (j.results || []).map(normalizeEntity);
    },
    async insights({ type, seedIds, take = 8 }) {
      const j = await get("/v2/insights", {
        "filter.type": type,
        "signal.interests.entities": seedIds.join(","),
        take,
      });
      return (j.results?.entities || []).map(normalizeEntity);
    },
  };
}

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
    async insights({ type, seedIds, take = 8 }) {
      const seedTags = new Set(seedIds.flatMap((id) => byId.get(id)?.tags || []));
      return ENTITIES.filter((e) => e.type === type && e.lang === "ja")
        .map((e) => ({ ...normalizeEntity(e), score: e.tags.filter((t) => seedTags.has(t)).length / Math.max(1, e.tags.length) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, take);
    },
  };
}

export function makeClient(env = {}) {
  return env.QLOO_API_KEY ? liveClient(env.QLOO_API_KEY) : mockClient();
}

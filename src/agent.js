// Taste Trail agent: plans tool calls, grounds picks in Qloo, fits them to the learner's level,
// and returns a 7-day trail with evidence. No LLM is required for the core loop.
// Each domain gets a "Japan lens" so the picks are Japanese-language media. Found by probing the live API (2026-10-20):
// release_country works for tv_show/movie/videogame; artist/book have no country field, so we filter by Qloo tag ids
// (found via /v2/tags). Podcasts have no usable Japan lens in this API, so that domain is not used.
const JP_MAKERS = /square|enix|capcom|nintendo|sega|konami|bandai|namco|atlus|koei|tecmo|level-5|from ?software|sce japan|sony computer|taito|cygames|marvelous|falcom|spike|platinum|mistwalker|monolith|clover|intelligent systems|game freak|hal laboratory/i;
// "keep" runs after Qloo returns: release_country lists every country a title shipped in, so we require Japan to be FIRST
// (country of origin). Video games carry no country field, so we use a Japanese-publisher/developer list (our heuristic).
// If the field is absent (mock data) the entity is kept.
export const TARGETS = [
  { type: "urn:entity:tv_show", params: { "filter.release_country": "Japan" }, keep: (e) => !e.country || e.country[0] === "Japan" },
  { type: "urn:entity:movie", params: { "filter.release_country": "Japan" }, keep: (e) => !e.country || e.country[0] === "Japan" },
  { type: "urn:entity:videogame", params: {}, keep: (e) => !e.makers || JP_MAKERS.test(e.makers) },
  { type: "urn:entity:artist", params: { "filter.tags": "urn:tag:genre:music:japanese" }, keep: () => true },
  { type: "urn:entity:book", params: { "filter.tags": "urn:tag:genre:media:manga" }, keep: () => true },
];
// Podcasts are not used: the API has no usable Japan lens for them (probed 2026-10-20).
// OUR heuristic (not Qloo data): tags that tend to make Japanese media easier/harder.
const EASY_WORDS = ["everyday-speech", "short-dialogue", "slow-lyrics", "children", "folktale", "slice-of-life", "slice of life", "family", "kids", "comedy", "school", "friendship", "cooking", "food", "cute", "romantic comedy", "iyashikei", "wholesome"];
const HARD_WORDS = ["slang", "fast-speech", "fast-lyrics", "literary", "dialect", "crime", "legal", "political", "politics", "samurai", "historical", "war", "philosophy", "philosophical", "noir", "psychological", "military", "mystery"];
const has = (t, list) => list.some((w) => new RegExp(`(^|[^a-z])${w}($|[^a-z])`, "i").test(t)); // whole-word match ("war" must not hit "Warrior")
const EASY = { has: (t) => has(t, EASY_WORDS) }, HARD = { has: (t) => has(t, HARD_WORDS) };
const LEVEL_BIAS = { beginner: { easy: 0.35, hard: -0.5 }, intermediate: { easy: 0.1, hard: -0.1 }, advanced: { easy: -0.05, hard: 0.25 } };
const ACTIVITY = {
  "urn:entity:tv_show": "Watch one 20-min episode with JP subs; write down 5 phrases you caught.",
  "urn:entity:videogame": "Play 15 min with JP text on; screenshot 3 lines and look up one word each.",
  "urn:entity:movie": "Watch the first 20 minutes with JP subs; pause on 3 lines and say them aloud.",
  "urn:entity:podcast": "Listen 10 min; shadow the first minute out loud.",
  "urn:entity:artist": "Pick one song; read the lyrics once, then sing along.",
  "urn:entity:book": "Read 5 pages or one story; underline known kanji only.",
};

export function fitScore(entity, level) {
  const b = LEVEL_BIAS[level] || LEVEL_BIAS.intermediate;
  const easy = Math.min(3, entity.tags.filter((t) => EASY.has(t)).length); // cap: real entities carry 100+ tags
  const hard = Math.min(3, entity.tags.filter((t) => HARD.has(t)).length);
  return (entity.score ?? 0) + b.easy * easy + b.hard * hard;
}

// Which favorite pulled this pick the most (Qloo explainability), only when the scores actually differ.
function drivenBy(p, seeds) {
  if (!p.explain || seeds.length < 2) return null;
  const top = [...p.explain].sort((a, b) => b.score - a.score);
  if (!top.length || top[0].score === top[top.length - 1].score) return null;
  return seeds.find((s) => s.id === top[0].entity_id)?.name || null;
}

export async function runAgent({ favorites, level = "beginner" }, client) {
  const trace = [];
  const log = (step, detail) => trace.push({ step, detail });
  if (!favorites?.length) throw new Error("favorites required");
  if (favorites.length > 5) favorites = favorites.slice(0, 5); // smallest request that answers the question

  // 1. resolve seeds
  const seeds = [];
  for (const f of favorites) {
    const hit = (await client.search(f.name, f.type))[0];
    log("search", { query: f.name, resolved: hit ? hit.name : null });
    if (hit) seeds.push(hit);
  }
  if (!seeds.length) throw new Error("no favorites could be resolved");
  const seedIds = seeds.map((s) => s.id);
  const seedTags = new Set(seeds.flatMap((s) => s.tags));

  // 2. cross-domain insights per target type
  const picks = [], seconds = [];
  for (const { type, params, keep } of TARGETS) {
    const rows = (await client.insights({ type, seedIds, take: 20, params })).filter((r) => !seedIds.includes(r.id) && keep(r));
    log("insights", { type, returned: rows.length });
    const ranked = rows.map((r) => ({ ...r, fit: fitScore(r, level) })).sort((a, b) => b.fit - a.fit);
    if (ranked[0]) picks.push(ranked[0]);
    if (ranked[1]) seconds.push(ranked[1]);
  }

  // 3. evidence + 7-day trail
  const trail = picks.concat(seconds, picks).filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i || i >= picks.length + seconds.length).slice(0, 7).map((p, i) => ({
    day: i + 1,
    title: p.name,
    type: p.type.replace("urn:entity:", ""),
    task: ACTIVITY[p.type],
    why: {
      qloo: p.score != null ? `Qloo affinity with your favorites: ${(p.score * 100).toFixed(0)}%` : "Returned by Qloo insights for your favorites",
      sharedTaste: [...new Set(p.tags.filter((t) => seedTags.has(t)))].slice(0, 5),
      drivenBy: drivenBy(p, seeds),
      levelFit: [...new Set(p.tags.filter((t) => EASY.has(t)))].slice(0, 3).concat([...new Set(p.tags.filter((t) => HARD.has(t)))].slice(0, 3).map((t) => `harder: ${t}`)),
    },
  }));
  return {
    mode: client.mode,
    level,
    trail,
    trace,
    limits: "Qloo gives aggregate taste affinity, not learning difficulty. Level fit is our own tag heuristic; verify with the learner.",
  };
}

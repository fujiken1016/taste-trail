// Taste Trail agent: plans tool calls, grounds picks in Qloo, fits them to the learner's level,
// and returns a 7-day trail with evidence. No LLM is required for the core loop.
const TARGET_TYPES = [
  "urn:entity:tv_show", "urn:entity:video_game", "urn:entity:podcast", "urn:entity:artist", "urn:entity:book",
];
// OUR heuristic (not Qloo data): tags that tend to make Japanese media easier/harder.
const EASY = new Set(["everyday-speech", "short-dialogue", "slow-lyrics", "children", "folktale", "slice-of-life"]);
const HARD = new Set(["slang", "fast-speech", "fast-lyrics", "literary", "dialect", "crime"]);
const LEVEL_BIAS = { beginner: { easy: 0.35, hard: -0.5 }, intermediate: { easy: 0.1, hard: -0.1 }, advanced: { easy: -0.05, hard: 0.25 } };
const ACTIVITY = {
  "urn:entity:tv_show": "Watch one 20-min episode with JP subs; write down 5 phrases you caught.",
  "urn:entity:video_game": "Play 15 min with JP text on; screenshot 3 lines and look up one word each.",
  "urn:entity:podcast": "Listen 10 min; shadow the first minute out loud.",
  "urn:entity:artist": "Pick one song; read the lyrics once, then sing along.",
  "urn:entity:book": "Read 5 pages or one story; underline known kanji only.",
};

export function fitScore(entity, level) {
  const b = LEVEL_BIAS[level] || LEVEL_BIAS.intermediate;
  const easy = entity.tags.filter((t) => EASY.has(t)).length;
  const hard = entity.tags.filter((t) => HARD.has(t)).length;
  return (entity.score ?? 0) + b.easy * easy + b.hard * hard;
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
  for (const type of TARGET_TYPES) {
    const rows = await client.insights({ type, seedIds, take: 6 });
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
      sharedTaste: p.tags.filter((t) => seedTags.has(t)),
      levelFit: p.tags.filter((t) => EASY.has(t)).concat(p.tags.filter((t) => HARD.has(t)).map((t) => `harder: ${t}`)),
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

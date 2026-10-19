// Taste Trail agent: Plan -> Act -> Check level-fit -> Replan, then a 7-day trail with evidence.
// The loop is deterministic rules by default (free to run publicly). A planner can be injected (see scripts/llm_agent.mjs,
// which lets Claude make the plan/review decisions). Every step is returned as `history` and shown in the UI.
const JP_MAKERS = /square|enix|capcom|nintendo|sega|konami|bandai|namco|atlus|koei|tecmo|level-5|from ?software|sce japan|sony computer|taito|cygames|marvelous|falcom|spike|platinum|mistwalker|monolith|clover|intelligent systems|game freak|hal laboratory/i;
// "keep" runs after Qloo returns. release_country lists every country a title shipped in, so Japan must be FIRST (origin).
// Live results with no country info are dropped (mock data has none, so the mock keeps them). Video games carry no country
// field, so we use a Japanese-publisher/developer list (our heuristic). Podcasts: no usable Japan lens in the API.
export const TARGETS = [
  { type: "urn:entity:tv_show", label: "TV", params: { "filter.release_country": "Japan" }, keep: (e, live) => (e.country ? e.country[0] === "Japan" : !live) },
  { type: "urn:entity:movie", label: "Film", params: { "filter.release_country": "Japan" }, keep: (e, live) => (e.country ? e.country[0] === "Japan" : !live) },
  { type: "urn:entity:videogame", label: "Game", params: {}, keep: (e, live) => (e.makers ? JP_MAKERS.test(e.makers) : !live) },
  { type: "urn:entity:artist", label: "Music", params: { "filter.tags": "urn:tag:genre:music:japanese" }, keep: () => true },
  { type: "urn:entity:book", label: "Manga", params: { "filter.tags": "urn:tag:genre:media:manga" }, keep: () => true },
];
export const LEVELS = ["beginner", "intermediate", "advanced"];

// OUR heuristic (not Qloo data): words in Qloo tag names that point to easier/harder LANGUAGE (not genre mood).
const EASY_WORDS = ["everyday-speech", "short-dialogue", "slow-lyrics", "children", "kids", "folktale", "slice-of-life", "slice of life", "family", "iyashikei", "school life", "cooking", "daily life"];
const HARD_WORDS = ["slang", "fast-speech", "fast-lyrics", "literary", "dialect", "crime", "legal", "political", "politics", "samurai", "historical", "war", "philosophy", "philosophical", "noir", "psychological", "military", "mystery", "cyberpunk"];
const has = (t, list) => list.some((w) => new RegExp(`(^|[^a-z])${w}($|[^a-z])`, "i").test(t)); // whole-word ("war" must not hit "Warrior")
const uniq = (a) => [...new Set(a)];
const LEVEL_BIAS = { beginner: { easy: 0.35, hard: -0.5 }, intermediate: { easy: 0.1, hard: -0.1 }, advanced: { easy: -0.05, hard: 0.25 } };

export function levelInfo(entity, level) {
  const easy = uniq(entity.tags.filter((t) => has(t, EASY_WORDS))).slice(0, 3);
  const hard = uniq(entity.tags.filter((t) => has(t, HARD_WORDS))).slice(0, 3);
  const net = easy.length - hard.length;
  let verdict = "none"; // no language signal in the tags
  if (level === "beginner") verdict = net >= 1 ? "fits" : net < 0 ? "stretch" : "none";
  else if (level === "intermediate") verdict = net <= -2 ? "stretch" : net !== 0 ? "fits" : "none";
  else verdict = net >= 2 ? "easy" : hard.length ? "fits" : "none";
  return { verdict, easy, hard, net };
}
export function fitScore(entity, level) {
  const b = LEVEL_BIAS[level] || LEVEL_BIAS.intermediate;
  const easy = Math.min(3, entity.tags.filter((t) => has(t, EASY_WORDS)).length);
  const hard = Math.min(3, entity.tags.filter((t) => has(t, HARD_WORDS)).length);
  return (entity.score ?? 0) + b.easy * easy + b.hard * hard;
}
const passes = (c, level) => level === "advanced" || (c.level?.verdict ?? c.verdict) !== "stretch";

const TASKS = {
  "urn:entity:tv_show": ["Watch one 20-min episode with JP subs; write down 5 phrases you caught.", "Watch 10 minutes with no subs first, then replay with JP subs and compare."],
  "urn:entity:movie": ["Watch the first 20 minutes with JP subs; pause on 3 lines and say them aloud.", "Pick one scene (5 min); shadow the dialogue line by line."],
  "urn:entity:videogame": ["Play 15 min with JP text on; screenshot 3 lines and look up one word each.", "Replay one short scene; read every line aloud before pressing next."],
  "urn:entity:artist": ["Pick one song; read the lyrics once, then sing along.", "Listen twice; underline the words you already know in the lyrics."],
  "urn:entity:book": ["Read 5 pages or one story; underline known kanji only.", "Read one chapter opening; list 5 words you can guess from the pictures."],
};
const GOALS = ["Warm-up: spot 5 words you already know", "Listen for sentence endings (ね, よ, だ)", "Collect 3 everyday phrases", "Notice politeness (です/ます vs casual)", "Follow one scene without pausing", "Say 5 lines out loud", "Remix: retell your favorite moment in Japanese"];

// "Hades (game)" style hint: a bare name is ambiguous (the band is more popular than the game).
const HINT = { game: "urn:entity:videogame", show: "urn:entity:tv_show", tv: "urn:entity:tv_show", film: "urn:entity:movie", movie: "urn:entity:movie", music: "urn:entity:artist", band: "urn:entity:artist", artist: "urn:entity:artist", book: "urn:entity:book", manga: "urn:entity:book" };
export function parseFavorite(name) { const m = name.match(/^(.*?)\s*\((game|show|tv|film|movie|music|band|artist|book|manga)\)\s*$/i); return m && m[1] ? { query: m[1], type: HINT[m[2].toLowerCase()] } : { query: name, type: undefined }; }

// Which favorite pulled this pick the most (Qloo explainability), only when the scores actually differ.
function drivenBy(p, seeds) {
  if (!p.explain || seeds.length < 2) return null;
  const top = [...p.explain].sort((a, b) => b.score - a.score);
  if (!top.length || top[0].score === top[top.length - 1].score) return null;
  return seeds.find((s) => s.id === top[0].entity_id)?.name || null;
}

// Default (rule-based) planner/reviewer. Same interface as the Claude-driven one in scripts/llm_agent.mjs.
export const rulesPlanner = {
  name: "rules",
  async plan({ favorites, level }) { return { note: `Resolve ${favorites.length} favorite(s), ask ${TARGETS.length} domains in parallel through a Japan lens, then check level fit (${level}) and diversity.`, targets: TARGETS.map((t) => t.type) }; },
  async review({ level, domains }) {
    const relax = [], swaps = [], notes = [];
    for (const d of domains) {
      if (d.error) { notes.push(`${d.label}: Qloo call failed; skipped`); continue; }
      if (d.candidates.length < 3 && !d.relaxed) { relax.push(d.type); notes.push(`${d.label}: only ${d.candidates.length} after the Japan lens; asking for more candidates`); continue; }
      if (!d.candidates.length) { notes.push(`${d.label}: nothing left after the Japan lens; domain dropped`); continue; }
      if (!passes(d.candidates[d.pick], level)) {
        const alt = d.candidates.findIndex((c) => passes(c, level));
        if (alt > 0) { swaps.push({ type: d.type, pick: alt, reason: `${d.label}: top match was a stretch for ${level}; took the best one that fits` }); }
        else notes.push(`${d.label}: every candidate is a stretch for ${level}; kept the top match, flagged`);
      }
    }
    return { relax, swaps, notes };
  },
};

export async function runAgent(input, client, opts = {}) {
  const planner = opts.planner || rulesPlanner;
  const level = LEVELS.includes(input.level) ? input.level : "beginner";
  let favorites = (input.favorites || []).map((f) => ({ name: String(f?.name ?? "").trim().slice(0, 80) })).filter((f) => f.name);
  if (!favorites.length) throw new Error("favorites required");
  favorites = favorites.slice(0, 5); // smallest request that answers the question
  const live = client.mode === "live";
  const history = [];
  const H = (phase, text) => { history.push({ phase, text }); opts.onStep?.({ phase, text }); };

  // ---- Plan
  const plan = await planner.plan({ favorites, level });
  H("Plan", `${plan.note} [planner: ${planner.name}]`);
  const targets = TARGETS.filter((t) => !plan.targets || plan.targets.includes(t.type));

  // ---- Act 1: resolve favorites
  const found = await Promise.all(favorites.map((f) => { const p = parseFavorite(f.name); return client.search(p.query, p.type).then((r) => r[0] || null, () => null); }));
  const seeds = found.filter(Boolean);
  if (!seeds.length) throw new Error("no favorites could be resolved");
  const missed = favorites.length - seeds.length;
  H("Act", `Qloo search resolved ${seeds.length} of ${favorites.length} favorites${missed ? ` (${missed} not found, ignored)` : ""}.`);
  const seedIds = seeds.map((s) => s.id);
  const seedTags = new Set(seeds.flatMap((s) => s.tags));

  // ---- Act 2: ask each domain (parallel)
  const ask = async (t, take) => {
    const rows = (await client.insights({ type: t.type, seedIds, take, params: t.params })).filter((r) => !seedIds.includes(r.id) && t.keep(r, live));
    return rows.map((r) => ({ ...r, fit: fitScore(r, level), level: levelInfo(r, level), driver: drivenBy(r, seeds) })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)); // Qloo's own ranking first; the level rule is a separate gate
  };
  const domains = await Promise.all(targets.map(async (t) => {
    try { return { type: t.type, label: t.label, candidates: await ask(t, 20), pick: 0, relaxed: false }; }
    catch (e) { return { type: t.type, label: t.label, candidates: [], pick: 0, error: true }; }
  }));
  H("Act", `Asked Qloo insights in ${targets.length} domains: ${domains.map((d) => `${d.label} ${d.error ? "failed" : d.candidates.length}`).join(", ")} candidates kept.`);
  if (domains.filter((d) => !d.error && d.candidates.length).length < 3) throw new Error("not enough results from Qloo for these favorites");

  // ---- Check level-fit / Replan (up to 2 rounds)
  for (let round = 1; round <= 2; round++) {
    const rev = await planner.review({ level, domains: domains.map((d) => ({ ...d, candidates: d.candidates.map((c, i) => ({ i, name: c.name, affinity: c.score, verdict: c.level.verdict, easy: c.level.easy, hard: c.level.hard, driver: c.driver, tags: c.tags.slice(0, 12) })) })), round });
    const stretchN = domains.filter((d) => d.candidates[d.pick] && !passes(d.candidates[d.pick], level)).length;
    H("Check", `Level-fit (${level}), round ${round}: ${domains.filter((d) => d.candidates.length).length - stretchN} of ${domains.filter((d) => d.candidates.length).length} top picks fit.${rev.notes?.length ? " " + rev.notes.join(" ") : ""}`);
    if (!rev.relax?.length && !rev.swaps?.length) break;
    for (const ty of rev.relax || []) { const d = domains.find((x) => x.type === ty); const t = targets.find((x) => x.type === ty); if (!d || !t) continue;
      try { d.candidates = await ask(t, 50); d.pick = 0; d.relaxed = true; H("Replan", `${d.label}: asked for 50 candidates, ${d.candidates.length} kept.`); } catch { d.relaxed = true; } }
    for (const s of rev.swaps || []) { const d = domains.find((x) => x.type === s.type); if (d && d.candidates[s.pick]) { d.pick = s.pick; H("Replan", s.reason); } }
  }

  // ---- Diversity check: no single favorite should drive most of the trail
  const live5 = domains.filter((d) => d.candidates[d.pick]);
  if (seeds.length >= 2) {
    const drivers = {}; for (const d of live5) { const n = d.candidates[d.pick].driver; if (n) drivers[n] = (drivers[n] || 0) + 1; }
    const [top, n] = Object.entries(drivers).sort((a, b) => b[1] - a[1])[0] || [];
    if (top && n > Math.ceil(live5.length / 2)) {
      let swapped = 0;
      for (const d of live5) { if (swapped >= n - Math.ceil(live5.length / 2)) break; const cur = d.candidates[d.pick];
        if (cur.driver !== top) continue; const alt = d.candidates.findIndex((c, i) => i !== d.pick && c.driver && c.driver !== top && passes(c, level) && (cur.score ?? 0) - (c.score ?? 0) < 0.1);
        if (alt >= 0) { d.pick = alt; swapped++; } }
      H("Check", `Diversity: "${top}" drove ${n} of ${live5.length} picks.`);
      H("Replan", swapped ? `Swapped ${swapped} pick(s) to ones driven by your other favorites (affinity within 0.1).` : "No close alternatives driven by the other favorites; kept the picks.");
    } else H("Check", "Diversity: your favorites share the picks fairly.");
  }

  // ---- Compose the trail: 5 domain picks + 2 runners-up, easiest-first for beginners (hardest-first for advanced)
  const used = new Set(live5.map((d) => d.candidates[d.pick].id));
  const extra = [];
  for (const ty of ["urn:entity:tv_show", "urn:entity:movie", "urn:entity:videogame", "urn:entity:artist", "urn:entity:book"]) {
    const d = domains.find((x) => x.type === ty); const c = d?.candidates.find((c, i) => !used.has(c.id) && passes(c, level));
    if (c) extra.push({ d, c });
  }
  let items = live5.map((d) => ({ type: d.type, label: d.label, c: d.candidates[d.pick] })).concat(extra.slice(0, Math.max(0, 7 - live5.length)).map((x) => ({ type: x.d.type, label: x.d.label, c: x.c })));
  items = items.slice(0, 7);
  if (level === "beginner") items.sort((a, b) => b.c.level.net - a.c.level.net || b.c.fit - a.c.fit);
  else if (level === "advanced") items.sort((a, b) => a.c.level.net - b.c.level.net || b.c.fit - a.c.fit);
  for (let i = 1; i < items.length; i++) if (items[i].type === items[i - 1].type) { const j = items.findIndex((x, k) => k > i && x.type !== items[i - 1].type); if (j > 0) [items[i], items[j]] = [items[j], items[i]]; }
  const seen = {};
  const trail = items.map(({ type, label, c }, i) => { const k = (seen[type] = (seen[type] || 0) + 1) - 1; return {
    day: i + 1, title: c.name, type: type.replace("urn:entity:", ""), typeLabel: label, goal: GOALS[i], task: TASKS[type][k % 2],
    qloo: { affinity: c.score, sharedTaste: uniq(c.tags.filter((t) => seedTags.has(t))).slice(0, 5), drivenBy: c.driver },
    level: { verdict: c.level.verdict, easy: c.level.easy, hard: c.level.hard },
  }; });
  H("Act", `Built a ${trail.length}-day trail: ${uniq(trail.map((t) => t.typeLabel)).join(", ")}.`);
  return { mode: client.mode, level, planner: planner.name, trail, history,
    limits: "Qloo gives aggregate taste affinity, not learning difficulty. The level rule is our own tag heuristic; verify with the learner." };
}

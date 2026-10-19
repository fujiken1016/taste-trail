// Live runs against the real Qloo API: node scripts/live_run.mjs rules|llm   (needs .env). Writes docs/LIVE_RUN_<mode>.json (aggregates only).
// No Qloo response data is written: only counts, timings, verdicts and the agent's own history text with titles removed.
import fs from "node:fs";
import { makeClient } from "../src/qloo-client.js";
import { runAgent, rulesPlanner } from "../src/agent.js";
import { llmPlanner } from "./llm_agent.mjs";
for (const l of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const mode = process.argv[2] || "rules"; const planner = mode === "llm" ? llmPlanner : rulesPlanner;
const CASES = [
  ["Cowboy Bebop", "Hades (game)", "Radiohead"], ["Spirited Away", "Zelda (game)", "Kendrick Lamar"], ["Attack on Titan", "Dark Souls (game)"], ["Studio Ghibli"],
  ["The Office", "Stardew Valley (game)", "Taylor Swift"], ["Breaking Bad", "Taylor Swift"], ["Naruto", "Persona 5 (game)", "Daft Punk"], ["Demon Slayer", "Minecraft (game)", "Billie Eilish"],
  ["Your Name", "Animal Crossing (game)", "Yoasobi"], ["Death Note", "Metal Gear Solid (game)", "Nirvana"], ["Friends", "The Sims (game)", "Adele"], ["One Piece", "Pokemon (game)"],
  ["Stranger Things", "Hollow Knight (game)", "Arctic Monkeys"], ["Haruki Murakami (book)", "Lo-fi"], ["Game of Thrones", "Elden Ring (game)", "Hans Zimmer"], ["Terrace House", "Mario Kart (game)", "BTS"],
  ["Fullmetal Alchemist", "Final Fantasy VII (game)", "Queen"], ["Harry Potter", "Minecraft (game)", "Ed Sheeran"], ["Neon Genesis Evangelion", "Celeste (game)", "Aphex Twin"], ["asdfqwer zzzz", "Cowboy Bebop"],
];
const LV = ["beginner", "intermediate", "advanced"];
const res = []; const t00 = Date.now();
const [A, B] = (process.env.RANGE || `1-${CASES.length}`).split("-").map(Number);
for (let i = A - 1; i < B; i++) {
  const level = LV[i % 3]; const favorites = CASES[i].map((name) => ({ name }));
  const t0 = Date.now(); const client = makeClient(process.env);
  const row = { case: i + 1, favorites: CASES[i], level, planner: planner.name };
  try {
    const r = await runAgent({ favorites, level }, client, { planner });
    const types = new Set(r.trail.map((t) => t.type));
    const stretch = r.trail.filter((t) => t.level.verdict === "stretch").length;
    const strip = (s) => s.replace(/"[^"]*"/g, '"<favorite>"');
    Object.assign(row, { ok: r.trail.length === 7 && types.size >= 4 && (level === "advanced" || stretch === 0), days: r.trail.length, domains: types.size, stretchLeft: stretch,
      checks: r.history.filter((h) => h.phase === "Check").length, replans: r.history.filter((h) => h.phase === "Replan").length,
      llmFallback: r.history.some((h) => /Claude (plan|review) failed/.test(h.text)), sample_plan: strip(r.history[0].text).slice(0, 200) });
  } catch (e) { Object.assign(row, { ok: false, error: String(e.message).replace(/https?:\/\/\S+/g, "").slice(0, 120), expectedFailure: i === 19 }); }
  row.seconds = +((Date.now() - t0) / 1000).toFixed(1); res.push(row); console.log(JSON.stringify(row).slice(0, 200));
}
const okN = res.filter((r) => r.ok).length;
const summary = { mode, date: new Date().toISOString().slice(0, 10), cases: res.length, ok: okN, successRate: +(okN / res.length).toFixed(2), medianSeconds: res.map((r) => r.seconds).sort((a, b) => a - b)[Math.floor(res.length / 2)], totalMinutes: +((Date.now() - t00) / 60000).toFixed(1), results: res };
fs.writeFileSync(new URL(`../docs/LIVE_RUN_${mode}${process.env.RANGE ? "_" + process.env.RANGE : ""}.json`, import.meta.url), JSON.stringify(summary, null, 1));
console.log("SUMMARY", mode, okN + "/" + res.length);

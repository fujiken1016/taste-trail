// Claude-driven planner/reviewer for Taste Trail (run locally; NOT used by the public demo, so the public demo costs nothing).
// Same interface as rulesPlanner in src/agent.js. Claude sees the Qloo candidates only transiently, in the prompt; nothing is stored.
import { spawnSync } from "node:child_process";
import { rulesPlanner, TARGETS } from "../src/agent.js";

const CLAUDE = process.env.CLAUDE_BIN || "claude";
const MODEL = process.env.CLAUDE_MODEL || "sonnet";
export function ask(prompt) {
  const r = spawnSync(CLAUDE, ["-p", "--model", MODEL, prompt], { encoding: "utf8", timeout: 120000 });
  if (r.status !== 0) throw new Error("claude -p failed: " + (r.stderr || "").slice(0, 200));
  const m = r.stdout.match(/\{[\s\S]*\}/); if (!m) throw new Error("no JSON in reply");
  return JSON.parse(m[0]);
}
const TYPES = TARGETS.map((t) => t.type);

export const llmPlanner = {
  name: "claude",
  async plan({ favorites, level }) {
    try {
      const j = ask(`You are the planner of "Taste Trail", an agent that builds a 7-day Japanese immersion trail from a learner's favorites using Qloo taste data.
Learner level: ${level}. Favorites (user input): ${favorites.map((f) => f.name).join("; ")}.
Available Qloo domains: ${TYPES.join(", ")}. Each is queried with a Japan lens.
Decide which domains to ask (usually all; drop one only with a clear reason, e.g. a ${level} learner and a domain that is mostly hard prose). Reply with ONLY JSON: {"note":"<one sentence, max 30 words, your plan>","targets":["urn:entity:..."]}`);
      const targets = (j.targets || []).filter((t) => TYPES.includes(t)); if (targets.length < 3) throw new Error("plan too narrow");
      return { note: String(j.note || "").slice(0, 240), targets };
    } catch (e) { const r = await rulesPlanner.plan({ favorites, level }); return { ...r, note: `(Claude plan failed: ${e.message.slice(0, 60)}; using rules) ${r.note}` }; }
  },
  async review({ level, domains, round }) {
    const compact = domains.map((d) => ({ type: d.type, error: d.error || undefined, relaxed: d.relaxed, current_pick: d.pick,
      candidates: d.candidates.slice(0, 8).map((c) => ({ i: c.i, name: c.name, affinity: +(c.affinity ?? 0).toFixed(2), level_rule: c.verdict, easier_tags: c.easy, harder_tags: c.hard, pulled_by: c.driver })) }));
    try {
      const j = ask(`You review one round of the "Taste Trail" agent (round ${round}). Learner level: ${level}.
For each domain you see Qloo candidates ranked by Qloo affinity, and our own level rule per candidate (fits / stretch / none = no language signal in tags / easy). current_pick is the index in use.
Goals: (1) no current pick should be a "stretch" for beginner/intermediate if a close-affinity alternative exists; (2) a domain with fewer than 3 candidates and not relaxed may be relaxed (asks Qloo for more); (3) do not change a pick for no reason; (4) the trail should draw on all favorites (pulled_by) rather than one.
Data: ${JSON.stringify(compact)}
Reply with ONLY JSON: {"relax":["urn:entity:..."],"swaps":[{"type":"urn:entity:...","pick":<index i>,"reason":"<max 18 words>"}],"notes":["<max 20 words>"]}. Empty arrays if nothing to change.`);
      const swaps = (j.swaps || []).filter((s) => domains.some((d) => d.type === s.type && d.candidates.some((c) => c.i === s.pick))).map((s) => ({ type: s.type, pick: s.pick, reason: String(s.reason || "").slice(0, 160) }));
      const relax = (j.relax || []).filter((t) => domains.some((d) => d.type === t && !d.relaxed));
      return { relax, swaps, notes: (j.notes || []).map((n) => String(n).slice(0, 160)).slice(0, 3) };
    } catch (e) { const r = await rulesPlanner.review({ level, domains, round }); return { ...r, notes: [`(Claude review failed: ${e.message.slice(0, 60)}; using rules)`, ...(r.notes || [])] }; }
  },
};

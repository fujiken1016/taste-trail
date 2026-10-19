import assert from "node:assert/strict";
import { mockClient, normalizeEntity, makeClient } from "../src/qloo-client.js";
import { runAgent, fitScore, levelInfo, TARGETS } from "../src/agent.js";
import { handleTrail, getMode } from "../src/handler.js";

const c = mockClient();
const favs = [{ name: "Space Pirate Saga" }, { name: "Pixel Farm Valley" }, { name: "Moonlit Cassette" }];
const beg = await runAgent({ favorites: favs, level: "beginner" }, c);
const adv = await runAgent({ favorites: favs, level: "advanced" }, c);
assert.equal(beg.trail.length, 7);
assert.ok(beg.trail.every((d) => d.task && d.goal && d.level && d.qloo));
assert.deepEqual(beg.history.map((h) => h.phase).slice(0, 2), ["Plan", "Act"]);
assert.ok(beg.history.some((h) => h.phase === "Check"));
assert.equal(new Set(beg.trail.map((d) => d.title)).size, 7, "no duplicate titles");
assert.ok(beg.trail.every((d, i) => i === 0 || d.type !== beg.trail[i - 1].type), "no same domain on consecutive days");
assert.notDeepEqual(beg.trail.map((d) => d.title), adv.trail.map((d) => d.title), "level changes the trail");
await assert.rejects(runAgent({ favorites: [] }, c), /favorites required/);
await assert.rejects(runAgent({ favorites: [{ name: "   " }] }, c));

// level rule
assert.ok(fitScore({ tags: ["slang"], score: 0.5 }, "beginner") < fitScore({ tags: ["slang"], score: 0.5 }, "advanced"));
assert.equal(levelInfo({ tags: ["Warrior", "Software"] }, "beginner").hard.length, 0, "whole-word match: 'war' must not hit 'Warrior'");
assert.equal(levelInfo({ tags: ["Slice of life", "Crime"] }, "beginner").verdict, "none");
assert.equal(levelInfo({ tags: ["Crime", "Politics"] }, "beginner").verdict, "stretch");
assert.equal(levelInfo({ tags: ["Slice of life"] }, "beginner").verdict, "fits");

// Japan lens (live): origin must be Japan; no country => dropped in live, kept in mock
const tv = TARGETS.find((t) => t.type === "urn:entity:tv_show");
assert.equal(tv.keep({ country: ["Japan", "US"] }, true), true);
assert.equal(tv.keep({ country: ["United States", "Japan"] }, true), false);
assert.equal(tv.keep({ country: null }, true), false);
assert.equal(tv.keep({ country: null }, false), true);

// Replan: a stub client where the top beginner pick is a stretch -> the agent swaps and logs a Replan
const mk = (id, name, aff, tags, extra = {}) => ({ id, name, type: "x", tags, score: aff, explain: null, country: ["Japan"], makers: "Nintendo", ...extra });
const stub = { mode: "live", async search(q) { return [{ id: "S" + q, name: q, tags: [] }]; },
  async insights({ type }) { return [mk(type + "1", "A", 0.95, ["Crime", "Politics"]), mk(type + "2", "B", 0.9, ["Slice of life"]), mk(type + "3", "C", 0.85, ["Family"]), mk(type + "4", "D", 0.8, [])]; } };
const rp = await runAgent({ favorites: [{ name: "x" }], level: "beginner" }, stub);
assert.ok(rp.history.some((h) => h.phase === "Replan" && /stretch/.test(h.text)), "replan logged");
assert.ok(rp.trail.every((t) => t.level.verdict !== "stretch"), "beginner trail has no stretch picks");

// Thin domain -> relax (asks for more candidates)
let asked = [];
const thin = { ...stub, async insights({ type, take }) { asked.push(take); return take >= 50 ? stub.insights({ type }) : [mk(type + "1", "A", 0.9, ["Family"])]; } };
const rt = await runAgent({ favorites: [{ name: "x" }], level: "intermediate" }, thin);
assert.ok(asked.includes(50) && rt.history.some((h) => h.phase === "Replan" && /50 candidates/.test(h.text)));

// A failing domain is reported, not hidden; too many failures -> error
const flaky = { ...stub, async insights({ type }) { if (type.endsWith("movie")) throw new Error("Qloo 500 on /v2/insights"); return stub.insights({ type }); } };
const rf = await runAgent({ favorites: [{ name: "x" }], level: "beginner" }, flaky);
assert.ok(rf.history.some((h) => /Film failed/.test(h.text)));
await assert.rejects(runAgent({ favorites: [{ name: "x" }] }, { ...stub, async insights() { throw new Error("boom"); } }), /not enough results/);

// No key => "preparing" (never a mock result); input validation; safe errors
assert.equal(makeClient({}), null);
assert.equal(getMode({}), "unavailable");
assert.equal((await handleTrail("{}", {})).status, 503);
const env = { TASTE_TRAIL_MOCK: "1" };
assert.equal((await handleTrail('{"favorites":[],"level":"beginner"}', env)).status, 400);
assert.equal((await handleTrail('{"favorites":[{"name":"a"}],"level":"godlike"}', env)).status, 400);
assert.equal((await handleTrail("not json", env)).status, 400);
assert.equal((await handleTrail(JSON.stringify({ favorites: [{ name: "Space Pirate Saga" }], level: "beginner" }), env, "t1")).status, 200);
let last; for (let i = 0; i < 14; i++) last = await handleTrail(JSON.stringify({ favorites: [{ name: "q" + i }], level: "beginner" }), env, "t2");
assert.equal(last.status, 429);

// Shape-only test of the LIVE response format (field names verified 2026-10-20; every value is invented).
const n = normalizeEntity({ entity_id: "X-1", name: "Invented Show", type: "urn:entity", subtype: "urn:entity:tv_show",
  tags: [{ name: "Slice of life", tag_id: "urn:tag:x", type: "urn:tag:genre:media" }], properties: { release_country: ["Japan", "Canada"], publisher: "Invented Co" },
  query: { affinity: 0.5, explainability: { "signal.interests.entities": [{ entity_id: "A", score: 3 }] } } });
assert.equal(n.type, "urn:entity:tv_show"); assert.equal(n.score, 0.5); assert.equal(n.country[0], "Japan"); assert.deepEqual(n.tags, ["Slice of life"]);
assert.equal(normalizeEntity({ entity_id: "S", name: "n", types: ["urn:entity:videogame"], tags: [] }).type, "urn:entity:videogame");
console.log("ok: all tests passed", beg.trail.map((d) => d.title).join(" | "));
import { parseFavorite } from "../src/agent.js";
assert.deepEqual(parseFavorite("Hades (game)"), { query: "Hades", type: "urn:entity:videogame" });
assert.deepEqual(parseFavorite("Cowboy Bebop"), { query: "Cowboy Bebop", type: undefined });
console.log("ok: parseFavorite");

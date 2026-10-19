import assert from "node:assert/strict";
import { mockClient } from "../src/qloo-client.js";
import { runAgent, fitScore } from "../src/agent.js";

const c = mockClient();
const favs = [{ name: "Space Pirate Saga" }, { name: "Pixel Farm Valley" }, { name: "Moonlit Cassette" }];
const beg = await runAgent({ favorites: favs, level: "beginner" }, c);
const adv = await runAgent({ favorites: favs, level: "advanced" }, c);
assert.equal(beg.trail.length, 7);
assert.ok(beg.trail.every((d) => d.why.qloo && d.task));
assert.ok(beg.trace.some((t) => t.step === "insights"));
assert.ok(fitScore({ tags: ["slang"], score: 0.5 }, "beginner") < fitScore({ tags: ["slang"], score: 0.5 }, "advanced"));
await assert.rejects(runAgent({ favorites: [] }, c));
console.log("ok: agent tests passed", beg.trail.map((d) => d.title).join(" | "));

// Shape-only test of the LIVE response format (field names verified 2026-10-20; every value below is invented).
import { normalizeEntity } from "../src/qloo-client.js";
const liveShape = { entity_id: "X-1", name: "Invented Show", type: "urn:entity", subtype: "urn:entity:tv_show",
  tags: [{ name: "Slice of life", tag_id: "urn:tag:x", type: "urn:tag:genre:media" }],
  properties: { release_country: ["Japan", "Canada"], publisher: "Invented Co" },
  query: { affinity: 0.5, explainability: { "signal.interests.entities": [{ entity_id: "A", score: 3 }] } } };
const n = normalizeEntity(liveShape);
assert.equal(n.type, "urn:entity:tv_show"); assert.equal(n.score, 0.5); assert.equal(n.country[0], "Japan"); assert.deepEqual(n.tags, ["Slice of life"]);
assert.equal(normalizeEntity({ entity_id: "S", name: "n", types: ["urn:entity:videogame"], tags: [] }).type, "urn:entity:videogame");
console.log("ok: live-shape normalize test passed");

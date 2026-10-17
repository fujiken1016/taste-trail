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

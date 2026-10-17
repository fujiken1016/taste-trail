// Cloudflare Pages Function: POST /api/trail. QLOO_API_KEY is a Pages secret (never in the repo/browser).
import { makeClient } from "../../src/qloo-client.js";
import { runAgent } from "../../src/agent.js";

export async function onRequestPost({ request, env }) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  try {
    const body = await request.text();
    if (body.length > 4000) return json({ error: "too large" }, 400);
    return json(await runAgent(JSON.parse(body), makeClient(env)));
  } catch (e) { return json({ error: String(e.message) }, 400); }
}

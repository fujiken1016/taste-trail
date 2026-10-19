// Cloudflare Pages Function: POST /api/trail. QLOO_API_KEY is a Pages secret (never in the repo/browser).
import { handleTrail } from "../../src/handler.js";
export async function onRequestPost({ request, env }) {
  const r = await handleTrail(await request.text(), env, request.headers.get("cf-connecting-ip") || "unknown");
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
}

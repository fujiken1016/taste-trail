// Minimal Node server: static UI + /api/trail. Reads QLOO_API_KEY from env (mock mode if absent).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { makeClient } from "./src/qloo-client.js";
import { runAgent } from "./src/agent.js";

import { readFileSync } from "node:fs";
// Local dev: read .env (git-ignored). On Cloudflare the key is a Pages secret instead.
try { for (const l of readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {}
const client = makeClient(process.env);
const cache = new Map(); // private server-side cache only; never written to the repo
http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/trail") {
      let body = ""; for await (const ch of req) { body += ch; if (body.length > 4000) throw new Error("too large"); }
      const key = body; if (cache.has(key)) return send(res, 200, cache.get(key));
      const out = await runAgent(JSON.parse(body), client); cache.set(key, out); if (cache.size > 200) cache.delete(cache.keys().next().value);
      return send(res, 200, out);
    }
    if (req.method === "GET" && req.url === "/api/mode") return send(res, 200, { mode: client.mode });
    const html = await readFile(new URL("./public/index.html", import.meta.url));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html);
  } catch (e) { send(res, 400, { error: String(e.message) }); }
}).listen(process.env.PORT || 8787, () => console.log(`mode=${client.mode}`));
const send = (res, c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

// Minimal Node server: static UI + /api/trail. Reads QLOO_API_KEY from env (mock mode if absent).
import http from "node:http";
import { readFile } from "node:fs/promises";

import { readFileSync } from "node:fs";
// Local dev: read .env (git-ignored). On Cloudflare the key is a Pages secret instead.
try { for (const l of readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {}
import { handleTrail, getMode } from "./src/handler.js";
http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/trail") {
      let body = ""; for await (const ch of req) { body += ch; if (body.length > 4000) break; }
      const r = await handleTrail(body, process.env, req.socket.remoteAddress);
      return send(res, r.status, r.body);
    }
    if (req.method === "GET" && req.url === "/api/mode") return send(res, 200, { mode: getMode(process.env) });
    const html = await readFile(new URL("./public/index.html", import.meta.url));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html);
  } catch (e) { send(res, 400, { error: "bad" }); }
}).listen(process.env.PORT || 8787, () => console.log(`mode=${getMode(process.env)}`));
const send = (res, c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

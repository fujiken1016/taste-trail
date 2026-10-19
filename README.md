# Taste Trail

An agent that turns a Japanese learner's favorite titles (anime, games, podcasts, music, books) into a 7-day immersion trail.
It uses Qloo's cross-domain taste affinities (tv_show / video_game / podcast / artist / book) as the evidence for *what the learner will actually enjoy*, then re-ranks by a clearly separate, self-made level heuristic.

Built for the Qloo Agentic Hackathon 2026. License: MIT.

## How Qloo is used
1. `GET /search` resolves each favorite to a Qloo entity.
2. `GET /v2/insights` is called once per target domain with `signal.interests.entities` = all resolved favorites (cross-domain recommendation).
3. Our own tag heuristic (`src/agent.js`, EASY/HARD sets) re-ranks for beginner/intermediate/advanced. Qloo does not return learning difficulty; the UI shows "Qloo affinity" and "level fit" separately.
4. Output: 7 days, each with a 10-20 minute task and the evidence for the pick.

Without Qloo there is no taste signal, so the picks would be arbitrary. Only aggregate affinities are used; no personal data is sent to Qloo.

## Run locally (Node 22+)
```
npm test
npm run dev        # http://localhost:8787  (mock mode if QLOO_API_KEY is unset)
QLOO_API_KEY=... npm run dev   # live mode (hackathon base URL https://hackathon.api.qloo.com)
```
Mock mode uses `fixtures/mock-data.js`: invented titles and scores, **not** Qloo data. The UI/API response includes `mode: "mock" | "live"`.

## Deploy (Cloudflare Pages + Pages Functions)
Static UI in `public/`, API in `functions/api/trail.js` (same `src/` code, fetch-only, no dependencies).
```
npx wrangler pages project create taste-trail --production-branch main
npx wrangler pages deploy public --project-name taste-trail      # run from repo root; functions/ is picked up
npx wrangler pages secret put QLOO_API_KEY --project-name taste-trail
```
The key exists only as a server-side secret. There is no silent fallback: a failing Qloo call returns an error.

## Limits
- Qloo affinity is group-level taste similarity, not a fact about the individual or a causal claim.
- Level fit is a heuristic over tags, not measured difficulty. Verify with the learner.
- Response parsing (`normalizeEntity`) was written from the docs and must be verified against live responses.

## Switching from mock to live Qloo (about half a day, once the key arrives)
1. (5 min) `npx wrangler pages secret put QLOO_API_KEY --project-name taste-trail`, then redeploy (`npx wrangler pages deploy public --project-name taste-trail --branch main`). The "Demo data" banner disappears by itself (it keys off `/api/mode`).
2. (30 min) Run locally with the key and call `/search` and `/v2/insights` by hand with `curl -H "X-Api-Key: $K" "https://hackathon.api.qloo.com/search?query=..."`. Save the raw JSON **outside the repo** (Qloo terms: no Qloo response data in a public repo).
3. (1-2 h) Fix `normalizeEntity` in `src/qloo-client.js` to the real shapes (entity id, `types`, `tags`, affinity field, `results.entities`). Then add a **shape-only** fixture test (invented values, real field names).
4. (1-2 h) Map the EASY/HARD heuristic tags to real Qloo tag ids (`/v2/tags`); keep the heuristic labelled as ours.
5. (1 h) Check each domain returns results for `filter.type` and fix empty-domain handling; add rate-limit/error display (no silent fallback).
6. (1 h) Re-record the live-data shots in `VIDEO_SHOTLIST.md` (marked with a star), update the Devpost text lines marked with a star, then resubmit.
Optional: add an MCP version (`qloo mcp`) for the "agent framework" requirement.

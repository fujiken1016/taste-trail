# Taste Trail

An agent that turns a Japanese learner's favorite titles (anime, games, podcasts, music, books) into a 7-day immersion trail.
It uses Qloo's cross-domain taste affinities (tv_show / video_game / podcast / artist / book) as the evidence for *what the learner will actually enjoy*, then re-ranks by a clearly separate, self-made level heuristic.

Built for the Qloo Agentic Hackathon 2026. License: MIT.

## How Qloo is used
1. `GET /search` resolves each favorite to a Qloo entity.
2. `GET /v2/insights` runs once per domain (tv_show, movie, videogame, artist, book) with all favorites as `signal.interests.entities` and `feature.explainability=true` (cross-domain recommendation; explainability tells which favorite pulled each pick).
3. A **Japan lens** per domain, found by probing the live API: `filter.release_country=Japan` (then country of origin must be first in the list) for shows and films; Qloo tag ids from `/v2/tags` for music (`genre:music:japanese`) and books (`genre:media:manga`); a Japanese-publisher list for video games (the API has no country field for them). Podcasts are not used: no usable Japan lens.
4. Our own tag heuristic (`src/agent.js`, EASY/HARD word lists matched against Qloo tag names) re-ranks for beginner/intermediate/advanced. Qloo returns no difficulty, so the UI labels it as ours.
5. Output: 7 days, each with a 10-20 minute task and the evidence for the pick: affinity, shared tags, and which favorite pulled it.
Without Qloo there is no taste signal, so the picks would be arbitrary. Only aggregate affinities are used; no personal data is sent to Qloo.

## Run locally (Node 22+)
```
npm test
npm run dev        # http://localhost:8787  (mock mode if QLOO_API_KEY is unset)
QLOO_API_KEY=... npm run dev   # live mode (hackathon base URL https://hackathon.api.qloo.com)
```
Mock mode uses `fixtures/mock-data.js`: invented titles and scores, **not** Qloo data. The UI/API response includes `mode: "mock" | "live"`.

## Deploy (Cloudflare Pages + Pages Functions)
Static UI in `public/`, API in `functions/api/` (same `src/` code, fetch-only, no dependencies).
```
npx wrangler pages deploy public --project-name taste-trail --branch main   # from repo root; functions/ is picked up
```
**Add the key (dashboard, 3 steps):** Cloudflare dashboard > Workers & Pages > `taste-trail` > Settings > Variables and Secrets > Add: type **Secret**, name `QLOO_API_KEY`, environment Production > then Deployments > latest > Retry deployment (secrets apply on the next deploy). `QLOO_BASE_URL` is optional (defaults to the hackathon URL). The page's "Demo data" banner disappears by itself when `/api/mode` reports `live`.
The key exists only as a server-side secret. There is no silent fallback: a failing Qloo call returns an error.

## Limits
- Qloo affinity is group-level taste similarity, not a fact about the individual or a causal claim.
- Level fit is a heuristic over tag names, not measured difficulty. Verify with the learner.
- The Japan lens is imperfect: release_country lists every release country, video games use a publisher list, and some music/manga picks are Japan-adjacent rather than Japanese-language.
- Docs vs API: the developer guide says `video_game`; the API only accepts `urn:entity:videogame`.
- Qloo terms: no Qloo response data in this public repo. Tests use invented, shape-only fixtures. Caching is in-memory on the server only.

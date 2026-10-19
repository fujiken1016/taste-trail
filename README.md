# Taste Trail
![test](https://github.com/fujiken1016/taste-trail/actions/workflows/test.yml/badge.svg)

Demo: https://taste-trail.pages.dev

An agent that turns a Japanese learner's favorite titles (anime, games, podcasts, music, books) into a 7-day immersion trail.
It uses Qloo's cross-domain taste affinities (tv_show / video_game / podcast / artist / book) as the evidence for *what the learner will actually enjoy*, then re-ranks by a clearly separate, self-made level heuristic.

Built for the Qloo Agentic Hackathon 2026. License: MIT.

## The agent loop (Plan, Act, Check level-fit, Replan)
Every trail comes with its history, shown on screen ("How the agent decided").
1. **Plan**: decide which Qloo domains to ask, each through a Japan lens.
2. **Act**: `GET /search` resolves each favorite; then `GET /v2/insights` per domain (tv_show, movie, videogame, artist, book) with all favorites as `signal.interests.entities` and `feature.explainability=true` (it says which favorite pulled each pick).
3. **Check**: (a) Japan lens kept enough candidates? (b) is each top pick a "stretch" for your level by our own rule? (c) does one favorite drive most picks?
4. **Replan**: thin domain -> ask for 50 candidates; stretch pick -> swap to the best-affinity pick that fits; one favorite dominating -> swap to a close match driven by the others (affinity within 0.1). Up to 2 rounds.
5. **Compose**: 7 days, easiest-first for beginners, no same domain two days in a row, a goal and a task per day.
The public demo uses deterministic rules (free to run). `scripts/llm_agent.mjs` plugs Claude (`claude -p`) in as planner and reviewer for the same loop (local runs only, so the public demo never incurs model costs). See `docs/LIVE_RUN.md` for 20 live cases with both planners.

**Qloo evidence and our level rule are shown separately** on every card: "Qloo says" (taste affinity 0 to 1, shared tags, which favorite pulled it) vs "Our level rule says" (fits / stretch / no language signal, with the tags behind it). Qloo returns no learning difficulty; the level rule is our own heuristic over tag names.

**Japan lens per domain** (found by probing the live API): `filter.release_country=Japan` and Japan must be the *first* listed country for shows and films; Qloo tag ids from `/v2/tags` for music and manga; a Japanese-publisher list for games (no country field). Podcasts are not used (no usable Japan lens). Results with no country information are dropped in live mode.
Without Qloo there is no taste signal, so the picks would be arbitrary. Only aggregate affinities are used; no personal data is sent to Qloo.

## Run locally (Node 22+)
```
npm test
QLOO_API_KEY=... npm run dev          # live mode; or put QLOO_API_KEY in .env (git-ignored)
TASTE_TRAIL_MOCK=1 npm run dev        # offline dev only: invented sample data
# http://localhost:8787
```
Mock mode (`fixtures/mock-data.js`: invented titles and scores, **not** Qloo data) is opt-in for tests and offline work. **Without a key and without TASTE_TRAIL_MOCK the app shows a "Getting ready" page and the API answers 503**; it never presents mock output as live.

## Deploy (Cloudflare Pages + Pages Functions)
Static UI in `public/`, API in `functions/api/` (same `src/` code, fetch-only, no dependencies).
```
npx wrangler pages deploy public --project-name taste-trail --branch main   # from repo root; functions/ is picked up
```
**Add the key (dashboard, 3 steps):** Cloudflare dashboard > Workers & Pages > `taste-trail` > Settings > Variables and Secrets > Add: type **Secret**, name `QLOO_API_KEY`, environment Production > then Deployments > latest > Retry deployment (secrets apply on the next deploy). `QLOO_BASE_URL` is optional (defaults to the hackathon URL). Until the secret is set the page shows "Getting ready" (`/api/mode` reports `unavailable`) instead of any result.
The key exists only as a server-side secret. There is no silent fallback: a failing Qloo call returns an error.

## Limits
- Qloo affinity is group-level taste similarity, not a fact about the individual or a causal claim.
- Level fit is a heuristic over tag names, not measured difficulty (it checks language-related tags such as everyday-speech or slang, not genre mood). It is untested against learner outcomes. Verify with the learner.
- `docs/LIVE_RUN.md` measures whether the agent completes and passes its own checks, not whether learners improve.
- The Japan lens is imperfect: release_country lists every release country, video games use a publisher list, and some music/manga picks are Japan-adjacent rather than Japanese-language.
- Docs vs API: the developer guide says `video_game`; the API only accepts `urn:entity:videogame`.
- Qloo terms: no Qloo response data in this public repo. Tests use invented, shape-only fixtures. Caching is in-memory on the server only.

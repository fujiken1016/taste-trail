# Live runs against the real Qloo API

Each case = favorites + level, run end to end (search, 5 insights calls, check, replan, 7-day trail). **No Qloo response data is stored here**: only counts, timings and verdicts. Raw JSON: `LIVE_RUN_rules.json`, `LIVE_RUN_llm.json`.

**Success** = 7 days, at least 4 domains, and (for beginner/intermediate) no "stretch" pick left. This measures that the agent completes and passes its own checks. **It does not measure whether learners improve.** Case 20 includes a nonsense title on purpose: the agent should ignore it and continue.

## Planner: deterministic rules (what the public demo runs)
- 2026-10-19: 20/20 succeeded (100%), median 2.4s per case, total 0.9 min
- Replans per case: 1.6 on average; cases with at least one Replan: 16

| # | favorites | level | ok | domains | checks | replans | seconds |
|---|---|---|---|---|---|---|---|
| 1 | Cowboy Bebop, Hades (game), Radiohead | beginner | yes | 5 | 3 | 3 | 3.3 |
| 2 | Spirited Away, Zelda (game), Kendrick Lamar | intermediate | yes | 5 | 2 | 0 | 2.8 |
| 3 | Attack on Titan, Dark Souls (game) | advanced | yes | 5 | 2 | 0 | 2.1 |
| 4 | Studio Ghibli | beginner | yes | 5 | 2 | 3 | 1.6 |
| 5 | The Office, Stardew Valley (game), Taylor Swift | intermediate | yes | 5 | 3 | 2 | 3.4 |
| 6 | Breaking Bad, Taylor Swift | advanced | yes | 5 | 3 | 3 | 3.5 |
| 7 | Naruto, Persona 5 (game), Daft Punk | beginner | yes | 5 | 3 | 4 | 1.9 |
| 8 | Demon Slayer, Minecraft (game), Billie Eilish | intermediate | yes | 5 | 3 | 1 | 2.1 |
| 9 | Your Name, Animal Crossing (game), Yoasobi | advanced | yes | 5 | 2 | 0 | 3.1 |
| 10 | Death Note, Metal Gear Solid (game), Nirvana | beginner | yes | 5 | 3 | 3 | 2 |
| 11 | Friends, The Sims (game), Adele | intermediate | yes | 5 | 3 | 1 | 2.8 |
| 12 | One Piece, Pokemon (game) | advanced | yes | 5 | 2 | 1 | 2.4 |
| 13 | Stranger Things, Hollow Knight (game), Arctic Monkeys | beginner | yes | 5 | 3 | 1 | 2.7 |
| 14 | Haruki Murakami (book), Lo-fi | intermediate | yes | 5 | 3 | 2 | 2.2 |
| 15 | Game of Thrones, Elden Ring (game), Hans Zimmer | advanced | yes | 5 | 2 | 1 | 2.2 |
| 16 | Terrace House, Mario Kart (game), BTS | beginner | yes | 5 | 2 | 0 | 2.2 |
| 17 | Fullmetal Alchemist, Final Fantasy VII (game), Queen | intermediate | yes | 5 | 2 | 1 | 3 |
| 18 | Harry Potter, Minecraft (game), Ed Sheeran | advanced | yes | 5 | 3 | 2 | 3.7 |
| 19 | Neon Genesis Evangelion, Celeste (game), Aphex Twin | beginner | yes | 5 | 3 | 4 | 2.3 |
| 20 | asdfqwer zzzz, Cowboy Bebop | intermediate | yes | 5 | 2 | 1 | 2 |

## Planner: Claude (claude -p, local only)
- 2026-10-19: 18/20 succeeded (90%), median 32.3s per case, total 3.5 min
- Replans per case: 5.3 on average; cases with at least one Replan: 19
- Claude call failures that fell back to rules: 4 of 20 cases (shown in the history as "Claude ... failed; using rules")

| # | favorites | level | ok | domains | checks | replans | seconds |
|---|---|---|---|---|---|---|---|
| 1 | Cowboy Bebop, Hades (game), Radiohead | beginner | NO  | 5 | 3 | 5 | 36.5 |
| 2 | Spirited Away, Zelda (game), Kendrick Lamar | intermediate | yes | 5 | 3 | 8 | 32.3 |
| 3 | Attack on Titan, Dark Souls (game) | advanced | yes | 5 | 3 | 7 | 25.6 |
| 4 | Studio Ghibli | beginner | yes | 5 | 2 | 5 | 27.5 |
| 5 | The Office, Stardew Valley (game), Taylor Swift | intermediate | yes | 5 | 3 | 4 | 30.9 |
| 6 | Breaking Bad, Taylor Swift | advanced | yes | 5 | 3 | 5 | 28.1 |
| 7 | Naruto, Persona 5 (game), Daft Punk | beginner | yes | 5 | 3 | 6 | 31.9 |
| 8 | Demon Slayer, Minecraft (game), Billie Eilish | intermediate | yes | 5 | 3 | 5 | 29.9 |
| 9 | Your Name, Animal Crossing (game), Yoasobi | advanced | yes | 5 | 2 | 0 | 20.9 |
| 10 | Death Note, Metal Gear Solid (game), Nirvana | beginner | NO  | 4 | 3 | 5 | 32.3 |
| 11 | Friends, The Sims (game), Adele | intermediate | yes | 5 | 3 | 8 | 30.7 |
| 12 | One Piece, Pokemon (game) | advanced | yes | 5 | 3 | 6 | 35.8 |
| 13 | Stranger Things, Hollow Knight (game), Arctic Monkeys | beginner | yes | 5 | 3 | 2 | 32.8 |
| 14 | Haruki Murakami (book), Lo-fi | intermediate | yes | 5 | 3 | 4 | 28.8 |
| 15 | Game of Thrones, Elden Ring (game), Hans Zimmer | advanced | yes | 5 | 3 | 10 | 34.4 |
| 16 | Terrace House, Mario Kart (game), BTS | beginner | yes | 5 | 3 | 2 | 33.6 |
| 17 | Fullmetal Alchemist, Final Fantasy VII (game), Queen | intermediate | yes | 5 | 3 | 6 | 34.5 |
| 18 | Harry Potter, Minecraft (game), Ed Sheeran | advanced | yes | 5 | 3 | 6 | 35 |
| 19 | Neon Genesis Evangelion, Celeste (game), Aphex Twin | beginner | yes | 4 | 3 | 5 | 34.9 |
| 20 | asdfqwer zzzz, Cowboy Bebop | intermediate | yes | 5 | 3 | 7 | 34.2 |


## Reading the two Claude-planner failures
Both failed the "no stretch pick left" check for a beginner (cases 1 and 10): Claude's review judged some swaps unnecessary or chose a swap the rule still flags. The rules planner, which enforces the check mechanically, passed all 20. Claude's run also needed a fallback to rules in 4 cases when its reply was not valid JSON. Timing for the Claude run is wall-clock with three batches in parallel on a busy machine, not a clean latency measurement.

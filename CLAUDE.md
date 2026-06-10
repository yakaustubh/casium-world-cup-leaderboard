# Casium World Cup 2026 — Leaderboard

An internal web page showing a single leaderboard for the Casium team's World Cup
2026 sweepstake. Each teammate backs one nation and earns points from that nation's
real results. Scores update automatically from football-data.org via a scheduled
GitHub Action.

## Architecture (how it fits together)
- `index.html` — the **only page**. Static. Fetches `data.json` + `scoring.config.json`,
  computes points in the browser, renders the standings. Has embedded fallbacks so it
  still renders if a fetch fails.
- `scoring.config.json` — the **point weights** (single source of truth). Editing a
  number here re-ranks the board on next load; no code change needed.
- `data.json` — **raw per-team stats** (goals + minutes, cards, W/D/L, clean sheets,
  knockout wins). Written by the Action. Don't hand-edit while the schedule is live —
  it gets overwritten.
- `scripts/update-scores.mjs` — Node fetcher. Pulls World Cup matches, attributes
  stats to our 8 teams (matched by 3-letter code / name), writes `data.json`. It does
  **not** compute points — that's the browser's job, so weights stay tweakable.
- `.github/workflows/update-scores.yml` — runs the fetcher every 10 min, commits
  `data.json` if it changed. API key comes from the `FOOTBALL_DATA_TOKEN` secret.

## The roster (fixed — do not add or remove people)
| Player | Nation | Code |
|--------|--------|------|
| Conrad | Argentina | arg |
| Kaustubh | Norway | nor |
| Ashlee | United States | usa |
| Luke | Spain | esp |
| Thanh | Ecuador | ecu |
| Phil | Cape Verde | cpv |
| Alexander | Germany | ger |
| Dibyendu | Brazil | bra |
| Priyanka | France | fra |

## Scoring (defaults — all in `scoring.config.json`)
- Goal **+3**, plus a clutch-timing bonus by minute (1–45′ +0, 46–75′ +1, 76–90′ +2, 90′+ +3)
- Win **+5**, draw **+2**, loss +0
- Yellow card **−1**, red card **−3**
- Clean sheet **+2**, knockout-round win **+5**

To change scoring, edit `scoring.config.json` only. To change a stat by hand (e.g.
testing), edit `data.json`, but expect the Action to overwrite it.

## Scope
- **Leaderboard only.** No map, no match-center, no sign-up/onboarding UI, no per-player
  admin. The row expander showing the points breakdown is the only interactive element.
- Keep the visual style as-is (pine green + gold, "scoreboard" header).
- If asked to add features beyond the leaderboard, confirm before expanding scope.

## Run / preview
Static files, but the page needs to fetch the JSON, so **serve it** (don't open via
`file://`, or the fetches are blocked and you'll see the embedded zeros):
```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Run the fetcher (needs Node 18+ and a token)
```
FOOTBALL_DATA_TOKEN=xxxx node scripts/update-scores.mjs
```

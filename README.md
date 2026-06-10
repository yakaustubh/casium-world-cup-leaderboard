# Casium World Cup 2026 — Leaderboard

A single-page leaderboard for the Casium team sweepstake. Each teammate backs one
nation and earns points from that nation's real World Cup results — goals (with a
**clutch-timing bonus**), wins and draws, **clean sheets**, **knockout wins**, and
**minus points for cards**.

Scores update **automatically**: a scheduled GitHub Action pulls live match data
from [football-data.org](https://www.football-data.org/), reduces it to per-team
stats, and commits `data.json`. The page reads that file and computes points in the
browser using the weights in `scoring.config.json`.

```
index.html             the leaderboard (static; reads the two JSON files)
data.json              raw per-team stats — written by the Action, do not hand-edit during the cup
scoring.config.json    the point weights — tweak these freely
scripts/update-scores.mjs   the fetcher (runs in CI; also runnable locally)
.github/workflows/update-scores.yml   the schedule that runs the fetcher
```

---

## 1. Get a free API key (2 min)

1. Sign up at **https://www.football-data.org/client/register** (free).
2. Copy the API token from your account page. The free tier includes the FIFA
   World Cup and is rate-limited to 10 calls/minute — fine for this.

## 2. Put the project on GitHub

From this folder (a git repo is already initialised with a first commit):

```bash
# create an empty repo named casium-world-cup-leaderboard on github.com first, then:
git remote add origin https://github.com/<YOUR_GH_USERNAME>/casium-world-cup-leaderboard.git
git branch -M main
git push -u origin main
```

## 3. Add the API key as a secret

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

- **Name:** `FOOTBALL_DATA_TOKEN`
- **Value:** the token from step 1

## 4. Turn on the schedule and Pages

- **Actions tab:** if prompted, enable workflows. The "Update World Cup scores"
  job runs every 10 minutes; you can also trigger it manually with **Run workflow**
  to confirm it works (watch the log — it prints each team's tally).
- **Settings → Pages:** set **Source = Deploy from a branch**, **Branch = `main` / root**.
  Your board goes live at `https://<YOUR_GH_USERNAME>.github.io/casium-world-cup-leaderboard/`.
  Every time the Action commits a new `data.json`, Pages redeploys automatically.

That's it — the board now tracks the tournament on its own.

---

## Scoring (edit `scoring.config.json`)

| Rule | Default | Notes |
|------|---------|-------|
| Goal | **+3** | base points for any goal your nation scores |
| Clutch timing | **+0 → +3** | extra per goal by minute: 1–45′ +0, 46–75′ +1, 76–90′ +2, 90′+ +3 |
| Win | **+5** | per match won |
| Draw | **+2** | per match drawn |
| Yellow card | **−1** | per booking against your nation |
| Red card | **−3** | per sending-off |
| Clean sheet | **+2** | match where your nation concedes none |
| Knockout win | **+5** | bonus for winning a knockout-round match |

Change any number and the leaderboard re-ranks on the next page load — no code
change, no re-fetch needed. The "How points work" panel on the page reflects
whatever is in the config.

## Running the fetcher locally (optional)

Requires Node 18+ (for global `fetch`):

```bash
FOOTBALL_DATA_TOKEN=your_token node scripts/update-scores.mjs
```

It overwrites `data.json` with the latest stats and prints a per-team summary.

## Manual override

No matches yet, or want to force a value? Edit the numbers in `data.json` directly
(`goals`, `wins`, `yellow`, etc.). Note the Action will overwrite them on its next
run, so only do this when the schedule is paused.

## Notes & limits

- **Not affiliated with FIFA.** football-data.org is a third-party provider; on the
  free tier, per-minute goal data and bookings can occasionally be sparse. When a
  match's event detail is missing, the goal **count** (from the scoreline) is still
  correct — only the timing bonus and card counts for that match may be incomplete.
- **Pause after the cup:** disable the workflow in the Actions tab so it stops
  running on a schedule.

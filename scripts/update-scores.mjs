#!/usr/bin/env node
/**
 * Casium World Cup 2026 — score fetcher
 * ------------------------------------------------------------
 * Pulls FIFA World Cup match data from football-data.org, reduces it to the
 * raw per-team stats our leaderboard needs, and writes them to data.json.
 *
 * It does NOT compute points — the weights live in scoring.config.json and are
 * applied in the browser (index.html), so you can re-tune scoring without
 * re-fetching. This script only reports the facts: goals (+ their minutes),
 * cards, results, clean sheets and knockout wins.
 *
 * Runs in GitHub Actions (see .github/workflows/update-scores.yml). The API key
 * is read from the FOOTBALL_DATA_TOKEN environment variable (a GitHub Secret),
 * so it never appears in the committed site.
 *
 * Run locally:  FOOTBALL_DATA_TOKEN=xxxx node scripts/update-scores.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_PATH = join(ROOT, "data.json");

const API = "https://api.football-data.org/v4";
const COMPETITION = "WC"; // FIFA World Cup
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

/* Our roster, keyed by team code. We match an API team by its three-letter
   code (tla) first, then by any of the name aliases (case-insensitive). */
const TEAMS = {
  arg: { tla: "ARG", aliases: ["argentina"] },
  nor: { tla: "NOR", aliases: ["norway"] },
  usa: { tla: "USA", aliases: ["united states", "usa"] },
  esp: { tla: "ESP", aliases: ["spain"] },
  ecu: { tla: "ECU", aliases: ["ecuador"] },
  cpv: { tla: "CPV", aliases: ["cape verde", "cabo verde"] },
  ger: { tla: "GER", aliases: ["germany"] },
  bra: { tla: "BRA", aliases: ["brazil"] },
  fra: { tla: "FRA", aliases: ["france"] }
};

const KNOCKOUT_STAGES = new Set([
  "LAST_32", "LAST_16", "ROUND_OF_16", "QUARTER_FINALS",
  "SEMI_FINALS", "THIRD_PLACE", "FINAL"
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emptyStats() {
  return { goals: 0, goalMinutes: [], yellow: 0, red: 0, wins: 0, draws: 0, losses: 0, cleanSheets: 0, knockoutWins: 0, played: 0 };
}

/** Which roster code (if any) does this API team correspond to? */
function codeFor(apiTeam) {
  if (!apiTeam) return null;
  const tla = String(apiTeam.tla || "").toUpperCase();
  const name = String(apiTeam.name || "").toLowerCase();
  for (const [code, t] of Object.entries(TEAMS)) {
    if (tla && tla === t.tla) return code;
    if (t.aliases.some((a) => name.includes(a))) return code;
  }
  return null;
}

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { "X-Auth-Token": TOKEN } });
  if (res.status === 429) { // rate limited — back off and retry once
    await sleep(60000);
    return api(path);
  }
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

/** Goal/card minute, including stoppage time (e.g. 90+4 → 94). */
function totalMinute(ev) {
  const base = Number(ev.minute) || 0;
  const extra = Number(ev.injuryTime || ev.extraTime || 0) || 0;
  return base + extra;
}

async function main() {
  if (!TOKEN) throw new Error("FOOTBALL_DATA_TOKEN is not set. Add it as a GitHub Secret (or export it locally).");

  const stats = {};
  for (const code of Object.keys(TEAMS)) stats[code] = emptyStats();

  // 1) One cheap call for the whole fixture list.
  const { matches = [] } = await api(`/competitions/${COMPETITION}/matches`);

  // 2) Keep only matches that involve our teams and have started.
  const relevant = matches.filter((m) => {
    const live = ["IN_PLAY", "PAUSED", "FINISHED"].includes(m.status);
    if (!live) return false;
    return codeFor(m.homeTeam) || codeFor(m.awayTeam);
  });

  let detailCalls = 0;
  for (const m of relevant) {
    const homeCode = codeFor(m.homeTeam);
    const awayCode = codeFor(m.awayTeam);
    const ft = m.score?.fullTime ?? {};
    const ht = m.score?.halfTime ?? {};
    const homeGoals = Number(ft.home ?? ht.home ?? 0) || 0;
    const awayGoals = Number(ft.away ?? ht.away ?? 0) || 0;
    const finished = m.status === "FINISHED";
    const knockout = KNOCKOUT_STAGES.has(String(m.stage || ""));

    // Goal COUNT comes from the authoritative scoreline (always correct).
    if (homeCode) { stats[homeCode].goals += homeGoals; stats[homeCode].played += 1; }
    if (awayCode) { stats[awayCode].goals += awayGoals; stats[awayCode].played += 1; }

    // Results / clean sheets / knockout wins — only once a match is final.
    if (finished) {
      const homeWin = homeGoals > awayGoals, awayWin = awayGoals > homeGoals;
      if (homeCode) {
        if (homeWin) { stats[homeCode].wins++; if (knockout) stats[homeCode].knockoutWins++; }
        else if (awayWin) stats[homeCode].losses++;
        else stats[homeCode].draws++;
        if (awayGoals === 0) stats[homeCode].cleanSheets++;
      }
      if (awayCode) {
        if (awayWin) { stats[awayCode].wins++; if (knockout) stats[awayCode].knockoutWins++; }
        else if (homeWin) stats[awayCode].losses++;
        else stats[awayCode].draws++;
        if (homeGoals === 0) stats[awayCode].cleanSheets++;
      }
    }

    // 3) Per-match detail gives goal minutes + cards. Throttle to respect the
    //    free tier (10 calls/min): ~6.5s between detail calls.
    try {
      if (detailCalls > 0) await sleep(6500);
      detailCalls++;
      const detail = await api(`/matches/${m.id}`);

      for (const g of detail.goals || []) {
        if (String(g.type || "").toUpperCase() === "OWN") continue; // own goals aren't clutch credit
        const code = codeFor(g.team);
        if (code) stats[code].goalMinutes.push(totalMinute(g));
      }
      for (const b of detail.bookings || []) {
        const code = codeFor(b.team);
        if (!code) continue;
        if (String(b.card || "").toUpperCase().includes("RED")) stats[code].red++;
        else stats[code].yellow++;
      }
    } catch (e) {
      // Detail (minutes/cards) may be thin on the free tier — keep the
      // scoreline-derived numbers and move on.
      console.warn(`detail for match ${m.id} unavailable: ${e.message}`);
    }
  }

  const out = {
    updatedAt: new Date().toISOString(),
    source: "football-data.org",
    competition: "FIFA World Cup 2026",
    teams: stats
  };

  // Preserve key order in the file for clean diffs.
  await writeFile(DATA_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote data.json — ${relevant.length} live/finished match(es), ${detailCalls} detail call(s).`);
  for (const [code, s] of Object.entries(stats)) {
    console.log(`  ${code}: ${s.goals}G (${s.goalMinutes.length} timed) ${s.wins}W-${s.draws}D-${s.losses}L  🟨${s.yellow} 🟥${s.red}  CS${s.cleanSheets} KO${s.knockoutWins}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

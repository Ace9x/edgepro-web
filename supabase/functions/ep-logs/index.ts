// EdgePro nightly game-log loader -> public.ep_game_logs (read-only to clients).
// NFL: nflverse stats_player_week (open data, GitHub releases). NHL: NHL stats REST (skater + goalie per-game summaries).
// Idempotent upserts; runs at most once per 6h unless ?force=1 with the cron secret. Called nightly by pg_cron.
import { createClient } from "npm:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const H = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: H });
const UA = { "User-Agent": "EdgePro/1.0 (https://ace9x.github.io/edgepro-web/)" };
function csv(t: string) { const rows: string[][] = []; let r: string[] = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { r.push(f); f = ""; } else if (c === "\n") { r.push(f); rows.push(r); r = []; f = ""; } else if (c !== "\r") f += c; }
  if (f || r.length) { r.push(f); rows.push(r); } return rows; }
const NFL_K = ["completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions", "carries", "rushing_yards", "rushing_tds", "receptions", "targets", "receiving_yards", "receiving_tds", "fantasy_points_ppr"];
async function nfl(season: number) {
  const r = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`, { headers: UA }); if (!r.ok) throw new Error("nflverse " + r.status);
  const [h, ...rows] = csv(await r.text()); const ix = (k: string) => h.indexOf(k);
  return rows.filter(x => x.length > 10 && x[ix("season_type")] !== "").map(x => { const st: Record<string, number> = {}; for (const k of NFL_K) { const v = x[ix(k)]; if (v !== "" && v != null && ix(k) >= 0) st[k] = +v; }
    const gid = x[ix("game_id")], team = x[ix("team")]; return { league: "nfl", player_id: x[ix("player_id")], game_id: gid, player: x[ix("player_display_name")], pos: x[ix("position")], team, opp: x[ix("opponent_team")],
      home: gid ? gid.endsWith("_" + team) : null, game_date: null, season: +x[ix("season")], week: +x[ix("week")], stats: st, src: "nflverse" }; }); }
async function nhl(season: number) { const sid = `${season}${season + 1}`, out: Record<string, unknown>[] = [];
  for (const kind of ["skater", "goalie"]) { const r = await fetch(`https://api.nhle.com/stats/rest/en/${kind}/summary?isAggregate=false&isGame=true&limit=-1&cayenneExp=seasonId=${sid}%20and%20gameTypeId=2`, { headers: UA }); if (!r.ok) throw new Error("NHL stats " + r.status);
    for (const x of (await r.json()).data) out.push({ league: "nhl", player_id: String(x.playerId), game_id: String(x.gameId), player: x.skaterFullName || x.goalieFullName, pos: kind === "goalie" ? "G" : x.positionCode, team: x.teamAbbrev, opp: x.opponentTeamAbbrev, home: x.homeRoad === "H", game_date: x.gameDate, season, week: null,
      stats: kind === "goalie" ? { saves: x.saves, shots_against: x.shotsAgainst, goals_against: x.goalsAgainst, started: x.gamesStarted, toi: x.timeOnIce } : { goals: x.goals, assists: x.assists, points: x.points, shots: x.shots, pp_points: x.ppPoints, pim: x.penaltyMinutes, toi: x.timeOnIcePerGame }, src: "NHL stats API" }); }
  return out; }
Deno.serve(async (req) => {
  const u = new URL(req.url); const { data: last } = await db.rpc("ep_cache_get", { key: "logs:last", max_age: 6 * 3600 });
  if (last && u.searchParams.get("force") !== "1") return out({ skipped: "loaded within 6h", last });
  const now = new Date(), nflS = now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(), nhlS = now.getUTCMonth() < 8 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const res: Record<string, unknown> = {};
  for (const [lg, f] of [["nfl", () => nfl(nflS)], ["nhl", () => nhl(nhlS)]] as const) {
    try { const rows = (await f()).filter(r => r.player_id && r.game_id); for (let i = 0; i < rows.length; i += 1000) { const { error } = await db.from("ep_game_logs").upsert(rows.slice(i, i + 1000)); if (error) throw error; } res[lg] = rows.length; }
    catch (e) { res[lg] = "error: " + (e as Error).message; await db.from("ep_feed_health").insert({ feed: "Game logs", source: lg === "nfl" ? "nflverse" : "NHL stats API", ok: false, err: String((e as Error).message).slice(0, 200) }).then(() => 0, () => 0); } }
  const body = { at: now.toISOString(), ...res }; await db.rpc("ep_cache_put", { key: "logs:last", b: body }); return out(body);
});

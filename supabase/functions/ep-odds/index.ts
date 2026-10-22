// EdgePro cached proxy for The Odds API. Key lives in private.kv (service role only), never in the client.
// Shared cache keeps free-tier credit use low: game odds 30 min per sport, props 60 min per event+market.
import { createClient } from "npm:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };
const SPORTS = new Set(["baseball_mlb","americanfootball_nfl","basketball_nba","icehockey_nhl","basketball_wnba","americanfootball_ncaaf","basketball_ncaab","soccer_epl","soccer_spain_la_liga","soccer_italy_serie_a","soccer_germany_bundesliga","soccer_france_ligue_one","soccer_usa_mls","soccer_uefa_champs_league"]);
const PROPS = /^(player_[a-z_]+|batter_[a-z_]+|pitcher_[a-z_]+)$/;
// per-event period / team-total markets, fixed server-side so a client can't run up credits
const EVENT_MKTS: Record<string, string> = {
  americanfootball_nfl: "h2h_h1,totals_h1,h2h_q1,totals_q1,team_totals", americanfootball_ncaaf: "h2h_h1,totals_h1,team_totals",
  basketball_nba: "h2h_h1,totals_h1,h2h_q1,totals_q1,team_totals", basketball_wnba: "h2h_h1,totals_h1,team_totals", basketball_ncaab: "h2h_h1,totals_h1,team_totals",
  icehockey_nhl: "h2h_p1,totals_p1,team_totals", baseball_mlb: "h2h_1st_5_innings,totals_1st_5_innings,totals_1st_1_innings,team_totals" };
/** daily credit allowance = what's left this month spread over the days left (UTC), minus a 20-credit reserve */
async function allowance(remaining: number) { const now = new Date(), end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1), days = Math.max(1, Math.ceil((end - now.getTime()) / 864e5));
  const day = now.toISOString().slice(0, 10); const { data: sp } = await db.rpc("ep_cache_get", { key: "spent:" + day, max_age: 2 * 86400 });
  return { day, spent: sp?.n || 0, cap: Math.max(0, Math.floor((remaining - 20) / days)) }; }
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: H });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  const u = new URL(req.url), kind = u.searchParams.get("kind"), sport = u.searchParams.get("sport") || "";
  if (!SPORTS.has(sport)) return out({ error: "unsupported sport" }, 400);
  let path = "", age = 1800, ck = "";
  if (kind === "odds") { path = `/v4/sports/${sport}/odds?regions=us&markets=h2h,spreads,totals&oddsFormat=american`; ck = `odds:${sport}`; }
  else if (kind === "props") { const ev = u.searchParams.get("event") || "", m = u.searchParams.get("market") || "";
    if (!/^[a-f0-9]{32}$/.test(ev) || !PROPS.test(m)) return out({ error: "bad event/market" }, 400);
    path = `/v4/sports/${sport}/events/${ev}/odds?regions=us&markets=${m}&oddsFormat=american`; ck = `props:${ev}:${m}`; age = 3600; }
  else if (kind === "event") { const ev = u.searchParams.get("event") || ""; if (!/^[a-f0-9]{32}$/.test(ev) || !EVENT_MKTS[sport]) return out({ error: "bad event/sport" }, 400);
    // only events on today's slate (starting within 18h, from the cached game-odds list)
    const { data: list } = await db.rpc("ep_cache_get", { key: `odds:${sport}`, max_age: 86400 });
    const g = (list?.data || []).find((x: { id: string }) => x.id === ev); const t = g ? new Date(g.commence_time).getTime() - Date.now() : NaN;
    if (!g || t > 18 * 3600e3 || t < -4 * 3600e3) return out({ error: "only today's slate is fetched (keeps within the free credits)", skip: true }, 200);
    path = `/v4/sports/${sport}/events/${ev}/odds?regions=us&markets=${EVENT_MKTS[sport]}&oddsFormat=american`; ck = `event:${ev}`; age = 3 * 3600; }
  else return out({ error: "kind must be odds, props or event" }, 400);
  if (kind === "odds") age = 6 * 3600; // game lines: ESPN is primary; this is the 2nd source, refreshed every 6h
  const { data: hit } = await db.rpc("ep_cache_get", { key: ck, max_age: age });
  if (hit) return out({ ...hit, cached: true });
  const { data: stale } = await db.rpc("ep_cache_get", { key: ck, max_age: 7 * 86400 });
  const { data: quota } = await db.rpc("ep_cache_get", { key: "quota", max_age: 40 * 86400 });
  if (quota && quota.remaining < 40) return out(stale ? { ...stale, cached: true, note: "monthly free credits nearly used; showing last saved odds" } : { error: "monthly free credits nearly used" }, stale ? 200 : 429);
  const al = await allowance(quota?.remaining ?? 500);
  if (al.spent >= al.cap) return out(stale ? { ...stale, cached: true, note: `daily free-credit budget used (${al.spent}/${al.cap}); showing last saved` } : { error: `daily free-credit budget used (${al.spent}/${al.cap})`, budget: al }, stale ? 200 : 429);
  const { data: key } = await db.rpc("ep_odds_key");
  if (!key) return out({ error: "not configured" }, 503);
  const r = await fetch(`https://api.the-odds-api.com${path}&apiKey=${key}`);
  const rem = +(r.headers.get("x-requests-remaining") || 0);
  await db.rpc("ep_cache_put", { key: "quota", b: { remaining: rem, used: +(r.headers.get("x-requests-used") || 0) } });
  await db.rpc("ep_cache_put", { key: "spent:" + al.day, b: { n: al.spent + (+(r.headers.get("x-requests-last") || 1)) } });
  if (!r.ok) return out(stale ? { ...stale, cached: true } : { error: "upstream " + r.status }, stale ? 200 : 502);
  const body = { data: await r.json(), fetched: new Date().toISOString(), remaining: rem, cost: +(r.headers.get("x-requests-last") || 0) };
  await db.rpc("ep_cache_put", { key: ck, b: body });
  return out(body);
});

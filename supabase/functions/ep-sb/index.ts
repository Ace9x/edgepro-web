// EdgePro scoreboard relay: server-side copy of ESPN's public scoreboard JSON, used as the backup where the
// ESPN CDN feed has no league (NHL, soccer) or when the browser can't reach ESPN directly. 60s shared cache.
import { createClient } from "npm:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: H });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  const u0 = new URL(req.url); let gid = u0.searchParams.get("nhlgame"); const nd = u0.searchParams.get("nhldate"), nh = u0.searchParams.get("nhlhome");
  if (!gid && nd && nh && /^\d{4}-\d\d-\d\d$/.test(nd) && /^[A-Z]{2,3}$/.test(nh)) { const sc = await fetch(`https://api-web.nhle.com/v1/score/${nd}`).then(r => r.ok ? r.json() : null).catch(() => null);
    const g = (sc?.games || []).find((x: any) => x.homeTeam?.abbrev === nh); if (!g) return out({ error: "no NHL game for that home team on that date" }, 404); gid = String(g.id); }
  if (gid) { // NHL goalie check: starters from the NHL's own boxscore (posted near puck drop), plus each team's goalies
    if (!/^\d{10}$/.test(gid)) return out({ error: "bad game id" }, 400);
    const ck = `nhlg:${gid}`; const { data: hit } = await db.rpc("ep_cache_get", { key: ck, max_age: 120 }); if (hit) return out({ ...hit, cached: true });
    const [bx, ld] = await Promise.all([fetch(`https://api-web.nhle.com/v1/gamecenter/${gid}/boxscore`).then(r => r.ok ? r.json() : null).catch(() => null), fetch(`https://api-web.nhle.com/v1/gamecenter/${gid}/landing`).then(r => r.ok ? r.json() : null).catch(() => null)]);
    if (!bx && !ld) return out({ error: "NHL API unavailable" }, 502);
    const side = (k: "homeTeam" | "awayTeam") => { const gs = bx?.playerByGameStats?.[k]?.goalies || []; const st = gs.find((g: any) => g.starter); return { abbr: (bx || ld)?.[k]?.abbrev, starter: st ? st.name?.default : null, goalies: (ld?.matchup?.goalieComparison?.[k]?.leaders || []).map((g: any) => g.name?.default) }; };
    const body = { state: (bx || ld)?.gameState, home: side("homeTeam"), away: side("awayTeam"), fetched: new Date().toISOString(), src: "NHL api-web gamecenter" };
    await db.rpc("ep_cache_put", { key: ck, b: body }); return out(body); }
  const u = u0, p = u.searchParams.get("p") || "", dates = u.searchParams.get("dates") || "", groups = u.searchParams.get("groups") || "", limit = u.searchParams.get("limit") || "";
  if (!/^[a-z]+\/[a-z0-9.\-]+$/.test(p) || (dates && !/^\d{8}$/.test(dates)) || (groups && !/^\d{1,3}$/.test(groups)) || (limit && !/^\d{1,3}$/.test(limit))) return out({ error: "bad params" }, 400);
  const qs = new URLSearchParams(); if (dates) qs.set("dates", dates); if (groups) qs.set("groups", groups); if (limit) qs.set("limit", limit);
  const ck = `sb:${p}:${qs}`; const { data: hit } = await db.rpc("ep_cache_get", { key: ck, max_age: 60 }); if (hit) return out({ ...hit, cached: true });
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard${qs.toString() ? "?" + qs : ""}`, { headers: { "User-Agent": "EdgePro/1.0 (+https://ace9x.github.io/edgepro-web/)" } });
  if (!r.ok) { const { data: st } = await db.rpc("ep_cache_get", { key: ck, max_age: 3600 }); return st ? out({ ...st, cached: true }) : out({ error: "upstream " + r.status }, 502); }
  const d = await r.json(); const body = { events: d.events || [], fetched: new Date().toISOString() };
  await db.rpc("ep_cache_put", { key: ck, b: body }); return out(body);
});

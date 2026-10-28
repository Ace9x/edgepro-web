// Live data adapters. All keyless public endpoints, called straight from the browser.
import { parseAm } from './core.js';
import * as F from './feeds.js';
export const LEAGUES = {
  mlb: { n: 'MLB', p: 'baseball/mlb', poly: 'mlb', kalshi: 'KXMLBGAME' },
  nfl: { n: 'NFL', p: 'football/nfl', poly: 'nfl', kalshi: 'KXNFLGAME' },
  nba: { n: 'NBA', p: 'basketball/nba', poly: 'nba', kalshi: 'KXNBAGAME' },
  nhl: { n: 'NHL', p: 'hockey/nhl', poly: 'nhl', kalshi: 'KXNHLGAME' },
  wnba: { n: 'WNBA', p: 'basketball/wnba', poly: 'wnba' },
  ncaaf: { n: 'NCAAF', p: 'football/college-football', q: '&groups=80', poly: 'cfb' },
  ncaab: { n: 'NCAAB', p: 'basketball/mens-college-basketball', q: '&groups=50&limit=300', poly: 'cbb' },
  soccer: { n: 'Soccer', multi: ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'usa.1', 'uefa.champions', 'uefa.europa', 'mex.1'].map(l => 'soccer/' + l), poly: null },
};
const j = async (u, o) => { const r = await fetch(u, o); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };
const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; // user's local calendar day (UTC date was a day ahead every evening in the US)
function side(o, k) { const x = o && o[k]; return x ? { close: parseAm(x.close?.odds), open: parseAm(x.open?.odds), line: x.close?.line != null ? parseFloat(String(x.close.line).replace(/[ou]/, '')) : null, openLine: x.open?.line != null ? parseFloat(String(x.open.line).replace(/[ou]/, '')) : null } : null; }
export function parseEvent(e, lg, path) {
  const c = e.competitions[0], H = c.competitors.find(t => t.homeAway === 'home'), A = c.competitors.find(t => t.homeAway === 'away');
  const team = t => ({ id: t.team.id, abbr: t.team.abbreviation, name: t.team.shortDisplayName || t.team.name, full: t.team.displayName, logo: t.team.logo, score: t.score != null ? +t.score : null, record: t.records?.[0]?.summary, winner: t.winner });
  const o = (c.odds || [])[0]; let odds = null;
  if (o) odds = { provider: o.provider?.name || 'ESPN BET', details: o.details, ml: { home: side(o.moneyline, 'home'), away: side(o.moneyline, 'away'), draw: o.drawOdds ? { close: parseAm(o.drawOdds.moneyLine) } : null },
    spread: { home: side(o.pointSpread, 'home'), away: side(o.pointSpread, 'away') }, total: { line: o.overUnder, over: side(o.total, 'over'), under: side(o.total, 'under') } };
  if (odds && !odds.ml.home?.close && o.homeTeamOdds?.moneyLine) { odds.ml.home = { close: o.homeTeamOdds.moneyLine }; odds.ml.away = { close: o.awayTeamOdds.moneyLine }; }
  return { id: e.id, league: lg, path, name: e.shortName, start: e.date, state: c.status.type.state, detail: c.status.type.shortDetail, completed: c.status.type.completed,
    home: team(H), away: team(A), odds, venue: c.venue ? { name: c.venue.fullName, city: c.venue.address?.city, state: c.venue.address?.state, indoor: c.venue.indoor } : null,
    league_name: e.season?.slug, broadcast: c.broadcasts?.[0]?.names?.[0] };
}
export async function scoreboard(lg, date) {
  const L = LEAGUES[lg]; const paths = L.multi || [L.p]; const dq = date ? '&dates=' + ymd(date) : '';
  // three ESPN hosts with the same public JSON: site API, site.web API, and the CDN core feed (failover in that order)
  const q = `${(L.q || '').replace(/^&/, '')}${dq}`.replace(/^&/, ''), qs = q ? '?' + q : '';
  const src = p => [{ name: 'ESPN site API', run: () => j(`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard${qs}`).then(d => d.events) },
    { name: 'ESPN site.web API', run: () => j(`https://site.web.api.espn.com/apis/site/v2/sports/${p}/scoreboard${qs}`).then(d => d.events) },
    // CDN core feed has no NHL or soccer route (404, checked in a real browser); those leagues skip it
    ...(p.startsWith('soccer') || p === 'hockey/nhl' ? [] : [{ name: 'ESPN CDN feed', run: () => j(`https://cdn.espn.com/core/${p.split('/')[1]}/scoreboard?xhr=1${q ? '&' + q : ''}`).then(d => d.content?.sbData?.events) }]),
    { name: 'EdgePro relay (ESPN, server-side)', run: () => { const u = new URLSearchParams({ p }); for (const [k, v] of new URLSearchParams(q)) if (['dates', 'groups', 'limit'].includes(k)) u.set(k, v); return j(`https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-sb?${u}`).then(d => d.events); } }].map(x => ({ ...x, ok: v => Array.isArray(v) }));
  const res = await Promise.allSettled(paths.map(p => F.pull('Scores', `sb:${p}:${dq}`, src(p)).then(r => ({ r, ev: (r.v || []).map(e => parseEvent(e, lg, p)) }))));
  if (res.every(r => r.status === 'rejected')) throw res[0].reason;
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value); scoreboard.meta = { source: ok[0]?.r.source, at: Math.min(...ok.map(x => x.r.at)), cached: ok.some(x => x.r.cached) };
  return ok.flatMap(x => x.ev).sort((a, b) => a.start.localeCompare(b.start));
}
export const eventFinal = async (path, id) => { const d = await j(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${id}`); const c = d.header.competitions[0]; const H = c.competitors.find(t => t.homeAway === 'home'), A = c.competitors.find(t => t.homeAway === 'away'); return { completed: c.status.type.completed, home: +H.score, away: +A.score }; };
// ---------- Polymarket (gamma API, CORS open) ----------
const polyCache = {};
export async function polyEvents(lg) {
  const tag = LEAGUES[lg].poly; if (!tag) return [];
  if (polyCache[tag] && Date.now() - polyCache[tag].t < 60000) return polyCache[tag].v;
  const r = await F.pull('Polymarket', 'poly:' + tag, [{ name: 'Polymarket Gamma API (games)', run: () => polyGames(tag), ok: v => Array.isArray(v) && v.length > 0 }, { name: 'Polymarket Gamma API (league tag)', run: () => j(`https://gamma-api.polymarket.com/events?tag_slug=${tag}&closed=false&limit=100&order=startDate&ascending=false`), ok: Array.isArray }]);
  const v = r.v; v.fetchedAt = r.at; polyCache[tag] = { t: Date.now(), v }; return v;
}
// game events live under the "games" tag; the league tag alone returns mostly futures (API caps at 100 per page)
async function polyGames(tag) { const iso = d => new Date(d).toISOString().slice(0, 19) + 'Z', out = [];
  for (let off = 0; off < 600; off += 100) { const pg = await j(`https://gamma-api.polymarket.com/events?tag_slug=games&closed=false&limit=100&offset=${off}&end_date_min=${iso(Date.now() - 864e5)}&end_date_max=${iso(Date.now() + 5 * 864e5)}`);
    out.push(...pg.filter(x => x.slug?.startsWith(tag + '-'))); if (pg.length < 100) break; } return out; }
export function matchPoly(ev, list) {
  const ds = [0, 1, -1].map(k => new Date(new Date(ev.start).getTime() + k * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })), endsD = sl => ds.some(d => sl.endsWith(d));
  const hn = ev.home.name.toLowerCase(), an = ev.away.name.toLowerCase();
  const pe = list.find(p => endsD(p.slug) && p.title.toLowerCase().includes(hn) && p.title.toLowerCase().includes(an)) || list.find(p => /-\d{4}-\d\d-\d\d$/.test(p.slug) && endsD(p.slug) && p.slug.includes(ev.home.abbr.toLowerCase()) && p.slug.includes(ev.away.abbr.toLowerCase()));
  if (!pe) return null;
  const out = { slug: pe.slug, volume: pe.volume, totals: [] };
  out.slug = pe.slug;
  out.raw = (pe.markets || []).filter(m => !m.closed && m.sportsMarketType).map(m => ({ t: m.sportsMarketType, q: m.question, g: m.groupItemTitle, line: m.line, outcomes: m.outcomes, prices: m.outcomePrices, bid: +m.bestBid, ask: +m.bestAsk, liq: +m.liquidityNum || 0 }));
  for (const m of pe.markets || []) {
    if (m.closed) continue; let outc, pr; try { outc = JSON.parse(m.outcomes); pr = JSON.parse(m.outcomePrices).map(Number); } catch { continue; }
    const ba = +m.bestAsk, bb = +m.bestBid, ask = i => (i === 0 ? (ba > 0 && ba < 1 ? ba : null) : (bb > 0 && bb < 1 ? +(1 - bb).toFixed(3) : null));
    if (m.sportsMarketType === 'moneyline' && !out.ml) { const ih = outc.findIndex(x => hn.includes(x.toLowerCase()) || x.toLowerCase().includes(hn)); if (ih >= 0) { out.ml = { home: pr[ih], away: pr[1 - ih] }; out.mlAsk = { home: ask(ih), away: ask(1 - ih) }; try { const tk = JSON.parse(m.clobTokenIds); out.mlTok = { home: tk[ih], away: tk[1 - ih] }; } catch { /* no token ids */ } } }
    if (m.sportsMarketType === 'totals') { const L = parseFloat((m.question.match(/O\/U ([\d.]+)/) || [])[1]); if (!isNaN(L)) out.totals.push({ line: L, over: pr[outc.indexOf('Over')], under: pr[outc.indexOf('Under')], overAsk: ask(outc.indexOf('Over')), underAsk: ask(outc.indexOf('Under')) }); }
  }
  return out;
}
/** Polymarket CLOB price history for one outcome token (last 24h, 30-min points): [[unixSec, price], ...] */
export async function polyHistory(tok) { const d = await j(`https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tok)}&interval=1d&fidelity=30`); return (d.history || []).map(x => [x.t, +x.p]).filter(x => x[1] > 0 && x[1] < 1); }
// ---------- Kalshi (public market data; may be blocked by CORS/region — reported honestly) ----------
const kCache = {}; let kBlocked = null, kBlockedAt = 0; // Kalshi sends no CORS headers: after the first network failure, skip the other leagues instead of re-erroring
export async function kalshi(lg) {
  const s = LEAGUES[lg].kalshi; if (!s) return { ok: false, why: 'no Kalshi game series for this league' };
  if (kCache[s]) return kCache[s];
  if (kBlocked && Date.now() - kBlockedAt < 5 * 60e3) return kBlocked; kBlocked = null; // retry after a 5-minute cooldown
  try { const d = await j(`https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-kalshi?series=${s}`); return (kCache[s] = { ok: true, markets: d.markets || [] }); }
  catch (e) { const r = { ok: false, why: 'Kalshi API not reachable from this browser (' + e.message.split(' ')[0] + ')' }; if (e instanceof TypeError) { kBlocked = r; kBlockedAt = Date.now(); } return (kCache[s] = r); }
}
export function matchKalshi(ev, k) {
  if (!k?.ok) return null; const f = t => [t.name, t.full].map(x => x.toLowerCase());
  const pick = t => k.markets.find(m => f(t).some(n => (m.yes_sub_title || '').toLowerCase() && n.includes((m.yes_sub_title || '').toLowerCase())) && (m.title || '').toLowerCase().includes(ev.home.full.split(' ')[0].toLowerCase()));
  const mid = m => (m ? (m.yes_bid && m.yes_ask ? (m.yes_bid + m.yes_ask) / 200 : m.last_price / 100) : null);
  const h = pick(ev.home), a = pick(ev.away); return h || a ? { home: mid(h), away: mid(a), ticker: (h || a).event_ticker } : null;
}
// ---------- Weather: NWS weather.gov primary (via EdgePro server, contact User-Agent), Open-Meteo backup (non-commercial, CC BY 4.0) ----------
export async function weather(ev) {
  if (!ev.venue?.city) return null; if (ev.venue.indoor) return { indoor: true };
  const r = await F.pull('Weather', 'wx:' + ev.id, [{ name: 'NWS weather.gov', run: () => j(`https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-wx?city=${encodeURIComponent(ev.venue.city)}&state=${encodeURIComponent(ev.venue.state || '')}&t=${encodeURIComponent(ev.start)}`), ok: v => v && v.mph != null },
    { name: 'Open-Meteo', run: () => meteo(ev), ok: v => v && v.mph != null }], { retries: 1 }).catch(() => null);
  return r?.v || null;
}
async function meteo(ev) {
  const g = await j(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ev.venue.city)}&count=1`); const p = g.results?.[0]; if (!p) return null;
  const w = await j(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,precipitation_probability&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC&forecast_days=7`);
  const hr = ev.start.slice(0, 13) + ':00'; const i = w.hourly.time.indexOf(hr); if (i < 0) return null;
  return { mph: Math.round(w.hourly.wind_speed_10m[i]), dir: w.hourly.wind_direction_10m[i], temp: Math.round(w.hourly.temperature_2m[i]), rain: w.hourly.precipitation_probability[i], src: 'Open-Meteo', credit: 'Weather data by Open-Meteo.com (CC BY 4.0)' };
}
// ---------- Player game logs (prop hit-rate history) ----------
export const roster = async (path, teamId) => { const d = await j(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/roster`); const a = d.athletes || []; return (a[0]?.items ? a.flatMap(g => g.items) : a).map(x => ({ id: x.id, name: x.fullName, pos: x.position?.abbreviation })); };
// NFL (nflverse) and NHL (NHL stats API) game logs from EdgePro's nightly table; ESPN is the fallback
const SBK = 'sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK';
const LOGDEF = { nfl: [['CMP', 'Completions', 'completions'], ['ATT', 'Passing Attempts', 'attempts'], ['YDS', 'Passing Yards', 'passing_yards'], ['TD', 'Passing Touchdowns', 'passing_tds'], ['INT', 'Interceptions', 'passing_interceptions'], ['CAR', 'Rushing Attempts', 'carries'], ['YDS', 'Rushing Yards', 'rushing_yards'], ['TD', 'Rushing Touchdowns', 'rushing_tds'], ['REC', 'Receptions', 'receptions'], ['TGTS', 'Receiving Targets', 'targets'], ['YDS', 'Receiving Yards', 'receiving_yards'], ['TD', 'Receiving Touchdowns', 'receiving_tds']],
  nhl: [['G', 'Goals', 'goals'], ['A', 'Assists', 'assists'], ['PTS', 'Points', 'points'], ['S', 'Shots', 'shots'], ['PPP', 'Power Play Points', 'pp_points'], ['PIM', 'Penalty Minutes', 'pim']], nhlG: [['SV', 'Saves', 'saves'], ['SA', 'Shots Against', 'shots_against'], ['GA', 'Goals Against', 'goals_against']] };
export async function tableLog(lg, name) { if (!LOGDEF[lg] || !name) return null;
  const u = `https://czjwiudbasqwlwvezmaz.supabase.co/rest/v1/ep_game_logs?league=eq.${lg}&player=ilike.${encodeURIComponent(name.replace(/[%*,()]/g, ''))}&order=game_date.desc.nullslast&limit=120&select=game_id,player,pos,team,opp,home,game_date,season,week,stats,src`;
  const rows = await j(u, { headers: { apikey: SBK, Authorization: 'Bearer ' + SBK } }); if (!rows?.length) return null;
  const def = lg === 'nhl' && rows[0].pos === 'G' ? LOGDEF.nhlG : LOGDEF[lg];
  return { labels: def.map(d => d[0]), names: def.map(d => d[1]), src: rows[0].src, rows: rows.map(r => ({ id: r.game_id, date: r.game_date, opp: r.opp, home: r.home, season: `${r.season} Regular Season`, stats: def.map(d => r.stats[d[2]] == null ? '' : String(r.stats[d[2]])) })) }; }
export async function gamelog(path, id, name) {
  const lg = path === 'football/nfl' ? 'nfl' : path === 'hockey/nhl' ? 'nhl' : null;
  let t = null; if (lg && name) { t = await tableLog(lg, name).catch(() => null); if (t?.rows.length && Date.now() - new Date(t.rows[0].date || 0) < 9 * 864e5) return t; }
  try { const es = await espnLog(path, id); if (!t?.rows.length || (es.rows[0]?.date || '') > (t.rows[0].date || '')) return es; return t; } catch (x) { if (t?.rows.length) return t; throw x; } }
async function espnLog(path, id) {
  const d = await j(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${id}/gamelog`);
  const rows = []; for (const st of d.seasonTypes || []) for (const c of st.categories || []) for (const e of c.events || []) { const meta = d.events?.[e.eventId]; rows.push({ id: e.eventId, date: meta?.gameDate, opp: meta?.opponent?.abbreviation, season: st.displayName, stats: e.stats }); }
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || '')); return { labels: d.labels || [], names: d.displayNames || d.labels, rows, src: 'ESPN' };
}

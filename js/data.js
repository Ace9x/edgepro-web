// Live data adapters. All keyless public endpoints, called straight from the browser.
import { parseAm } from './core.js';
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
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
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
  const res = await Promise.allSettled(paths.map(p => j(`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard?x=1${L.q || ''}${dq}`).then(d => (d.events || []).map(e => parseEvent(e, lg, p)))));
  if (res.every(r => r.status === 'rejected')) throw res[0].reason;
  return res.flatMap(r => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => a.start.localeCompare(b.start));
}
export const eventFinal = async (path, id) => { const d = await j(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${id}`); const c = d.header.competitions[0]; const H = c.competitors.find(t => t.homeAway === 'home'), A = c.competitors.find(t => t.homeAway === 'away'); return { completed: c.status.type.completed, home: +H.score, away: +A.score }; };
// ---------- Polymarket (gamma API, CORS open) ----------
const polyCache = {};
export async function polyEvents(lg) {
  const tag = LEAGUES[lg].poly; if (!tag) return [];
  if (polyCache[tag] && Date.now() - polyCache[tag].t < 60000) return polyCache[tag].v;
  const v = await j(`https://gamma-api.polymarket.com/events?tag_slug=${tag}&closed=false&limit=300`); polyCache[tag] = { t: Date.now(), v }; return v;
}
export function matchPoly(ev, list) {
  const d = new Date(ev.start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const hn = ev.home.name.toLowerCase(), an = ev.away.name.toLowerCase();
  const pe = list.find(p => p.slug.endsWith(d) && p.title.toLowerCase().includes(hn) && p.title.toLowerCase().includes(an)) || list.find(p => /-\d{4}-\d\d-\d\d$/.test(p.slug) && p.slug.endsWith(d) && p.slug.includes(ev.home.abbr.toLowerCase()) && p.slug.includes(ev.away.abbr.toLowerCase()));
  if (!pe) return null;
  const out = { slug: pe.slug, url: 'https://polymarket.com/event/' + pe.slug, volume: pe.volume, totals: [] };
  for (const m of pe.markets || []) {
    if (m.closed) continue; let outc, pr; try { outc = JSON.parse(m.outcomes); pr = JSON.parse(m.outcomePrices).map(Number); } catch { continue; }
    if (m.sportsMarketType === 'moneyline' && !out.ml) { const ih = outc.findIndex(x => hn.includes(x.toLowerCase()) || x.toLowerCase().includes(hn)); if (ih >= 0) out.ml = { home: pr[ih], away: pr[1 - ih] }; }
    if (m.sportsMarketType === 'totals') { const L = parseFloat((m.question.match(/O\/U ([\d.]+)/) || [])[1]); if (!isNaN(L)) out.totals.push({ line: L, over: pr[outc.indexOf('Over')], under: pr[outc.indexOf('Under')] }); }
  }
  return out;
}
// ---------- Kalshi (public market data; may be blocked by CORS/region — reported honestly) ----------
const kCache = {}; let kBlocked = null; // Kalshi sends no CORS headers: after the first network failure, skip the other leagues instead of re-erroring
export async function kalshi(lg) {
  const s = LEAGUES[lg].kalshi; if (!s) return { ok: false, why: 'no Kalshi game series for this league' };
  if (kCache[s]) return kCache[s];
  if (kBlocked) return kBlocked;
  try { const d = await j(`https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${s}&status=open&limit=1000`); return (kCache[s] = { ok: true, markets: d.markets || [] }); }
  catch (e) { const r = { ok: false, why: 'Kalshi API not reachable from this browser (' + e.message.split(' ')[0] + ')' }; if (e instanceof TypeError) kBlocked = r; return (kCache[s] = r); }
}
export function matchKalshi(ev, k) {
  if (!k?.ok) return null; const f = t => [t.name, t.full].map(x => x.toLowerCase());
  const pick = t => k.markets.find(m => f(t).some(n => (m.yes_sub_title || '').toLowerCase() && n.includes((m.yes_sub_title || '').toLowerCase())) && (m.title || '').toLowerCase().includes(ev.home.full.split(' ')[0].toLowerCase()));
  const mid = m => (m ? (m.yes_bid && m.yes_ask ? (m.yes_bid + m.yes_ask) / 200 : m.last_price / 100) : null);
  const h = pick(ev.home), a = pick(ev.away); return h || a ? { home: mid(h), away: mid(a), ticker: (h || a).event_ticker } : null;
}
// ---------- Weather (Open-Meteo) ----------
export async function weather(ev) {
  if (!ev.venue?.city) return null; if (ev.venue.indoor) return { indoor: true };
  const g = await j(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ev.venue.city)}&count=1`); const p = g.results?.[0]; if (!p) return null;
  const w = await j(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,precipitation_probability&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC&forecast_days=7`);
  const hr = ev.start.slice(0, 13) + ':00'; const i = w.hourly.time.indexOf(hr); if (i < 0) return null;
  return { mph: Math.round(w.hourly.wind_speed_10m[i]), dir: w.hourly.wind_direction_10m[i], temp: Math.round(w.hourly.temperature_2m[i]), rain: w.hourly.precipitation_probability[i], src: 'Open-Meteo' };
}
// ---------- Player game logs (prop hit-rate history) ----------
export const roster = async (path, teamId) => { const d = await j(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/roster`); const a = d.athletes || []; return (a[0]?.items ? a.flatMap(g => g.items) : a).map(x => ({ id: x.id, name: x.fullName, pos: x.position?.abbreviation })); };
export async function gamelog(path, id) {
  const d = await j(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${id}/gamelog`);
  const rows = []; for (const st of d.seasonTypes || []) for (const c of st.categories || []) for (const e of c.events || []) { const meta = d.events?.[e.eventId]; rows.push({ id: e.eventId, date: meta?.gameDate, opp: meta?.opponent?.abbreviation, season: st.displayName, stats: e.stats }); }
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || '')); return { labels: d.labels || [], names: d.displayNames || d.labels, rows };
}

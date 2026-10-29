import * as C from './core.js';
// Intel: multi-book odds + prop prices (The Odds API via our cached Supabase proxy — key never in the client),
// ESPN injuries with a transparent injury adjustment, community splits, and bet import (paste / CSV).
import { parseAm } from './core.js';
import * as F from './feeds.js';
const SB = 'https://czjwiudbasqwlwvezmaz.supabase.co', KEY = 'sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK', FN = SB + '/functions/v1/ep-odds';
export const SPORT = { mlb: ['baseball_mlb'], nfl: ['americanfootball_nfl'], nba: ['basketball_nba'], nhl: ['icehockey_nhl'], wnba: ['basketball_wnba'], ncaaf: ['americanfootball_ncaaf'], ncaab: ['basketball_ncaab'],
  soccer: { 'soccer/eng.1': 'soccer_epl', 'soccer/esp.1': 'soccer_spain_la_liga', 'soccer/ita.1': 'soccer_italy_serie_a', 'soccer/ger.1': 'soccer_germany_bundesliga', 'soccer/fra.1': 'soccer_france_ligue_one', 'soccer/usa.1': 'soccer_usa_mls', 'soccer/uefa.champions': 'soccer_uefa_champs_league' } };
export const PROP_MARKETS = { nba: ['player_points', 'player_rebounds', 'player_assists', 'player_threes'], wnba: ['player_points', 'player_rebounds', 'player_assists'], ncaab: ['player_points'],
  nfl: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds', 'player_anytime_td'], ncaaf: ['player_pass_yds', 'player_rush_yds'], mlb: ['batter_hits', 'batter_total_bases', 'pitcher_strikeouts'], nhl: ['player_points', 'player_shots_on_goal'] };
const sportOf = e => (Array.isArray(SPORT[e.league]) ? SPORT[e.league][0] : SPORT[e.league]?.[e.path]);
const mem = {}; const j = async u => { const r = await fetch(u); const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || r.status); return b; };
const cached = (k, f) => (mem[k] ||= f().catch(x => { delete mem[k]; throw x; }));
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export async function books(e) {
  const sp = sportOf(e); if (!sp) return { why: 'The Odds API has no feed for this league.' };
  const pr = await cached('o' + sp, () => F.pull('Odds API', 'odds:' + sp, [{ name: 'The Odds API (via EdgePro server)', run: () => j(`${FN}?kind=odds&sport=${sp}`), ok: v => Array.isArray(v?.data) }])); const r = { ...pr.v, fetched: pr.v.fetched || pr.at, cached: pr.cached };
  const g = (r.data || []).find(x => norm(x.home_team) === norm(e.home.full) && norm(x.away_team) === norm(e.away.full) && Math.abs(new Date(x.commence_time) - new Date(e.start)) < 864e5)
    || (r.data || []).find(x => norm(x.home_team).includes(norm(e.home.name)) && norm(x.away_team).includes(norm(e.away.name)) && Math.abs(new Date(x.commence_time) - new Date(e.start)) < 864e5);
  if (!g) return { why: 'No matching game in the multi-book feed yet.', fetched: r.fetched };
  const rows = g.bookmakers.map(b => { const m = k => b.markets.find(x => x.key === k)?.outcomes || [], o = (k, n) => m(k).find(x => x.name === n);
    return { book: b.title, ml: { away: o('h2h', g.away_team)?.price, home: o('h2h', g.home_team)?.price, draw: o('h2h', 'Draw')?.price },
      sp: { away: o('spreads', g.away_team), home: o('spreads', g.home_team) }, tot: { over: o('totals', 'Over'), under: o('totals', 'Under') }, upd: b.last_update }; });
  return { id: g.id, sport: sp, rows, fetched: r.fetched, cached: r.cached };
}
export async function props(e, oddsId, market) {
  const sp = sportOf(e); const r = await cached(`p${oddsId}${market}`, () => j(`${FN}?kind=props&sport=${sp}&event=${oddsId}&market=${market}`));
  const by = {}; for (const b of r.data?.bookmakers || []) for (const m of b.markets) for (const o of m.outcomes) { const k = o.description + '|' + o.point; const x = by[k] ||= { player: o.description, line: o.point, over: [], under: [] }; (o.name === 'Under' ? x.under : x.over).push({ book: b.title, price: o.price }); }
  // fair over prob: median of each book's own no-vig pair (books quoting both sides of the same line)
  for (const x of Object.values(by)) { const ps = x.over.map(o => { const u = x.under.find(v => v.book === o.book); return u ? C.devig([o.price, u.price], 'multiplicative').probs[0] : null; }).filter(v => v != null); x.fairO = ps.length ? C.median(ps) : null; x.nPair = ps.length; }
  const best = a => a.reduce((m, x) => (m && m.price >= x.price ? m : x), null);
  return { fetched: r.fetched, rows: Object.values(by).map(x => ({ ...x, bestO: best(x.over), bestU: best(x.under) })).sort((a, b) => a.player.localeCompare(b.player) || a.line - b.line) };
}
/** period + team-total prices for one event (Odds API per-event markets; server caches 3h and enforces a daily credit budget) */
const EVENT_SPORTS = new Set(['americanfootball_nfl', 'basketball_nba', 'icehockey_nhl', 'baseball_mlb', 'americanfootball_ncaaf', 'basketball_ncaab', 'basketball_wnba']); // must match EVENT_MKTS in ep-odds
export async function eventMarkets(e, oddsId) { const sp = sportOf(e); if (!sp || !oddsId || !EVENT_SPORTS.has(sp)) return null;
  const pr = await cached('ev' + oddsId, () => F.pull('Odds API (periods)', 'ev:' + oddsId, [{ name: 'The Odds API per-event (via EdgePro server)', run: () => j(`${FN}?kind=event&sport=${sp}&event=${oddsId}`).then(r => { if (r.skip || r.error) { const x = new Error(r.error || 'skipped'); x.soft = true; throw x; } return r; }), ok: r => Array.isArray(r?.data?.bookmakers) }], { retries: 0 }));
  return { books: pr.v.data.bookmakers, fetched: pr.v.fetched || pr.at, note: pr.v.note }; }
/** Polymarket player-prop markets for a game (liquid ones only: ≥$500 liquidity and ≤6¢ spread) keyed "player|line" → over mid/ask */
export async function polyProps(slug) { if (!slug) return {}; const ev = (await j(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug + '-player-props')}`).catch(() => []))[0]; const out = {};
  for (const m of ev?.markets || []) { if (m.closed || +m.liquidityNum < 500 || !(m.bestAsk > 0 && m.bestBid > 0) || m.bestAsk - m.bestBid > 0.06) continue; const q = String(m.question).match(/^(.+?):\s*(.+?)\s+O\/U\s+([\d.]+)/); if (!q) continue;
    out[q[1].toLowerCase() + '|' + (+q[3])] = { stat: q[2], mid: (+m.bestBid + +m.bestAsk) / 2, ask: +m.bestAsk, askU: +(1 - m.bestBid).toFixed(3) }; } return out; }
// ---------- injuries (ESPN game summary: same feed as espn.com injury reports) ----------
const W = { Out: 1, 'Injured Reserve': 1, Suspension: 1, Doubtful: 0.75, Questionable: 0.3, 'Day-To-Day': 0.3, Probable: 0.05 };
const IMPACT = { nba: 0.03, wnba: 0.03, ncaab: 0.02, nfl: 0.02, ncaaf: 0.015, nhl: 0.015, mlb: 0.01, soccer: 0.015 };
// ---------- second, independent injury source ----------
// NBA/NFL: Sleeper public players API (free, CORS open). MLB: MLB StatsAPI injured list. NHL/others: ESPN core API team injuries (separate ESPN service).
const norm2 = n => String(n || '').toLowerCase().replace(/[^a-z]/g, '');
const sleeperMem = {};
export async function injuries2(e) {
  const lg = e.league, sides = ['home', 'away'];
  if (lg === 'nba' || lg === 'nfl') { const r = await (sleeperMem[lg] ||= F.pull('Injuries (2nd source)', 'sleeper:' + lg, [{ name: 'Sleeper API', run: () => j(`https://api.sleeper.app/v1/players/${lg}`).then(d => Object.values(d).filter(p => p.injury_status && p.team).map(p => ({ n: p.full_name || (p.first_name + ' ' + p.last_name), t: p.team, s: p.injury_status }))), ok: Array.isArray }], { cache: false }).catch(x => { delete sleeperMem[lg]; throw x; }));
    const fix = { WSH: 'WAS', GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', PHX: 'PHO' }, ab = a => [a, fix[a], Object.keys(fix).find(k => fix[k] === a)].filter(Boolean);
    const out = {}; sides.forEach(sd => (out[sd] = r.v.filter(p => ab(e[sd].abbr).includes(p.t)).map(p => ({ name: p.n, status: p.s })))); return { ...out, src: 'Sleeper API', at: r.at }; }
  if (lg === 'mlb') { const out = {}; const t = await j(`https://statsapi.mlb.com/api/v1/teams?sportId=1`); for (const sd of sides) { const tm = t.teams.find(x => norm2(x.name).includes(norm2(e[sd].name)) || x.abbreviation === e[sd].abbr);
      if (!tm) { out[sd] = []; continue; } const r = await F.pull('Injuries (2nd source)', 'mlbil:' + tm.id, [{ name: 'MLB StatsAPI', run: () => j(`https://statsapi.mlb.com/api/v1/teams/${tm.id}/roster?rosterType=40Man`).then(d => d.roster.filter(p => /injur|IL/i.test(p.status?.description || '')).map(p => ({ name: p.person.fullName, status: p.status.description }))), ok: Array.isArray }]); out[sd] = r.v; out.at = r.at; }
    return { home: out.home, away: out.away, src: 'MLB StatsAPI 40-man', at: out.at || Date.now() }; }
  const sp = e.path.split('/'), out = {}; let at = Date.now();
  for (const sd of sides) { const r = await F.pull('Injuries (2nd source)', 'core:' + e[sd].id, [{ name: 'ESPN core API', run: async () => { const d = await j(`https://sports.core.api.espn.com/v2/sports/${sp[0]}/leagues/${sp[1]}/teams/${e[sd].id}/injuries?limit=50`);
      return Promise.all((d.items || []).slice(0, 25).map(x => j(x.$ref.replace('http:', 'https:')).then(i => j(i.athlete.$ref.replace('http:', 'https:')).then(a => ({ name: a.displayName, status: i.status }))).catch(() => null))).then(l => l.filter(Boolean)); }, ok: Array.isArray }]); out[sd] = r.v; at = r.at; }
  return { ...out, src: 'ESPN core API (team injuries)', at }; }
/** cross-check: players both sources list, and ones only one lists */
export function crossCheck(a, b) { const res = {}; for (const sd of ['home', 'away']) { const A = (a?.[sd] || []), B = (b?.[sd] || []), nb = new Set(B.map(x => norm2(x.name)));
  res[sd] = { both: A.filter(x => nb.has(norm2(x.name))).length, onlyA: A.filter(x => !nb.has(norm2(x.name))).map(x => x.name), onlyB: B.filter(x => !new Set(A.map(y => norm2(y.name))).has(norm2(x.name))).map(x => x.name) }; } return res; }
export async function injuries(e) {
  const pr = await cached('s' + e.id, () => F.pull('Injuries', 'sum:' + e.id, [{ name: 'ESPN summary', run: () => j(`https://site.api.espn.com/apis/site/v2/sports/${e.path}/summary?event=${e.id}`) }, { name: 'ESPN summary (site.web)', run: () => j(`https://site.web.api.espn.com/apis/site/v2/sports/${e.path}/summary?event=${e.id}`) }])); const d = pr.v;
  const key = new Set((d.leaders || []).flatMap(t => (t.leaders || []).flatMap(c => (c.leaders || []).map(x => x.athlete?.id))));
  const team = {}; let shift = 0; const per = IMPACT[e.league] || 0.015;
  for (const t of d.injuries || []) { const side = t.team?.id === e.home.id ? 'home' : t.team?.id === e.away.id ? 'away' : null; if (!side) continue;
    team[side] = (t.injuries || []).map(i => { const st = i.status || i.type?.description || ''; const w = W[st] ?? 0.3, isKey = key.has(i.athlete?.id);
      const imp = isKey ? per * w : per * w * 0.2; shift += side === 'home' ? -imp : imp;
      return { id: i.athlete?.id, name: i.athlete?.displayName, pos: i.athlete?.position?.abbreviation, status: st, detail: i.details?.type || i.shortComment || '', key: isKey, imp }; }); }
  shift = Math.max(-0.12, Math.min(0.12, shift));
  return { home: team.home || [], away: team.away || [], shift, src: pr.source, at: pr.at, cached: pr.cached };
}
// ---------- community splits (anonymous EdgePro tracked bets; no personal data) ----------
const dev = () => localStorage.ep_dev ||= (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
export function reportTicket(b) { if (localStorage.ep_splitshare !== '1' || !b.eventId || !['ml', 'spread', 'total'].includes(b.market)) return;
  const sent = JSON.parse(localStorage.ep_splitsent || '[]'), k = b.eventId + '|' + b.market; if (sent.includes(k)) return; localStorage.ep_splitsent = JSON.stringify([...sent, k].slice(-500));
  fetch(`${SB}/rest/v1/edgepro_tickets`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ device: dev(), event_id: String(b.eventId), market: b.market, side: b.side, stake: 1 }) }).catch(() => {}); }
export async function splits(ids) { if (!ids.length) return {}; const r = await fetch(`${SB}/rest/v1/rpc/edgepro_splits`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); if (!r.ok) throw new Error(r.status);
  const o = {}; for (const x of await r.json()) { const m = ((o[x.event_id] ||= {})[x.market] ||= {}); m[x.side] = { t: +x.tickets, m: +x.money }; } return o; }
// ---------- bet import ----------
function csvRows(t) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; } if (f || row.length) { row.push(f); rows.push(row); } return rows.filter(r => r.some(x => x.trim())); }
const res = s => { s = (s || '').toLowerCase(); return /won|win|^w$/.test(s) ? 'win' : /lost|loss|lose|^l$/.test(s) ? 'loss' : /push|void|refund|cancel/.test(s) ? 'push' : null; };
const EP_COLS = ['placed', 'start', 'game', 'league', 'label', 'price', 'stake', 'book', 'closePrice', 'clv', 'result', 'profit', 'final', 'settledAt'];
const EP_NUM = new Set(['price', 'stake', 'closePrice', 'clv', 'profit', 'line']);
/** EdgePro's own CSV export, read back column for column */
function parseEdgePro(rows) { const h = rows[0].map(x => x.trim()); return rows.slice(1).filter(r => r.some(x => x !== '')).map(r => { const b = {}; h.forEach((k, i) => { const v = r[i]; if (v === '' || v == null) return; b[k] = EP_NUM.has(k) ? +v : k === 'final' ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v; }); b.edgepro = true; return b; }).filter(b => b.label && b.price != null && !isNaN(b.price)); }
export function parseCSV(t) {
  const rows = csvRows(t); if (rows.length < 2) return []; if (EP_COLS.every((c, i) => rows[0][i]?.trim() === c)) return parseEdgePro(rows); const h = rows[0].map(x => x.trim().toLowerCase());
  const col = (...ns) => h.findIndex(x => ns.some(n => x === n || x.includes(n)));
  const ci = { date: col('placed', 'date', 'time'), sel: col('label', 'selection', 'pick', 'bet', 'description', 'name'), game: col('game', 'event', 'matchup'), odds: col('odds', 'price', 'american'), stake: col('stake', 'risk', 'wager', 'amount'), book: col('book', 'sportsbook', 'site'), res: col('result', 'status', 'outcome'), profit: col('profit', 'net', 'p/l', 'pnl'), league: h.findIndex(x => x === 'league' || x === 'sport') };
  return rows.slice(1).map(r => { const g = k => (ci[k] >= 0 ? (r[ci[k]] || '').trim() : ''); let price = /^\d{1,2}\.\d+$/.test(g('odds')) ? null : parseAm(g('odds')); if (!price && /^\d+\.\d+$/.test(g('odds'))) { const d = +g('odds'); price = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)); }
    const result = res(g('res')), stake = 1, pf = NaN; // flat scoring: amounts in the file are ignored
    return { label: g('sel') || g('game') || 'Imported bet', game: g('game') || g('sel'), price, stake, book: g('book'), league: g('league').toLowerCase(), placed: g('date') && !isNaN(new Date(g('date'))) ? new Date(g('date')).toISOString() : new Date().toISOString(), result, profit: result ? (isNaN(pf) ? null : pf) : undefined }; }).filter(b => b.price);
}
// Parse pasted bet-slip / confirmation-email text. Splits on blank lines or "Bet ID"/"Ticket" markers; needs an American price in each chunk.
export function parseSlip(t) {
  const chunks = t.replace(/\r/g, '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const out = []; for (const c of chunks) { const pm = c.match(/(?:^|[\s(@])([+-]\d{3,4})(?![\d.])/); if (!pm) continue; const price = parseAm(pm[1]);
    const stake = 1; // flat scoring: slip amounts are ignored
    const book = (c.match(/\b(DraftKings|FanDuel|BetMGM|Caesars|ESPN ?BET|BetRivers|Fanatics|bet365|Hard Rock|PointsBet|BetOnline|Bovada)\b/i) || [])[1] || '';
    const game = (c.match(/([A-Z][\w .'&-]{1,30}\s(?:@|vs\.?|at)\s[A-Z][\w .'&-]{1,30})/) || [])[1]?.trim() || '';
    const lines = c.split('\n').map(s => s.trim()).filter(s => s && !/wager|stake|risk|payout|to win|bet id|ticket|placed|odds/i.test(s));
    const label = (lines.find(s => s.includes(pm[1])) || lines[0] || 'Imported bet').replace(pm[1], '').replace(/\s{2,}/g, ' ').trim().slice(0, 80);
    out.push({ label: label || 'Imported bet', game: game || label, price, stake, book, result: res((c.match(/\b(won|lost|push|void|loss)\b/i) || [])[1]), placed: new Date().toISOString() }); }
  return out;
}

// Intel: multi-book odds + prop prices (The Odds API via our cached Supabase proxy — key never in the client),
// ESPN injuries with a transparent injury adjustment, community splits, and bet import (paste / CSV).
import { parseAm } from './core.js';
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
  const r = await cached('o' + sp, () => j(`${FN}?kind=odds&sport=${sp}`));
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
  const best = a => a.reduce((m, x) => (m && m.price >= x.price ? m : x), null);
  return { fetched: r.fetched, rows: Object.values(by).map(x => ({ ...x, bestO: best(x.over), bestU: best(x.under) })).sort((a, b) => a.player.localeCompare(b.player) || a.line - b.line) };
}
// ---------- injuries (ESPN game summary: same feed as espn.com injury reports) ----------
const W = { Out: 1, 'Injured Reserve': 1, Suspension: 1, Doubtful: 0.75, Questionable: 0.3, 'Day-To-Day': 0.3, Probable: 0.05 };
const IMPACT = { nba: 0.03, wnba: 0.03, ncaab: 0.02, nfl: 0.02, ncaaf: 0.015, nhl: 0.015, mlb: 0.01, soccer: 0.015 };
export async function injuries(e) {
  const d = await cached('s' + e.id, () => j(`https://site.api.espn.com/apis/site/v2/sports/${e.path}/summary?event=${e.id}`));
  const key = new Set((d.leaders || []).flatMap(t => (t.leaders || []).flatMap(c => (c.leaders || []).map(x => x.athlete?.id))));
  const team = {}; let shift = 0; const per = IMPACT[e.league] || 0.015;
  for (const t of d.injuries || []) { const side = t.team?.id === e.home.id ? 'home' : t.team?.id === e.away.id ? 'away' : null; if (!side) continue;
    team[side] = (t.injuries || []).map(i => { const st = i.status || i.type?.description || ''; const w = W[st] ?? 0.3, isKey = key.has(i.athlete?.id);
      const imp = isKey ? per * w : per * w * 0.2; shift += side === 'home' ? -imp : imp;
      return { id: i.athlete?.id, name: i.athlete?.displayName, pos: i.athlete?.position?.abbreviation, status: st, detail: i.details?.type || i.shortComment || '', key: isKey, imp }; }); }
  shift = Math.max(-0.12, Math.min(0.12, shift));
  return { home: team.home || [], away: team.away || [], shift, src: 'ESPN injury report (game summary)' };
}
// ---------- community splits (anonymous EdgePro tracked bets; no personal data) ----------
const dev = () => localStorage.ep_dev ||= (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
export function reportTicket(b) { if (localStorage.ep_splitshare === '0' || !b.eventId || !['ml', 'spread', 'total'].includes(b.market)) return;
  fetch(`${SB}/rest/v1/edgepro_tickets`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=ignore-duplicates' }, body: JSON.stringify({ device: dev(), event_id: String(b.eventId), market: b.market, side: b.side, stake: Math.min(1000, Math.max(0.01, +b.stake || 1)) }) }).catch(() => {}); }
export async function splits(ids) { if (!ids.length) return {}; const r = await fetch(`${SB}/rest/v1/rpc/edgepro_splits`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); if (!r.ok) throw new Error(r.status);
  const o = {}; for (const x of await r.json()) { const m = ((o[x.event_id] ||= {})[x.market] ||= {}); m[x.side] = { t: +x.tickets, m: +x.money }; } return o; }
// ---------- bet import ----------
function csvRows(t) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; } if (f || row.length) { row.push(f); rows.push(row); } return rows.filter(r => r.some(x => x.trim())); }
const res = s => { s = (s || '').toLowerCase(); return /won|win|^w$/.test(s) ? 'win' : /lost|loss|lose|^l$/.test(s) ? 'loss' : /push|void|refund|cancel/.test(s) ? 'push' : null; };
export function parseCSV(t) {
  const rows = csvRows(t); if (rows.length < 2) return []; const h = rows[0].map(x => x.trim().toLowerCase());
  const col = (...ns) => h.findIndex(x => ns.some(n => x === n || x.includes(n)));
  const ci = { date: col('placed', 'date', 'time'), sel: col('label', 'selection', 'pick', 'bet', 'description', 'name'), game: col('game', 'event', 'matchup'), odds: col('odds', 'price', 'american'), stake: col('stake', 'risk', 'wager', 'amount'), book: col('book', 'sportsbook', 'site'), res: col('result', 'status', 'outcome'), profit: col('profit', 'net', 'p/l', 'pnl'), league: h.findIndex(x => x === 'league' || x === 'sport') };
  return rows.slice(1).map(r => { const g = k => (ci[k] >= 0 ? (r[ci[k]] || '').trim() : ''); let price = /^\d{1,2}\.\d+$/.test(g('odds')) ? null : parseAm(g('odds')); if (!price && /^\d+\.\d+$/.test(g('odds'))) { const d = +g('odds'); price = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)); }
    const result = res(g('res')), stake = parseFloat(g('stake').replace(/[$,]/g, '')) || 1, pf = parseFloat(g('profit').replace(/[$,]/g, ''));
    return { label: g('sel') || g('game') || 'Imported bet', game: g('game') || g('sel'), price, stake, book: g('book'), league: g('league').toLowerCase(), placed: g('date') && !isNaN(new Date(g('date'))) ? new Date(g('date')).toISOString() : new Date().toISOString(), result, profit: result ? (isNaN(pf) ? null : pf) : undefined }; }).filter(b => b.price);
}
// Parse pasted bet-slip / confirmation-email text. Splits on blank lines or "Bet ID"/"Ticket" markers; needs an American price in each chunk.
export function parseSlip(t) {
  const chunks = t.replace(/\r/g, '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const out = []; for (const c of chunks) { const pm = c.match(/(?:^|[\s(@])([+-]\d{3,4})(?![\d.])/); if (!pm) continue; const price = parseAm(pm[1]);
    const stake = parseFloat((c.match(/(?:wager|stake|risk|bet amount|amount)\s*:?\s*\$?\s*([\d,]+(?:\.\d+)?)/i) || c.match(/\$\s*([\d,]+(?:\.\d+)?)/) || [])[1]?.replace(/,/g, '')) || 1;
    const book = (c.match(/\b(DraftKings|FanDuel|BetMGM|Caesars|ESPN ?BET|BetRivers|Fanatics|bet365|Hard Rock|PointsBet|BetOnline|Bovada)\b/i) || [])[1] || '';
    const game = (c.match(/([A-Z][\w .'&-]{1,30}\s(?:@|vs\.?|at)\s[A-Z][\w .'&-]{1,30})/) || [])[1]?.trim() || '';
    const lines = c.split('\n').map(s => s.trim()).filter(s => s && !/wager|stake|risk|payout|to win|bet id|ticket|placed|odds/i.test(s));
    const label = (lines.find(s => s.includes(pm[1])) || lines[0] || 'Imported bet').replace(pm[1], '').replace(/\s{2,}/g, ' ').trim().slice(0, 80);
    out.push({ label: label || 'Imported bet', game: game || label, price, stake, book, result: res((c.match(/\b(won|lost|push|void|loss)\b/i) || [])[1]), placed: new Date().toISOString() }); }
  return out;
}

// Trend tracker: last 5 / last 10 for game total, team total, and first period (1Q / 1P / 1H / 1st inning) from ESPN linescores.
import { teamSchedule } from './ask.js';
const S = 'https://site.api.espn.com/apis/site/v2/sports';
const etDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
const sbCache = {};
async function board(path, day) { const k = path + day; return (sbCache[k] ||= fetch(`${S}/${path}/scoreboard?dates=${day}&limit=300`).then(r => (r.ok ? r.json() : { events: [] })).catch(() => ({ events: [] }))); }
export const PERIOD = { mlb: ['1st inning', 1], nhl: ['1st period', 1], nba: ['1st quarter', 1], wnba: ['1st quarter', 1], ncaab: ['1st half', 1], nfl: ['1st half', 2], ncaaf: ['1st half', 2] };
/** returns rows newest first: {date, opp, home, pf, pa, p1f, p1a} */
export async function teamGames(path, teamId, league, n = 10) {
  let gs = await teamSchedule(path, teamId); if (gs.length < n && gs.year) gs = [...gs, ...(await teamSchedule(path, teamId, gs.year - 1).catch(() => []))];
  gs = gs.slice(0, n); const per = PERIOD[league]?.[1] || 1;
  await Promise.all(gs.map(async g => { const b = await board(path, etDay(g.date)); const e = (b.events || []).find(x => x.id === g.id); const c = e?.competitions?.[0]; if (!c) return;
    const me = c.competitors.find(t => t.team?.id == teamId || t.id == teamId), op = c.competitors.find(t => t !== me);
    const sum = t => (t?.linescores || []).slice(0, per).reduce((x, l) => x + (+l.value || 0), 0); if (me?.linescores?.length >= per) { g.p1f = sum(me); g.p1a = sum(op); } }));
  return gs;
}
/** rate of games over a line for a numeric accessor, for last 5 and last 10 */
export function rate(gs, f, line) { const out = {}; for (const n of [5, 10]) { const s = gs.slice(0, n).map(f).filter(v => v != null && !isNaN(v)); out['l' + n] = s.length ? { n: s.length, avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2), over: line == null ? null : s.filter(v => v > line).length } : null; } return out; }

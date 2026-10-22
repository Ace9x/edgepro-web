// "Ask" — natural-language stat search answered only from free ESPN endpoints (StatMuse has no public API; nothing is scraped).
const W = 'https://site.web.api.espn.com/apis', S = 'https://site.api.espn.com/apis/site/v2/sports';
export const LG = { 46: ['basketball/nba', 'NBA'], 28: ['football/nfl', 'NFL'], 10: ['baseball/mlb', 'MLB'], 90: ['hockey/nhl', 'NHL'], 59: ['basketball/wnba', 'WNBA'], 23: ['football/college-football', 'NCAAF'], 41: ['basketball/mens-college-basketball', 'NCAAB'] };
const j = async u => { const r = await fetch(u); if (!r.ok) throw new Error('ESPN ' + r.status); return r.json(); };
// stat words → ESPN game-log labels (first label found in the log wins)
const STAT = [
  [/\b(points?|pts|scor\w*)\b/, ['PTS']], [/\b(rebounds?|reb|boards)\b/, ['REB']], [/\b(assists?|ast|dimes)\b/, ['AST', 'A']],
  [/\b(threes?|3s|3pm|3-pointers?|three pointers?)\b/, ['3PT']], [/\b(steals?)\b/, ['STL']], [/\b(blocks?)\b/, ['BLK']], [/\b(turnovers?)\b/, ['TO']],
  [/\b(home runs?|hrs?|homers?)\b/, ['HR']], [/\b(hits)\b/, ['H']], [/\b(rbis?)\b/, ['RBI']], [/\b(strikeouts?|ks?)\b/, ['K', 'SO']], [/\b(walks)\b/, ['BB']],
  [/\b(goals?)\b/, ['G']], [/\b(shots?( on goal)?|sog)\b/, ['S', 'SOG']], [/\b(saves)\b/, ['SV']],
  [/\b(passing yards?|pass yds)\b/, ['YDS@passing']], [/\b(rushing yards?|rush yds)\b/, ['YDS@rushing']], [/\b(receiving yards?|rec yds)\b/, ['YDS@receiving']],
  [/\b(receptions?|catches)\b/, ['REC']], [/\b(touchdowns?|tds?)\b/, ['TD']], [/\b(yards?|yds)\b/, ['YDS']], [/\b(minutes|mins)\b/, ['MIN']],
];
export function parse(q) {
  const s = ' ' + q.toLowerCase().replace(/[?!,]|\.(?!\d)/g, ' ') + ' ';
  const n = +(s.match(/\b(?:last|past|l)\s*(\d{1,2})\b/)?.[1] || 0) || null;
  const line = s.match(/\b(?:over|above|more than|at least|o)\s*(\d+(?:\.\d+)?)\b/); const under = s.match(/\b(?:under|below|less than|u)\s*(\d+(?:\.\d+)?)\b/);
  const where = /\bat home\b|\bhome games?\b/.test(s) ? 'home' : /\bon the road\b|\baway\b|\broad\b/.test(s) ? 'road' : null;
  const stat = STAT.find(([re]) => re.test(s));
  const isRecord = /\brecord\b|\bwins?\b|\blosses\b|\bw-l\b/.test(s);
  let name = s.replace(/\b(?:last|past|l)\s*\d{1,2}\b|\b(?:over|above|under|below|more than|less than|at least)\s*\d+(?:\.\d+)?\b/g, ' ');
  if (stat) name = name.replace(stat[0], ' ');
  name = name.replace(/\b(what|whats|what's|is|are|the|how|many|much|did|does|has|have|in|his|her|their|per|game|games|this|season|record|at|home|on|road|away|average|avg|vs|versus|stats?|log|for|of|show|me|wins?|losses|a|w-l|played|score[ds]?)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, n, stat: stat ? stat[1] : null, line: line ? +line[1] : under ? +under[1] : null, side: under ? 'under' : line ? 'over' : null, where, isRecord };
}
export async function search(name) {
  const d = await j(`${W}/search/v2?query=${encodeURIComponent(name)}&limit=6`);
  const pick = t => (d.results.find(r => r.type === t)?.contents || []).map(c => { const m = c.uid?.match(/l:(\d+)~(?:a|t):(\d+)/); return m && LG[m[1]] ? { type: t, id: m[2], lg: LG[m[1]], name: c.displayName, sub: c.subtitle || c.description || '' } : null; }).filter(Boolean);
  return { players: pick('player'), teams: pick('team') };
}
const seasonsOf = d => (d.filters?.find(f => f.name === 'season')?.options || []).map(o => o.value);
export async function playerLog(path, id, need = 5) {
  let d = await j(`${W}/common/v3/sports/${path}/athletes/${id}/gamelog`);
  const rows = rowsOf(d); if (rows.length < need) { const cur = d.filters?.find(f => f.name === 'season')?.value; const prev = seasonsOf(d).find(v => +v < +cur); if (prev) { const p = await j(`${W}/common/v3/sports/${path}/athletes/${id}/gamelog?season=${prev}`).catch(() => null); if (p) { rows.push(...rowsOf(p)); d.labels = d.labels?.length ? d.labels : p.labels; d.names = d.names?.length ? d.names : p.names; } } }
  return { labels: d.labels || [], names: d.names || [], rows };
  function rowsOf(d) { const out = []; for (const st of d.seasonTypes || []) { if (/preseason/i.test(st.displayName)) continue; for (const c of st.categories || []) for (const e of c.events || []) { const ev = d.events?.[e.eventId]; if (ev) out.push({ id: e.eventId, date: ev.gameDate, opp: ev.opponent?.abbreviation, at: ev.atVs, res: ev.gameResult, stats: e.stats, season: st.displayName }); } }
    return out.sort((a, b) => new Date(b.date) - new Date(a.date)); }
}
export async function teamSchedule(path, id, season) {
  const q = season ? `&season=${season}` : '';
  const ds = await Promise.all([2, 3].map(t => j(`${S}/${path}/teams/${id}/schedule?seasontype=${t}${q}`).catch(() => ({ events: [] }))));
  const seen = new Set(); const evs = ds.flatMap(d => d.events || []).filter(e => !seen.has(e.id) && seen.add(e.id)); const yr = ds[0].requestedSeason?.year || ds[0].season?.year;
  return Object.assign(evs.map(e => { const c = e.competitions[0], me = c.competitors.find(t => t.team.id == id), op = c.competitors.find(t => t.team.id != id); return { id: e.id, date: e.date, done: c.status.type.completed, home: me?.homeAway === 'home', opp: op?.team.abbreviation, pf: +(me?.score?.value ?? me?.score), pa: +(op?.score?.value ?? op?.score), win: me?.winner }; }).filter(g => g.done).sort((a, b) => new Date(b.date) - new Date(a.date)), { year: yr });
}
const num = v => { if (v == null) return NaN; const m = String(v).match(/^(\d+)-\d+$/); return m ? +m[1] : parseFloat(v); };
/** Answer a question. Returns { kind, title, value, sub, series:[{x,v,label}], line, src, rows } or { error } */
export async function answer(q) {
  const p = parse(q); if (!p.name) return { error: 'Name a player or team, e.g. "Mitchell points last 5" or "Jets record at home".' };
  const r = await search(p.name); const wantTeam = !p.stat;
  let hit = wantTeam ? r.teams[0] || r.players[0] : r.players[0] || r.teams[0];
  if (!hit) return { error: `No ESPN player or team matched "${p.name}". Try a full name.` };
  const [path, lgName] = hit.lg;
  if (hit.type === 'team') {
    let gs = await teamSchedule(path, hit.id); let note = '';
    if (p.n && gs.length < p.n && gs.year) { const prev = await teamSchedule(path, hit.id, gs.year - 1).catch(() => []); if (prev.length) { note = ` · includes last season`; gs = [...gs, ...prev]; } }
    if (p.where) gs = gs.filter(g => (p.where === 'home') === g.home); const all = gs.length; if (p.n) gs = gs.slice(0, p.n);
    if (!gs.length) return { error: `${hit.name} have no completed ${p.where ? p.where + ' ' : ''}games this season yet.` };
    const w = gs.filter(g => g.win).length, l = gs.length - w - gs.filter(g => g.pf === g.pa).length, t = gs.length - w - l;
    const avg = k => (gs.reduce((x, g) => x + g[k], 0) / gs.length).toFixed(1);
    return { kind: 'team', title: `${hit.name} ${p.where ? (p.where === 'home' ? 'at home' : 'on the road') : ''} ${p.n ? `· last ${gs.length}` : '· this season'}`.replace(/\s+/g, ' '), value: `${w}-${l}${t ? '-' + t : ''}`, sub: `Avg score ${avg('pf')}–${avg('pa')} · ${gs.length} of ${all} completed games${note}`, league: lgName,
      series: gs.slice(0, 20).reverse().map(g => ({ x: g.date, v: g.pf - g.pa, label: `${g.home ? 'vs' : '@'} ${g.opp} ${g.pf}-${g.pa}` })), diverge: true,
      rows: gs.slice(0, 10).map(g => [new Date(g.date).toLocaleDateString([], { month: 'short', day: 'numeric' }), (g.home ? 'vs ' : '@ ') + g.opp, `${g.win ? 'W' : g.pf === g.pa ? 'T' : 'L'} ${g.pf}-${g.pa}`]),
      src: { name: 'ESPN team schedule', url: `https://www.espn.com/${lgName.toLowerCase()}/team/schedule/_/id/${hit.id}` } };
  }
  return playerAnswer(p, r.players.slice(0, 4));
}
async function playerAnswer(p, cands) {
  let firstErr = null;
  for (const hit of cands) { const res = await one(hit).catch(e => ({ error: e.message })); if (!res.error) { res.alts = cands.filter(c => c !== hit).map(c => c.name + (c.sub ? ' · ' + c.sub : '')); return res; } firstErr = firstErr || res; }
  return firstErr || { error: 'No player matched.' };
  async function one(hit) { const [path, lgName] = hit.lg;
  const log = await playerLog(path, hit.id, p.n || 10); if (!log.rows.length) return { error: `No games logged for ${hit.name} yet.` };
  let label = null, idx = -1; const want = p.stat || [log.labels.includes('PTS') ? 'PTS' : log.labels.includes('YDS') ? 'YDS' : log.labels.includes('H') ? 'H' : log.labels.includes('G') ? 'G' : log.labels[log.labels.length - 1]];
  for (const w of want) { const [lab, cat] = w.split('@'); idx = log.labels.findIndex((x, i) => x === lab && (!cat || (log.names[i] || '').toLowerCase().includes(cat))); if (idx < 0 && cat) idx = log.labels.indexOf(lab); if (idx >= 0) { label = lab; break; } }
  if (idx < 0) return { error: `${hit.name}'s ESPN game log has no "${want[0].split('@')[0]}" column. Available: ${log.labels.join(', ')}.` };
  let rows = log.rows.map(x => ({ ...x, v: num(x.stats[idx]) })).filter(x => !isNaN(x.v)); if (p.where) rows = rows.filter(x => (p.where === 'home') === (x.at === 'vs'));
  const n = p.n || 10, sl = rows.slice(0, n); if (!sl.length) return { error: 'No matching games.' };
  const avg = sl.reduce((a, x) => a + x.v, 0) / sl.length; const L = p.line;
  const hitN = L == null ? null : sl.filter(x => (p.side === 'under' ? x.v < L : x.v > L)).length;
  return { kind: 'player', title: `${hit.name} · ${label} · last ${sl.length}${p.where ? (p.where === 'home' ? ' at home' : ' on the road') : ''}`, value: avg.toFixed(1), unit: `${label} per game`, league: lgName, sub: `${hit.sub ? hit.sub + ' · ' : ''}total ${+sl.reduce((a, x) => a + x.v, 0).toFixed(1)} · high ${Math.max(...sl.map(x => x.v))} · low ${Math.min(...sl.map(x => x.v))}`,
    hit: L == null ? null : { n: hitN, of: sl.length, line: L, side: p.side }, line: L,
    series: sl.slice().reverse().map(x => ({ x: x.date, v: x.v, label: `${x.at === 'vs' ? 'vs' : '@'} ${x.opp} · ${x.v}` })),
    rows: sl.map(x => [new Date(x.date).toLocaleDateString([], { month: 'short', day: 'numeric' }), `${x.at === 'vs' ? 'vs' : '@'} ${x.opp || ''}`, String(x.v)]),
    src: { name: 'ESPN game log', url: `https://www.espn.com/${lgName.toLowerCase()}/player/gamelog/_/id/${hit.id}` } }; }
}
export const EXAMPLES = ['Mitchell points last 5', 'Jets record at home', 'Aaron Judge home runs last 10', 'Celtics last 10', 'Jokic rebounds over 11.5', 'McDavid shots last 10'];

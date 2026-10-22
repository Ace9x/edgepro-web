// Pick ledger (Grok record vs. Desk record, never mixed), ROI breakdowns with sample sizes, row validator, best per section.
import { amToDec, amToProb, JUICE_CAP } from './core.js';
let cache = null;
export async function load() { if (cache) return cache; const [g, d] = await Promise.all(['grok_record', 'desk_ledger'].map(n => fetch(`data/${n}.json`).then(r => r.ok ? r.json() : []).catch(() => [])));
  const res = x => ({ W: 'win', L: 'loss', P: 'push' })[String(x).toUpperCase()] || null;
  const grok = g.map((x, i) => ({ id: 'g' + i, book: 'grok', date: x.date, sport: x.sport, section: x.type || 'Other', pick: x.pick, grade: x.grade, price: x.price ?? -110, priceSrc: x.price == null ? 'assumed' : x.src, close: x.close, clv: null, result: res(x.result), raw: x.result, check: x.check }));
  const desk = d.filter(x => !/^sit|pass$/i.test(x.grade)).map((x, i) => ({ id: 'd' + i, book: 'desk', date: x.date, sport: x.sport, section: secOf(x.market), pick: `${x.game}: ${x.player ? x.player + ' ' : ''}${x.sel}${x.line != null ? ' ' + x.line : ''}`, grade: x.grade, price: okP(x.price) ? x.price : -110, priceSrc: okP(x.price) ? x.src || 'unknown' : 'assumed', close: x.close, closeSrc: x.closeSrc, clv: x.clv, result: res(x.result), raw: x.result, status: x.status, start: x.start }));
  return (cache = { grok, desk }); }
const okP = p => p != null && (p <= -100 || p >= 100);
const secOf = m => ({ total: 'Total', spread: 'Side', moneyline: 'Side', ml90: 'Side', k_prop: 'Pitcher prop', player_k: 'Pitcher prop', rec_yds: 'Player prop yds', '2h_total': '1P/1H/F5' })[m] || m;
export const units = r => (r.result === 'win' ? +(amToDec(r.price) - 1).toFixed(3) : r.result === 'loss' ? -1 : 0);
/** flat 1u per pick; pushes count as picks at 0; void/unverified excluded (same rule as ROI_GROK_OCT.md) */
export function roi(rows, keyFn = () => 'All') { const g = {};
  for (const r of rows) { if (!r.result) continue; const k = keyFn(r); const x = g[k] ||= { k, w: 0, l: 0, p: 0, n: 0, u: 0, clvN: 0, clvS: 0 }; x[r.result[0]]++; x.n++; x.u += units(r); if (r.clv != null) { x.clvN++; x.clvS += r.clv; } }
  return Object.values(g).map(x => ({ ...x, u: +x.u.toFixed(2), roi: x.n ? +(100 * x.u / x.n).toFixed(1) : null, hit: x.w + x.l ? x.w / (x.w + x.l) : null, clv: x.clvN ? +(x.clvS / x.clvN).toFixed(2) : null, small: x.n < 20 })).sort((a, b) => b.n - a.n); }
export const priceBucket = r => (/assum/.test(r.priceSrc) ? 'Assumed −110' : /sourced|close/i.test(r.priceSrc) ? 'Sourced (book close)' : /quot/.test(r.priceSrc) ? 'Quoted' : 'Book: ' + r.priceSrc);

// ---------- row validator ----------
const NOLINE = /\b(ml|moneyline|btts|nrfi|yrfi|anytime|to score|draw|win)\b/i;
const CAT = { points: /\b(pts|points?)\b/i, rebounds: /\b(reb|rebounds?)\b/i, assists: /\b(ast|assists?)\b/i, '3pm': /\b(3pm|threes?|3-?pointers?)\b/i, sog: /\b(sog|shots?)\b/i, saves: /\bsaves?\b/i, strikeouts: /\b(k|ks|strikeouts?)\b/i };
/** rows: [{section, pick, line, price, start?}] → each gets {issues:[{lvl:'error'|'warn'|'sit', msg}]} */
export function validate(rows, now = Date.now()) {
  const seen = new Map();
  return rows.map((r, i) => { const iss = []; const add = (lvl, msg) => iss.push({ lvl, msg }); const t = `${r.pick || ''}`;
    if (!t.trim()) add('error', 'Empty pick');
    if (/~|\?|\bif active\b/i.test(t)) add('error', 'Uncertain row ("~", "?" or "if active") — needs an exact line');
    if (r.price == null || r.price === '') add('warn', 'No price — ROI will assume −110');
    else if (!(r.price <= -100 || r.price >= 100)) add('error', `Price ${r.price} is not a valid American price`);
    else if (r.price < JUICE_CAP) add('sit', `Juice ${r.price} is worse than ${JUICE_CAP} → SIT`);
    if ((r.line == null || r.line === '' || isNaN(r.line)) && !NOLINE.test(t + ' ' + (r.section || ''))) add('error', 'No line number');
    if (r.start && new Date(r.start) < now) add('error', 'Game already started — can\'t be a pre-game pick');
    const sec = (r.section || '').toLowerCase(); for (const [k, re] of Object.entries(CAT)) if (sec.includes(k) || (k === '3pm' && sec.includes('3'))) { if (!re.test(t)) add('error', `Filed under ${r.section} but the pick isn't a ${k} market`); else if (/\+/.test(t.replace(/^[^a-z]*\+?\d/i, '')) && /pts\s*\+|\+\s*(reb|ast)/i.test(t)) add('error', 'Combo stat (e.g. pts+ast) filed as a single stat'); }
    const base = t.toLowerCase().replace(/\b(over|under|o|u)\b/g, '').replace(/[^a-z0-9.]+/g, ' ').trim(); const side = /\b(under|u)\b/i.test(t) ? 'u' : /\b(over|o)\b/i.test(t) ? 'o' : '';
    if (seen.has(base)) { const j = seen.get(base); add('error', j.side && side && j.side !== side ? `Both sides of the same market (row ${j.i + 1})` : `Duplicate of row ${j.i + 1}`); } else seen.set(base, { i, side });
    return { ...r, issues: iss, ok: !iss.some(x => x.lvl !== 'warn') }; });
}
/** "Section | pick | line | price | start" per line, or a CSV with those headers */
export function parseRows(text) { const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (!lines.length) return [];
  const sep = lines[0].includes('|') ? '|' : lines[0].includes('\t') ? '\t' : ','; let rows = lines.map(l => l.split(sep).map(c => c.trim()));
  if (/pick|section/i.test(rows[0].join(' '))) rows = rows.slice(1);
  const pn = v => { const m = String(v ?? '').replace('−', '-').match(/^[+-]?\d+(\.\d+)?$/); return m ? +m[0] : v === '' || v == null ? null : NaN; };
  return rows.map(c => { if (c.length === 1) { const m = c[0].match(/(.*?)\s+([ou]?\d+(?:\.\d+)?)?\s*([+-−]\d{3,4})\s*$/i); return { section: '', pick: c[0], line: m?.[2] ? +m[2].replace(/[ou]/i, '') : null, price: m ? +m[3].replace('−', '-') : null }; }
    return { section: c[0], pick: c[1], line: pn(c[2]), price: pn(c[3]), start: c[4] || null }; }); }
/** desk/live markets → best (highest-confidence, non-SIT) per section */
export function bestBySection(items) { const out = {}; for (const x of items) { if (x.sit) continue; const s = x.section; if (!out[s] || (x.conf ?? 0) > (out[s].conf ?? 0)) out[s] = x; } return out; }
export const sameGrade = grades => grades.length >= 4 && new Set(grades).size === 1;
export const polyVsBook = (bookAm, polyProb) => (bookAm == null || polyProb == null ? null : { book: amToProb(bookAm), poly: polyProb, diff: polyProb - amToProb(bookAm) });
/** 95% Wilson score interval for k wins in n decided picks */
export function wilson(k, n, z = 1.96) { if (!n) return null; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; }
/** chronological equity curve (units), max drawdown, longest losing streak (pushes don't break it) */
export function equity(rows) { const s = rows.filter(r => r.result).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))); let c = 0, peak = 0, dd = 0, ddAt = 0, run = 0, worst = 0; const pts = [0];
  s.forEach((r, i) => { c += units(r); pts.push(+c.toFixed(3)); if (c > peak) peak = c; if (peak - c > dd) { dd = peak - c; ddAt = i + 1; } if (r.result === 'loss') { run++; worst = Math.max(worst, run); } else if (r.result === 'win') run = 0; });
  return { pts, maxDD: +dd.toFixed(2), ddAt, streak: worst, risked: s.filter(r => r.result !== 'void').length }; }
/** zero-edge Monte Carlo: same prices, each pick wins at its no-vig-ish implied prob (break-even), 500 runs → 5th/95th pct per step */
export function zeroEdgeBand(rows, runs = 500) { const s = rows.filter(r => r.result).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))); const n = s.length; if (n < 5) return null;
  const paths = Array.from({ length: runs }, () => { let c = 0; const out = [0]; for (const r of s) { const p = 1 / amToDec(r.price); c += Math.random() < p ? amToDec(r.price) - 1 : -1; out.push(c); } return out; });
  const lo = [], hi = []; for (let i = 0; i <= n; i++) { const col = paths.map(p => p[i]).sort((a, b) => a - b); lo.push(col[Math.floor(runs * 0.05)]); hi.push(col[Math.floor(runs * 0.95)]); } return { lo, hi }; }
export const band = p => (p == null ? 'n/a' : p <= -150 ? 'Fav ≤−150' : p < 100 ? '−149…−101' : p < 200 ? '+100…+199' : '+200+');

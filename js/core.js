// EdgePro core math & desk rules — pure functions, unit-tested (test/unit.test.js)
export const amToDec = a => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);
export const amToProb = a => (a == null || isNaN(a) ? null : a > 0 ? 100 / (a + 100) : -a / (-a + 100));
export const probToAm = p => (p <= 0 || p >= 1 ? null : p >= 0.5 ? Math.round(-100 * p / (1 - p)) : Math.round(100 * (1 - p) / p));
export const parseAm = s => { if (s == null) return null; s = String(s).trim().toUpperCase(); if (s === 'EVEN' || s === 'EV') return 100; const n = parseInt(s.replace(/[^\d+-]/g, ''), 10); return isNaN(n) || Math.abs(n) < 100 ? null : n; };
export const fmtAm = a => (a == null ? '—' : a > 0 ? '+' + a : String(a));
export function noVig(a1, a2) { const p1 = amToProb(a1), p2 = amToProb(a2); if (p1 == null || p2 == null) return null; const s = p1 + p2; return { p1: p1 / s, p2: p2 / s, hold: s - 1, fair1: probToAm(p1 / s), fair2: probToAm(p2 / s) }; }
// EV per $1 staked given true probability p and American price a
export const ev = (p, a) => p * (amToDec(a) - 1) - (1 - p);
export const kellyFrac = (p, a) => { const b = amToDec(a) - 1; return Math.max(0, (b * p - (1 - p)) / b); };
// Arbitrage check across two best opposite prices
export function arb(a1, a2) { const s = 1 / amToDec(a1) + 1 / amToDec(a2); return { isArb: s < 1, margin: 1 - s, stake1: (1 / amToDec(a1)) / s, stake2: (1 / amToDec(a2)) / s }; }
// Best price among quotes [{book, price}]
export const best = qs => qs.filter(q => q.price != null).sort((x, y) => amToDec(y.price) - amToDec(x.price))[0] || null;

// ---------- Research Desk grading (Fan's desk rules) ----------
export const JUICE_CAP = -230;
export const TIERS = [['A', 0.75], ['B', 0.68], ['C+', 0.62], ['C', 0.58], ['D', 0]];
export const tierOf = p => TIERS.find(([, t]) => p >= t)[0];
const rank = g => ['D', 'C', 'C+', 'B', 'A'].indexOf(g);
/** pick: {sport, market:'ml'|'spread'|'total', side, price, sources:[{name, prob, kind:'outside'|'model'}], wind:{mph, blowingIn:true|false|null}} */
export function gradePick(pick) {
  const why = []; const outside = (pick.sources || []).filter(s => s.kind !== 'model' && s.prob > 0 && s.prob < 1);
  const models = (pick.sources || []).filter(s => s.kind === 'model');
  const implied = amToProb(pick.price);
  why.push(`Price ${fmtAm(pick.price)} → implied ${(implied * 100).toFixed(1)}%`);
  if (!outside.length) { why.push(models.length ? 'Model-only play → PASS (no model-only plays)' : 'No outside numbers → PASS'); return { grade: 'D', official: false, conf: null, edge: null, why, status: 'PASS' }; }
  const conf = outside.reduce((s, x) => s + x.prob, 0) / outside.length;
  outside.forEach(s => why.push(`Outside #: ${s.name} ${(s.prob * 100).toFixed(1)}%`));
  models.forEach(s => why.push(`Model (check only, not counted): ${s.name} ${(s.prob * 100).toFixed(1)}%`));
  let grade = tierOf(conf); why.push(`Avg of ${outside.length} outside # = ${(conf * 100).toFixed(1)}% → tier ${grade}`);
  const names = new Set(outside.map(s => s.name.toLowerCase()));
  if (names.size < 2 && rank(grade) > rank('B')) { grade = 'B'; why.push('Capped at B: only one independent source'); }
  if (grade === 'A') { const ps = outside.map(s => s.prob); if (Math.max(...ps) - Math.min(...ps) > 0.05) { grade = 'B'; why.push('A needs sources to agree within 5 pts → B'); } }
  const edge = conf - implied; why.push(`Edge vs price: ${(edge * 100).toFixed(1)} pts, EV ${(ev(conf, pick.price) * 100).toFixed(1)}%`);
  const blocks = [];
  if (names.size < 2) blocks.push('Official needs two independent outside numbers');
  if (rank(grade) < rank('C+')) blocks.push('Official needs C+ or better');
  if (pick.price < JUICE_CAP) blocks.push(`Juice ${fmtAm(pick.price)} worse than ${JUICE_CAP} cap → SIT`);
  if (edge <= 0) blocks.push('No edge vs the price');
  if (pick.sport === 'mlb' && pick.market === 'total' && /over/i.test(pick.side || '') && pick.wind && pick.wind.mph >= 9) {
    if (pick.wind.blowingIn === true) blocks.push(`Wind gate: ${pick.wind.mph} mph blowing in → Over is a SIT`);
    else if (pick.wind.blowingIn == null) blocks.push(`Wind gate: ${pick.wind.mph} mph, direction vs park unverified → no Official Over`);
  }
  blocks.forEach(b => why.push('✗ ' + b));
  const official = blocks.length === 0; why.push(official ? '✓ OFFICIAL' : 'Not official (lean/sit)');
  return { grade, official, conf, edge, why, status: official ? 'OFFICIAL' : 'LEAN' };
}

// ---------- Bet tracking ----------
/** bet: {market, side:'home'|'away'|'over'|'under', line, price, stake}; final: {home, away} scores */
export function settle(bet, final) {
  const h = +final.home, a = +final.away; let r;
  if (bet.market === 'ml') r = h === a ? 'push' : (bet.side === 'home') === (h > a) ? 'win' : 'loss';
  else if (bet.market === 'spread') { const m = (bet.side === 'home' ? h - a : a - h) + +bet.line; r = m === 0 ? 'push' : m > 0 ? 'win' : 'loss'; }
  else if (bet.market === 'total') { const t = h + a - +bet.line; r = t === 0 ? 'push' : (t > 0) === (bet.side === 'over') ? 'win' : 'loss'; }
  else return null;
  const profit = r === 'win' ? +(bet.stake * (amToDec(bet.price) - 1)).toFixed(2) : r === 'loss' ? -bet.stake : 0;
  return { result: r, profit };
}
// CLV in implied-probability points (positive = you beat the close)
export const clv = (betAm, closeAm) => (closeAm == null ? null : +((amToProb(closeAm) - amToProb(betAm)) * 100).toFixed(2));
export function record(bets) {
  const s = bets.filter(b => b.result); const w = s.filter(b => b.result === 'win').length, l = s.filter(b => b.result === 'loss').length, p = s.filter(b => b.result === 'push').length;
  const risk = s.reduce((x, b) => x + +b.stake, 0), profit = s.reduce((x, b) => x + (b.profit || 0), 0);
  const c = bets.map(b => b.clv).filter(v => v != null);
  return { w, l, p, profit: +profit.toFixed(2), roi: risk ? +(profit / risk * 100).toFixed(1) : 0, avgClv: c.length ? +(c.reduce((x, y) => x + y, 0) / c.length).toFixed(2) : null, open: bets.length - s.length };
}
// ---------- Parlay correlation ----------
export function correlation(legs) {
  const out = []; const byGame = {};
  legs.forEach(l => (byGame[l.eventId] = byGame[l.eventId] || []).push(l));
  for (const [, ls] of Object.entries(byGame)) {
    if (ls.length < 2) continue;
    const name = ls[0].label || 'same game';
    out.push(`${ls.length} legs from ${name}: same-game legs are correlated; books price SGPs with extra hold.`);
    const ml = ls.find(l => l.market === 'ml'), sp = ls.find(l => l.market === 'spread'), ov = ls.find(l => l.market === 'total');
    if (ml && sp && ml.side === sp.side) out.push(`${name}: ML + spread on same team are positively correlated (double exposure).`);
    if (ml && sp && ml.side !== sp.side) out.push(`${name}: ML and spread on opposite teams partly conflict.`);
    if (ov && ls.filter(l => l.market === 'total').length > 1 && new Set(ls.filter(l => l.market === 'total').map(l => l.side)).size > 1) out.push(`${name}: Over and Under together conflict.`);
    if (ov && (ml || sp)) out.push(`${name}: side + total in one game are scripted together (e.g. favorite + Over).`);
  }
  return out;
}
export const parlayPrice = legs => { const d = legs.reduce((x, l) => x * amToDec(l.price), 1); return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)); };

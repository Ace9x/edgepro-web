// Period (1H / 1Q / 1P / first 5 / 1st inning) and team-total markets from two free sources:
// The Odds API per-event markets (real sportsbook prices, credit-budgeted) and Polymarket game markets (CLOB mid + ask).
import * as C from './core.js';
export const PERIOD = {
  h2h_h1: ['1st half', 'ml'], totals_h1: ['1st half', 'total'], h2h_q1: ['1st quarter', 'ml'], totals_q1: ['1st quarter', 'total'],
  h2h_p1: ['1st period', 'ml'], totals_p1: ['1st period', 'total'], h2h_1st_5_innings: ['First 5 innings', 'ml'], totals_1st_5_innings: ['First 5 innings', 'total'],
  totals_1st_1_innings: ['1st inning', 'total'], team_totals: ['Team total', 'tt'],
  spreads_h1: ['1st half', 'sp'], spreads_q1: ['1st quarter', 'sp'], spreads_p1: ['1st period', 'sp'], spreads_1st_5_innings: ['First 5 innings', 'sp'],
  h2h_h2: ['2nd half', 'ml'], totals_h2: ['2nd half', 'total'], spreads_h2: ['2nd half', 'sp'], h2h_q2: ['2nd quarter', 'ml'], totals_q2: ['2nd quarter', 'total'], h2h_q3: ['3rd quarter', 'ml'], totals_q3: ['3rd quarter', 'total'],
  h2h_q4: ['4th quarter', 'ml'], totals_q4: ['4th quarter', 'total'], h2h_p2: ['2nd period', 'ml'], totals_p2: ['2nd period', 'total'], h2h_p3: ['3rd period', 'ml'], totals_p3: ['3rd period', 'total'] };
const POLY = { first_half_moneyline: 'h2h_h1', first_half_totals: 'totals_h1', first_half_spreads: 'spreads_h1', q1_spreads: 'spreads_q1', q1_moneyline: 'h2h_q1', q1_totals: 'totals_q1', team_totals: 'team_totals',
  first_period_moneyline: 'h2h_p1', first_period_totals: 'totals_p1', p1_moneyline: 'h2h_p1', p1_totals: 'totals_p1', first_five_innings_moneyline: 'h2h_1st_5_innings', first_five_innings_totals: 'totals_1st_5_innings', f5_moneyline: 'h2h_1st_5_innings', f5_totals: 'totals_1st_5_innings' };
const low = s => String(s || '').toLowerCase();
const teamSide = (e, name) => { const n = low(name); return ['home', 'away'].find(sd => [e[sd].full, e[sd].name, e[sd].abbr].some(x => x && (n.includes(low(x)) || low(x).includes(n)))) || null; };
/** liquid Polymarket outcome → {prob (mid), ask} or null. Thin books (wide spread / low liquidity) are ignored, never shown as a price. */
function polyQuote(m, i) { let o, p; try { o = JSON.parse(m.outcomes); p = JSON.parse(m.prices).map(Number); } catch { return null; }
  if (m.liq < 500 || !(m.ask > 0 && m.ask < 1) || !(m.bid > 0) || m.ask - m.bid > 0.06) return null;
  const mid = i === 0 ? (m.bid + m.ask) / 2 : 1 - (m.bid + m.ask) / 2, ask = i === 0 ? m.ask : +(1 - m.bid).toFixed(3); return { outcomes: o, prob: mid, ask, last: p[i] }; }
/** build gradeable market objects for one event */
export function build(e, ev, poly, method = 'multiplicative') { const legs = {}; // key -> {okey, side, line, team, books:[{book, price, pair}], poly}
  const put = (okey, side, line, team) => { const k = `${okey}|${side}|${line ?? ''}|${team ?? ''}`; return (legs[k] ||= { okey, side, line, team, books: [], poly: null }); };
  for (const b of ev?.books || []) for (const m of b.markets || []) { const P = PERIOD[m.key]; if (!P) continue;
    if (P[1] === 'ml') { const h = m.outcomes.find(o => teamSide(e, o.name) === 'home'), a = m.outcomes.find(o => teamSide(e, o.name) === 'away'); if (!h || !a) continue;
      put(m.key, 'home', null).books.push({ book: b.title, price: h.price, pair: [a.price, h.price], i: 1 }); put(m.key, 'away', null).books.push({ book: b.title, price: a.price, pair: [a.price, h.price], i: 0 }); }
    else if (P[1] === 'sp') { const h = m.outcomes.find(o => teamSide(e, o.name) === 'home'), a = m.outcomes.find(o => teamSide(e, o.name) === 'away'); if (!h || !a || h.point == null) continue;
      put(m.key, 'home', h.point).books.push({ book: b.title, price: h.price, pair: [a.price, h.price], i: 1 }); put(m.key, 'away', a.point).books.push({ book: b.title, price: a.price, pair: [a.price, h.price], i: 0 }); }
    else { const groups = {}; m.outcomes.forEach(o => { const t = P[1] === 'tt' ? teamSide(e, o.description) : null; (groups[`${o.point}|${t}`] ||= { point: o.point, t, o: {} }).o[o.name] = o.price; });
      Object.values(groups).forEach(g => { if (g.o.Over == null || g.o.Under == null || (P[1] === 'tt' && !g.t)) return; ['Over', 'Under'].forEach((sd, i) => put(m.key, sd.toLowerCase(), g.point, g.t).books.push({ book: b.title, price: g.o[sd], pair: [g.o.Over, g.o.Under], i })); }); } }
  for (const m of poly?.raw || []) { const okey = POLY[m.t]; if (!okey) continue; const P = PERIOD[okey]; let o; try { o = JSON.parse(m.outcomes); } catch { continue; }
    o.forEach((name, i) => { const q = polyQuote(m, i); if (!q) return; let side, line = m.line ?? null, team = null;
      if (P[1] === 'ml') side = teamSide(e, name); else if (P[1] === 'sp') { side = teamSide(e, name); if (line == null) return; line = i === 0 ? line : -line; } else { side = low(name); if (P[1] === 'tt') team = teamSide(e, m.g || m.q); }
      if (!side || (P[1] === 'tt' && !team)) return; const k0 = `${okey}|${side}|${P[1] === 'ml' ? '' : line}|${team ?? ''}`; if (!legs[k0] && Math.abs(q.prob - 0.5) > 0.25) return; const L = put(okey, side, P[1] === 'ml' ? null : line, team); L.poly = q; }); }
  const out = [];
  for (const L of Object.values(legs)) { const [sec, kind] = PERIOD[L.okey]; const nb = L.books.length; if (!nb && !L.poly) continue;
    const quotes = L.books.map(x => ({ book: x.book, price: x.price })); if (L.poly) quotes.push({ book: `Polymarket ${Math.round(L.poly.ask * 100)}¢ ask`, price: C.probToAm(L.poly.ask), prob: L.poly.ask, exec: true });
    const src = []; if (nb >= 2) src.push({ name: `Book median no-vig (${nb} books)`, prob: C.median(L.books.map(x => C.devig(x.pair, method).probs[x.i])) }); else if (nb === 1) src.push({ name: `${L.books[0].book} no-vig`, prob: C.devig(L.books[0].pair, method).probs[L.books[0].i] });
    if (L.poly) src.push({ name: 'Polymarket mid', prob: L.poly.prob });
    const best = C.best(quotes), price = (C.best(quotes.filter(q => !q.exec)) || best).price;
    const who = kind === 'ml' || kind === 'sp' ? e[L.side].abbr + ' ' : kind === 'tt' ? e[L.team].abbr + ' ' : '';
    const label = `${who}${kind === 'ml' ? 'ML' : kind === 'sp' ? (L.line > 0 ? '+' : '') + L.line : (L.side === 'over' ? 'Over' : 'Under') + ' ' + L.line} · ${sec}`;
    out.push({ key: `${e.id}|${L.okey}|${L.side}|${L.line ?? ''}|${L.team ?? ''}`, e, market: L.okey, section: sec, kind, side: L.side, line: L.line, team: L.team, label, price, quotes, src, best, fetched: ev?.fetched,
      fair: src.reduce((x, s) => x + s.prob, 0) / (src.length || 1) }); }
  out.forEach(m => { m.ev = m.best ? C.ev(m.fair, m.best.price) : null; }); return out; }

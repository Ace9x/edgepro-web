// Stale-line finder + "priced for the public" flag. Research only: shows where one book's price is out of line with the market; never suggests a bet size.
import * as C from './core.js';
const SHARP = /pinnacle|circa|betonline|bookmaker/i;
/** rows: [{book, ml:{away,home}, sp:{away:{price,point},home}, tot:{over:{price,point},under}}]
 *  Returns flags: [{market, side, book, price, fair, fairSrc, edge (pts of prob), ev}] where a book pays more than the leave-one-out market fair. */
export function scan(rows, { method = 'multiplicative', min = 0.015, splits = null } = {}) {
  const out = [], mk = [
    ['ml', ['away', 'home'], r => [r.ml?.away, r.ml?.home], () => null],
    ['spread', ['away', 'home'], r => [r.sp?.away?.price, r.sp?.home?.price], r => r.sp?.home?.point],
    ['total', ['over', 'under'], r => [r.tot?.over?.price, r.tot?.under?.price], r => r.tot?.over?.point]];
  for (const [market, sides, px, pt] of mk) {
    const all = rows.map(r => ({ r, p: px(r), line: pt(r), nv: px(r).every(x => x != null) ? C.devig(px(r), method) : null })).filter(x => x.nv);
    if (all.length < 3) continue; // need a real market: 3+ books
    const lines = {}; all.forEach(x => (lines[x.line] = (lines[x.line] || 0) + 1)); const L = market === 'ml' ? null : +Object.entries(lines).sort((a, b) => b[1] - a[1])[0][0];
    const same = all.filter(x => market === 'ml' || x.line === L); if (same.length < 3) continue;
    sides.forEach((sd, i) => { for (const x of same) {
      const others = same.filter(y => y !== x), sharp = others.filter(y => SHARP.test(y.r.book));
      const fair = sharp.length ? C.median(sharp.map(y => y.nv.probs[i])) : C.median(others.map(y => y.nv.probs[i]));
      const price = x.p[i], ev = C.ev(fair, price), edge = fair - C.amToProb(price);
      const publicSide = isPublic({ market, side: sd, i, x, fair, splits });
      if (ev >= min) out.push({ market, side: sd, line: market === 'ml' ? null : L, book: x.r.book, price, fair, fairAm: C.probToAm(fair), fairSrc: sharp.length ? 'sharp-book median (' + sharp.map(y => y.r.book).join(', ') + ')' : `median of ${others.length} other books`, ev, edge, updated: x.r.upd, publicSide });
    } });
  }
  return out.sort((a, b) => b.ev - a.ev);
}
/** consensus fair for one market (median no-vig of all books) — used for the public flag */
export function consensus(rows, market, method = 'multiplicative') { const f = { ml: r => [r.ml?.away, r.ml?.home], spread: r => [r.sp?.away?.price, r.sp?.home?.price], total: r => [r.tot?.over?.price, r.tot?.under?.price] }[market];
  const nv = rows.map(r => f(r)).filter(p => p.every(x => x != null)).map(p => C.devig(p, method).probs); if (nv.length < 3) return null; return [C.median(nv.map(p => p[0])), C.median(nv.map(p => p[1]))]; }
/** "Priced for the public" (Levitt 2004: books shade popular sides instead of balancing).
 *  Flag a side when EdgePro tickets show ≥65% on it (20+ tickets), or — without splits — when this book's no-vig price for it is ≥2 pts richer than the market. */
export function isPublic({ market, side, i, x, fair, splits }) {
  const s = splits?.[market]; const t = s ? (s[side]?.t || 0) : 0, tot = s ? Object.values(s).reduce((a, v) => a + (v?.t || 0), 0) : 0;
  if (tot >= 20) return t / tot >= 0.65 ? { why: `${Math.round(100 * t / tot)}% of ${tot} EdgePro tickets` } : null;
  const mine = x?.nv?.probs?.[i]; return mine != null && fair != null && mine - fair >= 0.02 ? { why: `${x.r.book} prices it ${((mine - fair) * 100).toFixed(1)} pts above the market` } : null;
}
/** per-side public flags for a game, across books */
export function publicFlags(rows, splits, method) { const res = [];
  for (const [market, sides] of [['ml', ['away', 'home']], ['spread', ['away', 'home']], ['total', ['over', 'under']]]) { const s = splits?.[market]; const tot = s ? Object.values(s).reduce((a, v) => a + (v?.t || 0), 0) : 0;
    if (tot >= 20) sides.forEach(sd => { const t = s[sd]?.t || 0; if (t / tot >= 0.65) res.push({ market, side: sd, why: `${Math.round(100 * t / tot)}% of ${tot} EdgePro tickets`, src: 'splits' }); });
    else { const c = consensus(rows, market, method); if (!c) continue; const f = { ml: r => [r.ml?.away, r.ml?.home], spread: r => [r.sp?.away?.price, r.sp?.home?.price], total: r => [r.tot?.over?.price, r.tot?.under?.price] }[market];
      sides.forEach((sd, i) => { const rich = rows.map(r => ({ r, p: f(r) })).filter(x => x.p.every(v => v != null)).map(x => ({ book: x.r.book, d: C.devig(x.p, method).probs[i] - c[i] })).filter(x => x.d >= 0.02);
        if (rich.length) res.push({ market, side: sd, why: rich.map(x => `${x.book} +${(x.d * 100).toFixed(1)} pts`).join(', '), src: 'books' }); }); } }
  return res; }

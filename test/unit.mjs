// Pure-math unit tests: de-vig methods, CLV, stale-line finder, public flag. node test/unit.mjs
import * as C from '../js/core.js'; import * as S from '../js/stale.js';
let f = 0; const t = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) f++; };
for (const k of Object.keys(C.DEVIG)) { const r = C.devig([-150, 130], k); t(Math.abs(r.probs[0] + r.probs[1] - 1) < 1e-6 && r.probs[0] > 0.55 && r.probs[0] < 0.6, k + ' sums to 1'); }
t(Math.abs(C.devig([-110, -110], 'shin').probs[0] - 0.5) < 1e-9, 'shin symmetric');
t(C.devig([-400, 300], 'power').probs[1] < C.devig([-400, 300]).probs[1], 'power trims longshot more');
t(Math.abs(C.devig([200, 250, 150], 'shin').probs.reduce((a, b) => a + b) - 1) < 1e-6, '3-way shin sums to 1');
t(C.clvPct(-110, -130) > 0 && C.clvPct(150, 120) > 0 && C.clvPct(-130, -110) < 0, 'clvPct sign');
t(C.probToAm(0.5) === 100, 'even = +100');
const rows = [['A', -120, 100], ['B', -118, -102], ['C', -121, 101], ['Pinnacle', -119, 100], ['Soft', -100, -120]].map(([book, a, h]) => ({ book, ml: { away: a, home: h } }));
const fl = S.scan(rows); t(fl[0]?.book === 'Soft' && fl[0].side === 'away' && fl.length === 1, 'stale: only the soft book flagged'); t(/sharp/.test(fl[0].fairSrc), 'stale: sharp fair used');
t(!S.scan(rows.slice(0, 2)).length, 'stale: needs 3+ books');
t(S.publicFlags(rows, null).some(x => x.side === 'home' && /Soft/.test(x.why)), 'public: shaded side flagged');
const ps = S.publicFlags(rows, { ml: { away: { t: 30 }, home: { t: 5 } } }); t(ps.length === 1 && ps[0].side === 'away', 'public: splits ≥65%');
t(!S.publicFlags(rows, { ml: { away: { t: 6 }, home: { t: 5 } } }).some(x => x.src === 'splits'), 'public: small split sample ignored');
console.log(f ? f + ' failed' : 'all passed'); process.exit(f ? 1 : 0);

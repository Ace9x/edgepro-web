import test from 'node:test'; import assert from 'node:assert/strict';
import * as C from '../js/core.js';
test('odds conversions', () => { assert.equal(C.amToProb(-110).toFixed(4), '0.5238'); assert.equal(C.amToProb(150), 0.4); assert.equal(C.probToAm(0.6), -150); assert.equal(C.probToAm(0.4), 150); assert.equal(C.parseAm('EVEN'), 100); assert.equal(C.parseAm('+133'), 133); });
test('no-vig', () => { const n = C.noVig(-110, -110); assert.equal(n.p1, 0.5); assert.ok(Math.abs(n.hold - 0.0476) < 0.001); const m = C.noVig(-161, 133); assert.ok(Math.abs(m.p1 + m.p2 - 1) < 1e-9); });
test('EV and arb', () => { assert.ok(Math.abs(C.ev(0.5, 100)) < 1e-9); assert.ok(C.ev(0.55, -110) > 0); assert.ok(C.arb(110, 105).isArb); assert.ok(!C.arb(-110, -110).isArb); assert.equal(C.best([{ book: 'a', price: -110 }, { book: 'b', price: 105 }]).book, 'b'); });
test('desk: model-only is a pass', () => { const g = C.gradePick({ price: -110, sources: [{ name: 'M', prob: 0.7, kind: 'model' }] }); assert.equal(g.grade, 'D'); assert.equal(g.official, false); });
test('desk: one source caps at B and blocks official', () => { const g = C.gradePick({ price: -110, sources: [{ name: 'Poly', prob: 0.8 }] }); assert.equal(g.grade, 'B'); assert.equal(g.official, false); });
test('desk: two sources C+ official', () => { const g = C.gradePick({ price: 100, sources: [{ name: 'Poly', prob: 0.63 }, { name: 'Kalshi', prob: 0.64 }] }); assert.equal(g.grade, 'C+'); assert.ok(g.official); });
test('desk: C is not official', () => { const g = C.gradePick({ price: 120, sources: [{ name: 'A', prob: 0.59 }, { name: 'B', prob: 0.59 }] }); assert.equal(g.grade, 'C'); assert.ok(!g.official); });
test('desk: juice cap -230', () => { const g = C.gradePick({ price: -240, sources: [{ name: 'A', prob: 0.8 }, { name: 'B', prob: 0.8 }] }); assert.ok(!g.official); assert.ok(g.why.some(w => /cap/.test(w))); });
test('desk: MLB wind gate', () => { const p = { sport: 'mlb', market: 'total', side: 'Over 8.5', price: 100, sources: [{ name: 'A', prob: 0.7 }, { name: 'B', prob: 0.7 }] };
  assert.ok(C.gradePick(p).official); assert.ok(!C.gradePick({ ...p, wind: { mph: 12, blowingIn: true } }).official); assert.ok(!C.gradePick({ ...p, wind: { mph: 12, blowingIn: null } }).official); assert.ok(C.gradePick({ ...p, wind: { mph: 12, blowingIn: false } }).official); });
test('settlement', () => { assert.deepEqual(C.settle({ market: 'ml', side: 'home', price: -150, stake: 15 }, { home: 5, away: 3 }), { result: 'win', profit: 10 });
  assert.equal(C.settle({ market: 'spread', side: 'away', line: 3, price: -110, stake: 11 }, { home: 24, away: 21 }).result, 'push');
  assert.equal(C.settle({ market: 'total', side: 'under', line: 6, price: -110, stake: 11 }, { home: 4, away: 3 }).result, 'loss'); });
test('clv + record', () => { assert.ok(C.clv(120, 100) > 0); const r = C.record([{ stake: 10, result: 'win', profit: 10, clv: 2 }, { stake: 10, result: 'loss', profit: -10, clv: 0 }, { stake: 5 }]); assert.deepEqual([r.w, r.l, r.open, r.roi, r.avgClv], [1, 1, 1, 0, 1]); });
test('correlation', () => { const w = C.correlation([{ eventId: 1, market: 'ml', side: 'home', label: 'TB@MIL' }, { eventId: 1, market: 'spread', side: 'home' }, { eventId: 2, market: 'ml' }]); assert.ok(w.some(x => /double exposure/.test(x))); assert.equal(C.correlation([{ eventId: 1 }, { eventId: 2 }]).length, 0); assert.equal(C.parlayPrice([{ price: 100 }, { price: 100 }]), 300); });

test('self-learning: gradeShown result + CLV', () => {
  const g = C.gradeShown({ market: 'ml', side: 'home', shownPrice: 120, closePrice: -110 }, { home: 3, away: 2 });
  assert.equal(g.result, 'win'); assert.equal(g.units, 1.2); assert.ok(g.clv > 0);
  assert.equal(C.gradeShown({ market: 'total', side: 'over', line: 8.5, shownPrice: -110 }, { home: 3, away: 2 }).result, 'loss');
});
test('self-learning: calibrate stays neutral until enough data, then shrinks overconfidence', () => {
  assert.deepEqual([C.calibrate([]).k, C.calibrate([]).n], [1, 0]);
  const recs = Array.from({ length: 60 }, (_, i) => ({ conf: 0.7, result: i % 2 ? 'win' : 'loss', src: [{ name: 'Book no-vig', prob: 0.7 }] }));
  const cal = C.calibrate(recs); assert.ok(cal.k < 1 && cal.k >= 0.5); assert.ok(cal.w['book no-vig'] < 1);
  assert.ok(C.applyCal(0.7, cal) < 0.7);
});
test('self-learning: summarize counts losses and pushes honestly', () => {
  const s = C.summarize([{ result: 'win', units: 1, clv: 2, conf: 0.6 }, { result: 'loss', units: -1, clv: -1 }, { result: 'push', units: 0 }, { conf: 0.6 }]).all;
  assert.deepEqual([s.w, s.l, s.p, s.hit, s.units, s.avgClv], [1, 1, 1, 0.5, 0, 0.5]);
});

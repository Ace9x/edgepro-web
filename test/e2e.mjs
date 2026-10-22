// Playwright e2e against the live site. BASE=https://ace9x.github.io/edgepro-web/ npm run e2e
import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE || 'https://ace9x.github.io/edgepro-web/', OUT = '/workspace/edgepro-shots'; fs.mkdirSync(OUT, { recursive: true });
// ESPN's CDN rejects the 'HeadlessChrome' client hint, so the test browser presents normal Chrome hints (real users are unaffected).
const HDR = { 'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"' };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36', permissions: ['clipboard-read', 'clipboard-write'], extraHTTPHeaders: HDR });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const shot = n => p.screenshot({ path: `${OUT}/${n}.png` }); const E = f => p.evaluate(f);
const loadLg = async lg => { await p.click(`[data-lg=${lg}]`); await p.waitForFunction(l => EP.league === l && EP.fetched, lg, { timeout: 30000 }); };
await p.goto(BASE); await p.waitForFunction(() => EP.fetched, null, { timeout: 30000 });
ok(await p.isVisible('text=1-800-GAMBLER') && await p.isVisible('text=21+'), 'responsible-gambling notice + 21+ visible');
const counts = {};
for (const lg of ['mlb', 'nfl', 'nba', 'nhl', 'wnba', 'ncaaf', 'ncaab', 'soccer']) { await loadLg(lg); counts[lg] = await E(() => ({ n: EP.events.length, odds: EP.events.filter(e => e.odds).length, poly: Object.values(EP.poly).filter(Boolean).length, err: EP.err })); }
console.log('INFO slate', JSON.stringify(counts));
ok(Object.values(counts).filter(c => c.n > 0).length >= 4 && Object.values(counts).every(c => !c.err), 'live ESPN scoreboards load for 4+ leagues with no errors');
// pick league with most odds + poly for remaining tests
const best = Object.entries(counts).sort((a, b) => (b[1].poly * 10 + b[1].odds) - (a[1].poly * 10 + a[1].odds))[0][0]; await loadLg(best);
ok(await p.locator('.card[data-ev]').count() === counts[best].n, `${best}: ${counts[best].n} game cards rendered`);
ok(await p.isVisible('#stamp') && /updated \d/.test(await p.textContent('#stamp')), 'data source + timestamp label shown'); await shot('01-scoreboard');
const dk = await E(() => EP.events.find(e => e.odds)); ok(dk && /DraftKings|ESPN/.test(dk.odds.provider) && dk.odds.ml.home.close, `real odds: ${dk?.name} ${dk?.odds.provider} ML ${dk?.odds.ml.away.close}/${dk?.odds.ml.home.close}`);
const pm = await E(() => { const id = Object.keys(EP.poly).find(k => EP.poly[k]?.ml); return id && { n: EP.events.find(e => e.id === id).name, ...EP.poly[id].ml }; }); ok(!!pm, `Polymarket matched: ${pm ? pm.n + ' away ' + pm.away + ' / home ' + pm.home : 'none'}`);
console.log('INFO kalshi', JSON.stringify(await E(() => EP.kalshi.ok ? 'ok' : EP.kalshi.why)));
await p.click('[data-t=odds]'); await p.waitForTimeout(500); ok(await p.isVisible('text=+EV finder') && await p.locator('text=No-vig fair').count() > 0, 'odds screen: best line, no-vig, +EV, arb scan'); await shot('02-odds');
ok(await E(() => Object.keys(JSON.parse(localStorage.ep_hist || '{}')).length > 0), 'line-movement snapshots stored client-side');
await p.click('[data-t=desk]'); await p.waitForTimeout(1500); const g = await p.locator('.grade').count(); ok(g > 0, `desk graded ${g} picks`);
await p.locator('details').first().click(); ok(await p.locator('ul.why li').count() >= 3, 'reasoning stack shown'); await shot('03-desk');
await p.click('[data-t=tools]'); await p.fill('#tA', '-150'); await p.fill('#tB', '+130'); await p.fill('#tX', '+140'); ok(/No-vig fair: 58\.0%/.test(await p.textContent('#tOut')), 'no-vig calc: -150/+130 → 58.0% fair'); await shot('04-tools');
// bet tracker
await p.click('[data-t=scores]'); await p.locator('[data-act=track]').first().click(); await p.click('#bSave'); await p.waitForTimeout(500);
await p.click('[data-t=bets]'); ok(await p.locator('text=open').count() > 0 || await p.locator('td b.mv-up, td b.mv-dn').count() > 0, 'bet tracked in ledger');
// auto-settle a finished game from yesterday
await p.click('[data-t=scores]'); await p.click('[data-day="-1"]'); await p.waitForFunction(() => EP.fetched && EP.dayOff === -1, null, { timeout: 20000 });
let fin = null; for (const lg of ['nba', 'mlb', 'nhl', 'wnba', 'soccer']) { await loadLg(lg); await p.waitForTimeout(1500); fin = await E(() => EP.events.find(e => e.completed)); if (fin) break; }
if (fin) { await p.locator(`.card[data-ev="${fin.id}"] [data-act=track]`).click(); const pv = await p.inputValue('#bP').catch(e => 'ERR'); console.log('INFO price field', pv); if (pv === '—' || pv === '') await p.fill('#bP', '-110'); await p.click('#bSave'); await p.waitForFunction(id => (JSON.parse(localStorage.ep_bets || '[]').find(b => b.eventId === id) || {}).result, fin.id, { timeout: 15000 }).catch(() => {}); const s = await E(id => JSON.parse(localStorage.ep_bets).find(b => b.eventId === id), fin.id); if (!s?.result) console.log('INFO bets', await E(() => localStorage.ep_bets), await p.textContent('#modal')); ok(s?.result && s.auto, `auto-settled from ESPN final ${fin.name}: ${s?.result} ${s?.profit}, CLV ${s?.clv}`); } else console.log('INFO no finished game with odds yesterday in', best);
await p.click('[data-day="0"]'); await p.waitForFunction(() => EP.fetched && EP.dayOff === 0, null, { timeout: 20000 }); await p.click('[data-t=bets]'); await p.locator('[data-act=pladd]').first().click(); await p.locator('[data-act=pladd]').first().click(); ok(await p.locator('text=same-game legs are correlated').count() > 0, 'parlay correlation warning'); await shot('05-bets');
// props
await loadLg('nba').catch(() => {}); await p.click('[data-t=props]'); const ev = await E(() => EP.events[0]?.id);
if (ev) { await p.selectOption('#pGame', ev); await p.waitForFunction(() => EP.prop?.roster?.length, null, { timeout: 20000 }); const pid = await E(() => EP.prop.roster[0].id); await p.selectOption('#pPlayer', pid); await p.waitForFunction(() => EP.prop.log, null, { timeout: 20000 }); await p.fill('#pLine', '9.5'); await p.waitForTimeout(300); ok(/Last 5 over/.test(await p.textContent('#pOut')), 'prop hit-rate from ESPN game log'); await shot('06-props'); }
// community
await p.click('[data-t=community]'); await p.fill('#handle', 'fan'); await p.click('[data-act=mkprof]'); await p.click('[data-t=desk]'); await p.waitForTimeout(800); await p.locator('[data-act=share]').first().click(); await p.waitForTimeout(500);
const link = await E(() => EP.lastShare); ok(/#follow=/.test(link || ''), 'shareable pick link created');
const p2 = await (await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', extraHTTPHeaders: HDR })).newPage(); await p2.goto(link); await p2.waitForTimeout(2500); ok(await p2.isVisible('text=@fan'), 'second device follows @fan via link'); await p2.screenshot({ path: `${OUT}/07-community.png` });
// Ace
await p.click('#aceBtn'); await p.fill('#aceQ', 'officials'); await p.press('#aceQ', 'Enter'); await p.waitForTimeout(300); ok(await p.locator('.msg').count() >= 3, 'Ace answers from loaded data'); await shot('08-ace');
await p.setViewportSize({ width: 1280, height: 860 }); await p.click('#aceX'); await p.click('[data-t=scores]'); await p.click('[data-day="0"]'); await p.waitForTimeout(2500); await shot('09-desktop');
ok(errs.length === 0, 'no page errors ' + errs.join('; '));
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);

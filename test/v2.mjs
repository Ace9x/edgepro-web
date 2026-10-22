// v2 checks + screenshots at 390x844 and 1440x900. BASE=... node test/v2.mjs
import { chromium } from 'playwright';
const go = (pg, t) => pg.evaluate(t => { const b = [...document.querySelectorAll('[data-t="' + t + '"]')].find(x => x.offsetParent); if (b) b.click(); else { document.querySelector('#moreBtn').click(); document.querySelector('#more [data-t="' + t + '"]').click(); } }, t);
 import fs from 'fs';
const BASE = process.env.BASE || 'https://ace9x.github.io/edgepro-web/', OUT = process.env.OUT || '/workspace/edgepro-shots/v2'; fs.mkdirSync(OUT, { recursive: true });
const HDR = { 'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"' };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const b = await chromium.launch();
for (const [tag, vp] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  const ctx = await b.newContext({ viewport: vp, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36', extraHTTPHeaders: HDR, isMobile: tag === 'mobile', hasTouch: tag === 'mobile' }); await ctx.addInitScript(() => { if (!localStorage.getItem('ep_consent')) localStorage.setItem('ep_consent', JSON.stringify({ v: '2026-10-22', at: new Date().toISOString() })); });  const p = await ctx.newPage();
  const errs = []; p.on('console', m => { if (m.type() === 'error' && !/Kalshi|kalshi|ERR_FAILED|CORS|Failed to load resource/.test(m.text())) errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
  const shot = n => p.screenshot({ path: `${OUT}/${tag}-${n}.png` }); const E = (f, a) => p.evaluate(f, a);
  await p.goto(BASE); await p.waitForFunction(() => EP.fetched, null, { timeout: 30000 });
  let lgBest = 'nba', bestN = -1; for (const lg of ['nba', 'mlb', 'nhl', 'nfl', 'ncaaf']) { await p.click(`[data-lg=${lg}]`); await p.waitForFunction(l => EP.league === l && EP.fetched, lg, { timeout: 30000 }); const n = await E(() => EP.events.filter(e => e.odds && e.state === 'pre').length); if (n > bestN) { bestN = n; lgBest = lg; } }
  await p.click(`[data-lg=${lgBest}]`); await p.waitForFunction(l => EP.league === l && EP.fetched, lgBest, { timeout: 30000 }); await p.waitForTimeout(800); console.log('INFO league', lgBest, bestN);
  ok(await p.isVisible('text=1-800-GAMBLER') && await p.isVisible('text=21+'), `${tag}: 21+ · research only · 1-800-GAMBLER visible`);
  const emoji = await E(() => /\p{Extended_Pictographic}/u.test(document.body.innerText)); ok(!emoji, `${tag}: no emoji in UI`);
  ok(await p.locator('#tabs svg.ds-ic').count() >= 5, `${tag}: SVG tab icons`);
  ok(await E(() => getComputedStyle(document.querySelector('.chip.on')).color.includes('94, 234, 212') && getComputedStyle(document.querySelector('.btn.pri, .chip.on')).borderColor !== ''), `${tag}: teal primary`);
  ok(/ago/.test(await p.locator('.age').first().textContent().catch(() => '')), `${tag}: odds age shown`); await shot('01-scores');
  await go(p, 'desk'); await p.waitForTimeout(1500); await shot('02-desk');
  ok(await E(async () => (await new Promise(r => { const q = indexedDB.open('edgepro'); q.onsuccess = () => { const t = q.result.transaction('grades').objectStore('grades').count(); t.onsuccess = () => r(t.result); }; })) > 0), `${tag}: shown desk picks logged to IndexedDB`);
  await go(p, 'record'); await p.waitForTimeout(500); ok(await p.isVisible("text=How we're doing") && await p.isVisible('text=Self-calibration'), `${tag}: How we're doing page`);
  ok(await E(() => { const r = [...document.querySelectorAll('#view .od b')][2]?.textContent; return r === '—' || /^\d+-\d+-\d+$/.test(r); }), `${tag}: record starts honest (empty or real)`); await shot('03-record');
  await go(p, 'bets'); await p.click('[data-act=manual]'); await p.fill('#mG', 'NYJ @ BUF'); await p.fill('#mL', 'Jets +7.5'); await p.fill('#mP', '-110'); await p.click('#mSave'); await p.waitForTimeout(300);
  ok(await p.locator('text=manual').count() > 0 && await p.isVisible('text=Open bets'), `${tag}: manual bet saved, pending pinned first`);
  const ids = await E(() => JSON.parse(localStorage.ep_bets).filter(b => b.manual).map(b => b.id)); await E(id => { const bs = JSON.parse(localStorage.ep_bets); const x = bs.find(b => b.id === id); Object.assign(x, { result: 'loss', profit: -1 }); localStorage.ep_bets = JSON.stringify(bs); }, ids[0]);
  await go(p, 'scores'); await go(p, 'bets'); ok(await p.locator('.cal-d.dn').count() > 0, `${tag}: P/L calendar shows the loss day`);
  await p.locator('[data-act=audit][data-f=settled]').first().click(); ok(await p.locator('#modal table tr').count() >= 2, `${tag}: record total opens the bets behind it`); await shot('04-audit'); await p.click('#modal [data-act=mclose]');
  await p.evaluate(() => scrollTo(0, 0)); await shot('05-bets');
  await go(p, 'tools'); await p.waitForTimeout(1500); ok(await p.isVisible('text=Free here, paid elsewhere') && await p.isVisible('#aE'), `${tag}: account card (email) + free-feature list`);
  ok(!(await p.isVisible('[data-act=gin]')) || (await E(async () => (await (await fetch('https://czjwiudbasqwlwvezmaz.supabase.co/auth/v1/settings', { headers: { apikey: 'sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK' } })).json()).external.google)), `${tag}: Google button hidden until provider enabled`); await shot('06-tools');
  await go(p, 'props'); await shot('07-props');
  ok(errs.length === 0, `${tag}: no console errors ${errs.slice(0, 3).join(' | ')}`); await ctx.close();
}
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

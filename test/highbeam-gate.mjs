// Highbeam gate: 390x844 + 412x915, each main view, overflow/clip, 44px tab targets, reload, offline, 0 errors. BASE=... OUT=... node test/highbeam-gate.mjs
import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE || 'http://localhost:8139/', OUT = process.env.OUT || 'qa/highbeam'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const b = await chromium.launch();
for (const vp of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  const ctx = await b.newContext({ viewport: vp }); await ctx.addInitScript(() => { localStorage.setItem('ep_consent', '{"v":"2026-10-28","at":"2026-10-28T00:00:00Z"}'); localStorage.setItem('ep_whats', '"2026-10-28"'); localStorage.setItem('ep_league', '"nba"'); localStorage.setItem('ep_league_set', '1'); localStorage.setItem('EP_NO_HEALTH', '1'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 160)));
  for (const v of ['scores', 'odds', 'bets', 'ask']) {
    await p.goto(BASE + '#' + v); await p.waitForTimeout(3500);
    ok(await p.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(0, 0, 0)', `${vp.width} ${v}: Highbeam bg`);
    const clip = await p.evaluate(() => [...document.querySelectorAll('button,a,input')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.chips,[style*=overflow],.scroll'); }).map(e => (e.id || e.textContent.trim()).slice(0, 20)));
    ok(clip.length === 0, `${vp.width} ${v}: no clipped controls ${clip.join(',')}`);
    const hs = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); ok(hs, `${vp.width} ${v}: no horizontal page scroll`);
    await p.screenshot({ path: `${OUT}/${v}-${vp.width}.png` });
  }
  const small = await p.evaluate(() => [...document.querySelectorAll('.tabs button,.tabs a,.chip')].filter(e => { const r = e.getBoundingClientRect(); return r.height && r.height < 44; }).map(e => e.textContent.trim().slice(0, 15)));
  ok(small.length === 0, `${vp.width}: tabs/chips ≥44px ${small.join(',')}`);
  await p.reload(); await p.waitForTimeout(2500); ok(await p.locator('#view').count() === 1, `${vp.width}: reload renders`);
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
  await ctx.setOffline(true); await p.reload().catch(() => {}); await p.waitForTimeout(2000); ok(await p.locator('#view').count() === 1, `${vp.width}: offline reload renders from SW cache`);
  await p.screenshot({ path: `${OUT}/offline-${vp.width}.png` }); await ctx.setOffline(false);
  ok(errs.length === 0, `${vp.width}: 0 console errors ${errs.join(' | ')}`); await ctx.close();
}
await b.close(); console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);

// Highbeam gate: 390x844 + 412x915, each main view, overflow/clip, 44px tab targets, reload, offline, 0 errors. BASE=... OUT=... node test/highbeam-gate.mjs
import * as PW from 'playwright'; import fs from 'fs';
const BRW = process.env.BRW || 'chromium'; const BASE = process.env.BASE || 'http://localhost:8139/', OUT = process.env.OUT || 'qa/highbeam'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const b = await PW[process.env.BRW || 'chromium'].launch();
for (const vp of [{ width: 390, height: 844 }, { width: 412, height: 915 }]) {
  const ctx = await b.newContext({ viewport: vp }); await ctx.addInitScript(() => { localStorage.setItem('ep_consent', '{"v":"2026-10-28","at":"2026-10-28T00:00:00Z"}'); localStorage.setItem('ep_whats', '"2026-10-28"'); localStorage.setItem('ep_league', '"nba"'); localStorage.setItem('ep_league_set', '1'); localStorage.setItem('EP_NO_HEALTH', '1'); });
  if (process.env.LOCAL_DIR) await ctx.route(/^https:\/\/ace9x\.github\.io\/edgepro-web\//, r => { let f = new URL(r.request().url()).pathname.replace('/edgepro-web/', '') || 'index.html'; if (f.endsWith('/')) f += 'index.html'; const fp = process.env.LOCAL_DIR + '/' + f; if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' }); const ct = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', woff2: 'font/woff2', webmanifest: 'application/manifest+json' }[f.split('.').pop()] || 'application/octet-stream'; return r.fulfill({ status: 200, body: fs.readFileSync(fp), contentType: ct }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 160)));
  for (const v of ['scores', 'odds', 'bets', 'ask']) {
    const blk = [];
    await p.goto(BASE + '#' + v); await p.waitForTimeout(3500);
    if (v === 'scores') { const src = await p.evaluate(async () => { try { const m = await import('./js/data.js'); return m.scoreboard?.meta?.source || null; } catch { return null; } }); console.log(`INFO ${vp.width} scores served by: ${src}`); }
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

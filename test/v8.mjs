// #21 player-centric props view + #97 prop sparklines, live. BASE=... xvfb-run node test/v8.mjs
import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE || 'https://ace9x.github.io/edgepro-web/', OUT = '/workspace/edgepro-shots/v4'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const b = await chromium.launch({ headless: false });
for (const [tag, vp] of [['d', { width: 1440, height: 900 }], ['m', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp }); await ctx.addInitScript(() => { localStorage.setItem('ep_consent', '{"v":"2026-10-22"}'); localStorage.setItem('ep_whats', '"2026-10-22c"'); localStorage.setItem('ep_league', '"nba"'); localStorage.setItem('ep_league_set', '1'); localStorage.setItem('EP_NO_HEALTH', '1'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '#props'); await p.waitForFunction(() => window.EP?.events?.length, null, { timeout: 40000 });
  const gid = await p.evaluate(() => EP.events.find(e => e.state === 'pre')?.id || EP.events[0].id); await p.selectOption('#pGame', gid);
  await p.waitForFunction(() => document.querySelectorAll('#pPlayer option').length > 2, null, { timeout: 30000 });
  // pick the first player with a game log
  const pls = await p.$$eval('#pPlayer option', o => o.map(x => x.value)); let got = false, pname = '';
  for (const v of pls.slice(0, 12)) { await p.selectOption('#pPlayer', v); await p.waitForFunction(() => !EP.prop.loading, null, { timeout: 20000 }); if (await p.locator('#pCard').count()) { got = true; pname = await p.$eval('#pCard b', x => x.textContent); break; } }
  ok(got, `${tag}: player card shows (${pname})`);
  const n = await p.locator('#pCard table tr').count(), sk = await p.locator('#pCard svg.psk').count(); ok(n > 5 && sk === n - 1, `${tag}: every stat row has a sparkline (${n - 1} rows, ${sk} sparklines)`);
  const ll = await p.$eval('#pCard svg.psk', s => s.getAttribute('aria-label')); ok(/^last \d+: [\d., ]+$/.test(ll), `${tag}: sparkline is the real game log (${ll})`);
  if (tag === 'd') { await p.click('[data-act="pbooks"]'); await p.waitForFunction(() => !EP.prop.booksLoading && EP.prop.booksAt, null, { timeout: 60000 }).catch(() => {});
    const st = await p.$eval('#pCard .row .small', x => x.textContent); ok(/loaded/.test(st), `${tag}: book lines loaded (${st.trim()})`);
    // find a player the books list, to show a line + hit rate vs it
    let lined = 0; for (const v of pls.slice(0, 15)) { await p.selectOption('#pPlayer', v); await p.waitForFunction(() => !EP.prop.loading, null, { timeout: 20000 }); lined = await p.locator('#pCard td b').count(); if (lined) break; }
    ok(lined > 0, `${tag}: a listed player shows book lines (${lined}) with hit rates vs them`);
    if (lined) { const row = await p.locator('#pCard tr:has(td b)').first().innerText(); console.log('INFO row', row.replace(/\s+/g, ' ')); ok(/\d+%/.test(row) && /[+-]\d{3}/.test(row), `${tag}: row has hit % and best O/U price`); } }
  await p.locator('#pCard').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/v8-${tag}-player-card.png` });
  // #97 roster sparklines
  await p.click('[data-act="pscan"]'); await p.waitForFunction(() => EP.prop.scan?.rows.length > 3, null, { timeout: 90000 }).catch(() => {}); await p.waitForTimeout(1500);
  const rr = await p.evaluate(() => { const t = [...document.querySelectorAll('table')].find(t => /Last 10/i.test(t.rows[0]?.innerText) && /L20/i.test(t.rows[0]?.innerText)); return t ? { rows: t.rows.length - 1, sk: t.querySelectorAll('svg.psk').length } : null; });
  ok(rr && rr.rows > 3 && rr.sk === rr.rows, `${tag}: roster table sparkline in every row (${rr?.rows} rows)`);
  ok(errs.length === 0, `${tag}: no page errors ${errs.join('; ')}`); await ctx.close(); }
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);

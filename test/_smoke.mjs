import { chromium } from '/workspace/edgepro-web/node_modules/playwright/index.mjs';
const b = await chromium.launch(); const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });
await ctx.addInitScript(() => { localStorage.setItem('ep_consent', '{"v":"2026-10-22"}'); localStorage.setItem('ep_whats', '"2026-10-22b"'); globalThis.EP_NO_HEALTH = 1; });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const BASE = process.env.BASE || 'http://localhost:8765/';
for (const lg of ['mlb', 'nba', 'nhl', 'nfl']) { await p.goto(BASE + '#desk'); await p.evaluate(l => { localStorage.setItem('ep_league', JSON.stringify(l)); localStorage.setItem('ep_league_set', '1'); }, lg); await p.reload(); await p.waitForTimeout(6000);
  const r = await p.evaluate(() => ({ lg: EP.league, n: EP.events?.length, stamp: document.getElementById('stamp')?.textContent, gate: [...document.querySelectorAll(".card")].find(c => /Injury & lineup/.test(c.innerText))?.innerText.slice(0, 500), desk: [...document.querySelectorAll(".card")].filter(c => c.querySelector(".grade")).length, spreads: document.body.innerText.match(/Market median[^\n]*/)?.[0], feeds: Object.fromEntries(Object.entries(window.EPF?.status || {}).map(([k, v]) => [k, v.source + (v.ok ? "" : " FAIL")])) })); console.log(JSON.stringify(r)); }
console.log('errors', errs); await b.close();

// security + data-source + desk_v2 + legal items, live site, real (headed) Chromium. BASE=... xvfb-run node test/v9.mjs
import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE || 'https://ace9x.github.io/edgepro-web/', OUT = '/workspace/edgepro-shots/v4'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const b = await chromium.launch({ headless: false });
const page = async (lg, vp = { width: 1280, height: 900 }) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addInitScript(l => { localStorage.setItem('ep_consent', '{"v":"2026-10-28","at":"2026-10-28T00:00:00Z"}'); localStorage.setItem('ep_whats', '"2026-10-28"'); localStorage.setItem('ep_league', JSON.stringify(l)); localStorage.setItem('ep_league_set', '1'); localStorage.setItem('EP_NO_HEALTH', '1'); }, lg);
  const p = await ctx.newPage(); const errs = [], csp = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text().slice(0, 160)); }); return { ctx, p, errs, csp }; };
const ready = p => p.waitForFunction(() => window.EP?.events?.length && EP.fetched, null, { timeout: 40000 }).catch(() => {});
// 1 CSP + XSS
{ const { ctx, p, errs, csp } = await page('nba'); await p.goto(BASE + '#scores'); await ready(p);
  ok(await p.locator('meta[http-equiv="Content-Security-Policy"]').count() === 1, 'CSP meta tag present');
  await p.evaluate(() => { const bets = JSON.parse(localStorage.ep_bets || '[]'); localStorage.ep_bets = JSON.stringify(bets); });
  const stored = await p.evaluate(() => { window.__x = 0; const LS = (k, v) => localStorage.setItem('ep_' + k, v); return 1; });
  // a manual bet with markup in its label is saved without markup
  await p.goto(BASE + '#bets'); await p.waitForTimeout(1500); const add = p.locator('[data-act="manual"]').first(); if (await add.count()) { await add.click(); await p.fill('#mG', 'Test <img src=x onerror="window.__x=1"> game').catch(() => {}); await p.fill('#mL', '<b>XSS</b> pick').catch(() => {}); await p.fill('#mP', '-110').catch(() => {}); await p.locator('#mSave, [data-act="msave"], button:has-text("Save")').first().click().catch(() => {}); await p.waitForTimeout(800); }
  const raw = await p.evaluate(() => localStorage.ep_bets || ''); ok(!/<img|<b>/.test(raw), 'user text saved without markup'); ok(await p.evaluate(() => window.__x === undefined || window.__x === 0), 'injected handler never ran');
  await p.evaluate(() => { const b = JSON.parse(localStorage.ep_bets || '[]').filter(x => !/XSS/.test(x.label)); localStorage.ep_bets = JSON.stringify(b); });
  ok(csp.length === 0, `no CSP violations ${csp.join(' | ')}`); ok(errs.length === 0, `no page errors ${errs.join('; ')}`);
  // no trading links
  await p.goto(BASE + '#odds'); await p.waitForTimeout(4000); const tl = await p.$$eval('a[href]', a => a.map(x => x.href).filter(h => /polymarket\.com\/event|kalshi\.com\/markets/.test(h)));
  ok(tl.length === 0, 'no Polymarket/Kalshi trading links'); ok(/Data: Polymarket/.test(await p.innerText('#view')), 'Data: Polymarket credit shown');
  await p.screenshot({ path: `${OUT}/v9-odds-credit.png` }); await ctx.close(); }
// 2 share link: own secret, still signs + verifies (server-side)
{ const r = await fetch('https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-share?t=bogus.AAAA'); const j = await r.json(); ok(r.status !== 503 && j.valid === false, `ep-share up with its own secret (bad token rejected: ${j.why})`); }
// 3 weather NWS
{ const t = new Date(Date.now() + 864e5).toISOString().slice(0, 13) + ':00:00Z'; const r = await (await fetch(`https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-wx?city=Chicago&state=Illinois&t=${t}`)).json(); ok(r.src === 'NWS (weather.gov)' && r.mph != null, `NWS weather via ep-wx: ${r.mph} mph ${r.dirTxt}, ${r.temp}°F`); }
// 4 nightly logs + Ask
{ const K = 'sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK'; const r = await (await fetch('https://czjwiudbasqwlwvezmaz.supabase.co/rest/v1/ep_game_logs?select=league,src,loaded_at&order=loaded_at.desc&limit=1', { headers: { apikey: K } })).json(); ok(r[0] && Date.now() - new Date(r[0].loaded_at) < 30 * 3600e3, `game-log table loaded ${r[0]?.loaded_at}`);
  const { ctx, p } = await page('nhl'); await p.goto(BASE + '#ask'); await p.waitForTimeout(2000); const box = p.locator('#askQ, input[type=search]').first();
  if (await box.count()) { await box.fill('Connor McDavid points last 5'); await box.press('Enter'); await p.waitForTimeout(8000); }
  const t = await p.innerText('#view').catch(() => ''); ok(/NHL stats API/.test(t), 'Ask answers NHL from the NHL stats API table'); await p.screenshot({ path: `${OUT}/v9-ask-nhl.png` }); await ctx.close(); }
// 5 NHL goalie gate + no stake UI + family rule
{ const { ctx, p, errs } = await page('nhl'); await p.goto(BASE + '#desk'); await ready(p); await p.waitForTimeout(9000);
  const gate = await p.locator('.card:has-text("Injury & lineup gate")').first().innerText().catch(() => ''); ok(/NHL starting goalies/.test(gate), 'NHL goalie row in the gate'); console.log('INFO ' + gate.replace(/\s+/g, ' ').slice(0, 300));
  const why = await p.$$eval('.card.pick .whyg', w => w.map(x => x.textContent).join(' ')); ok(/Source families/.test(why), 'Why-this-grade lists source families');
  await p.screenshot({ path: `${OUT}/v9-nhl-goalie-gate.png` });
  await p.goto(BASE + '#bets'); await p.waitForTimeout(1500); const bt = await p.innerText('#view'); ok(!/\bStake\b|Units logged|\d+u\b/.test(bt), 'no Stake/Units UI on Bets');
  await p.goto(BASE + '#record'); await p.waitForTimeout(3000); const rt = await p.innerText('#view'); ok(/69-41-2|69–41–2/.test(rt.replace(/\s/g, '')) || /69\D+41\D+2/.test(rt), 'Record shows the real 69-41-2 Grok record'); ok(/per \$100 flat/.test(rt) && !/\bUnits\b|1u\b/.test(rt), 'Record scored per $100 flat, no units');
  await p.screenshot({ path: `${OUT}/v9-record.png` }); ok(errs.length === 0, `no page errors ${errs.join('; ')}`); await ctx.close(); }
// 6 CSV round trip in the UI
{ const { ctx, p } = await page('nba'); await p.goto(BASE + '#bets'); await ready(p);
  const csv = 'placed,start,game,league,label,price,stake,book,closePrice,clv,result,profit,final,settledAt,id,eventId,market,side,line\n"2026-10-20T12:00:00Z","","NE @ CHI","nfl","CHI ML (v9 test)","-150","1","DK","","","win","0.67","","","v9test","","manual","",""';
  await p.locator('[data-act="import"]').first().click(); await p.fill('#imT', csv); await p.click('#imPv'); await p.waitForTimeout(500); const pv = await p.locator('#imO').innerText(); ok(/CHI ML \(v9 test\)/.test(pv), 'EdgePro CSV export format parsed in import preview');
  await p.click('#imGo'); await p.waitForTimeout(800); const has = await p.evaluate(() => JSON.parse(localStorage.ep_bets || '[]').filter(b => b.id === 'v9test').length); ok(has === 1, 'imported bet keeps its id');
  await p.locator('[data-act="import"]').first().click(); await p.fill('#imT', csv); await p.click('#imPv'); await p.click('#imGo').catch(() => {}); await p.waitForTimeout(500); ok(await p.evaluate(() => JSON.parse(localStorage.ep_bets || '[]').filter(b => b.id === 'v9test').length) === 1, 're-import dedupes by id');
  await p.evaluate(() => { localStorage.ep_bets = JSON.stringify(JSON.parse(localStorage.ep_bets || '[]').filter(b => b.id !== 'v9test')); }); await ctx.close(); }
// 7 legal pages + splits opt-in
{ const { ctx, p } = await page('nba'); await p.goto(BASE + 'terms.html'); const t = await p.innerText('body'); ok(/Governing law/.test(t) && /Limitation of liability/.test(t) && /opt out of arbitration/.test(t) && /ticking/.test(t), 'terms: clickwrap, NY law, liability cap, arbitration opt-out');
  await p.goto(BASE + 'privacy.html'); const pv = await p.innerText('body'); ok(/SHIELD/.test(pv) && /off by default/.test(pv) && /Don’t post personal information/.test(pv), 'privacy: SHIELD notice, splits off by default, no-PII contact warning');
  await p.goto(BASE + '#tools'); await p.waitForTimeout(1500); ok(await p.locator('#splitT').isChecked().then(v => !v).catch(() => false), 'community splits unchecked by default');
  const ctx2 = await b.newContext(); const p2 = await ctx2.newPage(); await p2.goto(BASE); await p2.waitForTimeout(2500); ok(await p2.locator('#cTos').count() === 1, 'new visitor must tick to accept the terms'); await p2.screenshot({ path: `${OUT}/v9-clickwrap.png` }); await ctx2.close(); await ctx.close(); }
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);

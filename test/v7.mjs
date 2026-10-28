// period / team-total / prop grading + scores failover proof in a real (headed) Chromium. BASE=... xvfb-run node test/v7.mjs
import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE || 'https://ace9x.github.io/edgepro-web/', OUT = '/workspace/edgepro-shots/v4'; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const b = await chromium.launch({ headless: false }); // real browser: its own UA + sec-ch-ua, no spoofing
const init = () => { localStorage.setItem('ep_consent', '{"v":"2026-10-28"}'); localStorage.setItem('ep_whats', '"2026-10-28"'); localStorage.setItem('ep_whats_seen', '"2026-10-28"'); };
const page = async (vp, lg, block) => { const ctx = await b.newContext({ viewport: vp }); await ctx.addInitScript(init); await ctx.addInitScript(l => { localStorage.setItem('ep_league', JSON.stringify(l)); localStorage.setItem('ep_league_set', '1'); localStorage.setItem('EP_NO_HEALTH', '1'); }, lg);
  if (block) await ctx.route(block, r => r.abort()); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); return { ctx, p, errs }; };
// 1) scores failover: block the two ESPN site APIs, scores must come from the CDN (NFL) or the relay (NHL)
for (const [lg, want] of [['nba', /ESPN CDN feed/], ['nhl', /EdgePro relay/]]) {
  const { ctx, p } = await page({ width: 1280, height: 860 }, lg, /site(\.web)?\.api\.espn\.com\/apis\/site\/v2\/sports\/[^/]+\/[^/]+\/scoreboard/);
  await p.goto(BASE + '#scores'); await p.waitForFunction(() => window.EP?.events?.length, null, { timeout: 40000 }).catch(() => {});
  const st = await p.evaluate(() => { const s = EPF.status.Scores || {}; return { ok: s.ok, source: s.source, n: EP.events.length }; });
  ok(st.ok && want.test(st.source) && st.n > 0, `${lg}: primary + site.web blocked → scores via ${st.source} (${st.n} games)`); ok(!(await p.isVisible('text=unavailable since')), `${lg}: no outage shown`);
  if (lg === 'nhl') await p.screenshot({ path: `${OUT}/v7-failover-nhl.png` }); await ctx.close(); }
// 2) unblocked real browser: CDN as a direct source for each league it serves
{ const { ctx, p } = await page({ width: 1280, height: 860 }, 'nfl'); await p.goto(BASE + 'privacy.html');
  const r = await p.evaluate(async () => Promise.all(['nfl', 'nba', 'mlb', 'college-football', 'mens-college-basketball'].map(async l => { try { const d = await (await fetch(`https://cdn.espn.com/core/${l}/scoreboard?xhr=1`)).json(); return [l, Array.isArray(d.content?.sbData?.events)]; } catch (e) { return [l, false]; } })));
  r.forEach(([l, v]) => ok(v, `real browser fetches ESPN CDN ${l}`)); await ctx.close(); }
// 3) Today: period + team-total sections priced from real sources
for (const [tag, vp] of [['m', { width: 390, height: 844 }], ['d', { width: 1440, height: 900 }]]) {
  const { ctx, p, errs } = await page(vp, process.env.PLG || 'nba'); await p.goto(BASE + '#today'); await p.waitForFunction(() => window.EP?.events?.length, null, { timeout: 40000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelector('#view')?.innerText.match(/1st half|Team total/), null, { timeout: 40000 }).catch(() => {});
  const t = await p.innerText('#view'); const secs = await p.$$eval('.sec h3', h => h.map(x => x.textContent));
  ok(secs.some(s => /1st half/.test(s)), `${tag}: 1st half section (${secs.filter(s => /1st|Team/.test(s)).join(' / ')})`); ok(secs.some(s => /Team total/.test(s)), `${tag}: team total section`);
  ok(/Period and team-total prices/.test(t) && !/no free live price feed/.test(t), `${tag}: sources stated, old "no feed" line gone`);
  const per = await p.$$eval('.sec', ss => ss.filter(s => /1st|Team total|First 5/.test(s.querySelector('h3').textContent)).map(s => ({ h: s.querySelector('h3').textContent, pick: !!s.querySelector('.card.pick'), none: /Nothing graded/.test(s.textContent) })));
  ok(per.length && per.every(x => x.pick || x.none), `${tag}: each period section shows a graded card or a plain "nothing" line`);
  await p.waitForFunction(() => EP.ev && Object.keys(EP.ev).length, null, { timeout: 30000 }).catch(() => {});
  const ev = await p.evaluate(() => { const e = EP.events.find(x => EP.ev?.[x.id]); return e ? { books: EP.ev[e.id].books.length, at: EP.ev[e.id].fetched } : null; });
  ok(ev && ev.books > 0 && ev.at, `${tag}: Odds API per-event prices cached server-side (${ev?.books} books, fetched ${ev?.at})`);
  ok(!/C\+/.test(t), `${tag}: no C+`); ok(errs.length === 0, `${tag}: no page errors ${errs.join('; ')}`); await p.screenshot({ path: `${OUT}/v7-${tag}-today-periods.png`, fullPage: tag === 'd' }); await ctx.close(); }
// 4) player props graded in the game sheet
{ const { ctx, p } = await page({ width: 1280, height: 900 }, process.env.PLG || 'nba'); await p.goto(BASE + '#scores'); await p.waitForFunction(() => window.EP?.events?.length, null, { timeout: 40000 }).catch(() => {});
  await p.locator('[data-act="intel"]').first().click();
  await p.waitForSelector('#inP table, #inP .muted', { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(3000);
  const t = await p.locator('#inP').innerText().catch(() => ''); const chips = await p.locator('#inP .gchip').count();
  ok(/Grade/.test(t) && chips > 0, `player props graded (${chips} rows with a chip)`); ok(/book median no-vig/.test(t), `prop grade sources stated`);
  await p.screenshot({ path: `${OUT}/v7-props-graded.png` }); await ctx.close(); }
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);

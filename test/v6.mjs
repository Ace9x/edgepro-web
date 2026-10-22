// desk-design pass + live feeds, end to end. BASE=... node test/v6.mjs
import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE || 'https://ace9x.github.io/edgepro-web/', OUT = '/workspace/edgepro-shots/v4'; fs.mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', HDR = { 'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"' };
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const b = await chromium.launch(); const uptime = {};
for (const [tag, vp] of [['m', { width: 390, height: 844 }], ['d', { width: 1440, height: 900 }]]) {
  const ctx = await b.newContext({ viewport: vp, userAgent: UA, extraHTTPHeaders: HDR }); await ctx.addInitScript(() => { localStorage.setItem('ep_consent', '{"v":"2026-10-22"}'); localStorage.setItem('ep_whats', '"2026-10-22b"'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); const shot = n => p.screenshot({ path: `${OUT}/v6-${tag}-${n}.png` });
  for (const lg of ['nfl', 'mlb']) {
    await p.goto(BASE); await p.evaluate(l => { localStorage.setItem('ep_league', JSON.stringify(l)); localStorage.setItem('ep_league_set', '1'); }, lg); await p.goto(BASE + '#today'); await p.reload();
    await p.waitForFunction(() => EP.fetched && EP.events.length, null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(6000);
    const st = await p.evaluate(() => Object.fromEntries(Object.entries(EPF.status).map(([k, v]) => [k, { ok: v.ok, source: v.source, tried: v.tried.map(t => t.source + ':' + (t.ok ? 'ok' : 'fail')) }])));
    for (const [k, v] of Object.entries(st)) { for (const t of v.tried) { const [s, r] = t.split(/:(?=ok$|fail$)/); const u = uptime[k + ' · ' + s] ||= { ok: 0, n: 0 }; u.n++; if (r === 'ok') u.ok++; } }
    const stamp = await p.textContent('#stamp'); ok(/^updated \d{1,2}:\d\d [AP]M$/.test(stamp.trim()), `${tag} ${lg}: compact stamp "${stamp.trim()}"`);
    ok(st.Scores?.ok, `${tag} ${lg}: scores live via ${st.Scores?.source}`); ok(!(await p.isVisible('text=unavailable since')), `${tag} ${lg}: no outage shown while a source works`);
    const t = await p.innerText('#view'); ok(/Today/.test(t) && /Moneyline/.test(t) && /Spread/.test(t) && /Game total/.test(t), `${tag} ${lg}: Today shows each section`);
    const none = (t.match(/Nothing graded B or better in/g) || []).length, picks = await p.locator('.sec .card.pick').count(); ok(none + picks === 3, `${tag} ${lg}: every section has a pick or a plain "nothing" line (${picks} picks, ${none} empty)`);
    ok(/no free live price feed/.test(t) && !/C\+/.test(t), `${tag} ${lg}: unpriced sections stated plainly, no C+`);
    ok(await p.locator('.gcard').count() > 0, `${tag} ${lg}: game list`); if (lg === 'nfl') await shot('today');
    await p.goto(BASE + '#desk'); await p.waitForTimeout(5000); const dc = await p.locator('.card.pick').count(); ok(dc > 0, `${tag} ${lg}: Desk pick cards ${dc}`);
    const chips = await p.$$eval('.card.pick .gchip b', x => x.map(e => e.textContent)); ok(chips.every(c => ['A', 'B', 'C', 'D', '–'].includes(c)), `${tag} ${lg}: A–D chips only (${[...new Set(chips)].join(',')})`);
    const offBad = await p.$$eval('.card.pick', cs => cs.filter(c => /Official/.test(c.querySelector('.gchip')?.textContent || '') && !/^[AB]$/.test(c.querySelector('.gchip b')?.textContent)).length); ok(offBad === 0, `${tag} ${lg}: Official only on A/B`);
    const sp = await p.locator('.card.pick:has-text("Spread"), .card.pick:has(b:text-matches("[A-Z]{2,3} [+-]\\\\d"))').count(); console.log(`INFO ${lg} spread cards ${sp}`);
    await p.locator('.card.pick .whyg summary').first().click(); const why = await p.locator('.card.pick .whyg').first().innerText(); ok(/Why this grade/.test(why) && /%/.test(why) && (/What would change it/.test(why) || /All Official checks pass/.test(why)), `${tag} ${lg}: Why-this-grade panel`);
    ok(await p.locator('.card.pick .xrow').count() === dc, `${tag} ${lg}: Polymarket vs book row on every card`); const xr = await p.locator('.card.pick .xrow').first().innerText(); console.log('INFO xrow', xr.replace(/\n/g, ' '));
    const gate = await p.locator('.card:has-text("Injury & lineup gate")').innerText().catch(() => ''); ok(/ESPN/.test(gate) && /(Sleeper|MLB StatsAPI|ESPN core)/.test(gate), `${tag} ${lg}: injury gate has two live sources`); console.log('INFO gate', gate.split('\n').slice(3, 8).join(' | '));
    if (lg === 'nfl') await shot('desk');
  }
  await p.goto(BASE + '#props'); await p.waitForTimeout(3000); const g0 = await p.$$eval('#pGame option', o => o.map(x => x.value).filter(Boolean)); if (g0.length) { await p.selectOption('#pGame', g0[0]); await p.waitForTimeout(4000); const pl = await p.$$eval('#pPlayer option', o => o.map(x => x.value)); if (pl.length > 1) await p.selectOption('#pPlayer', pl[1]); await p.waitForTimeout(4000); await p.fill('#pLine', '0.5'); await p.dispatchEvent('#pLine', 'change'); await p.waitForTimeout(800);
    ok(await p.locator('.hrbar').count() === 3 && await p.locator('.glog .b').count() > 0, `${tag}: hit-rate bars L5/L10/Season + game log vs line`); await shot('props'); }
  await p.goto(BASE + '#trends'); await p.waitForTimeout(2000); const tg = await p.$$eval('#trG option', o => o.map(x => x.value).filter(Boolean)); if (tg.length) { await p.selectOption('#trG', tg[0]); await p.waitForTimeout(8000); const tt = await p.innerText('#view'); ok(/From ESPN box scores/.test(tt), `${tag}: trends from box scores`); const bad = await p.$$eval('.tbadge', x => x.map(e => e.textContent).filter(s => { const m = s.match(/(\d+)\/(\d+)$/); return !m || +m[2] < 5; })); ok(!bad.length, `${tag}: trend badges show n and none under 5`); await shot('trends'); }
  await p.goto(BASE + '#record'); await p.waitForTimeout(2500); const rt = await p.innerText('#view'); ok(/By sport & section/.test(rt) && /Real/.test(rt) && /Assumed −110/.test(rt), `${tag}: record split by sport & section, real vs assumed`); await shot('record');
  await p.goto(BASE + '#ledger'); await p.waitForTimeout(2000); await p.check('#ledV'); await p.waitForTimeout(400); const n = await p.locator('.pchip.assumed').count(), r = await p.locator('.pchip.real').count(); ok(n === 56 && r === 58, `${tag}: ledger marks 58 real / 56 assumed (got ${r}/${n})`); ok(!(await p.innerText('#view')).match(/>C\+</), `${tag}: no C+ chip in ledger`);
  const tabs = await p.$$eval('#tabs > button', x => x.map(e => e.textContent.trim())); ok(tag === 'd' || tabs.join(',') === 'Today,Games,Props,Record,More', `${tag}: tabs ${tabs.join(',')}`);
  const html = await p.content(); ok(!/sportsbook\.(draftkings|fanduel)\.com|bet now|sign up bonus|promo code/i.test(html), `${tag}: no bet buttons, book links or promo copy`);
  ok(!errs.length, `${tag}: no page errors ${errs.join('|')}`); await ctx.close(); }
console.log('\nUPTIME ' + JSON.stringify(uptime)); console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);

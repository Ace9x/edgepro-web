// v4 regression: new features end to end at 390x844 and 1440x900. BASE=... PW_FILE=... node test/v4.mjs
import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE || 'https://ace9x.github.io/edgepro-web/', OUT = process.env.OUT || '/workspace/edgepro-shots/v4'; fs.mkdirSync(OUT, { recursive: true });
const PW = process.env.PW_FILE ? fs.readFileSync(process.env.PW_FILE, 'utf8').trim() : null;
const HDR = { 'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"' }, UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const go = (pg, t) => pg.evaluate(t => { const b = [...document.querySelectorAll('[data-t="' + t + '"]')].find(x => x.offsetParent); if (b) b.click(); else { document.querySelector('#moreBtn').click(); document.querySelector('#more [data-t="' + t + '"]').click(); } }, t);
const b = await chromium.launch();
const mk = async vp => { const ctx = await b.newContext({ viewport: vp, userAgent: UA, extraHTTPHeaders: HDR }); await ctx.addInitScript(() => { if (!localStorage.getItem('ep_consent')) localStorage.setItem('ep_consent', JSON.stringify({ v: '2026-10-22', at: new Date().toISOString() })); localStorage.setItem('ep_whats', '"2026-10-22b"'); });  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/kalshi|Failed to load resource/i.test(m.text())) errs.push(m.text()); }); return { ctx, p, errs }; };
if (!process.env.ONLY_ACCT) for (const [tag, vp] of [['m', { width: 390, height: 844 }], ['d', { width: 1440, height: 900 }]]) {
  const { ctx, p, errs } = await mk(vp); const E = (f, a) => p.evaluate(f, a); const shot = n => p.screenshot({ path: `${OUT}/after-${tag}-${n}.png` });
  // skeleton then success (delay ESPN)
  await p.route(/scoreboard/, async r => { await new Promise(x => setTimeout(x, 1500)); r.continue(); });
  await p.goto(BASE); ok(await p.locator('.skel').count() >= 3, `${tag}: skeleton cards while loading`);
  await p.waitForFunction(() => EP.fetched, null, { timeout: 30000 }); await p.unroute(/scoreboard/);
  ok(await p.locator('.skel').count() === 0 && await p.locator('#view .state').count() + await p.locator('.card[data-ev]').count() > 0, `${tag}: one state at a time (success or empty)`);
  // nav
  if (tag === 'm') { ok(await p.locator('#tabs > button').count() === 5, 'm: 5 bottom tabs'); await p.click('#moreBtn'); ok(await p.locator('#more:not(.hide) button[data-t]').count() === 8, 'm: More sheet lists 8 sections'); await shot('more'); await p.click('[data-act=moreclose]'); }
  else ok(await p.isVisible('#side') && !(await p.isVisible('#tabs')), 'd: sidebar on desktop, no bottom tabs');
  // error state: abort scoreboards
  await p.route(/scoreboard/, r => r.abort()); await E(() => { EP.events = []; EP.fetched = null; }); await p.click('[data-day="1"]'); await p.waitForFunction(() => EP.err, null, { timeout: 20000 });
  const vt = await p.innerText('#view'); ok(/Can't reach live scores/.test(vt) && !/Failed to fetch|Loading/.test(vt) && await p.locator('.skel').count() === 0, `${tag}: single error state, no raw "Failed to fetch"`);
  await shot('error'); await p.unroute(/scoreboard/); await p.click('[data-act=retry]'); await p.waitForFunction(() => EP.fetched && !EP.err, null, { timeout: 30000 }); ok(true, `${tag}: Retry now recovers`);
  await p.click('[data-day="0"]'); await p.waitForFunction(() => EP.fetched && EP.dayOff === 0, null, { timeout: 30000 });
  // choose a league with pre-game odds
  let lg = null; for (const l of ['mlb', 'nfl', 'nhl', 'nba', 'ncaaf']) { await p.click(`[data-lg=${l}]`); await p.waitForFunction(x => EP.league === x && EP.fetched, l, { timeout: 30000 }); if (await E(() => EP.events.some(e => e.odds && e.state === 'pre'))) { lg = l; break; } }
  console.log('INFO league', lg);
  ok(!/Invalid Date|undefined|NaN/.test(await p.innerText('#view')), `${tag}: no Invalid Date / undefined / NaN on scores`);
  // favorites: star → Following section
  const id = await E(() => EP.events.find(e => e.state !== 'post')?.id || EP.events[0].id); await p.click(`[data-act=fav][data-id="${id}"]`); ok(await p.isVisible('h3:has-text("Following")'), `${tag}: starred game floats to Following`); await shot('scores');
  await p.click(`[data-act=fav][data-id="${id}"]`);
  // fair line on card
  ok(await p.locator('text=no-vig fair').count() > 0, `${tag}: no-vig fair line on game cards`);
  // odds → line movement section present
  await go(p, 'odds'); await p.waitForTimeout(400); ok(await p.isVisible('text=+EV finder') && (await p.locator('text=Line movement').count()) > 0, `${tag}: odds view has +EV finder and line movement`); await shot('odds');
  // desk
  await go(p, 'desk'); await p.waitForTimeout(2500); ok(await p.isVisible('text=Best per section') && await p.isVisible('text=Injury & lineup gate'), `${tag}: desk best-per-section + injury gate`);
  ok(await p.locator('text=ESPN injury report').count() > 0 && /\d+ listed|unavailable/.test(await p.innerText('#view')), `${tag}: gate shows ESPN injury source with time`); await shot('desk');
  // trends
  await go(p, 'trends'); const tg = await E(() => EP.events.find(e => e.state !== 'post')?.id || EP.events[0]?.id); await p.selectOption('#trG', tg); await p.waitForSelector('text=Game total', { timeout: 30000 });
  ok(/\d+(\.\d+)?/.test(await p.innerText('#view table')), `${tag}: trend table filled from ESPN`); await shot('trends');
  // ask
  await go(p, 'ask'); await p.fill('#askQ', 'Jokic rebounds over 11.5'); await p.click('#askF button'); await p.waitForSelector('.answer', { timeout: 30000 });
  const at = await p.innerText('.answer'); ok(/Jokic/.test(at) && /REB/.test(at) && /\d+\/\d+/.test(at) && /ESPN game log/.test(at), `${tag}: Ask player stat with hit rate + source`); await shot('ask');
  await p.fill('#askQ', 'Jets record at home'); await p.click('#askF button'); await p.waitForSelector('.answer:has-text("Jets")', { timeout: 30000 }); ok(/\d+-\d+/.test(await p.innerText('.answer .hero')), `${tag}: Ask team record`);
  await p.fill('#askQ', 'zzqx qqq'); await p.click('#askF button'); await p.waitForSelector('text=No answer for that one', { timeout: 30000 }); ok(true, `${tag}: Ask empty state for nonsense`);
  // ledger
  await go(p, 'ledger'); await p.waitForSelector('text=By sport'); const lt = await p.innerText('#view'); ok(/69–41–2/.test(lt) && /\+23\.17/.test(lt) && /\+20\.7%/.test(lt), `${tag}: Grok ledger matches ROI_GROK_OCT (69–41–2, +23.17u, +20.7%)`);
  await p.click('[data-act=ledbook][data-k=desk]'); ok(/Desk record/.test(await p.innerText('#view')) && /avg clv/i.test(await p.innerText('#view')), `${tag}: Desk ledger separate, with CLV`);
  await p.fill('#valT', 'ML | TOR ML | | -450\nPoints | Ja Morant O23.5 pts+ast | 23.5 | -110\nAssists | Trae ast ~ | |'); await p.click('[data-act=validate]'); const vv = await p.innerText('#view');
  ok(/SIT/.test(vv) && /Combo stat/.test(vv) && /Uncertain row/.test(vv) && /0 of 3 rows pass/.test(vv), `${tag}: row validator flags juice, combo, uncertain rows`); await shot('ledger');
  // bets: empty → add → delete → undo
  await go(p, 'bets'); ok(await p.isVisible('text=No bets tracked yet'), `${tag}: bets empty state with next action`);
  await p.click('[data-act=manual] >> nth=0'); await p.fill('#mG', 'NYJ @ BUF'); await p.fill('#mL', 'Jets +7.5'); await p.fill('#mP', '-110'); await p.click('#mSave'); await p.waitForTimeout(300);
  ok(!/Invalid Date/.test(await p.innerText('#view')) && await p.isVisible('text=Open bets'), `${tag}: manual bet shows, no Invalid Date`);
  const bx = await p.locator('[data-act=del]').first().boundingBox(); ok(bx.width >= 44 && bx.height >= 44, `${tag}: delete button is ${Math.round(bx.width)}×${Math.round(bx.height)}px (≥44)`);
  await p.click('[data-act=del]'); ok(await p.isVisible('.toast button:has-text("Undo")'), `${tag}: delete shows Undo toast`); await p.click('.toast button'); ok(await E(() => JSON.parse(localStorage.ep_bets).length === 1), `${tag}: Undo restores the bet`);
  const tb = await p.locator('.toast').first().boundingBox().catch(() => null), rg = await p.locator('#rg').boundingBox(); ok(!tb || !rg || tb.y > rg.y + rg.height, `${tag}: toast never covers the disclaimer`);
  await shot('bets');
  // limits: set stop, lock blocks tracking
  await go(p, 'limits'); await p.fill('#limW', '10'); await p.fill('#limD', '3'); await p.click('[data-act=limsave]'); ok(await E(() => JSON.parse(localStorage.ep_limits).dailyStop === 3), `${tag}: limits saved`);
  p.once('dialog', d => d.accept()); await p.click('[data-act=lock][data-d="1"]'); ok(await p.isVisible('text=Paused until'), `${tag}: break engaged`); await shot('limits');
  await go(p, 'bets'); await p.click('[data-act=manual] >> nth=0'); ok(await p.isVisible('text=Tracking is paused') && await p.locator('#modal a[href="tel:18004264537"]').count() === 1, `${tag}: lock blocks tracking and shows 1-800-GAMBLER`); await p.click('#modal [data-act=mclose]');
  ok(!/recommend|you should bet|bet size|kelly/i.test(await p.innerText('body')), `${tag}: no bet-size recommendations anywhere`);
  // record: calibration + retune log
  await go(p, 'record'); ok(await p.isVisible('text=Calibration') && await p.locator('text=Weekly retune log').count() === 1, `${tag}: calibration chart + weekly retune log`); await shot('record');
  // every button in every view: click, no errors
  for (const v of ['scores', 'odds', 'desk', 'props', 'trends', 'ask', 'ledger', 'record', 'community', 'tools']) { await go(p, v); await p.waitForTimeout(600);
    const n = await p.locator('#view button:visible').count(); let clicked = 0;
    for (let i = 0; i < Math.min(n, 25); i++) { const bt = p.locator('#view button:visible').nth(i); const a = await bt.getAttribute('data-act').catch(() => null); if (['lock', 'del', 'gatecheck', 'addsrc', 'csv', 'pcard', 'signout', 'exjson', 'excsv', 'plst', 'delcloud', 'psign'].includes(a)) continue; p.once('dialog', d => d.dismiss().catch(() => {}));
      await bt.click({ timeout: 2000 }).then(() => clicked++).catch(() => {}); await p.waitForTimeout(150); await p.evaluate(() => document.querySelector('#modal')?.classList.add('hide')); if (await E(() => EP.tab) !== v) await go(p, v); }
    console.log(`INFO ${tag} ${v}: clicked ${clicked}/${n} buttons`); }
  ok(errs.length === 0, `${tag}: no console/page errors ${errs.slice(0, 3).join(' | ')}`); await ctx.close();
}
// accounts: profiles, verified picks, follows, leaderboard, RLS (two throwaway users)
if (PW) {
  const A = await mk({ width: 390, height: 844 }), B = await mk({ width: 1440, height: 900 });
  const signin = async (p, email) => { await p.goto(BASE + '#tools'); await p.waitForSelector('#aE'); await p.fill('#aE', email); await p.fill('#aP', PW); await p.click('[data-act=ein]'); await p.waitForSelector('text=Signed in as', { timeout: 20000 }); await p.evaluate(async () => { const m = await import('./js/account.js'); const c = m.client(), id = m.user.id; await c.from('edgepro_follows').delete().eq('follower', id); await c.from('edgepro_picks').delete().eq('user_id', id); await c.from('edgepro_profiles').delete().eq('user_id', id); }); await p.reload(); await p.waitForSelector('text=Signed in as', { timeout: 20000 }); };
  await signin(A.p, 'ep-v4-test-a@example.com'); ok(true, 'acct: A signs in with email');
  await go(A.p, 'community'); await A.p.waitForSelector('#pU', { timeout: 20000 }); await A.p.fill('#pU', 'Bad Name!'); await A.p.waitForTimeout(500); ok(/Lowercase/.test(await A.p.innerText('#pUMsg')), 'acct: invalid username rejected live');
  await A.p.fill('#pU', 'ep_v4_test_a'); await A.p.waitForSelector('#pUMsg:has-text("Available")', { timeout: 10000 }); ok(true, 'acct: username availability check');
  await A.p.fill('#pN', 'Test A'); await A.p.fill('#pB', 'Throwaway QA account'); await A.p.click('[data-act=pfs][data-s=NBA]'); await A.p.fill('#pT', 'NYK, NYJ');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'); await A.p.setInputFiles('#pAv', { name: 'a.png', mimeType: 'image/png', buffer: png }); await A.p.waitForSelector('#pAvMsg:has-text("Photo ready")', { timeout: 20000 }); ok(true, 'acct: avatar uploads to Supabase storage');
  await A.p.click('[data-act=psave]'); await A.p.waitForSelector('text=Verified record', { timeout: 20000 }); ok(await A.p.isVisible('text=@ep_v4_test_a') && await A.p.locator('.prof-h img').count() === 1, 'acct: profile created with avatar'); await A.p.screenshot({ path: `${OUT}/after-m-profile.png` });
  // post a pre-game pick from the Desk
  await A.p.goto(BASE + '#desk'); await A.p.waitForFunction(() => EP.fetched, null, { timeout: 30000 });
  for (const l of ['mlb', 'nfl', 'nhl', 'nba', 'ncaaf']) { await A.p.click(`[data-lg=${l}]`); await A.p.waitForFunction(x => EP.league === x && EP.fetched, l); await A.p.waitForTimeout(800); if (await A.p.locator('[data-act=share]').count()) break; }
  await A.p.locator('[data-act=share]').first().click(); await A.p.click('[data-act=ppost]'); await A.p.waitForSelector('#shMsg:has-text("Posted")', { timeout: 15000 }); ok(true, 'acct: pick posted to verified profile');
  await A.p.click('[data-act=ppost]'); await A.p.waitForSelector('#shMsg:has-text("Already posted")', { timeout: 15000 }); ok(true, 'acct: duplicate post blocked');
  // RLS probes from A's session
  const rls = await A.p.evaluate(async () => { const m = await import('./js/account.js'); const c = m.client(); const out = {};
    let r = await c.from('edgepro_picks').insert({ pick_key: 'x|forge', event_id: '1', path: 'basketball/nba', market: 'ml', side: 'home', label: 'Forged', price: -110, game_start: new Date(Date.now() + 864e5).toISOString(), result: 'win' }); out.forgeResult = !!r.error;
    r = await c.from('edgepro_picks').insert({ pick_key: 'x|past', event_id: '1', path: 'basketball/nba', market: 'ml', side: 'home', label: 'Past', price: -110, game_start: new Date(Date.now() - 3600e3).toISOString() }); out.pastGame = !!r.error;
    r = await c.from('edgepro_picks').update({ result: 'win' }).eq('pick_key', 'x').select(); const mine = await c.from('edgepro_picks').select('id').limit(1); r = await c.from('edgepro_picks').update({ result: 'win', units: 5 }).eq('id', mine.data?.[0]?.id).select(); out.updateBlocked = !r.data?.length;
    r = await c.from('edgepro_profiles').update({ bio: 'hacked' }).neq('username', 'ep_v4_test_a').select(); out.otherProfile = !r.data?.length; return out; });
  ok(rls.forgeResult && rls.pastGame && rls.updateBlocked && rls.otherProfile, 'acct: RLS blocks forged results, post-start picks, self-grading, editing others ' + JSON.stringify(rls));
  // B: taken username, follow A, feed, leaderboard
  await signin(B.p, 'ep-v4-test-b@example.com'); await go(B.p, 'community'); await B.p.waitForSelector('#pU', { timeout: 20000 }); await B.p.fill('#pU', 'ep_v4_test_a'); await B.p.waitForSelector('#pUMsg:has-text("Taken")', { timeout: 10000 }); ok(true, 'acct: taken username detected for second user');
  await B.p.fill('#pU', 'ep_v4_test_b'); await B.p.waitForTimeout(600); await B.p.click('[data-act=psave]'); await B.p.waitForSelector('text=Verified record', { timeout: 20000 });
  await B.p.click('[data-act=ptab][data-k=lb]'); await B.p.waitForSelector('text=@ep_v4_test_a', { timeout: 20000 }); ok(true, 'acct: leaderboard lists public profiles'); await B.p.screenshot({ path: `${OUT}/after-d-leaderboard.png` });
  await B.p.click('[data-act=puser][data-u=ep_v4_test_a]'); await B.p.waitForSelector('[data-act=pfollow]'); ok(await B.p.locator('text=Open').count() > 0, 'acct: public profile shows posted pick'); await B.p.click('[data-act=pfollow]'); await B.p.waitForSelector('[data-act=pfollow]:has-text("Following")', { timeout: 15000 }); ok(true, 'acct: follow works');
  await B.p.screenshot({ path: `${OUT}/after-d-public-profile.png` });
  await B.p.click('[data-act=pback]'); await B.p.click('[data-act=ptab][data-k=feed]'); await B.p.waitForSelector('text=@ep_v4_test_a', { timeout: 15000 }); ok(true, 'acct: following feed shows A\'s pick');
  // private profile hides from B
  await go(A.p, 'community'); await A.p.waitForSelector('[data-act=pedit]', { timeout: 20000 }); await A.p.click('[data-act=pedit]'); await A.p.uncheck('#pP'); await A.p.click('[data-act=psave]'); await A.p.waitForSelector('text=private', { timeout: 15000 });
  const hid = await B.p.evaluate(async () => { const m = await import('./js/account.js'); const r = await m.client().from('edgepro_profiles').select('username').eq('username', 'ep_v4_test_a'); const k = await m.client().from('edgepro_picks').select('id').eq('user_id', (await m.client().from('edgepro_follows').select('followee')).data?.[0]?.followee); return !r.data.length && !k.data.length; });
  ok(hid, 'acct: private profile and its picks hidden from others');
  ok(A.errs.length === 0 && B.errs.length === 0, 'acct: no console errors ' + [...A.errs, ...B.errs].slice(0, 3).join(' | '));
}
{ // consent gate + exports + change log (fresh context with no consent)
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, extraHTTPHeaders: HDR, acceptDownloads: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE); await p.waitForSelector("#cAge"); ok(await p.isDisabled('#cGo'), 'consent: continue disabled until both boxes');
  await p.keyboard.press('Escape'); ok(await p.isVisible('#cAge'), 'consent: Esc does not dismiss');
  await p.check('#cAge'); ok(await p.isDisabled('#cGo'), 'consent: one box not enough'); await p.check('#cTos'); await p.click('#cGo');
  const c = await p.evaluate(() => JSON.parse(localStorage.getItem('ep_consent'))); ok(c?.v === '2026-10-22' && c.at, 'consent: version + timestamp stored'); await p.evaluate(() => localStorage.setItem('ep_whats', '"2026-10-22b"'));
  await p.reload(); await p.waitForTimeout(800); ok(!(await p.isVisible('#cAge').catch(() => false)), 'consent: not asked again');
  await p.evaluate(() => localStorage.setItem('ep_bets', JSON.stringify([{ id: 'x1', game: 'A @ B', label: 'A ML', price: -110, stake: 1, start: '2026-10-01T20:00:00Z', result: 'win', profit: 0.91, placed: '2026-10-01T12:00:00Z' }])));
  await p.goto(BASE + "#tools"); await p.waitForTimeout(800);
  for (const [act, name] of [['exjson', 'edgepro-export.json'], ['excsv', 'edgepro-export.csv'], ['plst', 'edgepro-pl-statement.csv']]) { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click(`[data-act=${act}]`).catch(() => {})]); ok(d?.suggestedFilename() === name, 'export: ' + name); if (d && act === 'plst') { const fs = await import('fs'); const t = fs.readFileSync(await d.path(), 'utf8'); ok(/running_units/.test(t) && /0\.91/.test(t) && /2026-10,0\.91/.test(t), 'P/L statement rows + monthly'); } }
  // NY help line, CLV hero, stale-line finder, wording
  await p.goto(BASE + '#limits'); await p.waitForTimeout(800); await p.selectOption('#stSel', 'NY'); ok(/1-877-8-HOPENY/.test(await p.textContent('#rg')) && /1-800-GAMBLER/.test(await p.textContent('#rg')), 'NY: HOPENY shown with 1-800-GAMBLER');
  await p.selectOption('#stSel', 'NJ'); ok(!/HOPENY/.test(await p.textContent('#rg')), 'non-NY: HOPENY hidden');
  await p.evaluate(() => localStorage.setItem('ep_bets', JSON.stringify([{ id: 'c1', game: 'A @ B', label: 'A ML', price: -110, closePrice: -130, clv: 4.12, stake: 1, start: '2026-10-01T20:00:00Z', result: 'win', profit: 0.91 }])));
  await p.goto(BASE + '#record'); await p.waitForTimeout(1200); const hero = await p.textContent('.hero-clv').catch(() => ''); ok(/Skill score/.test(hero) && /\+7\.91%/.test(hero), 'record: CLV skill score is the headline ' + hero.match(/[+−-][\d.]+%/)?.[0]);
  ok((await p.evaluate(() => document.querySelector('main, #view')?.firstElementChild?.className || '')).includes('hero-clv') || (await p.$eval('.hero-clv', e => e.getBoundingClientRect().top)) < 400, 'record: CLV card first');
  await p.goto(BASE + '#odds'); await p.waitForTimeout(3000); const hasPre = await p.$('#stale'); if (hasPre) { await p.click('#stale [data-act=stalego]'); await p.waitForFunction(() => !document.querySelector('#stale .skel, #stale .sk'), null, { timeout: 30000 }).catch(() => {}); const t = await p.textContent('#stale'); ok(/Book|No book is more|No games with 3\+ books/.test(t), 'stale finder: result state rendered'); console.log('INFO stale', t.slice(0, 160)); } else console.log('INFO no pre-game events for stale finder');
  const body = await p.evaluate(async () => { const h = []; for (const t of ['desk', 'limits', 'tools', 'odds']) { location.hash = t; await new Promise(r => setTimeout(r, 400)); h.push(document.body.innerText); } return h.join(' '); });
  ok(!/\block\b|risk[- ]free|guarantee[ds]? (win|profit)/i.test(body), 'no lock / risk-free wording in UI');
  ok(!errs.length, 'consent/export: no page errors ' + errs.join('|')); await ctx.close(); }
for (const f of ['privacy.html', 'terms.html']) { const r = await fetch(BASE + f).catch(() => null); ok(r?.ok, f + ' served'); }
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);

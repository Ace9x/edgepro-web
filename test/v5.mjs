// growth/design batch + signed share links. BASE=... [EMAIL=... PW_FILE=...] node test/v5.mjs
import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE || 'https://ace9x.github.io/edgepro-web/', OUT = '/workspace/edgepro-shots/v4'; fs.mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
let fail = 0, pass = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const b = await chromium.launch();
const mk = async (vp, consent = true) => { const ctx = await b.newContext({ viewport: vp, userAgent: UA, extraHTTPHeaders: { 'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"' } }); if (consent) await ctx.addInitScript(() => { if (!localStorage.getItem('ep_consent')) localStorage.setItem('ep_consent', JSON.stringify({ v: '2026-10-22', at: new Date().toISOString() })); localStorage.setItem('ep_whats', '"2026-10-22c"'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS|net::/.test(m.text())) errs.push(m.text()); }); return { ctx, p, errs }; };
for (const [tag, vp] of [['m', { width: 390, height: 844 }], ['d', { width: 1440, height: 900 }]]) {
  const { ctx, p, errs } = await mk(vp); const shot = n => p.screenshot({ path: `${OUT}/v5-${tag}-${n}.png`, fullPage: false });
  await p.goto(BASE); await p.waitForFunction(() => window.EP?.fetched || document.querySelector('.card[data-ev]'), null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(800);
  ok(await p.$('script[type="application/ld+json"]') && await p.$('link[sizes="32x32"]') && await p.$('meta[property="og:image"]'), `${tag}: JSON-LD, 32px favicon, og:image`);
  await shot('scores');
  await p.goto(BASE + '#tools'); await p.waitForTimeout(800); await p.click('[data-act=ofmt][data-v=dec]'); await p.waitForTimeout(300);
  await p.goto(BASE + '#odds'); await p.waitForTimeout(1500); const t = await p.innerText('#view'); ok(/\b\d\.\d\d\b/.test(t) && !/[+−-]1[0-9]{2}\b/.test(t.split('Line history')[0].slice(0, 400)), `${tag}: decimal odds shown`); await shot('odds-decimal');
  await p.goto(BASE + '#tools'); await p.waitForTimeout(600); await p.click('[data-act=ofmt][data-v=am]'); ok(await p.isVisible('text=Glossary') && await p.isVisible('text=Open an issue'), `${tag}: glossary + feedback in Tools`); await shot('tools');
  await p.goto(BASE + '?calc=novig&a=-150&b=%2B130'); await p.waitForTimeout(1500); ok(await p.inputValue('#tA').catch(() => '') === '-150' && /58\.\d%/.test(await p.textContent('#tOut').catch(() => '')), `${tag}: ?calc= deep link fills calculator`);
  await p.goto(BASE + '#desk'); await p.waitForTimeout(2500); if (await p.$('.legend')) { await p.click('.legend summary'); ok(await p.isVisible('text=Juice cap') && await p.$('.meter, .src:has-text("Calibrated")'), `${tag}: grade legend + juice explainer + calibration meter`); await shot('desk-legend'); } else console.log('INFO desk: no games for legend');
  await p.evaluate(() => localStorage.setItem('ep_bets', JSON.stringify([1, 2, 3].map(i => ({ id: 'n' + i, game: 'A @ B', label: 'A ML', price: -110, stake: 1, start: '2026-10-01T20:00:00Z', result: 'win', profit: 0.91, placed: '2026-10-01' })))));
  await p.goto(BASE + '#bets'); await p.waitForTimeout(800); ok(await p.isVisible('.nudge'), `${tag}: sync nudge after 3 bets`); await p.click('[data-act=nudgex]'); ok(!(await p.isVisible('.nudge')), `${tag}: nudge dismiss sticks`);
  await p.goto(BASE + '#record'); await p.waitForTimeout(1200); await shot('record');
  await ctx.setOffline(true); await p.evaluate(() => dispatchEvent(new Event('offline'))); await p.waitForTimeout(300); ok(await p.isVisible('#netchip'), `${tag}: offline chip`); await ctx.setOffline(false); await p.evaluate(() => dispatchEvent(new Event('online')));
  await p.goto(BASE + '#s/999999999.bogus'); await p.waitForSelector('text=can\'t be verified', { timeout: 15000 }).catch(() => {}); ok(await p.isVisible('text=can\'t be verified'), `${tag}: forged share link rejected`); await shot('share-forged');
  ok(!errs.length, `${tag}: no console errors ${errs.slice(0, 3).join(' | ')}`); await ctx.close(); }
{ // what's new shows for a returning user once
  const { ctx, p } = await mk({ width: 390, height: 844 }, false); await ctx.addInitScript(() => { localStorage.setItem('ep_consent', JSON.stringify({ v: '2026-10-22' })); if (!sessionStorage.x) { localStorage.setItem('ep_whats', '"old"'); localStorage.setItem('ep_bets', '[{"id":"q"}]'); sessionStorage.x = 1; } });
  await p.goto(BASE); await p.waitForTimeout(2500); ok(await p.isVisible('text=What’s new'), 'whats new for returning user'); await p.click('[data-act=closemodal]'); await p.reload(); await p.waitForTimeout(2500); ok(!(await p.isVisible('text=What’s new')), 'whats new only once'); await ctx.close(); }
if (process.env.PW_FILE) { // signed share link round trip on a throwaway account
  const PW = fs.readFileSync(process.env.PW_FILE, 'utf8').trim(); const { ctx, p, errs } = await mk({ width: 390, height: 844 });
  await p.goto(BASE + '#tools'); await p.waitForSelector('#aE'); await p.fill('#aE', process.env.EMAIL); await p.fill('#aP', PW); await p.click('[data-act=ein]'); await p.waitForSelector('text=Signed in as', { timeout: 20000 });
  const r = await p.evaluate(async () => { const A = await import('./js/account.js'); await A.init(); const c = A.client(); const uid = (await c.auth.getUser()).data.user.id;
    await c.from('edgepro_profiles').insert({ user_id: uid, username: 'ep_share_tmp', display_name: 'Share test', is_public: true });
    const { data, error } = await c.from('edgepro_picks').insert({ user_id: uid, pick_key: 'share-test', event_id: '0', path: 'baseball/mlb', league: 'mlb', market: 'ml', side: 'home', label: 'TEST ML', game: 'X @ Y', price: -110, game_start: new Date(Date.now() + 864e5).toISOString() }).select('id').single();
    const So = await import('./js/social.js'); const url = await So.signShare(data.id); return { url, id: data.id, error: error?.message }; });
  ok(/#s\/\d+\.[\w-]{32}$/.test(r.url), 'share: signed link minted ' + r.url.split('#')[1]);
  await p.goto(r.url); await p.waitForSelector('text=Signed by EdgePro server', { timeout: 15000 }).catch(() => {}); ok(await p.isVisible('text=Signed by EdgePro server') && await p.isVisible('text=✓ Verified pre-game') && await p.isVisible('text=TEST ML'), 'share: link opens verified card'); await p.screenshot({ path: `${OUT}/v5-m-share-signed.png` });
  const tok = r.url.split('#s/')[1], bad = tok.slice(0, -1) + (tok.endsWith('A') ? 'B' : 'A'); const v = await p.evaluate(async t => (await import('./js/social.js')).verifyShare(t), bad); ok(v.valid === false, 'share: tampered signature rejected');
  const v2 = await p.evaluate(async t => (await import('./js/social.js')).verifyShare(t), String(+r.id + 1) + '.' + tok.split('.')[1]); ok(v2.valid === false, 'share: signature not reusable on another pick');
  const other = await p.evaluate(async () => { const r = await fetch('https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"pick_id":1}' }); return r.status; }); ok(other === 401, 'share: signing needs sign-in');
  ok(!errs.length, 'share: no console errors ' + errs.join('|')); await ctx.close(); }
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);

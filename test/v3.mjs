import { chromium } from 'playwright'; import fs from 'fs';
const BASE = process.env.BASE, OUT='/workspace/edgepro-shots/v3'; fs.mkdirSync(OUT,{recursive:true});
const HDR = { 'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"' };
const b = await chromium.launch();
for (const [w,h,tag] of [[390,844,'m'],[1366,900,'d']]) {
const ctx = await b.newContext({ viewport:{width:w,height:h}, extraHTTPHeaders: HDR, userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push('console: '+m.text()));
await p.goto(BASE); await p.waitForFunction(()=>EP.fetched,null,{timeout:30000});
await p.click('[data-lg=nba]'); await p.waitForFunction(()=>EP.league==='nba'&&EP.fetched,null,{timeout:30000});
if (!(await p.evaluate(()=>EP.events.some(e=>e.state==='pre')))) { await p.click('[data-day="1"]'); await p.waitForTimeout(3000); }
const pid = await p.evaluate(()=>EP.events.find(e=>e.state==='pre')?.id); await p.locator(pid?`[data-act=intel][data-id="${pid}"]`:'[data-act=intel]').first().click();
await p.waitForFunction(()=>!/Loading…/.test(document.querySelector('#modal').innerText),null,{timeout:30000}).catch(()=>{});
const t = await p.innerText('#modal'); console.log(pid, t.slice(0,400)); console.log(tag,'books rows', (await p.locator('#inB tr').count())-1, '| props rows', (await p.locator('#inP tr').count())-1, '| inj', /weight/.test(t), '| splits', /community/.test(t));
await p.screenshot({path:`${OUT}/${tag}-intel.png`, fullPage:true});
await p.click('#modal [data-act=mclose]'); await p.click('[data-t=bets]'); await p.click('[data-act=import]');
await p.fill('#imT','DraftKings\nKnicks +4.5 -110\nWager: $25\n\nFanDuel\nCeltics ML -180\nStake $50\nWon'); await p.click('#imPv');
console.log(tag,'import preview rows',(await p.locator('#imO tr').count())-1); await p.screenshot({path:`${OUT}/${tag}-import.png`}); await p.click('#imGo'); await p.waitForTimeout(500);
await p.screenshot({path:`${OUT}/${tag}-bets.png`, fullPage:true});
await p.click('[data-t=tools]'); await p.waitForTimeout(400); await p.locator('text=Now built in').scrollIntoViewIfNeeded(); await p.screenshot({path:`${OUT}/${tag}-tools.png`});
console.log(tag,'errors', JSON.stringify(errs)); await ctx.close(); }
await b.close();

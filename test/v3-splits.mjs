import { chromium } from 'playwright';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36', extraHTTPHeaders:{ 'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"' } });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
await p.goto('https://ace9x.github.io/edgepro-web/?v='+Date.now()); await p.waitForFunction(()=>EP.fetched,null,{timeout:30000});
await p.click('[data-lg=nba]'); await p.waitForFunction(()=>EP.league==='nba'&&EP.fetched); await p.click('[data-day="1"]'); await p.waitForTimeout(3000);
const id = await p.evaluate(()=>EP.events.find(e=>e.state==='pre').id);
await p.click(`[data-act=track][data-id="${id}"]`); await p.fill('#bP', (await p.inputValue('#bP'))||'-110'); await p.click('#bSave'); await p.waitForTimeout(2000);
await p.click(`[data-act=intel][data-id="${id}"]`); await p.waitForTimeout(6000);
console.log((await p.innerText('#inS')).slice(0,200)); await p.screenshot({path:'/workspace/edgepro-shots/v3/m-splits.png'}); console.log('errors',JSON.stringify(errs)); await b.close();

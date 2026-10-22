import { chromium } from 'playwright';
const [BASE, PFX] = [process.env.BASE, process.env.PFX];
const HDR = { 'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140"' };
const b = await chromium.launch();
for (const [w,h,n] of [[390,844,'m'],[1440,900,'d']]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, extraHTTPHeaders:HDR, userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' }); await ctx.addInitScript(() => { if (!localStorage.getItem('ep_consent')) localStorage.setItem('ep_consent', JSON.stringify({ v: '2026-10-22', at: new Date().toISOString() })); }); 
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push('console: '+m.text()));
  await p.goto(BASE); await p.waitForFunction(()=>window.EP&&EP.fetched,null,{timeout:30000}).catch(()=>{});
  await p.waitForTimeout(1500);
  for (const t of (process.env.TABS||'scores,odds,desk,props,bets,record,community,tools').split(',')) {
    await p.evaluate(t=>{EP.tab=t; document.querySelector(`[data-t=${t}]`)?.click();},t); await p.waitForTimeout(1200);
    await p.screenshot({ path:`/workspace/edgepro-shots/v4/${PFX}-${n}-${t}.png` });
  }
  console.log(n, 'errors:', JSON.stringify(errs));
}
await b.close();

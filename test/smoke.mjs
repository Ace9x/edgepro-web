import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 400, height: 860 } });
p.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text())); p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto('http://localhost:8811/'); await p.waitForFunction(() => EP.fetched, null, { timeout: 20000 });
console.log(await p.evaluate(() => ({ n: EP.events.length, poly: Object.values(EP.poly).filter(Boolean).length, k: EP.kalshi })));
for (const t of ['odds', 'desk', 'props', 'bets', 'community', 'tools']) { await p.click(`[data-t=${t}]`); await p.waitForTimeout(800); }
await p.click('[data-lg=nba]'); await p.waitForFunction(() => EP.fetched && EP.league === 'nba', null, { timeout: 20000 });
console.log(await p.evaluate(() => ({ n: EP.events.length, poly: Object.values(EP.poly).filter(Boolean).length, states: EP.events.map(e => e.state).join() })));
await b.close();

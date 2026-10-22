import { chromium } from 'playwright';
const b = await chromium.launch({ headless: false }); const p = await b.newPage();
await p.goto('https://ace9x.github.io/edgepro-web/privacy.html');
const ua = await p.evaluate(() => navigator.userAgent);
const lg = ['nfl','nba','nhl','mlb','wnba','college-football','mens-college-basketball','ncf','ncb'];
const r = await p.evaluate(async lg => Promise.all(lg.map(async l => { try { const x = await fetch(`https://cdn.espn.com/core/${l}/scoreboard?xhr=1`); const d = await x.json(); return [l, x.status, d.content?.sbData?.events?.length ?? 'no events key']; } catch (e) { return [l, 'ERR ' + e.message]; } })), lg);
console.log(ua); console.log(JSON.stringify(r)); await b.close();

# EdgePro Highbeam visual layer — gate (Nov 4 2026, ~10:00 PM ET)
Commits: bcff1a6 (css/highbeam.css, linked last in index.html, added to SW shell), 7d3d0da (odds tables scroll inside card). Live sw cache: edgepro-20261104215801.
Visual only: no JS/data/business logic changed. Research-only app, no bets.
Live gate (test/highbeam-gate.mjs, https://ace9x.github.io/edgepro-web/), 390x844 + 412x915, views scores/odds/bets/ask: 30/32 pass.
- PASS: Highbeam bg on every view, no clipped controls, no horizontal page scroll (fixed in 7d3d0da: odds table was widening page to 571px — also on old CSS), tabs/chips ≥44px, reload renders, offline reload renders from SW cache.
- FAIL (pre-existing, not from this change): console shows browser CORS blocks on ESPN scoreboard fetch (site.api.espn.com) — curl with the same Origin returns access-control-allow-origin:*, so it's intermittent upstream; the app's fallback sources still render scores. Not fixed: data-layer change, out of a visual pass.
Not covered: real Safari engine; no tap-by-tap assertion of every button's action (layout + navigation only).

## v2 (Nov 4, ~10:45 PM ET): ESPN fix, brand audit, WebKit, before/after
- Root cause: from this box's Chromium, every fetch to site.api.espn.com is CORS-blocked (6/6), while site.web.api.espn.com and cdn.espn.com return 200 (3/3 each). curl to site.api with the same Origin gets ACAO:* — so it's host/network specific, not something the app can suppress.
- Fix (js/data.js, intel.js, ask.js, trends.js): ESPN calls try site.web.api.espn.com first, fall back to site.api.espn.com only if that fails. Scoreboard source order is now site.web → site.api → CDN → EdgePro relay, names unchanged so the "source" label stays honest. If site.web fails and site.api is blocked, the browser still logs the CORS error — not hidden.
- Gate now prints which source served scores (INFO line) and keeps 0-console-errors strict. Local gate serves local files at the real https://ace9x.github.io origin via Playwright route (Supabase CORS is locked to that origin), so the local run is meaningful.
- Brand audit: removed "TODO: Fan's contact email" from privacy.html and terms.html; removed "Fan's" from js/core.js comment. No Gmail/location found.
- Local gate Chromium: 32/32, scores served by "ESPN site.web API", 0 console errors. Unit 16/16.
- WebKit (webkit-2370): launches but this box's build has no TLS, so every HTTPS fetch fails; scores never load. Layout checks pass (30/32); console check fails on TLS errors. apt install of glib-networking failed (mirror SSL errors). WebKit is NOT verified for data/console.
- Before/after: qa/highbeam/before/ (704b602, pre-Highbeam) vs qa/highbeam/v2-local/ and live/.

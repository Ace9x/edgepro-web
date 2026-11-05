# EdgePro Highbeam visual layer — gate (Nov 4 2026, ~10:00 PM ET)
Commits: bcff1a6 (css/highbeam.css, linked last in index.html, added to SW shell), 7d3d0da (odds tables scroll inside card). Live sw cache: edgepro-20261104215801.
Visual only: no JS/data/business logic changed. Research-only app, no bets.
Live gate (test/highbeam-gate.mjs, https://ace9x.github.io/edgepro-web/), 390x844 + 412x915, views scores/odds/bets/ask: 30/32 pass.
- PASS: Highbeam bg on every view, no clipped controls, no horizontal page scroll (fixed in 7d3d0da: odds table was widening page to 571px — also on old CSS), tabs/chips ≥44px, reload renders, offline reload renders from SW cache.
- FAIL (pre-existing, not from this change): console shows browser CORS blocks on ESPN scoreboard fetch (site.api.espn.com) — curl with the same Origin returns access-control-allow-origin:*, so it's intermittent upstream; the app's fallback sources still render scores. Not fixed: data-layer change, out of a visual pass.
Not covered: real Safari engine; no tap-by-tap assertion of every button's action (layout + navigation only).

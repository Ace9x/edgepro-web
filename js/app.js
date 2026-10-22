import * as C from './core.js';
import * as D from './data.js';
import * as L from './learn.js';
const $ = s => document.querySelector(s), V = $('#view');
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('ep_' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('ep_' + k, JSON.stringify(v)) };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = p => (p == null ? '—' : (p * 100).toFixed(1) + '%');
const tm = iso => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const S = window.EP = { league: LS.get('league', 'mlb'), tab: 'scores', events: [], poly: {}, kalshi: null, fetched: null, err: null, dayOff: 0 };

// ---------- loading ----------
async function load() {
  const lg = S.league; const date = S.dayOff ? new Date(Date.now() + S.dayOff * 864e5) : null;
  try {
    const [ev, pl, k] = await Promise.all([D.scoreboard(lg, date), D.polyEvents(lg).catch(e => (S.polyErr = e.message, [])), D.kalshi(lg)]);
    if (lg !== S.league) return;
    S.events = ev; S.kalshi = k; S.poly = {}; S.kal = {}; ev.forEach(e => { S.poly[e.id] = D.matchPoly(e, pl); S.kal[e.id] = D.matchKalshi(e, k); });
    S.fetched = new Date(); S.err = null; snapshot(); await autoSettle(); await L.gradeOpen(S.events, D.eventFinal, closeFor).catch(() => {});
  } catch (e) { S.err = e.message; }
  render();
}
// line-movement history (client-side)
function snapshot() {
  const h = LS.get('hist', {}); const now = Date.now();
  for (const e of S.events) { if (!e.odds || e.state === 'post') continue; const o = e.odds, a = h[e.id] || [], last = a[a.length - 1];
    const s = { t: now, mh: o.ml.home?.close, ma: o.ml.away?.close, sp: o.spread.home?.line, tot: o.total.line, ph: S.poly[e.id]?.ml?.home };
    if (!last || ['mh', 'ma', 'sp', 'tot', 'ph'].some(k => last[k] !== s[k])) a.push(s); h[e.id] = a.slice(-200); }
  for (const id in h) if (now - h[id][h[id].length - 1].t > 14 * 864e5) delete h[id];
  LS.set('hist', h);
}
// Serialized: the 60s refresh and a Save can both run autoSettle; without a lock the slower run wrote back a stale
// bet list and erased a just-saved settlement (the e2e saw "loss" then "open"). Each pass re-reads storage and merges by id.
let settling = Promise.resolve();
function autoSettle() { settling = settling.then(settlePass, settlePass); return settling; }
async function settlePass() {
  const bets = LS.get('bets', []); const upd = {};
  for (const b of bets) {
    if (b.result) continue; let fin = null; const ev = S.events.find(e => e.id === b.eventId); const u = {};
    if (ev && ev.completed) fin = { home: ev.home.score, away: ev.away.score, completed: true };
    else if (!ev && Date.now() - new Date(b.start) > 3 * 3600e3) fin = await D.eventFinal(b.path, b.eventId).catch(() => null);
    if (ev && b.closePrice == null && ev.state !== 'pre') { const cp = closeFor(ev, b); if (cp != null) Object.assign(u, { closePrice: cp, clv: C.clv(b.price, cp) }); }
    if (fin?.completed) { const r = C.settle(b, fin); if (r) Object.assign(u, r, { final: `${fin.away}-${fin.home}`, settledAt: new Date().toISOString(), auto: true }); }
    if (Object.keys(u).length) upd[b.id] = u;
  }
  if (Object.keys(upd).length) { const cur = LS.get('bets', []); cur.forEach(b => { if (upd[b.id] && !b.result) Object.assign(b, upd[b.id]); }); LS.set('bets', cur); }
}
function closeFor(ev, b) { const o = ev.odds; if (!o) return null; if (b.market === 'ml') return o.ml[b.side]?.close; if (b.market === 'spread') return o.spread[b.side]?.line == b.line ? o.spread[b.side]?.close : null; if (b.market === 'total') return o.total.line == b.line ? o.total[b.side]?.close : null; }

// ---------- market math per game ----------
function markets(e) {
  const o = e.odds, P = S.poly[e.id], K = S.kal[e.id], out = [];
  if (o?.ml.home?.close != null && o.ml.away?.close != null) {
    const nv = C.noVig(o.ml.home.close, o.ml.away.close);
    for (const sd of ['away', 'home']) { const team = e[sd];
      const quotes = [{ book: o.provider, price: o.ml[sd].close }]; if (P?.ml) quotes.push({ book: 'Polymarket', price: C.probToAm(P.ml[sd]), prob: P.ml[sd] }); if (K?.[sd]) quotes.push({ book: 'Kalshi', price: C.probToAm(K[sd]), prob: K[sd] });
      const src = [{ name: o.provider + ' no-vig', prob: sd === 'home' ? nv.p1 : nv.p2 }]; if (P?.ml) src.push({ name: 'Polymarket', prob: P.ml[sd] }); if (K?.[sd]) src.push({ name: 'Kalshi', prob: K[sd] });
      out.push({ key: `${e.id}|ml|${sd}`, e, market: 'ml', side: sd, label: `${team.abbr} ML`, price: o.ml[sd].close, open: o.ml[sd].open, quotes, src, hold: nv.hold }); }
  }
  if (o?.total.over?.close != null) {
    const L = o.total.line, nv = C.noVig(o.total.over.close, o.total.under.close), pt = P?.totals.find(t => t.line === L);
    for (const sd of ['over', 'under']) { const quotes = [{ book: o.provider, price: o.total[sd].close }]; const src = [{ name: o.provider + ' no-vig', prob: sd === 'over' ? nv.p1 : nv.p2 }];
      if (pt) { quotes.push({ book: 'Polymarket', price: C.probToAm(pt[sd]), prob: pt[sd] }); src.push({ name: 'Polymarket', prob: pt[sd] }); }
      out.push({ key: `${e.id}|total|${sd}`, e, market: 'total', side: sd, line: L, label: `${sd === 'over' ? 'Over' : 'Under'} ${L}`, price: o.total[sd].close, open: o.total[sd].open, openLine: o.total[sd].openLine, quotes, src, hold: nv.hold }); }
  }
  if (o?.spread.home?.close != null) for (const sd of ['away', 'home']) { const s = o.spread[sd]; const nv = C.noVig(o.spread.away.close, o.spread.home.close);
    out.push({ key: `${e.id}|spread|${sd}`, e, market: 'spread', side: sd, line: s.line, label: `${e[sd].abbr} ${s.line > 0 ? '+' : ''}${s.line}`, price: s.close, open: s.open, openLine: s.openLine, quotes: [{ book: o.provider, price: s.close }], src: [{ name: o.provider + ' no-vig', prob: sd === 'away' ? nv.p1 : nv.p2 }], hold: nv.hold }); }
  out.forEach(m => { m.best = C.best(m.quotes); m.fair = m.src.reduce((x, s) => x + s.prob, 0) / m.src.length; m.ev = m.best ? C.ev(m.fair, m.best.price) : null; });
  return out;
}
const userSrc = k => LS.get('usrc', {})[k] || [];
function grade(m) {
  const extra = userSrc(m.key); const w = S.wx?.[m.e.id];
  return C.gradePick({ cal: L.calibration(), sport: m.e.league, market: m.market, side: m.label, price: m.best?.book === m.e.odds?.provider ? m.price : m.price, sources: [...m.src, ...extra],
    wind: w && !w.indoor ? { mph: w.mph, blowingIn: LS.get('windIn', {})[m.e.id] ?? null } : null });
}

// ---------- render ----------
function head() {
  const ago = S.fetched ? Math.round((Date.now() - S.fetched) / 1000) : null;
  return `<div class="row" style="justify-content:space-between;margin-top:6px"><div class="row">${[-1, 0, 1, 2].map(d => `<button class="chip ${S.dayOff === d ? 'on' : ''}" data-day="${d}">${['Yesterday', 'Today', 'Tomorrow', '+2 days'][d + 1]}</button>`).join('')}</div>
  <div class="src" id="stamp">Data: ESPN public API${S.league !== 'soccer' ? ', Polymarket' : ''}${S.kalshi?.ok ? ', Kalshi' : ''} · updated ${S.fetched ? S.fetched.toLocaleTimeString() : '…'}${ago != null ? ` (${ago}s ago)` : ''} · auto-refresh 60s</div></div>
  ${S.err ? `<div class="card" style="border-color:var(--rd)">Couldn't load live data: ${esc(S.err)}. Retrying every 60s.</div>` : ''}
  ${S.kalshi && !S.kalshi.ok && S.tab !== 'scores' ? `<div class="src">Kalshi: ${esc(S.kalshi.why)}</div>` : ''}`;
}
function mv(open, close) { if (open == null || close == null || open === close) return ''; const better = C.amToDec(close) > C.amToDec(open); return ` <span class="small ${better ? 'mv-up' : 'mv-dn'}" title="opened ${C.fmtAm(open)}">${better ? '▲' : '▼'}${C.fmtAm(open)}</span>`; }
function gameCard(e) {
  const o = e.odds, P = S.poly[e.id], st = e.state === 'in' ? `<span class="live">● LIVE</span> ${esc(e.detail)}` : esc(e.state === 'pre' ? tm(e.start) : e.detail);
  const t = sd => `<div class="tm"><img src="${e[sd].logo || ''}" alt="" loading="lazy">${esc(e[sd].name)} <span class="muted small">${esc(e[sd].record || '')}</span></div><div class="sc ${e.completed && e[sd].winner ? 'win' : ''}">${e.state === 'pre' ? '' : e[sd].score ?? ''}</div>`;
  return `<div class="card" data-ev="${e.id}"><div class="status"><span>${st}</span><span>${esc(e.broadcast || '')}${e.path.startsWith('soccer') ? ' · ' + esc(e.path.split('/')[1]) : ''}</span></div><div class="game">${t('away')}${t('home')}</div>
  ${o ? `<div class="oddrow"><div class="od">ML<b>${C.fmtAm(o.ml.away?.close)} / ${C.fmtAm(o.ml.home?.close)}</b>${mv(o.ml.home?.open, o.ml.home?.close)}</div><div class="od">Spread<b>${o.spread.home?.line != null ? e.home.abbr + ' ' + (o.spread.home.line > 0 ? '+' : '') + o.spread.home.line : '—'}</b>${C.fmtAm(o.spread.home?.close)}</div><div class="od">Total<b>${o.total.line ?? '—'}</b>${o.total.over?.openLine != null && o.total.over.openLine !== o.total.line ? `<span class="small">opened ${o.total.over.openLine}</span>` : C.fmtAm(o.total.over?.close)}</div></div>
  <div class="src">Odds: ${esc(o.provider)} via ESPN${P?.ml ? ` · <a href="${P.url}" target="_blank" rel="noopener">Polymarket</a> ${e.away.abbr} ${pct(P.ml.away)} / ${e.home.abbr} ${pct(P.ml.home)}` : ''}</div>` : '<div class="src">No odds posted on ESPN for this game.</div>'}
  <div class="row" style="margin-top:8px"><button class="btn sm" data-act="track" data-id="${e.id}">+ Track bet</button><button class="btn sm" data-act="desk" data-id="${e.id}">Desk grade</button><button class="btn sm" data-act="ace" data-id="${e.id}">Ask Ace</button></div></div>`;
}
const views = {
  scores() { const live = S.events.filter(e => e.state === 'in'), pre = S.events.filter(e => e.state === 'pre'), post = S.events.filter(e => e.state === 'post');
    return head() + (S.events.length ? [['Live', live], ['Upcoming', pre], ['Final', post]].filter(x => x[1].length).map(([h, l]) => `<h3>${h} <span class="muted small">${l.length}</span></h3><div class="grid2">${l.map(gameCard).join('')}</div>`).join('') : `<div class="card">${S.fetched ? 'No ' + D.LEAGUES[S.league].n + ' games on this date.' : 'Loading live games…'}</div>`); },
  odds() { const ms = S.events.filter(e => e.state !== 'post').flatMap(markets); const h = LS.get('hist', {});
    const evs = ms.filter(m => m.quotes.length > 1 && m.ev > 0).sort((a, b) => b.ev - a.ev);
    const arbs = []; for (let i = 0; i < ms.length; i += 2) { const a = ms[i], b = ms[i + 1]; if (b && a.e === b.e && a.market === b.market && a.best && b.best) { const r = C.arb(a.best.price, b.best.price); if (r.isArb) arbs.push({ a, b, r }); } }
    return head() + `<div class="card"><b>+EV finder</b> <span class="muted small">best available price vs. consensus fair probability (avg of de-vigged book + prediction markets). Free.</span>
    ${evs.length ? `<table><tr><th>Game</th><th>Bet</th><th>Best</th><th>Fair</th><th>EV</th></tr>${evs.slice(0, 15).map(m => `<tr><td>${esc(m.e.name)}</td><td>${esc(m.label)}</td><td>${C.fmtAm(m.best.price)} <span class="muted small">${esc(m.best.book)}</span></td><td>${pct(m.fair)}</td><td class="mv-up">+${(m.ev * 100).toFixed(1)}%</td></tr>`).join('')}</table>` : '<div class="muted">No positive-EV prices right now across the sources loaded.</div>'}</div>
    <div class="card"><b>Arbitrage scan</b> ${arbs.length ? arbs.map(x => `<div>${esc(x.a.e.name)}: ${esc(x.a.label)} ${C.fmtAm(x.a.best.price)} @${esc(x.a.best.book)} + ${esc(x.b.label)} ${C.fmtAm(x.b.best.price)} @${esc(x.b.best.book)} → ${(x.r.margin * 100).toFixed(2)}% (stake ${(x.r.stake1 * 100).toFixed(0)}/${(x.r.stake2 * 100).toFixed(0)})</div>`).join('') : '<span class="muted">none found in loaded sources</span>'}</div>
    ${S.events.filter(e => e.state !== 'post' && e.odds).map(e => { const m = markets(e); const hs = h[e.id] || [];
      return `<div class="card"><div class="status"><b>${esc(e.away.name)} @ ${esc(e.home.name)}</b><span>${esc(e.state === 'pre' ? tm(e.start) : e.detail)}</span></div>
      <table><tr><th>Bet</th><th>Open</th><th>${esc(e.odds.provider)}</th><th>Poly</th><th>Kalshi</th><th>Best</th><th>No-vig fair</th></tr>${m.map(x => { const q = b => x.quotes.find(y => y.book === b); return `<tr><td>${esc(x.label)}</td><td>${C.fmtAm(x.open)}${x.openLine != null && x.openLine !== x.line ? ' (' + x.openLine + ')' : ''}</td><td>${C.fmtAm(x.price)}</td><td>${q('Polymarket') ? C.fmtAm(q('Polymarket').price) : '—'}</td><td>${q('Kalshi') ? C.fmtAm(q('Kalshi').price) : '—'}</td><td><b>${C.fmtAm(x.best?.price)}</b></td><td>${pct(x.src[0].prob)} (${C.fmtAm(C.probToAm(x.src[0].prob))})</td></tr>`; }).join('')}</table>
      <div class="src">Hold ${m[0] ? (m[0].hold * 100).toFixed(1) + '%' : '—'} · Line history on this device: ${hs.length} snapshot(s)${hs.length > 1 ? ' — ' + hs.map(s => `${new Date(s.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ${C.fmtAm(s.mh)}`).slice(-6).join(' → ') : ' (keeps recording while the app is open)'}</div></div>`; }).join('')}`; },
  desk() { const ms = S.events.filter(e => e.state === 'pre').flatMap(markets).filter(m => m.market !== 'spread'); const gs = ms.map(m => ({ m, g: grade(m) })).sort((a, b) => (b.g.official - a.g.official) || ((b.g.conf || 0) - (a.g.conf || 0)));
    L.logShown(gs).catch(() => {}); const only = S.deskOnly; const list = only ? gs.filter(x => x.m.e.id === only) : gs;
    return head() + `<div class="card"><b>Research Desk</b> — every pick graded by the desk rules: tiers A ≥75% · B 68–74 · C+ 62–67 · C 58–61 · D pass. <b>Official only at C+ or better with two independent outside numbers</b>, juice cap −230, no model-only plays, MLB Over wind gate (≥9 mph). Outside numbers loaded automatically: de-vigged book price, Polymarket, Kalshi (when reachable). Add your own (e.g. ZCode, Ballpark Pal %) on any pick.
    ${only ? '<div><button class="btn sm" data-act="deskall">Show whole slate</button></div>' : ''}<div class="src">Official: ${gs.filter(x => x.g.official).length} · graded: ${gs.length}. A book's own de-vigged line rarely beats its own price — Officials require the markets to disagree with the book.</div></div>
    ${list.map(({ m, g }) => `<div class="card"><div class="row" style="justify-content:space-between"><div><span class="grade g${g.grade.replace('+', 'p')}">${g.grade}</span> <b>${esc(m.label)}</b> ${C.fmtAm(m.price)} <span class="muted small">${esc(m.e.away.abbr)} @ ${esc(m.e.home.abbr)} · ${tm(m.e.start)}</span></div><span class="tag ${g.official ? 'off' : ''}">${g.status}</span></div>
    <details><summary class="small muted">Reasoning stack (${g.why.length})</summary><ul class="why">${g.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>
    ${m.e.league === 'mlb' && m.market === 'total' ? `<div class="small" data-wx="${m.e.id}">${wxLine(m.e)}</div>` : ''}
    <div class="row" style="margin-top:6px"><button class="btn sm" data-act="addsrc" data-k="${m.key}">+ Outside number</button><button class="btn sm" data-act="share" data-k="${m.key}">Share pick</button><button class="btn sm" data-act="trackm" data-k="${m.key}">Track</button></div></div>`).join('') || '<div class="card muted">No upcoming games with odds to grade.</div>'}`; },
  props() { const evs = S.events; const P = S.prop || {};
    return head() + `<div class="card"><b>Prop hit-rate history</b> <span class="muted small">(free — what Outlier/Props.Cash charge for). Real ESPN game logs.</span>
    <div class="row"><div><label>Game</label><select id="pGame"><option value="">Pick a game</option>${evs.map(e => `<option value="${e.id}" ${P.ev === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
    <div><label>Player</label><select id="pPlayer">${(P.roster || []).map(r => `<option value="${r.id}" ${P.pid === r.id ? 'selected' : ''}>${esc(r.name)} ${esc(r.pos || '')}</option>`).join('') || '<option>—</option>'}</select></div>
    <div><label>Stat</label><select id="pStat">${(P.log?.labels || []).map((l, i) => `<option value="${i}" ${P.stat == i ? 'selected' : ''}>${esc(l)}</option>`).join('') || '<option>—</option>'}</select></div>
    <div><label>Line</label><input id="pLine" type="number" step="0.5" value="${P.line ?? ''}" style="width:80px"></div></div><div id="pOut">${propOut()}</div></div>`; },
  bets() { const bets = LS.get('bets', []); const r = C.record(bets); const pl = LS.get('parlay', []);
    return `<div class="card"><b>My record</b> <span class="muted small">(computed on your device from the bets below — editable, exportable)</span><div class="oddrow"><div class="od">W-L-P<b>${r.w}-${r.l}-${r.p}</b></div><div class="od">Profit<b class="${r.profit >= 0 ? 'mv-up' : 'mv-dn'}">${r.profit >= 0 ? '+' : ''}${r.profit}</b></div><div class="od">ROI<b>${r.roi}%</b></div></div><div class="oddrow"><div class="od">Avg CLV<b>${r.avgClv == null ? '—' : r.avgClv + ' pts'}</b></div><div class="od">Open<b>${r.open}</b></div><div class="od"><button class="btn sm" data-act="csv">Export CSV</button></div></div></div>
    <div class="card"><b>Parlay check</b> ${pl.length ? `<div>${pl.map((l, i) => `<div>${esc(l.label)} ${C.fmtAm(l.price)} <button class="btn sm" data-act="plrm" data-i="${i}">✕</button></div>`).join('')}<div>Combined price: <b>${C.fmtAm(C.parlayPrice(pl))}</b></div>${C.correlation(pl).map(w => `<div class="mv-dn small">⚠ ${esc(w)}</div>`).join('') || '<div class="small mv-up">No correlation flags.</div>'}<button class="btn sm" data-act="plclear">Clear</button></div>` : '<span class="muted small">Use "Parlay" on an open bet to test legs for correlation.</span>'}</div>
    <div class="card"><b>Bets</b> · settles automatically from ESPN finals; CLV recorded vs. the closing price. <button class="btn sm pri" data-act="track">+ Add bet</button>
    <table><tr><th>Bet</th><th>Price</th><th>Stake</th><th>Close / CLV</th><th>Result</th><th></th></tr>${bets.slice().reverse().map(b => `<tr><td>${esc(b.label)}<div class="muted small">${esc(b.game)} · ${new Date(b.start).toLocaleDateString()}</div></td><td>${C.fmtAm(b.price)}</td><td>${b.stake}</td><td>${C.fmtAm(b.closePrice)}${b.clv != null ? `<div class="small ${b.clv >= 0 ? 'mv-up' : 'mv-dn'}">${b.clv > 0 ? '+' : ''}${b.clv}</div>` : ''}</td><td>${b.result ? `<b class="${b.result === 'win' ? 'mv-up' : b.result === 'loss' ? 'mv-dn' : ''}">${b.result}</b> ${b.profit > 0 ? '+' : ''}${b.profit ?? ''}<div class="muted small">${esc(b.final || '')}</div>` : 'open'}</td><td><button class="btn sm" data-act="pladd" data-bid="${b.id}">Parlay</button> <button class="btn sm" data-act="edit" data-bid="${b.id}">Edit</button> <button class="btn sm" data-act="del" data-bid="${b.id}">✕</button></td></tr>`).join('')}</table></div>`; },
  community() { const me = LS.get('me', null), mine = LS.get('mypicks', []), fol = LS.get('follow', {});
    return `<div class="card"><b>Community picks</b> <span class="muted small">Profiles live on your device. Share any pick as a link — anyone who opens it can follow you. No fake leaderboards: records shown are computed from settled picks in the link.</span>
    ${me ? `<div style="margin-top:8px">You are <b>@${esc(me.handle)}</b> · ${mine.length} shared pick(s) · <button class="btn sm" data-act="shareprof">Copy my profile link</button></div>` : `<div class="row"><div><label>Pick a handle</label><input id="handle" maxlength="20" placeholder="e.g. ace9x"></div><button class="btn pri" data-act="mkprof">Create profile</button></div>`}</div>
    <div class="card"><b>My picks</b>${mine.map(p => pickRow(p)).join('') || '<div class="muted small">Share a pick from the Desk to post it here.</div>'}</div>
    ${Object.values(fol).map(f => `<div class="card"><b>@${esc(f.handle)}</b> <span class="muted small">followed · ${f.picks.length} picks · ${recOf(f.picks)}</span> <button class="btn sm" data-act="unf" data-h="${esc(f.handle)}">Unfollow</button>${f.picks.map(pickRow).join('')}</div>`).join('') || '<div class="card muted small">You are not following anyone yet. Open a friend\'s EdgePro share link to follow them.</div>'}`; },
  record() { const R = L.cached(), done = R.filter(r => r.result), cal = L.calibration() || { n: 0, k: 1, w: {}, brier: {} };
    const all = C.summarize(R).all, tbl = (title, fn) => { const g = C.summarize(R, fn); const ks = Object.keys(g).sort(); return `<div class="card"><b>${title}</b>${ks.length ? `<table><tr><th></th><th>W-L-P</th><th>Hit</th><th>Expected</th><th>Units (1u flat)</th><th>Avg CLV</th><th>Beat close</th></tr>${ks.map(k => { const x = g[k]; return `<tr><td>${esc(k)}</td><td>${x.w}-${x.l}-${x.p}</td><td>${x.hit == null ? '—' : pct(x.hit)}</td><td>${x.expHit == null ? '—' : pct(x.expHit)}</td><td class="${x.units >= 0 ? 'mv-up' : 'mv-dn'}">${x.units > 0 ? '+' : ''}${x.units}</td><td>${x.avgClv == null ? '—' : x.avgClv + ' pts'}</td><td>${x.beatClose == null ? '—' : pct(x.beatClose)}</td></tr>`; }).join('')}</table>` : '<div class="muted small">No graded picks yet.</div>'}</div>`; };
    return `<div class="card"><b>How we're doing</b> <span class="muted small">Every pick and lean the Desk showed on this device, graded automatically from ESPN finals — wins and losses. Units assume a flat 1u per pick for scoring only; EdgePro never suggests stakes. CLV = shown price vs. the last pre-game price.</span>
    <div class="oddrow"><div class="od">Logged<b id="recN">${R.length}</b></div><div class="od">Graded<b>${done.length}</b></div><div class="od">Record<b>${all ? `${all.w}-${all.l}-${all.p}` : '—'}</b></div></div>
    <div class="oddrow"><div class="od">Hit rate<b>${all?.hit == null ? '—' : pct(all.hit)}</b></div><div class="od">Units<b>${all ? (all.units > 0 ? '+' : '') + all.units : '—'}</b></div><div class="od">Avg CLV<b>${all?.avgClv == null ? '—' : all.avgClv + ' pts'}</b></div></div>
    ${R.length ? '' : '<div class="muted" style="margin-top:8px">Nothing graded yet. The record starts empty and fills in as Desk picks you viewed reach a final score.</div>'}</div>
    ${tbl('By grade', r => (r.official ? 'Official ' : 'Lean ') + r.grade)}${tbl('By sport', r => D.LEAGUES[r.league]?.n || r.league)}${tbl('By market', r => ({ ml: 'Moneyline', total: 'Total', spread: 'Spread' })[r.market])}
    <div class="card"><b>Self-calibration</b> <div class="small muted">Confidence slope k = ${cal.k} from ${cal.n} decided results (stays 1.0 until ${C.MIN_CAL}). Source weights switch on after ${C.MIN_SRC} graded results per source.</div>
    <table><tr><th>Source</th><th>Graded</th><th>Brier</th><th>Weight</th></tr>${Object.entries(cal.brier).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${v.b}</td><td>${cal.w[k] ?? '1 (not enough data)'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No graded sources yet.</td></tr>'}</table>
    <label class="row small" style="align-items:center;margin-top:8px"><input type="checkbox" id="syncT" ${L.syncOn() ? 'checked' : ''}> Share anonymous grades to the EdgePro server (results only, no account, insert-only)</label></div>
    <div class="card"><b>Recent graded</b>${done.slice().sort((a, b) => new Date(b.start) - new Date(a.start)).slice(0, 30).map(r => `<div class="small" style="border-top:1px solid var(--line);padding:6px 0"><span class="grade g${r.grade.replace('+', 'p')}">${r.grade}</span> <b>${esc(r.label)}</b> ${C.fmtAm(r.shownPrice)} · ${esc(r.game)} ${esc(r.final)} · <b class="${r.result === 'win' ? 'mv-up' : r.result === 'loss' ? 'mv-dn' : ''}">${r.result}</b>${r.clv != null ? ` · CLV ${r.clv > 0 ? '+' : ''}${r.clv}` : ''}</div>`).join('') || '<div class="muted small">None yet.</div>'}</div>`; },
  tools() { return `<div class="card"><b>No-vig fair odds & EV calculator</b><div class="row"><div><label>Side A price</label><input id="tA" value="-110" style="width:90px"></div><div><label>Side B price</label><input id="tB" value="-110" style="width:90px"></div><div><label>Your win % for A (optional)</label><input id="tP" placeholder="e.g. 55" style="width:90px"></div><div><label>Price you can get on A</label><input id="tX" placeholder="e.g. +105" style="width:90px"></div></div><div id="tOut" class="card"></div></div>
    <div class="card"><b>Responsible gambling</b><p class="small muted">EdgePro is free research software for adults 21+ where sports wagering is legal. It never takes bets, holds money, or links to deposit offers. Odds and probabilities are estimates; no outcome is guaranteed. If gambling stops being fun, call or text <a href="tel:18004264537">1-800-GAMBLER</a> (NY: 1-877-8-HOPENY).</p></div>
    <div class="card small muted">Data sources: ESPN public site API (scores, schedules, DraftKings/ESPN BET odds incl. open & close), Polymarket Gamma API (prediction-market prices), Kalshi public API (when your network allows), Open-Meteo (game-time wind), ESPN game logs (props). All free & keyless. Line history and bets are stored only in this browser.</div>`; },
};
const recOf = ps => { const s = ps.filter(p => p.result); return s.length ? `${s.filter(p => p.result === 'win').length}-${s.filter(p => p.result === 'loss').length} settled` : 'no settled picks yet'; };
const pickRow = p => `<div class="small" style="margin-top:6px;border-top:1px solid var(--line);padding-top:6px"><span class="grade g${String(p.grade).replace('+', 'p')}">${esc(p.grade)}</span> <b>${esc(p.label)}</b> ${C.fmtAm(p.price)} · ${esc(p.game)} · ${new Date(p.start).toLocaleDateString()} ${p.official ? '<span class="tag off">OFFICIAL</span>' : ''} ${p.result ? '<b>' + esc(p.result) + '</b>' : ''}</div>`;
function wxLine(e) { const w = S.wx?.[e.id]; if (w === undefined) { S.wx = S.wx || {}; S.wx[e.id] = null; D.weather(e).then(x => { S.wx[e.id] = x || { na: 1 }; if (S.tab === 'desk') render(); }).catch(() => { S.wx[e.id] = { na: 1 }; }); return 'Loading game-time wind…'; }
  if (!w) return 'Loading game-time wind…'; if (w.indoor) return '🏟 Roof/indoor — wind gate not applicable'; if (w.na) return 'Wind forecast unavailable';
  const cur = LS.get('windIn', {})[e.id]; return `💨 ${w.mph} mph from ${w.dir}° · ${w.temp}°F · rain ${w.rain}% (Open-Meteo, at first pitch). Blowing in? <select data-windin="${e.id}"><option value="" ${cur == null ? 'selected' : ''}>unverified</option><option value="1" ${cur === true ? 'selected' : ''}>yes, in</option><option value="0" ${cur === false ? 'selected' : ''}>no</option></select>`; }
function propOut() { const P = S.prop; if (!P?.log) return P?.loading ? '<div class="muted">Loading game log…</div>' : '<div class="muted small">Choose a game and player.</div>';
  const i = +(P.stat ?? P.log.labels.length - 1), L = parseFloat(P.line); const vals = P.log.rows.map(r => ({ ...r, v: parseFloat(r.stats[i]) })).filter(r => !isNaN(r.v));
  if (!vals.length) return '<div class="muted">No games logged this season.</div>';
  const hr = n => { const s = vals.slice(0, n); if (isNaN(L)) return '—'; const h = s.filter(r => r.v > L).length; return `${h}/${s.length} (${Math.round(h / s.length * 100)}%)`; };
  const avg = n => (vals.slice(0, n).reduce((x, r) => x + r.v, 0) / Math.min(n, vals.length)).toFixed(1);
  return `<div class="oddrow"><div class="od">Last 5 over<b>${hr(5)}</b>avg ${avg(5)}</div><div class="od">Last 10 over<b>${hr(10)}</b>avg ${avg(10)}</div><div class="od">All logged<b>${hr(999)}</b>avg ${avg(999)}</div></div>
  <table><tr><th>Date</th><th>Opp</th><th>${esc(P.log.labels[i])}</th><th></th></tr>${vals.slice(0, 15).map(r => `<tr><td>${r.date ? new Date(r.date).toLocaleDateString() : ''}</td><td>${esc(r.opp || '')}</td><td>${r.v}</td><td>${isNaN(L) ? '' : r.v > L ? '<span class="mv-up">over</span>' : r.v < L ? '<span class="mv-dn">under</span>' : 'push'}</td></tr>`).join('')}</table><div class="src">Source: ESPN game log (${esc(vals[0].season)}). Hit rate is history, not a prediction — graded as a model-only input on the Desk.</div>`; }

function render() {
  $('#leagues').innerHTML = Object.entries(D.LEAGUES).map(([k, l]) => `<button class="chip ${k === S.league ? 'on' : ''}" data-lg="${k}">${l.n}</button>`).join('');
  $('#leagues').classList.toggle('hide', ['bets', 'community', 'tools', 'record'].includes(S.tab));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
  V.innerHTML = views[S.tab](); if (S.tab === 'tools') calc();
}
function calc() { const a = C.parseAm($('#tA').value), b = C.parseAm($('#tB').value), p = parseFloat($('#tP').value) / 100, x = C.parseAm($('#tX').value); const n = a && b && C.noVig(a, b);
  $('#tOut').innerHTML = n ? `Implied: ${pct(C.amToProb(a))} / ${pct(C.amToProb(b))} · hold ${(n.hold * 100).toFixed(2)}%<br>No-vig fair: <b>${pct(n.p1)} (${C.fmtAm(n.fair1)})</b> / <b>${pct(n.p2)} (${C.fmtAm(n.fair2)})</b>${x ? `<br>EV of A at ${C.fmtAm(x)} vs fair: <b>${(C.ev(n.p1, x) * 100).toFixed(2)}%</b>` : ''}${p > 0 && p < 1 ? `<br>EV of A at ${C.fmtAm(x || a)} with your ${pct(p)}: <b>${(C.ev(p, x || a) * 100).toFixed(2)}%</b> · Desk tier ${C.tierOf(p)}` : ''}${C.arb(a, b).isArb ? '<br><b class="mv-up">Arbitrage!</b>' : ''}` : 'Enter two American prices (e.g. -110, +125).'; }

// ---------- actions ----------
const findM = k => { const [id] = k.split('|'); const e = S.events.find(x => x.id === id); return e && markets(e).find(m => m.key === k); };
function modal(html) { $('#modal').innerHTML = `<div>${html}</div>`; $('#modal').classList.remove('hide'); }
const closeModal = () => $('#modal').classList.add('hide');
function betForm(e, m, b) {
  let opts = e ? markets(e) : []; if (e && !opts.length) opts = ['away', 'home'].map(sd => ({ key: `${e.id}|ml|${sd}`, market: 'ml', side: sd, label: `${e[sd].abbr} ML`, price: null })); modal(`<h3>${b ? 'Edit bet' : 'Track a bet'}</h3>${e ? `<div class="muted">${esc(e.away.full)} @ ${esc(e.home.full)}</div>` : ''}
  ${!b && e ? `<label>Market</label><select id="bM">${opts.map(o => `<option value="${o.key}" ${m?.key === o.key ? 'selected' : ''}>${esc(o.label)} ${C.fmtAm(o.price)}</option>`).join('')}</select>` : ''}
  ${!e && !b ? '<div class="muted">Open a game card and tap "+ Track bet" so the bet links to the live ESPN event for auto-settlement.</div>' : `<div class="row"><div><label>Price you got</label><input id="bP" value="${C.fmtAm(b?.price ?? m?.price ?? opts[0]?.price)}" style="width:90px"></div><div><label>Line</label><input id="bL" value="${b?.line ?? m?.line ?? opts[0]?.line ?? ''}" style="width:70px"></div><div><label>Stake (units)</label><input id="bS" type="number" value="${b?.stake ?? 1}" style="width:80px"></div><div><label>Book</label><input id="bB" value="${esc(b?.book ?? '')}" placeholder="optional" style="width:110px"></div></div>
  ${b ? `<label>Result (manual override)</label><select id="bR"><option value="">open</option>${['win', 'loss', 'push'].map(r => `<option ${b.result === r ? 'selected' : ''}>${r}</option>`).join('')}</select>` : ''}`}
  <div class="row" style="margin-top:12px"><button class="btn pri" id="bSave">Save</button><button class="btn" id="bX">Cancel</button></div>`);
  $('#bX').onclick = closeModal; const sel = $('#bM'); if (sel) sel.onchange = () => { const o = opts.find(x => x.key === sel.value); $('#bP').value = C.fmtAm(o.price); $('#bL').value = o.line ?? ''; };
  $('#bSave').onclick = () => { const bets = LS.get('bets', []); const price = C.parseAm($('#bP')?.value); if (!price) return alert('Enter a valid American price like -110 or +125');
    if (b) { const x = bets.find(y => y.id === b.id); Object.assign(x, { price, line: $('#bL').value === '' ? null : +$('#bL').value, stake: +$('#bS').value, book: $('#bB').value }); const r = $('#bR').value; if (r) { const pr = r === 'win' ? +(x.stake * (C.amToDec(price) - 1)).toFixed(2) : r === 'loss' ? -x.stake : 0; Object.assign(x, { result: r, profit: pr, auto: false }); } else { delete x.result; delete x.profit; } if (x.closePrice != null) x.clv = C.clv(price, x.closePrice); }
    else if (e) { const o = opts.find(x => x.key === sel.value); bets.push({ id: Date.now().toString(36), eventId: e.id, path: e.path, league: e.league, start: e.start, game: `${e.away.abbr} @ ${e.home.abbr}`, market: o.market, side: o.side, line: $('#bL').value === '' ? null : +$('#bL').value, label: o.market === 'spread' ? `${e[o.side].abbr} ${$('#bL').value > 0 ? '+' : ''}${$('#bL').value}` : o.market === 'total' ? `${o.side === 'over' ? 'Over' : 'Under'} ${$('#bL').value}` : o.label, price, stake: +$('#bS').value || 1, book: $('#bB').value, placed: new Date().toISOString() }); }
    LS.set('bets', bets); closeModal(); autoSettle().then(render); };
}
function sharePick(k) { const m = findM(k); if (!m) return; let me = LS.get('me', null); if (!me) { S.tab = 'community'; render(); return alert('Create a profile handle first.'); }
  const g = grade(m); const p = { id: k, label: m.label, price: m.price, grade: g.grade, official: g.official, game: `${m.e.away.abbr} @ ${m.e.home.abbr}`, start: m.e.start, eventId: m.e.id, path: m.e.path, market: m.market, side: m.side, line: m.line, why: g.why.slice(0, 8) };
  const mine = LS.get('mypicks', []).filter(x => x.id !== k); mine.push(p); LS.set('mypicks', mine); copyLink(); }
function copyLink() { const me = LS.get('me'); const data = { h: me.handle, p: LS.get('mypicks', []).slice(-30) }; const url = location.origin + location.pathname + '#follow=' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('Profile link copied — send it to friends.'), () => prompt('Copy your share link:', url)); S.lastShare = url; }
function toast(t) { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#00e701;color:#05210a;padding:8px 14px;border-radius:8px;z-index:30;font-weight:700'; document.body.append(d); setTimeout(() => d.remove(), 2500); }
async function settlePicks(ps) { for (const p of ps) if (!p.result && Date.now() - new Date(p.start) > 3 * 3600e3) { const f = await D.eventFinal(p.path, p.eventId).catch(() => null); if (f?.completed) p.result = C.settle({ ...p, stake: 1 }, f)?.result; } return ps; }
function importFollow() { const m = location.hash.match(/#follow=(.+)/); if (!m) return; try { const d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); const fol = LS.get('follow', {}); fol[d.h] = { handle: d.h, picks: d.p || [] }; LS.set('follow', fol); history.replaceState(null, '', location.pathname); S.tab = 'community'; toast(`Following @${d.h}`); settlePicks(fol[d.h].picks).then(() => { LS.set('follow', fol); render(); }); } catch { toast('That share link is damaged.'); } }

document.addEventListener('click', async ev => {
  const t = ev.target.closest('[data-lg],[data-t],[data-act],[data-day]'); if (!t) { if (ev.target.id === 'modal') closeModal(); return; }
  if (t.dataset.lg) { S.league = t.dataset.lg; LS.set('league', S.league); S.events = []; S.fetched = null; S.deskOnly = null; S.prop = null; render(); load(); return; }
  if (t.dataset.day) { S.dayOff = +t.dataset.day; S.fetched = null; load(); return; }
  if (t.dataset.t) { S.tab = t.dataset.t; S.deskOnly = null; render(); scrollTo(0, 0); return; }
  const a = t.dataset.act, e = S.events.find(x => x.id === t.dataset.id);
  if (a === 'track') betForm(e); if (a === 'desk') { S.tab = 'desk'; S.deskOnly = t.dataset.id; render(); } if (a === 'deskall') { S.deskOnly = null; render(); }
  if (a === 'ace') { openAce(); ask(`${e.away.name} ${e.home.name}`); }
  if (a === 'trackm') { const m = findM(t.dataset.k); betForm(m.e, m); } if (a === 'share') sharePick(t.dataset.k);
  if (a === 'addsrc') { const name = prompt('Source name (e.g. ZCode, Ballpark Pal, Action Network projection):'); if (!name) return; const v = parseFloat(prompt(`${name}: win probability % for this side`)); if (!(v > 0 && v < 100)) return; const kind = confirm('Is this an independent OUTSIDE number? (Cancel = it\'s your own model — counted as check only)') ? 'outside' : 'model'; const u = LS.get('usrc', {}); (u[t.dataset.k] = u[t.dataset.k] || []).push({ name, prob: v / 100, kind }); LS.set('usrc', u); render(); }
  if (a === 'del') { if (!confirm('Delete this bet?')) return; LS.set('bets', LS.get('bets', []).filter(b => b.id !== t.dataset.bid)); render(); }
  if (a === 'edit') { const b = LS.get('bets', []).find(x => x.id === t.dataset.bid); betForm(S.events.find(x => x.id === b.eventId), null, b); }
  if (a === 'pladd') { const b = LS.get('bets', []).find(x => x.id === t.dataset.bid); const pl = LS.get('parlay', []); pl.push({ eventId: b.eventId, market: b.market, side: b.side, price: b.price, label: `${b.game} ${b.label}` }); LS.set('parlay', pl); render(); }
  if (a === 'plrm') { const pl = LS.get('parlay', []); pl.splice(+t.dataset.i, 1); LS.set('parlay', pl); render(); } if (a === 'plclear') { LS.set('parlay', []); render(); }
  if (a === 'csv') { const bets = LS.get('bets', []); const cols = ['placed', 'game', 'league', 'label', 'price', 'stake', 'book', 'closePrice', 'clv', 'result', 'profit', 'final']; const csv = [cols.join(','), ...bets.map(b => cols.map(c => JSON.stringify(b[c] ?? '')).join(','))].join('\n'); const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); l.download = 'edgepro-bets.csv'; l.click(); }
  if (a === 'mkprof') { const h = $('#handle').value.trim().replace(/[^\w.-]/g, ''); if (!h) return; LS.set('me', { handle: h, created: new Date().toISOString() }); render(); }
  if (a === 'shareprof') copyLink(); if (a === 'unf') { const f = LS.get('follow', {}); delete f[t.dataset.h]; LS.set('follow', f); render(); }
});
document.addEventListener('input', ev => { if (['tA', 'tB', 'tP', 'tX'].includes(ev.target.id)) calc(); if (ev.target.id === 'pLine') { S.prop.line = ev.target.value; $('#pOut').innerHTML = propOut(); } });
document.addEventListener('change', async ev => { const id = ev.target.id; if (id === 'syncT') { localStorage.ep_sync = ev.target.checked ? '1' : '0'; if (ev.target.checked) L.sync(L.cached().filter(r => r.result)); }
  if (ev.target.dataset.windin) { const w = LS.get('windIn', {}); const v = ev.target.value; if (v === '') delete w[ev.target.dataset.windin]; else w[ev.target.dataset.windin] = v === '1'; LS.set('windIn', w); render(); }
  if (id === 'pGame') { const e = S.events.find(x => x.id === ev.target.value); if (!e) return; S.prop = { ev: e.id, roster: [], loading: true }; render(); const [a, h] = await Promise.all([D.roster(e.path, e.away.id).catch(() => []), D.roster(e.path, e.home.id).catch(() => [])]); S.prop.roster = [...a.map(r => ({ ...r, pos: e.away.abbr + ' ' + (r.pos || '') })), ...h.map(r => ({ ...r, pos: e.home.abbr + ' ' + (r.pos || '') }))]; S.prop.loading = false; render(); }
  if (id === 'pPlayer') { const e = S.events.find(x => x.id === S.prop.ev); S.prop.pid = ev.target.value; S.prop.log = null; S.prop.loading = true; render(); S.prop.log = await D.gamelog(e.path, ev.target.value).catch(() => ({ labels: [], rows: [] })); S.prop.loading = false; S.prop.stat = S.prop.log.labels.length - 1; render(); }
  if (id === 'pStat') { S.prop.stat = ev.target.value; $('#pOut').innerHTML = propOut(); } });

// ---------- Ace assistant (transparent, rule-based) ----------
const openAce = () => $('#ace').classList.remove('hide');
$('#aceBtn').onclick = () => { $('#ace').classList.toggle('hide'); if (!$('#aceLog').children.length) say("I'm Ace. I only use the live data loaded on screen — no made-up stats. Try: a team name, 'best value', 'officials', 'live', or 'my record'."); };
$('#aceX').onclick = () => $('#ace').classList.add('hide');
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') $('#ace').classList.add('hide'); });
function say(t, me) { const d = document.createElement('div'); d.className = 'msg' + (me ? ' me' : ''); d.textContent = t; $('#aceLog').append(d); $('#aceLog').scrollTop = 1e9; if (!me && S.speak && 'speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t.slice(0, 400))); } }
export function answer(q) {
  q = q.toLowerCase(); const evs = S.events;
  if (/record|roi|clv|my bets/.test(q)) { const r = C.record(LS.get('bets', [])); return `Your tracked record: ${r.w}-${r.l}-${r.p}, profit ${r.profit} units, ROI ${r.roi}%, average CLV ${r.avgClv ?? 'n/a'} pts, ${r.open} open.`; }
  if (/value|ev|edge/.test(q)) { const m = evs.filter(e => e.state === 'pre').flatMap(markets).filter(x => x.quotes.length > 1 && x.ev > 0).sort((a, b) => b.ev - a.ev).slice(0, 3); return m.length ? 'Top prices above consensus fair value:\n' + m.map(x => `• ${x.e.name} ${x.label} ${C.fmtAm(x.best.price)} at ${x.best.book}: fair ${pct(x.fair)}, EV +${(x.ev * 100).toFixed(1)}%`).join('\n') : 'Nothing is priced above consensus fair value in the loaded sources right now.'; }
  if (/official|best pick|picks/.test(q)) { const g = evs.filter(e => e.state === 'pre').flatMap(markets).filter(m => m.market !== 'spread').map(m => ({ m, g: grade(m) })).filter(x => x.g.official); return g.length ? 'Desk Officials (C+ or better, two outside numbers):\n' + g.map(x => `• ${x.g.grade} ${x.m.e.name} ${x.m.label} ${C.fmtAm(x.m.price)} — ${pct(x.g.conf)}`).join('\n') : `No Officials on the ${D.LEAGUES[S.league].n} slate: nothing reaches C+ with two independent outside numbers that beat the price. Passing is a position.`; }
  if (/live|score/.test(q) && !evs.some(e => q.includes(e.home.name.toLowerCase()))) { const l = evs.filter(e => e.state === 'in'); return l.length ? l.map(e => `${e.away.abbr} ${e.away.score} - ${e.home.abbr} ${e.home.score} (${e.detail})`).join('\n') : `No ${D.LEAGUES[S.league].n} games live right now.`; }
  const words = q.split(/\W+/).filter(w => w.length > 2); const e = evs.find(e => words.some(w => [e.home.name, e.away.name, e.home.abbr, e.away.abbr, e.home.full].some(n => n.toLowerCase() === w || n.toLowerCase().split(' ').includes(w))));
  if (e) { const ms = markets(e), P = S.poly[e.id]; const lines = [`${e.away.full} @ ${e.home.full} — ${e.state === 'pre' ? 'starts ' + tm(e.start) : e.detail}${e.state !== 'pre' ? `, score ${e.away.abbr} ${e.away.score}-${e.home.score} ${e.home.abbr}` : ''}.`];
    if (e.odds) { const mh = ms.find(m => m.key.endsWith('ml|home')), ma = ms.find(m => m.key.endsWith('ml|away')); if (mh) lines.push(`${e.odds.provider} moneyline ${e.away.abbr} ${C.fmtAm(ma.price)} / ${e.home.abbr} ${C.fmtAm(mh.price)}; without the vig that's ${pct(ma.src[0].prob)} / ${pct(mh.src[0].prob)}.`); if (e.odds.ml.home?.open != null && e.odds.ml.home.open !== e.odds.ml.home.close) lines.push(`Line moved: ${e.home.abbr} opened ${C.fmtAm(e.odds.ml.home.open)}, now ${C.fmtAm(e.odds.ml.home.close)}.`); if (e.odds.total.line != null) lines.push(`Total ${e.odds.total.line}${e.odds.total.over?.openLine != null && e.odds.total.over.openLine !== e.odds.total.line ? ` (opened ${e.odds.total.over.openLine})` : ''}.`); }
    else lines.push('No odds posted on ESPN yet.');
    if (P?.ml) lines.push(`Polymarket has ${e.away.abbr} ${pct(P.ml.away)} / ${e.home.abbr} ${pct(P.ml.home)}.`);
    const gs = ms.filter(m => m.market !== 'spread').map(m => ({ m, g: grade(m) })).sort((a, b) => (b.g.conf || 0) - (a.g.conf || 0)); if (gs[0] && e.state === 'pre') lines.push(`Desk: best graded side is ${gs[0].m.label} at ${gs[0].g.grade} (${gs[0].g.status}). ${gs[0].g.why.filter(w => w.startsWith('✗')).slice(0, 2).join(' ')}`);
    return lines.join(' '); }
  return `I couldn't match that to a ${D.LEAGUES[S.league].n} game on this slate. Name a team, or ask 'best value', 'officials', 'live', 'my record'. Switch sports with the chips at top.`;
}
function ask(q) { say(q, true); say(answer(q)); }
$('#aceF').onsubmit = ev => { ev.preventDefault(); const q = $('#aceQ').value.trim(); if (q) ask(q); $('#aceQ').value = ''; };
$('#mic').onclick = () => { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return say('Voice input is not supported in this browser — try Chrome or Safari, or type your question.');
  const r = new SR(); r.lang = 'en-US'; r.interimResults = false; $('#mic').classList.add('rec'); S.speak = true; r.onresult = e => ask(e.results[0][0].transcript); r.onend = () => $('#mic').classList.remove('rec'); r.onerror = e => say('Mic error: ' + e.error); r.start(); };

setInterval(() => { const el = $('#clock'); if (el) el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }, 1000);
importFollow(); L.refresh().catch(() => {}).then(render); load(); setInterval(() => { if (!document.hidden && !$('#modal').classList.contains('hide') === false) load(); }, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

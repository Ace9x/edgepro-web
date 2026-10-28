// EdgePro v4: navigation, 4-state data views, toasts with undo, favorites + line-move alerts, price flashes,
// Ask (stat search), Ledger (Grok vs Desk), Trends, Limits (responsible play), People (profiles), calibration & leak finder.
import * as Ask from './ask.js';
import * as Lg from './ledger.js';
import * as Tr from './trends.js';
import * as So from './social.js';
import * as A from './account.js';
import * as C from './core.js';
import * as L from './learn.js';
import * as St from './stale.js';
import * as I from './intel.js';
const $ = s => document.querySelector(s);
const clean = v => typeof v === 'string' ? v.replace(/[<>`]/g, '').slice(0, 2000) : Array.isArray(v) ? v.map(clean) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v; // user text never carries markup (XSS defence in depth)
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('ep_' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('ep_' + k, JSON.stringify(clean(v))) };
const ic = n => `<svg class="ds-ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const am = v => (v == null ? '—' : C.oddsFmt() === 'dec' ? C.amToDec(v).toFixed(2) : (v > 0 ? '+' : '−') + Math.abs(v)).replace('−0', '0');
const sg = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const pc = p => (p == null ? '—' : Math.round(p * 100) + '%');
const fmtD = (iso, o) => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString([], o || { month: 'short', day: 'numeric' }) : ''; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let X; // app context
const rr = () => X.render();

// ---------- navigation ----------
const MAIN = ['today', 'scores', 'props', 'record'];
export function nav(S) {
  document.querySelectorAll('#side button,#tabs button[data-t],#more button[data-t]').forEach(b => { const on = b.dataset.t === S.tab; b.classList.toggle('on', on); b.toggleAttribute('aria-current', on); });
  const mb = $('#moreBtn'); mb?.classList.toggle('on', !MAIN.includes(S.tab));
  const tabs = [...document.querySelectorAll('#tabs > button')], i = Math.max(0, MAIN.includes(S.tab) ? MAIN.indexOf(S.tab) : 4), b = tabs[i], ind = $('.tab-ind');
  if (b && ind) requestAnimationFrame(() => (ind.style.transform = `translateX(${b.offsetLeft + b.offsetWidth / 2 - 12}px)`));
  const me = $('#meBtn'); if (me) me.innerHTML = prof?.avatar_url ? `<img src="${esc(prof.avatar_url)}" alt="">` : ic('user');
  queueMicrotask(flash);
  document.title = ({ today: 'Today', scores: 'Games', odds: 'Odds & +EV', desk: 'Research Desk', props: 'Props', trends: 'Trends', ask: 'Ask', bets: 'My bets', ledger: 'Ledger', record: 'Record', community: 'People', tools: 'Tools', limits: 'Limits' }[S.tab] || 'EdgePro') + ' · EdgePro';
}
export const closeMore = () => $('#more')?.classList.add('hide');
// price flash: compare each [data-px] cell with its last value
const lastPx = {};
function flash() { document.querySelectorAll('[data-px]').forEach(el => { const k = el.dataset.px, v = el.textContent, o = lastPx[k]; lastPx[k] = v; if (o == null || o === v) return;
  const n = s => { const m = String(s).replace(/−/g, '-').match(/[+-]?\d+(\.\d+)?/g); return m ? parseFloat(m[m.length - 1]) : NaN; }; const up = n(v) > n(o); el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth; el.classList.add(up ? 'flash-up' : 'flash-dn'); el.insertAdjacentHTML('beforeend', `<span class="small ${up ? 'mv-up' : 'mv-dn'}"> ${up ? '▲' : '▼'}</span>`); }); }

// ---------- states ----------
export const empty = (icon, title, text, actions = '') => `<div class="state fade-in">${ic(icon)}<b>${title}</b><p>${text}</p>${actions ? `<div class="actions" style="justify-content:center">${actions}</div>` : ''}</div>`;
export const skel = (n = 4, cls = '') => Array.from({ length: n }, () => `<div class="skel ${cls}" aria-hidden="true"></div>`).join('') + '<span class="sr-only" role="status" style="position:absolute;left:-9999px">Loading</span>';
export function states(S, D, ok) {
  if (S.err && !S.events.length) { const left = Math.max(0, 60 - Math.round((Date.now() - (S.errAt || Date.now())) / 1000));
    return `<div class="card state err fade-in">${ic('wifi-off')}<b>Live scores unavailable since ${fmtD(S.failSince || S.errAt || Date.now(), { hour: 'numeric', minute: '2-digit' })}</b><p>All three ESPN feeds failed and there's no earlier pull saved on this device. Retrying automatically — nothing is shown until real data arrives.</p>
      <div class="row" style="align-items:center;justify-content:center"><svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="bg" cx="20" cy="20" r="18"/><circle class="fg" cx="20" cy="20" r="18" style="animation-duration:${left}s"/></svg><span class="small muted num" id="retryIn">${left}s</span><button class="btn ghost" data-act="retry">${ic('refresh')} Retry now</button></div></div>`; }
  if (!S.fetched) return skel(4);
  if (!S.events.length) return `<div class="card">${empty('scores', `No ${D.LEAGUES[S.league].n} games ${['yesterday', 'today', 'tomorrow', 'in 2 days'][S.dayOff + 1]}`, 'Try another day or another sport.', S.dayOff < 2 ? `<button class="btn pri" data-day="${S.dayOff + 1}">See ${S.dayOff === 0 ? 'tomorrow' : 'next day'}</button>` : '')}</div>`;
  return `<div class="fade-in">${ok()}</div>`;
}
export function tick(S) { const r = $('#retryIn'); if (r && S.errAt) r.textContent = Math.max(0, 60 - Math.round((Date.now() - S.errAt) / 1000)) + 's'; if (S.fetched && !S.err) S.lastOk = S.fetched; }

// ---------- toasts ----------
export function toast(t, undo) { const box = $('#toasts'); if (!box) return; const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status');
  d.innerHTML = `<span>${esc(t)}</span>${undo ? '<button>Undo</button>' : ''}`; if (undo) d.querySelector('button').onclick = () => { undo(); d.remove(); };
  box.append(d); setTimeout(() => d.classList.add('out'), 4000); setTimeout(() => d.remove(), 4250); }

// ---------- favorites & alerts ----------
const favs = () => LS.get('favs', { games: {}, teams: [] });
export const isFav = e => { const f = favs(); return !!f.games[e.id] || f.teams.includes(e.home.abbr + '|' + e.league) || f.teams.includes(e.away.abbr + '|' + e.league); };
export const favSport = () => (prof?.fav_sports?.[0] || LS.get('favsports', [])[0] || null);
const pxSeen = {};
export function alerts(S) { const f = favs(); for (const e of S.events) { if (!isFav(e) || !e.odds || e.state === 'post') continue; const v = e.odds.ml.home?.close, t = e.odds.total.line, k = e.id, o = pxSeen[k];
    pxSeen[k] = { v, t }; if (!o) continue; const pd = v != null && o.v != null ? Math.abs(C.amToProb(v) - C.amToProb(o.v)) : 0;
    if (pd >= 0.02 || (t != null && o.t != null && t !== o.t)) { const msg = `${e.away.abbr} @ ${e.home.abbr}: ${pd >= 0.02 ? `${e.home.abbr} ML ${am(o.v)} → ${am(v)}` : `total ${o.t} → ${t}`}`; toast('Line move · ' + msg);
      if (LS.get('notify', 0) && 'Notification' in window && Notification.permission === 'granted') try { new Notification('EdgePro line move', { body: msg, tag: k }); } catch {} } }
  const tg = LS.get('targets', {}); for (const [k, x] of Object.entries(tg)) { const e = S.events.find(y => y.id === x.eventId); const m = e && X.markets(e).find(y => y.key === k); if (m && m.price != null && C.amToDec(m.price) >= C.amToDec(x.target)) { toast(`Target hit: ${m.label} is ${am(m.price)} (you wanted ${am(x.target)})`); delete tg[k]; LS.set('targets', tg); } } }

// ---------- celebration: wins only; never for placing a bet ----------
export function settled(list) { list.forEach(b => logBet('settle', b)); settledToast(list); if (!list.some(b => b.result === 'win') || reduced()) return; try { navigator.vibrate?.(15); } catch {} confetti(); }
function confetti() { const c = Object.assign(document.createElement('canvas'), { width: innerWidth, height: innerHeight }); c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:70'; document.body.append(c); const x = c.getContext('2d');
  const cols = ['#2DD4BF', '#5EEAD4', '#A78BFA'], ps = Array.from({ length: 60 }, () => { const a = -Math.PI / 2 + (Math.random() - 0.5) * (70 * Math.PI / 180); const v = 9 + Math.random() * 6; return { x: innerWidth / 2, y: innerHeight * 0.7, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.3, c: cols[Math.random() * 3 | 0] }; });
  let f = 0; (function step() { x.clearRect(0, 0, c.width, c.height); ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.vx *= 0.99; p.r += 0.2; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.globalAlpha = Math.max(0, 1 - f / 90); x.fillRect(-4, -2, 8, 4); x.restore(); }); if (++f < 90) requestAnimationFrame(step); else c.remove(); })(); }

// ---------- responsible play ----------
const lim = () => LS.get('limits', {});
export const locked = () => { const l = lim(); return (l.lockUntil && Date.now() < l.lockUntil) || stopHit(); };
const today = () => new Date().toDateString();
function stopHit() { const l = lim(); if (!l.dailyStop) return false; const lost = -LS.get('bets', []).filter(b => b.result && new Date(b.settledAt || b.start).toDateString() === today()).reduce((x, b) => x + (b.profit || 0), 0); return lost >= l.dailyStop; }
export function lockNotice() { X.modal(`<h3>${ic('lock')} Tracking is paused</h3><p>${lim().lockUntil && Date.now() < lim().lockUntil ? `You paused bet tracking until <b>${new Date(lim().lockUntil).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b>.` : 'You reached the daily stop you set for yourself. Tracking reopens tomorrow.'} Research tools still work.</p><p class="small muted">Need to talk to someone? Call or text <a href="tel:18004264537">1-800-GAMBLER</a> (free, 24/7).</p>`); }
export function limitsBanner() { return locked() ? `<div class="warnbox lock">${ic('lock')} Tracking is paused by your own limit. <button class="lnk" data-t="limits">See limits</button></div>` : ''; }
function limitsView() { const l = lim(), bets = LS.get('bets', []); const wk = Date.now() - 7 * 864e5;
  const lostToday = -bets.filter(b => b.result && new Date(b.settledAt || b.start).toDateString() === today()).reduce((x, b) => x + (b.profit || 0), 0);
  const riskedWeek = bets.filter(b => new Date(b.placed || b.start) > wk).reduce((x, b) => x + (+b.stake || 0), 0); const lk = l.lockUntil && Date.now() < l.lockUntil;
  const bar = (v, m) => m ? `<div style="height:8px;border-radius:4px;background:var(--surface-3);margin-top:8px"><i style="display:block;height:100%;border-radius:4px;width:${Math.min(100, v / m * 100)}%;background:${v >= m ? 'var(--loss)' : 'var(--brand)'}"></i></div>` : '';
  return `<h1 style="margin-top:24px">Limits</h1><p class="muted" style="margin-top:0">Your own rules, set by you. EdgePro never suggests how much to bet.</p>
  <div class="card"><div class="card-h"><b>Your limits</b><span class="small muted">in units, same as your tracker</span></div>
  <div class="row"><div><label for="limW">Weekly limit (units risked)</label><input id="limW" type="number" min="0" step="0.5" inputmode="decimal" value="${l.weekly ?? ''}" ${lk ? 'disabled' : ''} style="width:160px"></div><div><label for="limD">Daily stop (units lost)</label><input id="limD" type="number" min="0" step="0.5" inputmode="decimal" value="${l.dailyStop ?? ''}" ${lk ? 'disabled' : ''} style="width:160px"></div></div>
  <div class="actions"><button class="btn pri" data-act="limsave" ${lk ? 'disabled' : ''}>Save limits</button></div>
  <div class="stat-row"><div class="stat"><span class="cap">Risked this week</span><b class="num">${riskedWeek.toFixed(1)}u</b><small>${l.weekly ? `of ${l.weekly}u` : 'no limit set'}</small>${bar(riskedWeek, l.weekly)}</div><div class="stat"><span class="cap">Lost today</span><b class="num">${Math.max(0, lostToday).toFixed(1)}u</b><small>${l.dailyStop ? `stop at ${l.dailyStop}u` : 'no stop set'}</small>${bar(Math.max(0, lostToday), l.dailyStop)}</div></div>
  ${l.weekly && riskedWeek >= l.weekly ? '<div class="warnbox">You\'ve reached your weekly limit.</div>' : ''}${stopHit() ? '<div class="errbox">Daily stop reached — tracking is paused until tomorrow.</div>' : ''}</div>
  <div class="card"><div class="card-h"><b>${ic('lock')} Take a break</b></div><p class="small muted" style="margin-top:0">Pauses bet tracking and limit changes. The break can't be ended early — that's the point.</p>
  ${lk ? `<div class="lock">${ic('lock')} Paused until ${new Date(l.lockUntil).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>` : `<div class="actions">${[[1, '24 hours'], [7, '7 days'], [30, '30 days']].map(([d, t]) => `<button class="btn" data-act="lock" data-d="${d}">Pause for ${t}</button>`).join('')}</div>`}</div>
  <div class="card"><b>Get help</b>${stateSelect()}<p class="small" style="margin-bottom:0"><span data-help>${helpLine()}</span> · <a href="https://www.ncpgambling.org/help-treatment/" target="_blank" rel="noopener">National Council on Problem Gambling</a> · <a href="https://www.ncpgambling.org/help-treatment/self-exclusion/" target="_blank" rel="noopener">Self-exclusion programs</a></p></div>`; }

// ---------- leak finder ----------
export function leaks(bets) { const s = bets.filter(b => b.result && b.price); if (s.length < 10) return `<div class="card"><div class="card-h"><b>Leak finder</b></div><p class="small muted" style="margin:0">Shows where you win and lose by sport, bet type and odds range once you have 10 settled bets (you have ${s.length}).</p></div>`;
  const band = p => (p <= -150 ? 'Big favorite (−150 or shorter)' : p < 100 ? 'Near even (−149 to −101)' : p < 200 ? 'Underdog (+100 to +199)' : 'Long shot (+200 or longer)');
  const grp = (f) => { const g = {}; s.forEach(b => { const k = f(b) || 'Other'; const x = g[k] ||= { k, n: 0, u: 0, st: 0, w: 0 }; x.n++; x.u += b.profit || 0; x.st += +b.stake || 0; if (b.result === 'win') x.w++; }); return Object.values(g).map(x => ({ ...x, roi: x.st ? x.u / x.st * 100 : 0 })); };
  const rows = [...grp(b => b.league?.toUpperCase()).map(x => ({ ...x, dim: 'Sport' })), ...grp(b => ({ ml: 'Moneyline', spread: 'Spread', total: 'Total', manual: 'Manual / other' })[b.market]).map(x => ({ ...x, dim: 'Bet type' })), ...grp(b => band(b.price)).map(x => ({ ...x, dim: 'Odds range' }))].filter(x => x.n >= 3).sort((a, b) => a.roi - b.roi);
  return `<div class="card"><div class="card-h"><b>Leak finder</b><span class="small muted">groups with 3+ settled bets · worst first</span></div><div class="tbl"><table><tr><th>Group</th><th class="n">Bets</th><th class="n">Units</th><th class="n">ROI</th></tr>${rows.map((x, i) => `<tr><td>${i === 0 && x.roi < 0 ? '<span class="tag bad">Biggest leak</span> ' : ''}<span class="muted small">${x.dim}:</span> ${esc(x.k)}</td><td class="n">${x.n}</td><td class="n ${x.u >= 0 ? 'mv-up' : 'mv-dn'}">${x.u >= 0 ? '▲' : '▼'} ${sg(x.u)}</td><td class="n">${sg(x.roi)}%</td></tr>`).join('')}</table></div><div class="src">Small groups swing a lot — under 30 bets is mostly noise.</div></div>`; }

// ---------- Ask ----------
const askS = { q: '', res: null, busy: false };
function askView() { const r = askS.res;
  return `<h1 style="margin-top:24px">Ask</h1><p class="muted" style="margin-top:0">Plain-English stat search, answered from ESPN's free stats. Try a player, a stat and a range.</p>
  <form class="ask-box" id="askF" role="search"><input id="askQ" value="${esc(askS.q)}" placeholder="e.g. Jokic rebounds over 11.5" autocomplete="off" aria-label="Your stat question" enterkeyhint="search"><button class="btn pri" style="min-height:52px">${ic('search')} Ask</button></form>
  <div class="ask-ex">${Ask.EXAMPLES.map(x => `<button class="chip" data-act="askex" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  ${askS.busy ? skel(1) : r ? r.error ? `<div class="card">${empty('search', 'No answer for that one', esc(r.error))}</div>` : answerCard(r) : ''}`; }
function answerCard(r) { const mx = Math.max(...r.series.map(x => Math.abs(x.v)), r.line || 0, 1);
  const bars = r.series.map(x => { const h = Math.abs(x.v) / mx * 100; const cls = r.line != null ? (x.v > r.line ? 'o' : 'u') : r.diverge ? (x.v >= 0 ? 'o' : 'u') : 'o'; return `<i class="${cls}" style="height:${Math.max(2, h)}%" title="${esc(fmtD(x.x))} ${esc(x.label)}"></i>`; }).join('');
  return `<div class="card answer fade-in"><span class="cap">${esc(r.league)} · ${esc(r.kind === 'team' ? 'Team' : 'Player')}</span><h2 style="margin:4px 0 0">${esc(r.title)}</h2>
  <div class="hero num">${esc(r.value)} <span class="unit">${esc(r.unit || (r.kind === 'team' ? 'record' : ''))}</span></div><div class="small muted">${esc(r.sub)}</div>
  ${r.hit ? `<div class="stat-row"><div class="stat"><span class="cap">${r.hit.side === 'under' ? 'Under' : 'Over'} ${r.hit.line}</span><b class="num">${r.hit.n}/${r.hit.of}</b><small>${Math.round(r.hit.n / r.hit.of * 100)}% of games</small></div></div>` : ''}
  <div class="mini-wrap"><div class="mini" role="img" aria-label="Last ${r.series.length} games chart">${bars}</div>${r.line != null ? `<div class="mini-line" style="bottom:${r.line / mx * 64}px"></div>` : ''}</div>
  <div class="tbl"><table><tr><th>Date</th><th>Game</th><th class="n">${r.kind === 'team' ? 'Result' : 'Value'}</th></tr>${r.rows.map(x => `<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td><td class="n">${esc(x[2])}</td></tr>`).join('')}</table></div>
  <div class="src">Source: <a href="${r.src.url}" target="_blank" rel="noopener">${esc(r.src.name)}</a> · fetched ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${r.alts?.length ? ` · Not who you meant? ${r.alts.slice(0, 2).map(a => `<button class="lnk" data-act="askex" data-q="${esc(a.split(' · ')[0] + ' ' + askS.q.split(' ').slice(1).join(' '))}">${esc(a)}</button>`).join(', ')}` : ''}</div></div>`; }
async function runAsk(q) { askS.q = q; askS.busy = true; askS.res = null; rr(); try { askS.res = await Ask.answer(q); } catch (e) { askS.res = { error: 'ESPN stats are not reachable right now. Try again in a minute.' }; } askS.busy = false; rr(); }

// ---------- Ledger ----------
const ledS = { book: 'grok', data: null, val: null };
function ledgerView() { if (!ledS.data) { Lg.load().then(d => { ledS.data = d; rr(); }); return `<h1 style="margin-top:24px">Ledger</h1>${skel(3)}`; }
  const allRows = ledS.data[ledS.book], rows = allRows.filter(r => !/void|unverified/i.test(r.raw || '')), all = Lg.roi(rows)[0], shown = ledS.voids ? allRows : rows;
  const ci = x => { const w = Lg.wilson(x.w, x.w + x.l); return w ? `${pc(w[0])}–${pc(w[1])}` : '—'; }; const few = n => n < 50 ? ' <span class="tag warn">too few picks</span>' : '';
  const t = (title, f) => { const g = Lg.roi(rows, f); return `<div class="card"><div class="card-h"><b>${title}</b><span class="small muted">flat 1u per pick</span></div><div class="tbl"><table><tr><th></th><th class="n">W–L–P</th><th class="n">n</th><th class="n">Hit (95% CI)</th><th class="n">Units won / risked</th><th class="n">ROI</th>${ledS.book === 'desk' ? '<th class="n">Avg CLV</th>' : ''}</tr>${g.map(x => `<tr><td>${esc(x.k)}${few(x.n)}</td><td class="n">${x.w}–${x.l}–${x.p}</td><td class="n">${x.n}</td><td class="n">${pc(x.hit)} <span class="muted small">${ci(x)}</span></td><td class="n ${x.u >= 0 ? 'mv-up' : 'mv-dn'}">${x.u >= 0 ? '▲' : '▼'} ${sg(x.u, 2)}u / ${x.n}u</td><td class="n">${sg(x.roi)}%</td>${ledS.book === 'desk' ? `<td class="n">${x.clv == null ? '<span class="muted small">no close</span>' : sg(x.clv, 2)}</td>` : ''}</tr>`).join('')}</table></div></div>`; };
  const sec = Lg.roi(rows, r => r.section).filter(x => x.n >= 5).sort((a, b) => b.roi - a.roi);
  return `<h1 style="margin-top:24px">Ledger</h1><p class="muted" style="margin-top:0">Every logged pick with its price source, close and CLV. Grok's picks and the Desk's picks are kept apart — never blended.</p>
  <div class="chips" role="tablist">${[['grok', "Grok's record"], ['desk', 'Desk record']].map(([k, n]) => `<button class="chip ${ledS.book === k ? 'on' : ''}" role="tab" aria-selected="${ledS.book === k}" data-act="ledbook" data-k="${k}">${n}</button>`).join('')}</div>
  ${all ? `<div class="card"><div class="stat-row"><div class="stat"><span class="cap">Record</span><b class="num">${all.w}–${all.l}–${all.p}</b><small>${all.n} graded</small></div><div class="stat"><span class="cap">Units</span><b class="num ${all.u >= 0 ? 'mv-up' : 'mv-dn'}">${all.u >= 0 ? '▲' : '▼'} ${sg(all.u, 2)}</b><small>flat 1u</small></div><div class="stat"><span class="cap">ROI</span><b class="num">${sg(all.roi)}%</b><small>units ÷ picks</small></div><div class="stat"><span class="cap">Hit rate</span><b class="num">${pc(all.hit)}</b><small>95% CI ${ci(all)}${all.n < 50 ? ' · too few picks' : ''}</small></div></div>${equityChart(rows)}${ledS.book === 'desk' ? clvChart(rows) : ''}
  ${sec.length > 1 ? `<div class="src">Best bet type so far: <b>${esc(sec[0].k)}</b> (${sg(sec[0].roi)}% on ${sec[0].n}) · weakest: <b>${esc(sec[sec.length - 1].k)}</b> (${sg(sec[sec.length - 1].roi)}% on ${sec[sec.length - 1].n})</div>` : ''}</div>` : `<div class="card">${empty('ledger', 'Nothing graded yet', 'Picks show up here once they settle.')}</div>`}
  ${heat(rows)}${t('By sport', r => r.sport)}${t('By section / bet type', r => r.section)}${t('By price source', Lg.priceBucket)}
  <div class="card"><div class="card-h"><b>Every pick</b><span class="small muted">${shown.length} rows · wins and losses · unchanged since logged</span></div><label class="row small" style="align-items:center;margin:0 0 8px"><input type="checkbox" id="ledV" ${ledS.voids ? 'checked' : ''} style="min-height:20px;width:20px"> Show voided / unverified rows (struck through, never deleted)</label><div class="tbl" style="max-height:520px;overflow:auto"><table><tr><th>Date</th><th>Pick</th><th>Grade</th><th class="n">Price</th><th>Price source</th><th>Close</th>${ledS.book === 'desk' ? '<th class="n">CLV</th>' : ''}<th>Result</th></tr>
  ${shown.slice().reverse().map(r => `<tr${/void|unverified/i.test(r.raw || '') ? ' style="text-decoration:line-through;opacity:.6"' : ''}><td>${esc(fmtD(r.date + 'T12:00'))}</td><td>${esc(r.pick)}<div class="muted small">${esc(r.sport)} · ${esc(r.section)}</div></td><td>${ledChip(r.grade)}</td><td class="n">${am(r.price)}</td><td>${/assum/.test(r.priceSrc) ? '<span class="pchip assumed">Assumed −110</span>' : `<span class="pchip real" title="${esc(r.priceSrc)}">Real · ${esc(r.priceSrc.split(/[ (]/)[0])}</span>`}</td><td class="small">${r.close != null ? esc(typeof r.close === 'number' ? am(r.close) : r.close) : '<span class="muted">not logged</span>'}</td>${ledS.book === 'desk' ? `<td class="n">${r.clv == null ? '' : sg(r.clv, 2)}</td>` : ''}<td>${r.result ? `<span class="tag ${r.result === 'win' ? 'good' : r.result === 'loss' ? 'bad' : ''}">${r.result === 'win' ? '▲ W' : r.result === 'loss' ? '▼ L' : 'P'}</span>` : `<span class="muted small">${esc(r.raw || 'open')}</span>`}</td></tr>`).join('')}</table></div>
  <div class="src">${ledS.book === 'grok' ? 'Source: Grok record (Oct 1–20), audited against ESPN finals. "Assumed −110" rows had no quoted or sourced price.' : 'Source: Desk plays log. SIT and Pass rows excluded. CLV is vs the logged closing consensus when one was captured.'}</div></div>
  <div class="src" style="text-align:center;margin:16px 0">Research only — past results don't predict future results. Units are flat 1u per pick; no dollar amounts. 21+ · <span data-help>${helpLine()}</span></div>
  <div class="card"><div class="card-h"><b>Row validator</b><span class="small muted">check a card before it goes out</span></div><p class="small muted" style="margin-top:0">One row per line: <code>Section | pick | line | price | start time</code>. Catches missing lines, juice worse than −230, both sides of one prop, wrong section, duplicates, started games and “~”/“?” rows.</p>
  <textarea id="valT" rows="5" placeholder="Points | Luka Doncic Over 32.5 pts | 32.5 | -112\nML | TOR ML | | -450">${esc(ledS.valT || '')}</textarea><div class="actions"><button class="btn pri" data-act="validate">Validate rows</button></div>
  ${ledS.val ? `<div class="tbl"><table><tr><th>#</th><th>Row</th><th>Status</th></tr>${ledS.val.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.section ? r.section + ' · ' : '')}${esc(r.pick)}</td><td>${r.issues.length ? r.issues.map(x => `<div><span class="tag ${x.lvl === 'warn' ? 'warn' : 'bad'}">${x.lvl === 'sit' ? 'SIT' : x.lvl === 'warn' ? 'check' : 'fix'}</span> ${esc(x.msg)}</div>`).join('') : '<span class="tag good">✓ OK</span>'}</td></tr>`).join('')}</table></div><div class="src">${ledS.val.filter(r => r.ok).length} of ${ledS.val.length} rows pass.</div>` : ''}</div>`; }

// ---------- Trends ----------
const trS = { ev: null, data: null, busy: false, err: null };
function trendsView() { const S = X.S; const evs = S.events.filter(e => e.state !== 'post'); const lg = S.league, per = Tr.PERIOD[lg];
  if (!S.events.length) return X.head() + states(S, X.D, () => '');
  if (!per) return X.head() + `<div class="card">${empty('trend', 'Trends aren\'t available for soccer yet', 'ESPN scoreboards for soccer don\'t include per-half scores in a consistent way. Try MLB, NBA, NFL or NHL.')}</div>`;
  const e = S.events.find(x => x.id === trS.ev) || null;
  const pick = `<div class="card"><label for="trG">Game</label><select id="trG" style="width:100%"><option value="">Choose a game</option>${(evs.length ? evs : S.events).map(x => `<option value="${x.id}" ${x.id === trS.ev ? 'selected' : ''}>${esc(x.away.abbr)} @ ${esc(x.home.abbr)} · ${esc(x.state === 'pre' ? new Date(x.start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : x.detail)}</option>`).join('')}</select><div class="src">Last 5 and last 10 completed games per team, from ESPN scoreboards. Includes last season when this season is short.</div></div>`;
  if (!e) return X.head() + `<h1 style="margin-top:8px">Trends</h1>` + pick;
  if (trS.busy) return X.head() + `<h1 style="margin-top:8px">Trends</h1>` + pick + skel(2);
  if (trS.err) return X.head() + pick + `<div class="card">${empty('wifi-off', 'Couldn\'t load team history', 'ESPN didn\'t answer. Try again.', '<button class="btn" data-act="trretry">Retry</button>')}</div>`;
  const d = trS.data; if (!d) return X.head() + pick;
  const gl = e.odds?.total.line ?? null; const pname = per[0]; const trBadges = [];
  const row = (label, f, line) => { const a = Tr.rate(d.away, f, line), h = Tr.rate(d.home, f, line); const cell = x => !x ? '<span class="muted small" title="No completed games in ESPN box scores">no games</span>' : x.n < 5 ? `<span class="muted small" title="Trends under 5 games are hidden">n=${x.n} · hidden</span>` : `${x.avg}${line != null ? ` <span class="muted small">· ${x.over}/${x.n} over</span>` : ''}`;
    if (line != null) [['away', a], ['home', h]].forEach(([sd, r]) => ['l10', 'l5'].forEach(k => { const x = r[k]; if (x && x.n >= 5 && !trBadges.some(b => b.sd === sd && b.label === label)) { const o = x.over / x.n; if (o >= 0.7 || o <= 0.3) trBadges.push({ sd, label, txt: `${e[sd].abbr} ${o >= 0.7 ? 'Over' : 'Under'} ${line} ${label.toLowerCase()} ${o >= 0.7 ? x.over : x.n - x.over}/${x.n}` }); } }));
    return `<tr><td>${label}${line != null ? ` <span class="muted small">vs ${line}</span>` : ''}</td><td class="n">${cell(a.l5)}</td><td class="n">${cell(a.l10)}</td><td class="n">${cell(h.l5)}</td><td class="n">${cell(h.l10)}</td></tr>`; };
  const nr = lg === 'mlb' ? row('No run 1st inning (rate)', g => (g.p1f == null ? null : g.p1f + g.p1a === 0 ? 1 : 0), null) : '';
  const tbl = `${row('Game total', g => g.pf + g.pa, gl)}${row('Team total (scored)', g => g.pf, null)}${row('Allowed', g => g.pa, null)}${row(`${pname} total`, g => (g.p1f == null ? null : g.p1f + g.p1a), null)}${row(`${pname} team total`, g => g.p1f ?? null, null)}${nr}`;
  return X.head() + `<h1 style="margin-top:8px">Trends</h1>` + pick + `<div class="card fade-in"><div class="card-h"><b>${esc(e.away.full || e.away.name)} @ ${esc(e.home.full || e.home.name)}</b></div>${trBadges.length ? `<div class="ask-ex">${trBadges.map(b => `<span class="tbadge">${esc(b.txt)}</span>`).join('')}</div>` : `<div class="small muted">No trend at 70%+ over 5+ games against tonight's line.</div>`}<div class="tbl"><table><tr><th>Average per game</th><th class="n">${esc(e.away.abbr)} L5</th><th class="n">${esc(e.away.abbr)} L10</th><th class="n">${esc(e.home.abbr)} L5</th><th class="n">${esc(e.home.abbr)} L10</th></tr>
  ${tbl}</table></div>
  <div class="src">From ESPN box scores (linescores) of each team's completed games. Rows with fewer than 5 games are hidden. Game-total over counts use tonight's line${gl == null ? ' (none posted yet)' : ` (${gl})`}. ${nr ? 'No-run rate: 1 = neither team scored in the 1st. ' : ''}Player prop trends: use <button class="lnk" data-t="props">Props</button> or <button class="lnk" data-t="ask">Ask</button>.</div></div>`; }
async function loadTrends(id) { const e = X.S.events.find(x => x.id === id); if (!e) return; trS.ev = id; trS.busy = true; trS.err = null; trS.data = null; rr();
  try { const p = e.path; const [a, h] = await Promise.all([Tr.teamGames(p, e.away.id, e.league), Tr.teamGames(p, e.home.id, e.league)]); if (trS.ev === id) trS.data = { away: a, home: h }; } catch (x) { trS.err = x.message; } trS.busy = false; rr(); }

// ---------- Desk additions: same-grade warning, best per section, Poly vs book, juice gate, injury gate ----------
const gateS = {};
function deskExtras() { const S = X.S; const ms = S.events.filter(e => e.state === 'pre').flatMap(X.markets); if (!ms.length) return '';
  const gs = ms.map(m => ({ m, g: X.grade(m) })); const warn = Lg.sameGrade(gs.map(x => x.g.grade)) ? `<div class="warnbox">${ic('warn')} Every row on this slate graded <b>${gs[0].g.grade}</b>. A card where every game gets the same grade usually means the inputs are missing, not that the games are equal — add outside numbers before trusting it.</div>` : '';
  const sec = m => ({ ml: 'Moneyline', total: 'Game total', spread: 'Spread' })[m.market];
  const best = Lg.bestBySection(gs.map(x => ({ section: sec(x.m), conf: x.g.conf ?? 0, sit: x.g.status === 'SIT' || x.g.grade === 'D', x })));
  const bestT = Object.values(best).length ? `<div class="card"><div class="card-h"><b>Best per section</b><span class="small muted">highest graded, juice gate applied</span></div><div class="tbl"><table><tr><th>Section</th><th>Pick</th><th>Grade</th><th class="n">Book</th><th class="n">Book implied</th><th class="n">Polymarket</th></tr>${Object.entries(best).map(([k, b]) => { const m = b.x.m, poly = m.quotes.find(q => q.book === 'Polymarket'); return `<tr><td>${k}</td><td>${esc(m.label)} <span class="muted small">${esc(m.e.away.abbr)} @ ${esc(m.e.home.abbr)}</span>${gateTag(m.e)}</td><td><span class="grade g${b.x.g.grade.replace('+', 'p')}">${b.x.g.grade}</span></td><td class="n">${am(m.price)}</td><td class="n">${pc(C.amToProb(m.price))}</td><td class="n">${poly ? pc(poly.prob) + ` <span class="small ${poly.prob > C.amToProb(m.price) ? 'mv-up' : 'mv-dn'}">${sg((poly.prob - C.amToProb(m.price)) * 100)} pts</span>` : '<span class="muted small">no market</span>'}</td></tr>`; }).join('')}</table></div><div class="src">Juice gate: anything worse than ${am(C.JUICE_CAP)} is a SIT and is never listed as best. Grade scale A 75%+ · B 68–74 · C 58–67 lean · D pass. Polymarket shows the executable ask in cents.</div></div>` : '';
  return warn + bestT + gateCard(); }
export const gateOk = e => !!gateS[e.id]?.ok;
const gateTag = e => { const g = gateS[e.id]; return g?.ok ? ' <span class="tag good">gate ✓</span>' : ' <span class="tag warn">gate open</span>'; };
function gateCard() { const S = X.S; const e = S.events.find(x => x.id === S.deskOnly) || S.events.find(x => x.state === 'pre'); if (!e) return ''; const g = gateS[e.id] ||= {};
  if (!g.loading && !g.tried) { g.loading = true; g.tried = true; loadGate(e); }
  gateEval(e);
  const row = (name, at, txt, src) => `<tr><td>${esc(name)}${src ? `<div class="small muted">${esc(src)}</div>` : ''}</td><td>${g.loading && !at ? 'loading…' : txt}</td><td>${at ? stamp(at) : ''}</td></tr>`;
  return `<div class="card"><div class="card-h"><b>Injury & lineup gate</b><span class="small muted">${esc(e.away.abbr)} @ ${esc(e.home.abbr)}</span></div>
  <div class="tbl"><table><tr><th>Source</th><th>Status</th><th>Checked</th></tr>${row('ESPN injury report', g.espnAt, g.espnAt ? `${g.espnN} listed` : '<span class="tag warn">retrying</span>', g.espnSrc)}
  ${row(g.s2Name || 'Second source', g.s2At, g.s2At ? `${g.s2N} listed${g.x ? ` · ${g.x.both} on both lists` : ''}` : g.manual ? esc(g.manual.src) : `<span class="tag warn">retrying</span> <button class="btn sm" data-act="gatecheck" data-id="${e.id}">I checked another source</button>`, g.s2Src)}
  ${e.league === 'mlb' ? row('MLB StatsAPI lineups', g.luAt, g.luAt ? 'both lineups confirmed' : '<span class="tag warn">lineups not posted yet</span>') : ''}
  ${e.league === 'nhl' ? (() => { const G = g.goalie, gc = LS.get('gconf', {})[e.id], both = G?.home?.starter && G?.away?.starter;
    const txt = both ? `Starters: ${esc(G.away.starter)} (${esc(G.away.abbr)}) · ${esc(G.home.starter)} (${esc(G.home.abbr)})` : gc && Date.now() - gc.at < 3 * 3600e3 ? `Confirmed by you at ${tm2(gc.at)} ET (Daily Faceoff)` : `<span class="tag warn">not confirmed</span> ${G ? `Goalies: ${esc(G.away.abbr)} ${esc((G.away.goalies || []).join(' / ') || '—')} · ${esc(G.home.abbr)} ${esc((G.home.goalies || []).join(' / ') || '—')}` : esc(g.goalieErr || '')}. NHL posts starters near puck drop. <a href="https://www.dailyfaceoff.com/starting-goalies/" target="_blank" rel="noopener">Check Daily Faceoff</a> <button class="btn sm" data-act="gconf" data-id="${e.id}">I confirmed both starters</button>`;
    return row('NHL starting goalies', g.gAt, txt, 'NHL api-web gamecenter'); })() : ''}</table></div>
  ${g.x && (g.x.onlyA.length || g.x.onlyB.length) ? `<div class="small muted">Only on one list: ${esc([...g.x.onlyA.map(n => n + ' (ESPN)'), ...g.x.onlyB.map(n => n + ' (' + (g.s2Name || '2nd') + ')')].slice(0, 8).join(', '))} — check these before trusting a pick.</div>` : ''}
  <div class="src">${g.ok ? '<span class="tag good">✓ Gate passed</span> Two independent sources checked within the last 60 minutes.' : `<span class="tag warn">Gate open</span> ${esc(g.why || 'Needs two sources checked within 60 minutes.')}`}</div></div>`; }
export function gateEval(e) { const g = gateS[e.id] ||= {}, fresh = t => t && Date.now() - t < 3600e3; const s2 = g.s2At || g.manual?.at;
  const gc = LS.get('gconf', {})[e.id], goalieOk = e.league !== 'nhl' || !!(g.goalie?.home?.starter && g.goalie?.away?.starter) || !!(gc && Date.now() - gc.at < 3 * 3600e3);
  g.ok = !!(fresh(g.espnAt) && fresh(s2) && (e.league !== 'mlb' || fresh(g.luAt)) && goalieOk);
  g.why = !fresh(g.espnAt) ? 'ESPN injury report not pulled in the last 60 minutes.' : !fresh(s2) ? 'Second injury source not pulled in the last 60 minutes.' : e.league === 'mlb' && !fresh(g.luAt) ? 'MLB lineups not confirmed yet.' : !goalieOk ? 'NHL starting goalies not confirmed yet.' : ''; return g; }
const stamp = t => `${new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${Date.now() - t > 3600e3 ? ' <span class="tag warn">' + ic('clock') + ' stale</span>' : ''}`;
async function loadGate(e) { const g = gateS[e.id];
  const [a, b] = await Promise.allSettled([X.I.injuries(e), X.I.injuries2(e)]);
  if (a.status === 'fulfilled') { const v = a.value; g.espnAt = v.at || Date.now(); g.espnN = (v.home?.length || 0) + (v.away?.length || 0); g.espnSrc = v.src + (v.cached ? ' · last good pull' : ''); g.inj = v; }
  if (b.status === 'fulfilled') { const v = b.value; g.s2At = v.at || Date.now(); g.s2N = (v.home?.length || 0) + (v.away?.length || 0); g.s2Name = v.src; g.inj2 = v; }
  else g.s2Name = { nba: 'Sleeper API', nfl: 'Sleeper API', mlb: 'MLB StatsAPI 40-man' }[e.league] || 'ESPN core API (team injuries)';
  if (g.inj && g.inj2) { const x = X.I.crossCheck(g.inj, g.inj2); g.x = { both: x.home.both + x.away.both, onlyA: [...x.home.onlyA, ...x.away.onlyA], onlyB: [...x.home.onlyB, ...x.away.onlyB] }; }
  if (e.league === 'mlb') { try { const d = new Date(e.start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${d}&hydrate=lineups,probablePitcher`).then(x => x.json());
    const gm = r.dates?.[0]?.games?.find(x => [x.teams.home.team.name, x.teams.away.team.name].some(n => n.includes(e.home.name) || n.includes(e.away.name)));
    if (gm) { const n = (gm.lineups?.homePlayers?.length || 0) + (gm.lineups?.awayPlayers?.length || 0); if (n >= 18) g.luAt = Date.now(); } } catch {} }
  if (e.league === 'nhl') { const NHLAB = { TB: 'TBL', NJ: 'NJD', LA: 'LAK', SJ: 'SJS', UTAH: 'UTA' }; const d = new Date(e.start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    try { const r = await fetch(`https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-sb?nhldate=${d}&nhlhome=${NHLAB[e.home.abbr] || e.home.abbr}`).then(x => x.json()); if (!r.error) { g.goalie = r; g.gAt = new Date(r.fetched).getTime(); } else g.goalieErr = r.error; } catch (x) { g.goalieErr = 'NHL API unavailable'; } }
  g.loading = false; gateEval(e); if (['desk', 'today'].includes(X.S.tab)) rr(); }
export const loadGateFor = e => { const g = gateS[e.id] ||= {}; if (!g.tried) { g.tried = true; g.loading = true; loadGate(e); } return g; };

// ---------- Odds additions: line-movement chart ----------
function lineChart(e) { const h = (LS.get('hist', {})[e.id] || []).filter(s => s.mh != null); if (h.length < 2) return '';
  const W = 300, H = 72, ps = h.map(s => C.amToProb(s.mh)), mn = Math.min(...ps), mx = Math.max(...ps), sp = mx - mn || 0.01, t0 = h[0].t, t1 = h[h.length - 1].t || t0 + 1;
  const X_ = t => ((t - t0) / (t1 - t0 || 1)) * W, Y = p => H - 8 - ((p - mn) / sp) * (H - 16); const d = h.map((s, i) => `${i ? 'L' : 'M'}${X_(s.t).toFixed(1)},${Y(ps[i]).toFixed(1)}`).join('');
  return `<div class="chart"><div class="row" style="justify-content:space-between"><span class="cap">${esc(e.home.abbr)} moneyline · this device</span><span class="small num">${am(h[0].mh)} → <b>${am(h[h.length - 1].mh)}</b></span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Line movement"><path d="${d}" class="ln"/><circle cx="${X_(h[h.length - 1].t)}" cy="${Y(ps[ps.length - 1])}" r="3" fill="var(--brand)"/></svg><div class="src">${h.length} snapshots · ${new Date(t0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} → ${new Date(t1).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></div>`; }
function oddsExtras() { const evs = X.S.events.filter(e => e.state !== 'post' && (LS.get('hist', {})[e.id] || []).length > 1); return evs.length ? `<h3>Line movement</h3><div class="grid2">${evs.slice(0, 8).map(e => `<div class="card"><b>${esc(e.away.abbr)} @ ${esc(e.home.abbr)}</b>${lineChart(e)}</div>`).join('')}</div>` : `<div class="card">${empty('odds', 'Line movement builds up as you watch', 'EdgePro saves a snapshot every time a price changes while the app is open. Charts appear after the second change.')}</div>`; }

// ---------- Record additions: calibration chart + weekly retune log ----------
function calibration() { const R = L.cached().filter(r => (r.result === 'win' || r.result === 'loss') && r.conf != null); const bins = [[.5, .58], [.58, .62], [.62, .68], [.68, .75], [.75, 1.01]];
  const b = bins.map(([lo, hi]) => { const s = R.filter(r => { const c = r.conf >= .5 ? r.conf : 1 - r.conf; return c >= lo && c < hi; }); const w = s.filter(r => (r.conf >= .5) === (r.result === 'win')).length; return { lo, hi, n: s.length, pred: s.length ? s.reduce((x, r) => x + (r.conf >= .5 ? r.conf : 1 - r.conf), 0) / s.length : null, act: s.length ? w / s.length : null }; });
  const S = 240, P = v => 20 + (v - .5) / .5 * (S - 40); const pts = b.filter(x => x.n);
  const log = L.calLog().slice().reverse();
  return `<div class="card"><div class="card-h"><b>Calibration</b><span class="small muted">does "70%" really win 70%?</span></div>${R.length < 10 ? `<p class="small muted">The chart fills in after 10 decided picks with a confidence number (you have ${R.length}).</p>` : `<div class="row" style="align-items:center;gap:24px"><svg viewBox="0 0 ${S} ${S}" width="240" height="240" role="img" aria-label="Calibration chart"><rect x="20" y="20" width="${S - 40}" height="${S - 40}" fill="none" class="grid" stroke="var(--line-2)"/><line x1="20" y1="${S - 20}" x2="${S - 20}" y2="20" stroke="var(--text-3)" stroke-dasharray="4 4"/>${pts.map(x => `<circle cx="${P(x.pred)}" cy="${S - P(x.act)}" r="${4 + Math.min(8, x.n / 5)}" fill="var(--brand)" fill-opacity=".7"><title>${pc(x.pred)} predicted → ${pc(x.act)} actual (${x.n})</title></circle>`).join('')}<text x="20" y="${S - 4}" font-size="11" fill="var(--text-3)">50%</text><text x="${S - 40}" y="${S - 4}" font-size="11" fill="var(--text-3)">100%</text></svg>
  <div class="tbl" style="flex:1"><table><tr><th>Confidence</th><th class="n">Picks</th><th class="n">Predicted</th><th class="n">Actual</th></tr>${b.map(x => `<tr><td>${Math.round(x.lo * 100)}–${Math.min(100, Math.round(x.hi * 100) - 1)}%</td><td class="n">${x.n}</td><td class="n">${pc(x.pred)}</td><td class="n">${pc(x.act)}</td></tr>`).join('')}</table></div></div><div class="src">Dots on the dashed line = honest confidence. Below the line = overconfident.</div>`}
  <details style="margin-top:12px"><summary>Weekly retune log (${log.length})</summary><ul class="why">${log.map(x => `<li><b>${fmtD(x.at, { month: 'short', day: 'numeric', year: 'numeric' })}</b> · ${esc(x.note)}</li>`).join('') || '<li class="muted">No retune yet.</li>'}</ul></details></div>`; }

// ---------- People: profiles, verified picks, follows, leaderboard ----------
let prof = null, profLoaded = false; const pS = { tab: 'me', lb: null, other: null, feed: null, msg: '', avail: null };
export async function onAuth() { if (!A.user) { prof = null; profLoaded = true; return; } prof = await So.myProfile().catch(() => null); profLoaded = true; if (X.S.tab === 'community') rr(); }
function peopleView() { const S = X.S; if (!A.user) A.init().catch(() => {});
  if (S.viewUser) { if (!pS.other || pS.other.username?.toLowerCase() !== S.viewUser.toLowerCase()) { if (!pS.otherLoading) { pS.otherLoading = true; So.profileByName(S.viewUser).then(p => { pS.other = p || { missing: S.viewUser }; pS.otherLoading = false; rr(); }).catch(() => { pS.other = { missing: S.viewUser }; pS.otherLoading = false; rr(); }); } return skel(2); }
    return `<button class="btn ghost" data-act="pback" style="margin-top:16px">← People</button>` + (pS.other.missing ? `<div class="card">${empty('user', 'Profile not found', `@${esc(pS.other.missing)} doesn't exist or is private.`, '<button class="btn" data-act="pback">Back</button>')}</div>` : profileCard(pS.other, false)); }
  const tabs = `<div class="chips" role="tablist">${[['me', 'My profile'], ['feed', 'Following'], ['lb', 'Leaderboard']].map(([k, n]) => `<button class="chip ${pS.tab === k ? 'on' : ''}" role="tab" aria-selected="${pS.tab === k}" data-act="ptab" data-k="${k}">${n}</button>`).join('')}</div>`;
  let body = '';
  if (pS.tab === 'lb') { if (!pS.lb) { So.settleNow(); So.leaderboard().then(r => { pS.lb = r; rr(); }).catch(() => { pS.lb = 'err'; rr(); }); body = skel(3, 'sm'); }
    else if (pS.lb === 'err') body = `<div class="card">${empty('wifi-off', 'Leaderboard unavailable', 'The EdgePro server didn\'t answer.', '<button class="btn" data-act="plbretry">Retry</button>')}</div>`;
    else body = `<div class="card"><div class="card-h"><b>Leaderboard</b><span class="small muted">public profiles · ranked by average CLV · 50+ verified picks with a close to qualify</span></div>${pS.lb.length ? `<div class="tbl"><table class="lb"><tr><th>#</th><th>Bettor</th><th class="n">Avg CLV</th><th class="n">Picks</th><th class="n">W–L–P</th><th class="n">ROI</th><th class="n">Followers</th></tr>${pS.lb.map((r, i) => `<tr><td class="num">${r.qualified ? i + 1 : '–'}</td><td><button class="lnk" data-act="puser" data-u="${esc(r.username)}" style="text-decoration:none;display:inline-flex;gap:8px;align-items:center">${av(r, 'sm')} @${esc(r.username)}</button> ${r.qualified ? '' : `<span class="tag">${+r.clv_n || 0}/50</span>`}</td><td class="n"><b>${r.avg_clv == null ? '—' : sg(+r.avg_clv, 2)}</b></td><td class="n">${+r.clv_n || 0}</td><td class="n">${r.w}–${r.l}–${r.p}</td><td class="n">${r.roi == null ? '—' : sg(+r.roi) + '%'}</td><td class="n">${r.followers}</td></tr>`).join('')}</table></div>` : empty('community', 'No public profiles yet', 'Create yours and post a pick to be first.')}<div class="src">Ranked by CLV — how much better your price was than the closing line — because it predicts long-run results far better than win–loss over a small sample. Only verified picks (posted before the game starts) count; picks posted after the start show as unverified and are excluded. Results, closing prices and CLV are filled in by the EdgePro server from ESPN — nobody can edit their own record.</div></div>`; }
  else if (!A.user) body = `<div class="card">${empty('user', 'Create your EdgePro profile', 'A public profile with a verified record: picks are time-stamped before the game and graded by the server, so the ROI and CLV are real.')}</div>` + X.acctCard();
  else if (!profLoaded) body = skel(2);
  else if (!prof || pS.editing) body = profileForm();
  else if (pS.tab === 'feed') { if (!pS.feed) { So.feed().then(f => { pS.feed = f; rr(); }).catch(() => { pS.feed = []; rr(); }); body = skel(3, 'sm'); } else body = `<div class="card"><div class="card-h"><b>Picks from people you follow</b></div>${pS.feed.length ? pS.feed.map(p => pickLine(p, true)).join('') : empty('community', 'Nothing here yet', 'Follow bettors from the leaderboard to see their picks the moment they post.', '<button class="btn" data-act="ptab" data-k="lb">Open leaderboard</button>')}</div>`; }
  else { if (!pS.mine) { So.settleNow().finally(() => So.profileByName(prof.username).then(p => { pS.mine = p || { ...prof, picks: [], stat: null }; rr(); }).catch(() => { pS.mine = { ...prof, picks: [], stat: null }; rr(); })); body = skel(2); } else body = profileCard(pS.mine, true) + X.acctCard(); }
  return `<h1 style="margin-top:24px">People</h1>` + tabs + body; }
const av = (p, cls = '') => `<span class="avatar ${cls}">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy">` : esc((p.display_name || p.username || '?')[0].toUpperCase())}</span>`;
const pickLine = (p, who, mine) => `<div class="ds-list-row">${who && p.who ? `<button class="lnk" data-act="puser" data-u="${esc(p.who.username)}" style="text-decoration:none">${av(p.who, 'sm')}</button>` : ''}<div style="flex:1;min-width:0"><b>${esc(p.label)}</b> <span class="num">${am(p.price)}</span> ${p.created_at && p.game_start && new Date(p.created_at) >= new Date(p.game_start) ? '<span class="tag warn" title="Posted after the game started — not counted">Unverified</span> ' : '<span class="tag good" title="Posted on the server before the game started">✓ Verified</span> '}${p.grade ? `<span class="grade g${String(p.grade).replace('+', 'p')}">${esc(p.grade)}</span>` : ''}<div class="small muted">${who && p.who ? '@' + esc(p.who.username) + ' · ' : ''}${esc(p.game || '')} · ${fmtD(p.game_start, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · posted ${fmtD(p.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div><div class="n" style="text-align:right">${p.result ? `<span class="tag ${p.result === 'win' ? 'good' : p.result === 'loss' ? 'bad' : ''}">${p.result === 'win' ? '▲ Win' : p.result === 'loss' ? '▼ Loss' : p.result === 'void' ? 'Void' : 'Push'}</span>${p.clv != null ? `<div class="small muted num">CLV ${sg(+p.clv, 2)}</div>` : ''}` : '<span class="tag">Open</span>'}${mine && p.id ? `<div><button class="lnk small" data-act="psign" data-id="${p.id}">${ic('share')} Signed link</button></div>` : ''}</div></div>`;
function profileCard(p, mine) { const st = p.stat || {}; const n = (+st.w || 0) + (+st.l || 0) + (+st.p || 0);
  return `<div class="card fade-in"><div class="prof-h">${av(p)}<div style="flex:1;min-width:0"><h2 style="margin:0">${esc(p.display_name || '@' + p.username)}</h2><div class="muted small">@${esc(p.username)}${p.is_public ? '' : ' · <span class="tag">private</span>'}${p.fav_sports?.length ? ' · ' + p.fav_sports.map(esc).join(', ') : ''}</div></div>
  ${mine ? '<button class="btn" data-act="pedit">Edit</button>' : A.user && A.user.id !== p.user_id ? `<button class="btn ${p.following ? '' : 'pri'}" data-act="pfollow" data-id="${p.user_id}" data-on="${p.following ? 0 : 1}">${p.following ? 'Following' : 'Follow'}</button>` : ''}</div>
  ${p.bio ? `<p style="margin:12px 0 0">${esc(p.bio)}</p>` : ''}${p.fav_teams?.length ? `<div class="ask-ex">${p.fav_teams.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
  <div class="stat-row"><div class="stat hero"><span class="cap">Skill score · avg CLV</span><b class="num">${st.avg_clv == null ? '—' : sg(+st.avg_clv, 2)}</b><small>${+st.clv_n || 0} verified picks with a close</small></div><div class="stat"><span class="cap">Verified record</span><b class="num">${+st.w || 0}–${+st.l || 0}–${+st.p || 0}</b><small>${n} settled · ${st.open_picks || 0} open</small></div><div class="stat"><span class="cap">ROI</span><b class="num">${st.roi == null ? '—' : sg(+st.roi) + '%'}</b><small>flat 1u</small></div><div class="stat"><span class="cap">Followers</span><b class="num">${st.followers ?? 0}</b><small>&nbsp;</small></div></div>
  ${(+st.clv_n || 0) < 50 ? `<div class="src">${+st.clv_n || 0} of 50 verified picks needed to rank — too early to judge skill.</div>` : ''}${+st.unverified ? `<div class="src">${st.unverified} pick${st.unverified == 1 ? '' : 's'} posted after the start — unverified, not counted.</div>` : ''}</div>
  <div class="card"><div class="card-h"><b>Recent picks</b>${mine ? '<span class="small muted">post from the Desk with “Post pick”</span>' : ''}</div>${(p.picks || []).length ? p.picks.map(x => pickLine(x, false, mine)).join('') : empty('desk', 'No picks posted yet', mine ? 'Open the Desk and tap “Post pick” on any pre-game pick.' : 'Check back later.', mine ? '<button class="btn pri" data-t="desk">Open the Desk</button>' : '')}</div>
  ${mine ? `<div class="card"><div class="card-h"><b>Share</b></div><div class="actions"><button class="btn" data-act="pshare">${ic('share')} Copy profile link</button></div></div>` : ''}`; }
const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'WNBA', 'NCAAF', 'NCAAB', 'Soccer'];
function profileForm() { const p = prof || {};
  return `<div class="card"><div class="card-h"><b>${prof ? 'Edit profile' : 'Create your profile'}</b></div>
  <div class="prof-h">${av(p.username ? p : { username: '?' })}<div><label for="pAv" class="btn sm" style="margin:0;cursor:pointer">Upload photo</label><input id="pAv" type="file" accept="image/png,image/jpeg,image/webp" class="hide"><div class="small muted" id="pAvMsg">PNG, JPG or WebP · cropped to a square</div></div></div>
  <label for="pU">Username</label><input id="pU" maxlength="20" value="${esc(p.username || '')}" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="3–20 letters, numbers or _" style="width:100%"><div id="pUMsg" class="small muted">${pS.avail === true ? '<span class="mv-up">✓ Available</span>' : pS.avail === false ? '<span class="mv-dn">✗ Taken or not allowed</span>' : 'Lowercase letters, numbers and _ only.'}</div>
  <label for="pN">Display name</label><input id="pN" maxlength="40" value="${esc(p.display_name || '')}" style="width:100%">
  <label for="pB">Bio</label><textarea id="pB" maxlength="280" rows="3">${esc(p.bio || '')}</textarea>
  <label>Favorite sports</label><div class="ask-ex" style="margin-top:0">${SPORTS.map(s => `<button type="button" class="chip ${(p.fav_sports || pS.fs || []).includes(s) ? 'on' : ''}" data-act="pfs" data-s="${s}" aria-pressed="${(p.fav_sports || []).includes(s)}">${s}</button>`).join('')}</div>
  <label for="pT">Favorite teams</label><input id="pT" value="${esc((p.fav_teams || []).join(', '))}" placeholder="e.g. NYJ, NYK, NYY" style="width:100%">
  <label class="row small" style="align-items:center;margin-top:16px;color:var(--text)"><input type="checkbox" id="pP" ${p.is_public !== false ? 'checked' : ''} style="min-height:20px;width:20px"> Public profile (shows on the leaderboard; private hides you and your picks)</label>
  <div class="actions"><button class="btn pri" data-act="psave">${prof ? 'Save changes' : 'Create profile'}</button>${prof ? '<button class="btn" data-act="pcancel">Cancel</button>' : ''}</div><div id="pMsg" class="small mv-dn" role="alert">${esc(pS.msg)}</div></div>`; }

// ---------- share card image ----------
async function shareCard(m, g) { const W = 1080, c = Object.assign(document.createElement('canvas'), { width: W, height: W }), x = c.getContext('2d'); await document.fonts?.ready;
  x.fillStyle = '#0B0D10'; x.fillRect(0, 0, W, W); x.fillStyle = '#12151A'; x.beginPath(); x.roundRect(60, 60, W - 120, W - 120, 40); x.fill();
  x.fillStyle = '#2DD4BF'; x.font = '600 44px Inter'; x.fillText('EdgePro', 120, 170); x.fillStyle = '#A3ACB8'; x.font = '400 34px Inter'; x.fillText(`${m.e.away.full || m.e.away.name} @ ${m.e.home.full || m.e.home.name}`, 120, 300);
  x.fillStyle = '#E8EAED'; x.font = '600 96px Inter'; x.fillText(m.label, 120, 430); x.font = '600 140px Inter'; x.fillText(am(m.price), 120, 600);
  x.fillStyle = '#A3ACB8'; x.font = '400 36px Inter'; x.fillText(`Desk grade ${g.grade}${g.conf ? ' · ' + Math.round(g.conf * 100) + '% fair' : ''} · ${new Date(m.e.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`, 120, 700);
  x.fillStyle = '#8A94A1'; x.font = '400 28px Inter'; x.fillText('Research, not advice. 21+. 1-800-GAMBLER', 120, 900); x.fillText(prof ? 'edgepro · @' + prof.username : 'ace9x.github.io/edgepro-web', 120, 950);
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); const f = new File([blob], 'edgepro-pick.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: 'EdgePro pick' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'edgepro-pick.png' }); a.click(); toast('Pick card saved as an image'); }
export async function sharePick(k) { const m = X.findM(k); if (!m) return; const g = X.grade(m);
  X.modal(`<h3>Share ${esc(m.label)} ${am(m.price)}</h3><p class="small muted">Post it to your verified profile (time-stamped before the game, graded by the server), save a pick card image, or both.</p><div class="actions"><button class="btn pri" data-act="ppost" data-k="${esc(k)}">Post to my profile</button><button class="btn" data-act="pcard" data-k="${esc(k)}">${ic('share')} Pick card image</button></div><div id="shMsg" class="small" role="status"></div>`); }

// ---------- actions ----------
export async function act(a, t, ctx) { X = ctx; const S = X.S;
  switch (a) {
    case 'more': $('#more').classList.remove('hide'); $('#more button[data-t]')?.focus(); return true;
    case 'moreclose': closeMore(); return true;
    case 'retry': S.err = null; S.errAt = null; rr(); X.load(); return true;
    case 'rgx': return true; // responsible-play banner is always shown
    case 'fav': { const f = favs(); const e = S.events.find(x => x.id === t.dataset.id); if (f.games[e.id]) delete f.games[e.id]; else f.games[e.id] = 1; LS.set('favs', f); if (f.games[e.id]) { toast(`Following ${e.away.abbr} @ ${e.home.abbr} — you'll get line-move alerts while EdgePro is open`); if (LS.get('notify', null) == null && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(p => LS.set('notify', p === 'granted' ? 1 : 0)); } rr(); return true; }
    case 'askex': runAsk(t.dataset.q); return true;
    case 'ledbook': ledS.book = t.dataset.k; rr(); return true;
    case 'validate': ledS.valT = $('#valT').value; ledS.val = Lg.validate(Lg.parseRows(ledS.valT)); rr(); return true;
    case 'trretry': loadTrends(trS.ev); return true;
    case 'gconf': { const c = LS.get('gconf', {}); c[t.dataset.id] = { at: Date.now() }; LS.set('gconf', c); const e = X.S.events.find(x => x.id === t.dataset.id); if (e) gateEval(e); X.render(); return true; }
    case 'gatecheck': { const src = prompt('Which source did you check lineups/injuries on? (e.g. RotoWire, team X account)'); if (!src) return true; const g = gateS[t.dataset.id] ||= {}; g.manual = { at: Date.now(), src: 'you checked ' + src.slice(0, 40) }; rr(); return true; }
    case 'limsave': { const w = parseFloat($('#limW').value), d = parseFloat($('#limD').value); const l = lim(); l.weekly = w > 0 ? w : null; l.dailyStop = d > 0 ? d : null; LS.set('limits', l); toast('Limits saved'); rr(); return true; }
    case 'lock': { const d = +t.dataset.d; if (!confirm(`Pause bet tracking for ${d === 1 ? '24 hours' : d + ' days'}? You can't end the break early.`)) return true; const l = lim(); l.lockUntil = Date.now() + d * 864e5; LS.set('limits', l); rr(); return true; }
    case 'ptab': pS.tab = t.dataset.k; if (t.dataset.k === 'lb') pS.lb = null; if (t.dataset.k === 'feed') pS.feed = null; rr(); return true;
    case 'plbretry': pS.lb = null; rr(); return true;
    case 'puser': S.viewUser = t.dataset.u; pS.other = null; history.replaceState(null, '', '#u/' + t.dataset.u); rr(); scrollTo(0, 0); return true;
    case 'pback': S.viewUser = null; history.replaceState(null, '', '#community'); rr(); return true;
    case 'pedit': pS.editing = true; rr(); return true; case 'pcancel': pS.editing = false; rr(); return true;
    case 'pfs': { t.classList.toggle('on'); t.setAttribute('aria-pressed', t.classList.contains('on')); return true; }
    case 'psave': { const u = $('#pU').value.trim().toLowerCase(); const msg = m => ($('#pMsg').textContent = m);
      if (!So.USER_RE.test(u)) return msg('Username must be 3–20 lowercase letters, numbers or _.'), true;
      if (!(await So.available(u).catch(() => false))) return msg('That username is taken.'), true;
      try { prof = await So.saveProfile({ username: u, display_name: $('#pN').value.trim(), bio: $('#pB').value.trim(), fav_sports: [...document.querySelectorAll('[data-act=pfs].on')].map(b => b.dataset.s), fav_teams: $('#pT').value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20), is_public: $('#pP').checked, avatar_url: pS.avatar ?? prof?.avatar_url ?? null });
        prof = await So.myProfile(); pS.editing = false; pS.mine = null; pS.avatar = undefined; toast('Profile saved'); rr(); } catch (e) { msg(e.message); } return true; }
    case 'pfollow': { if (!A.user) { S.tab = 'community'; rr(); return true; } try { await So.follow(t.dataset.id, t.dataset.on === '1'); pS.other = null; pS.lb = null; rr(); } catch (e) { toast(e.message); } return true; }
    case 'pshare': { const url = location.origin + location.pathname + '#u/' + prof.username; navigator.clipboard?.writeText(url).then(() => toast('Profile link copied'), () => prompt('Copy your profile link:', url)); return true; }
    case 'ppost': { const m = X.findM(t.dataset.k); const g = X.grade(m); const out = $('#shMsg'); if (!A.user || !prof) { out.innerHTML = 'Create a profile first — <button class="lnk" data-t="community">open People</button>.'; return true; }
      try { await So.postPick({ key: m.key, eventId: m.e.id, path: m.e.path, league: m.e.league, market: m.market, side: m.side, line: m.line, label: m.label, game: `${m.e.away.abbr} @ ${m.e.home.abbr}`, price: m.price, grade: g.grade, official: g.official, start: m.e.start }); out.innerHTML = '<span class="mv-up">✓ Posted to your profile.</span>'; pS.mine = null; } catch (e) { out.innerHTML = `<span class="mv-dn">${esc(e.message)}</span>`; } return true; }
    case 'psign': { t.disabled = true; try { const url = await So.signShare(t.dataset.id); await navigator.clipboard?.writeText(url).then(() => toast('Signed link copied — anyone can check it against the server'), () => prompt('Copy this signed link:', url)); } catch (e) { toast('Could not sign: ' + e.message); } t.disabled = false; return true; }
    case 'nudgex': LS.set('nudge_sync', 1); rr(); return true;
    case 'closemodal': $('#modal').classList.add('hide'); return true;
    case 'ofmt': LS.set('ofmt', t.dataset.v); rr(); return true;
    case 'cpcalc': copyLine(t, location.origin + location.pathname + `?calc=novig&a=${encodeURIComponent($('#tA').value)}&b=${encodeURIComponent($('#tB').value)}`); return true;
    case 'stalego': staleScan(); return true;
    case 'exjson': exportData('json'); return true; case 'excsv': exportData('csv'); return true; case 'plst': plStatement(); return true;
    case 'delcloud': { const full = t.dataset.scope === 'account'; if (!confirm(full ? 'Delete your sign-in AND all EdgePro cloud data? This also closes the same sign-in on RigRoute and Rocapulco. This cannot be undone.' : 'Delete all your EdgePro cloud data (profile, posted picks, follows, synced bets)? Data on this device stays. This cannot be undone.')) return true;
      try { await deleteCloud(full ? 'account' : 'edgepro'); toast(full ? 'Account deleted' : 'EdgePro cloud data deleted'); rr(); } catch (e) { toast('Delete failed: ' + e.message); } return true; }
    case 'betlog': { const l = LS.get('betlog', []).filter(x => x.id === t.dataset.bid); X.modal(`<h3>Change log</h3><div class="tbl"><table><tr><th>When</th><th>Change</th></tr>${l.map(x => `<tr><td class="small">${new Date(x.at).toLocaleString()}</td><td class="small">${esc(x.kind)}${x.before ? ` · was ${am(x.before.price)} ${x.before.stake}u ${x.before.result || 'open'}` : ''}${x.after ? ` → ${am(x.after.price)} ${x.after.stake}u ${x.after.result || 'open'}` : ''}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No changes logged (bet predates the log).</td></tr>'}</table></div>`); return true; }
    case 'pcard': { const m = X.findM(t.dataset.k); shareCard(m, X.grade(m)); return true; }
  }
  return false; }

// ---------- views ----------
export function views(ctx) { X = ctx; const orig = { desk: ctx.views.desk, odds: ctx.views.odds, record: ctx.views.record, bets: ctx.views.bets, tools: ctx.views.tools };
  document.addEventListener('submit', ev => { if (ev.target.id === 'askF') { ev.preventDefault(); const q = $('#askQ').value.trim(); if (q) runAsk(q); } });
  document.addEventListener('change', async ev => { if (ev.target.id === 'trG') loadTrends(ev.target.value); if (ev.target.id === 'ledV') { ledS.voids = ev.target.checked; rr(); }
    if (ev.target.id === 'pAv' && ev.target.files[0]) { const m = $('#pAvMsg'); m.textContent = 'Uploading…'; try { pS.avatar = await So.uploadAvatar(ev.target.files[0]); m.innerHTML = '<span class="mv-up">✓ Photo ready — save to apply</span>'; document.querySelector('.prof-h .avatar').innerHTML = `<img src="${pS.avatar}" alt="">`; } catch (e) { m.innerHTML = `<span class="mv-dn">${esc(e.message)}</span>`; } } });
  let tmr; document.addEventListener('input', ev => { if (ev.target.id !== 'pU') return; clearTimeout(tmr); const u = ev.target.value.trim().toLowerCase(); const m = $('#pUMsg');
    pS.avail = null; if (!So.USER_RE.test(u)) { m.innerHTML = 'Lowercase letters, numbers and _ only (3–20).'; return; } m.textContent = 'Checking…'; tmr = setTimeout(async () => { const ok = await So.available(u).catch(() => null); pS.avail = ok; if ($('#pU')?.value.trim().toLowerCase() === u) $('#pUMsg').innerHTML = ok ? '<span class="mv-up">✓ Available</span>' : ok === false ? '<span class="mv-dn">✗ Taken</span>' : 'Couldn\'t check right now.'; }, 350); });
  return { today: todayView, ask: askView, ledger: ledgerView, trends: trendsView, limits: limitsView, community: peopleView,
    desk: () => { const h = orig.desk(); if (!X.S.events.length) return h; const i = h.indexOf('<div class="card">'); return i < 0 ? h : h.slice(0, i) + deskExtras() + `<div class="card">${gradeLegend()}${calMeter()}</div>` + h.slice(i).replace(/data-act="share"([^>]*)>Share pick/g, 'data-act="share"$1>Post pick'); },
    odds: () => { const h = orig.odds(); return X.S.events.length ? h + staleCard() + oddsExtras() : h; },
    bets: () => syncNudge() + orig.bets(),
    tools: () => orig.tools().replace('<div class="card"><b>No-vig fair odds & EV calculator</b>', fmtCard() + '<div class="card"><b>No-vig fair odds & EV calculator</b> <button class="icon-btn" data-act="cpcalc" aria-label="Copy a link to this calculation" title="Copy link">' + ic('copy') + '</button>') + glossaryCard() + `<div class="card"><b>Feedback</b><p class="small muted" style="margin:4px 0 0">Found a bug or want a feature? <a href="https://github.com/Ace9x/edgepro-web/issues/new" target="_blank" rel="noopener">Open an issue</a> — no account details needed.</p></div>`,
    record: () => clvHero() + recordSeed() + orig.record().replace(/ · updated [^<.]*/, '') + calibration() };
}
export const fairTxt = (e) => { const o = e.odds; const nv = o?.ml.home?.close && o?.ml.away?.close ? C.noVig(o.ml.away.close, o.ml.home.close) : null; return nv ? ` · no-vig fair ${esc(e.away.abbr)} ${pc(nv.p1)} / ${esc(e.home.abbr)} ${pc(nv.p2)}` : ''; };

function equityChart(rows) { const q = Lg.equity(rows); if (q.pts.length < 3) return ''; const z = Lg.zeroEdgeBand(rows); const W = 600, H = 140, all = [...q.pts, ...(z ? [...z.lo, ...z.hi] : [])], mn = Math.min(...all), mx = Math.max(...all), sp = mx - mn || 1;
  const Xp = i => i / (q.pts.length - 1) * W, Y = v => H - 8 - (v - mn) / sp * (H - 16), path = a => a.map((v, i) => `${i ? 'L' : 'M'}${Xp(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const bandP = z ? path(z.hi) + z.lo.map((v, i) => `L${Xp(z.lo.length - 1 - i).toFixed(1)},${Y(z.lo[z.lo.length - 1 - i]).toFixed(1)}`).join('') + 'Z' : '';
  return `<div class="chart" style="margin-top:16px"><div class="row" style="justify-content:space-between"><span class="cap">Equity curve · units</span><span class="small muted">max drawdown <b class="num">−${q.maxDD}u</b> · longest losing streak <b class="num">${q.streak}</b></span></div>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Equity curve with zero-edge band">${z ? `<path d="${bandP}" fill="var(--text-3)" opacity=".15"/>` : ''}<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="zero"/><path d="${path(q.pts)}" class="ln"/></svg>
  <div class="src">Grey band: where 90% of results land with <b>zero edge</b> at the same prices (500 simulated seasons). A line above the band is hard to get by luck alone.</div></div>`; }
function clvChart(rows) { const c = rows.filter(r => r.clv != null); if (!c.length) return ''; const beat = c.filter(r => r.clv > 0).length; const mx = Math.max(...c.map(r => Math.abs(r.clv)), 1);
  return `<div class="chart" style="margin-top:16px"><div class="row" style="justify-content:space-between"><span class="cap">Closing line value per pick</span><span class="small muted">beat the close <b class="num">${beat}/${c.length}</b> (${pc(beat / c.length)})</span></div><div class="mini" style="align-items:center">${c.map(r => `<i style="height:${Math.abs(r.clv) / mx * 50}%;align-self:${r.clv >= 0 ? 'flex-end' : 'flex-start'};background:${r.clv >= 0 ? 'var(--win)' : 'var(--loss)'}" title="${esc(r.pick)} ${sg(r.clv, 2)}"></i>`).join('')}</div><div class="src">Only ${c.length} of ${rows.length} desk picks have a logged close.</div></div>`; }
function heat(rows) { const sports = [...new Set(rows.map(r => r.sport))], bands = ['Fav ≤−150', '−149…−101', '+100…+199', '+200+'];
  const cell = (sp, b) => { const g = Lg.roi(rows.filter(r => r.sport === sp && Lg.band(r.price) === b))[0]; if (!g) return '<td class="n muted">·</td>'; const lo = g.n < 5; const a = Math.min(1, Math.abs(g.roi) / 60);
    return `<td class="n" style="${lo ? 'opacity:.45' : `background:color-mix(in srgb,${g.roi >= 0 ? 'var(--win)' : 'var(--loss)'} ${Math.round(a * 35)}%,transparent)`}" title="${g.n} picks">${g.roi >= 0 ? '▲' : '▼'}${sg(g.roi, 0)}% <span class="muted small">n${g.n}</span></td>`; };
  return `<div class="card"><div class="card-h"><b>ROI heatmap · sport × odds range</b><span class="small muted">greyed = under 5 picks</span></div><div class="tbl"><table><tr><th>Sport</th>${bands.map(b => `<th class="n">${b}</th>`).join('')}</tr>${sports.map(sp => `<tr><td>${esc(sp)}</td>${bands.map(b => cell(sp, b)).join('')}</tr>`).join('')}</table></div></div>`; }

function recordSeed() { if (!ledS.data) { Lg.load().then(d => { ledS.data = d; if (X.S.tab === 'record') rr(); }); return skel(1, 'sm'); }
  const box = (t, rows, note) => { const g = Lg.roi(rows.filter(r => !/void|unverified/i.test(r.raw || '')))[0]; if (!g) return ''; const w = Lg.wilson(g.w, g.w + g.l);
    return `<div class="stat"><span class="cap">${t}</span><b class="num">${g.w}–${g.l}–${g.p}</b><small>${pc(g.hit)} hit (95% CI ${w ? pc(w[0]) + '–' + pc(w[1]) : '—'}) · ${sg(g.roi)}% ROI · n=${g.n}${g.n < 50 ? ' · too few picks' : ''}${note ? ' · ' + note : ''}</small></div>`; };
  const G = ledS.data.grok, q = G.filter(r => !/assum/.test(r.priceSrc));
  const D = ledS.data.desk, valid = r => !/void|unverified/i.test(r.raw || ''), keys = [...new Set([...G, ...D].filter(valid).map(r => r.sport + ' · ' + r.section))].sort();
  const cell = rows => { const g = Lg.roi(rows)[0]; return g ? `${g.w}–${g.l}–${g.p} <span class="muted small">${sg(g.roi)}% · n=${g.n}</span>` : '<span class="muted small">—</span>'; };
  const real = G.filter(valid).filter(r => !/assum/.test(r.priceSrc)), ass = G.filter(valid).filter(r => /assum/.test(r.priceSrc)), gr = Lg.roi(real)[0], ga = Lg.roi(G.filter(valid))[0];
  const split = `<div class="card"><div class="card-h"><b>By sport &amp; section</b><span class="small muted">Grok and Desk side by side · never blended</span></div>${gr && ga ? `<p class="small" style="margin-top:0">Grok ROI with <span class="pchip real">Real</span> prices only: <b>${sg(gr.roi)}%</b> on ${gr.n} · all rows incl. <span class="pchip assumed">Assumed −110</span> (${ass.length}): <b>${sg(ga.roi)}%</b> on ${ga.n}.</p>` : ''}<div class="tbl" style="max-height:420px;overflow:auto"><table><tr><th>Sport · section</th><th class="n">Grok</th><th class="n">Desk</th></tr>${keys.map(k => `<tr><td>${esc(k)}</td><td class="n">${cell(G.filter(valid).filter(r => r.sport + ' · ' + r.section === k))}</td><td class="n">${cell(D.filter(valid).filter(r => r.sport + ' · ' + r.section === k))}</td></tr>`).join('')}</table></div><div class="src">Rows are read-only, loaded from GROK_RECORD.csv (with its price_source column) and the desk plays log. Voided or after-start rows stay in the ledger struck through and are not counted.</div></div>`;
  return split + `<div class="card"><div class="card-h"><b>Logged records</b><button class="btn sm" data-t="ledger">Open ledger</button></div><div class="stat-row">${box("Grok · all logged", G)}${box('Grok · quoted/sourced prices only', q)}${box('Desk plays', ledS.data.desk)}</div><div class="src">Kept separate, never blended. Grok rows with no price use an assumed −110 (marked in the ledger). Flat 1 unit per pick. As of Oct 20 settlements.</div></div>`; }

// ---------- consent (first launch + sign-up), export, delete ----------
export const TERMS_V = '2026-10-22';
export const consented = () => LS.get('consent', null)?.v === TERMS_V;
export function consentGate() { if (consented()) return; const m = $('#modal'); m.innerHTML = `<div role="document"><h3>Welcome to EdgePro</h3><p class="small muted">Free research tools — not a sportsbook. EdgePro never takes bets, holds money or tells you how much to bet.</p>
  <label class="row small" style="align-items:flex-start;color:var(--text);margin-top:16px"><input type="checkbox" id="cAge" style="min-height:20px;width:20px;margin-top:2px"> I'm 21 or older and in a place where sports wagering is legal.</label>
  <label class="row small" style="align-items:flex-start;color:var(--text)"><input type="checkbox" id="cTos" style="min-height:20px;width:20px;margin-top:2px"> I agree to the <a href="terms.html" target="_blank">Terms</a> and <a href="privacy.html" target="_blank">Privacy Policy</a>.</label>
  <div style="margin-top:8px">${stateSelect('cSt')}</div><div class="actions"><button class="btn pri" id="cGo" disabled>Continue</button></div><p class="small muted">Gambling problem? <span data-help>${helpLine()}</span>.</p></div>`;
  m.classList.remove('hide'); m.dataset.locked = '1'; const upd = () => ($('#cGo').disabled = !($('#cAge').checked && $('#cTos').checked)); $('#cAge').onchange = upd; $('#cTos').onchange = upd;
  $('#cGo').onclick = () => { LS.set('consent', { v: TERMS_V, at: new Date().toISOString(), age21: true, state: $('#cSt').value || null }); paintHelp(); delete m.dataset.locked; m.classList.add('hide'); }; $('#cAge').focus(); }
export const EXPORT_COLS = ['placed', 'start', 'game', 'league', 'label', 'price', 'stake', 'book', 'closePrice', 'clv', 'result', 'profit', 'final', 'settledAt', 'id', 'eventId', 'market', 'side', 'line'];
export function exportData(fmt) { const bets = LS.get('bets', []); const dump = { exported: new Date().toISOString(), consent: LS.get('consent', null), bets, betLog: LS.get('betlog', []), limits: lim(), favorites: favs(), profile: prof, grades: L.cached() };
  const cols = EXPORT_COLS;
  const blob = fmt === 'csv' ? new Blob([[cols.join(','), ...bets.map(b => cols.map(c => { const v = b[c] ?? ''; const t = typeof v === 'object' ? JSON.stringify(v) : String(v); return '"' + t.replace(/"/g, '""') + '"'; }).join(','))].join('\n')], { type: 'text/csv' }) : new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `edgepro-export.${fmt}` }).click(); }
export function plStatement() { const s = LS.get('bets', []).filter(b => b.result).sort((a, b) => String(a.start).localeCompare(String(b.start))); let run = 0;
  const rows = s.map(b => { run += b.profit || 0; return [fmtD(b.start, { year: 'numeric', month: '2-digit', day: '2-digit' }), b.game, b.label, b.price, b.stake, b.result, b.profit ?? 0, +run.toFixed(2)]; });
  const by = {}; s.forEach(b => { const k = String(b.start).slice(0, 7); by[k] = (by[k] || 0) + (b.profit || 0); });
  const csv = ['EdgePro P/L statement (units; research only, not tax advice),generated ' + new Date().toISOString(), 'date,game,bet,price,units_risked,result,units_won,running_units', ...rows.map(r => r.map(x => JSON.stringify(x ?? '')).join(',')), '', 'month,units_won', ...Object.entries(by).map(([k, v]) => `${k},${v.toFixed(2)}`)].join('\n');
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'edgepro-pl-statement.csv' }).click(); }
export async function deleteCloud(scope) { await A.init(); const c = A.client(); const { data } = await c.auth.getSession(); const r = await fetch('https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-delete-account', { method: 'POST', headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) }).then(x => x.json());
  if (r.error) throw new Error(r.error); prof = null; pS.mine = null; if (scope === 'account') await A.signOut(); return r; }
/** permanent per-bet change log: every create/edit/settle/delete appends, nothing is removed */
export function logBet(kind, bet, before) { const l = LS.get('betlog', []); l.push({ at: new Date().toISOString(), kind, id: bet.id, label: bet.label, before: before ? { price: before.price, stake: before.stake, result: before.result ?? null } : null, after: kind === 'delete' ? null : { price: bet.price, stake: bet.stake, result: bet.result ?? null } }); LS.set('betlog', l.slice(-5000)); }

// ---------- state-aware help line (user-picked state, never geolocated) ----------
export const US = LS.get('state', '');
export const helpLine = (st = LS.get('state', '')) => `Call or text <a href="tel:18004264537">1-800-GAMBLER</a>${st === 'NY' ? ' · New York: <a href="tel:18778467369">1-877-8-HOPENY</a> (877-846-7369) or text HOPENY (467369)' : ''}`;
export const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export const stateSelect = (id = 'stSel') => `<label class="small" style="display:block;color:var(--text)">Your state <span class="muted">(for the right help line; not tracked)</span><select id="${id}" aria-label="Your state"><option value="">Choose…</option>${STATES.map(x => `<option ${LS.get('state', '') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>`;
document.addEventListener('change', ev => { if (ev.target.id === 'stSel' || ev.target.id === 'cSt') { LS.set('state', ev.target.value); paintHelp(); } });
export function paintHelp() { const r = document.getElementById('rg'); if (r) r.innerHTML = `21+ only. Research tools, not a sportsbook — EdgePro never takes bets. Gambling problem? ${helpLine()}.`; document.querySelectorAll('[data-help]').forEach(x => (x.innerHTML = helpLine())); }
/** Any sportsbook link must go through this so a referral relationship is always disclosed (NY 9 NYCRR 5329.37). EdgePro has no referral deals today. */
export const bookLink = (href, text, { referral = false } = {}) => `<a href="${esc(href)}" target="_blank" rel="noopener${referral ? ' sponsored' : ''}">${esc(text)}</a>${referral ? ' <span class="tag warn" title="EdgePro may be paid if you sign up through this link">Referral link · EdgePro may be paid</span>' : ''}`;

// ---------- CLV as the headline skill score (Record) ----------
function clvHero() { const b = LS.get('bets', []).filter(x => x.closePrice != null && x.price != null); const n = b.length;
  const pts = n ? b.reduce((a, x) => a + (x.clv ?? C.clv(x.price, x.closePrice)), 0) / n : null, pc = n ? b.reduce((a, x) => a + C.clvPct(x.price, x.closePrice), 0) / n : null, beat = b.filter(x => C.clvPct(x.price, x.closePrice) > 0).length;
  return `<div class="card hero-clv"><div class="card-h"><b>Skill score · closing line value</b><span class="small muted">${n} bet${n === 1 ? '' : 's'} with a saved close</span></div>
  <div class="stat-row"><div class="stat hero"><span class="cap">Avg CLV</span><b class="num">${pc == null ? '—' : sg(pc, 2) + '%'}</b><small>price vs close</small></div><div class="stat"><span class="cap">In prob. points</span><b class="num">${pts == null ? '—' : sg(pts, 2)}</b><small>no-vig</small></div><div class="stat"><span class="cap">Beat the close</span><b class="num">${n ? Math.round(100 * beat / n) + '%' : '—'}</b><small>${beat} of ${n}</small></div></div>
  <div class="src">CLV is the main skill score here: across 87,960 Pinnacle price pairs, beating the close tracked long-run yield almost 1:1 (Football-Data). Win–loss over a small sample is mostly noise. Closing prices are saved automatically when each game starts.${n < 50 ? ` ${n} of 50 bets needed before this means much.` : ''}</div></div>`; }

// ---------- Stale-line finder (Odds) ----------
const stS = { key: null, data: null, busy: false, err: null };
function staleCard() { const S = X.S, pre = S.events.filter(e => e.state === 'pre'), key = S.league + '|' + pre.length, method = LS.get('devig', 'multiplicative');
  if (!pre.length) return '';
  const head = `<div class="card" id="stale"><div class="card-h"><b>${ic('search')} Stale-line finder</b><span class="small muted">each book vs the market fair price · ${esc(C.DEVIG_NAMES[method])} de-vig</span></div>`;
  if (stS.key !== key) { stS.key = key; stS.data = null; stS.err = null; }
  if (!stS.data) return head + (stS.busy ? skel(2, 'sm') : stS.err ? `<div class="muted small">${esc(stS.err)}</div><div class="actions"><button class="btn sm" data-act="stalego">Try again</button></div>` : `<p class="small muted">Compares every book's price with the fair price from the rest of the market (sharp books if listed, else the median of the others) and lists books paying more than fair. Informational — not a recommendation.</p><div class="actions"><button class="btn pri" data-act="stalego">Scan ${pre.length} upcoming game${pre.length === 1 ? '' : 's'}</button></div>`) + '</div>';
  const f = stS.data.flags, pub = stS.data.pub;
  return head + (f.length ? `<div class="tbl"><table><tr><th>Game</th><th>Bet</th><th>Book</th><th class="n">Price</th><th class="n">Fair</th><th class="n">Edge</th><th>Fair from</th></tr>${f.slice(0, 20).map(x => `<tr><td>${esc(x.e.away.abbr)} @ ${esc(x.e.home.abbr)}</td><td>${esc(x.label)}${x.publicSide ? ' <span class="tag warn" title="' + esc(x.publicSide.why) + '">priced for the public</span>' : ''}</td><td>${esc(x.book)}</td><td class="n">${am(x.price)}</td><td class="n">${am(x.fairAm)} <span class="muted small">${(x.fair * 100).toFixed(1)}%</span></td><td class="n mv-up">▲ ${(x.ev * 100).toFixed(1)}%</td><td class="small muted">${esc(x.fairSrc)}</td></tr>`).join('')}</table></div>`
    : `<div class="muted small">No book is more than 1.5% off the market fair right now across ${stS.data.games} game${stS.data.games === 1 ? '' : 's'} with 3+ books.</div>`)
    + (pub.length ? `<div style="margin-top:12px"><b class="small">Priced for the public</b><div class="small muted">Books often shade popular sides instead of balancing action (Levitt, 2004). These sides cost more than the market says they should — informational only.</div><ul class="why">${pub.slice(0, 12).map(x => `<li><b>${esc(x.e.away.abbr)} @ ${esc(x.e.home.abbr)}</b> ${esc(x.label)} <span class="muted small">· ${esc(x.why)}</span></li>`).join('')}</ul></div>` : '')
    + `<div class="src">Multi-book prices from The Odds API · fetched ${stS.data.at ? new Date(stS.data.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''} · <button class="lnk" data-act="stalego">Rescan</button> · <a href="terms.html">Not advice</a></div></div>`; }
const sideLabel = (e, m, sd, line) => m === 'ml' ? `${e[sd].abbr} ML` : m === 'spread' ? `${e[sd].abbr} ${line == null ? 'spread' : (sd === 'home' ? (line > 0 ? '+' : '') + line : (-line > 0 ? '+' : '') + -line)}` : `${sd === 'over' ? 'Over' : 'Under'}${line == null ? '' : ' ' + line}`;
async function staleScan() { const S = X.S, pre = S.events.filter(e => e.state === 'pre').slice(0, 30), method = LS.get('devig', 'multiplicative'); stS.busy = true; rr();
  try { const sp = await I.splits(pre.map(e => e.id)).catch(() => ({})); const flags = [], pub = []; let games = 0, at = null;
    for (const e of pre) { const bk = await I.books(e).catch(() => null); if (!bk?.rows?.length) continue; at = at || bk.fetched; if (bk.rows.length >= 3) games++;
      St.scan(bk.rows, { method, splits: sp[e.id] }).forEach(x => flags.push({ ...x, e, label: sideLabel(e, x.market, x.side, x.line) }));
      St.publicFlags(bk.rows, sp[e.id], method).forEach(x => pub.push({ ...x, e, label: sideLabel(e, x.market, x.side, x.market === 'spread' ? bk.rows[0]?.sp?.home?.point : x.market === 'total' ? bk.rows[0]?.tot?.over?.point : null) })); }
    if (!games && !flags.length) throw new Error('No games with 3+ books in the multi-book feed for this league yet — try closer to game time.');
    stS.data = { flags: flags.sort((a, b) => b.ev - a.ev), pub, games, at: at || Date.now() }; }
  catch (x) { stS.err = x.message; } stS.busy = false; rr(); }

// ---------- open a server-signed pick link (#s/<token>) ----------
export async function openShare(tok) { X.modal(`<h3>Shared pick</h3>${skel(1, 'sm')}`); const r = await So.verifyShare(tok).catch(() => ({ valid: false, why: 'could not reach the EdgePro server' }));
  if (!r.valid) { X.modal(`<h3>Shared pick</h3><div class="errbox">${ic('warn')} This link can't be verified: ${esc(r.why || 'unknown')}. Don't trust its contents.</div>`); return; }
  const p = r.pick, who = r.profile;
  X.modal(`<h3>Shared pick</h3><div class="card" style="margin:0"><div class="row" style="align-items:center;gap:12px">${who ? av(who) : ''}<div><b>${who ? '@' + esc(who.username) : 'Private profile'}</b><div class="small muted">${r.verified ? '<span class="tag good">✓ Verified pre-game</span>' : '<span class="tag warn">Unverified — posted after start</span>'} <span class="tag">Signed by EdgePro server</span></div></div></div>
  <div style="margin-top:12px"><b style="font-size:20px">${esc(p.label)}</b> <span class="num" style="font-size:20px">${am(p.price)}</span> ${p.grade ? `<span class="grade g${esc(p.grade)}">${esc(p.grade)}</span>` : ''}</div>
  <div class="small muted">${esc(p.game || '')} · ${fmtD(p.game_start, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · posted ${fmtD(p.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
  <div class="small" style="margin-top:8px">${p.result ? `Result: <b>${esc(p.result)}</b>${p.clv != null ? ` · CLV ${sg(+p.clv, 2)}` : ''}` : 'Not settled yet'}</div>
  <div class="src">Checked against the server record ${fmtD(r.checked, { hour: 'numeric', minute: '2-digit' })}. Research only, not advice · 21+ · <span data-help>${helpLine()}</span></div></div>
  <div class="actions">${who ? `<button class="btn pri" data-act="puser" data-u="${esc(who.username)}">View @${esc(who.username)}</button>` : ''}</div>`); }

// ================= growth + design batch =================
/** thin game-progress bar for live games (period / total periods) */
export function progress(e) { const per = { nba: 4, wnba: 4, nfl: 4, ncaaf: 4, ncaab: 2, nhl: 3, mlb: 9 }[e.league] || null, m = String(e.detail || '').match(/(\d+)(?:st|nd|rd|th)|(?:Top|Bot|Mid|End)\s+(\d+)|Q(\d)|P(\d)|(\d)(?:st|nd|rd|th) Half/i);
  const n = m ? +(m[1] || m[2] || m[3] || m[4] || m[5]) : null; if (!per || !n) return ''; const f = Math.min(1, (n - 0.5) / per);
  return `<div class="gprog" role="progressbar" aria-label="Game progress" aria-valuenow="${Math.round(f * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${(f * 100).toFixed(0)}%"></i></div>`; }
/** score bump: scale a score cell when it changes between renders */
const lastScore = {}; export function bumpScores(root = document) { root.querySelectorAll('[data-score]').forEach(el => { const k = el.dataset.score, v = el.textContent.trim(); if (lastScore[k] != null && lastScore[k] !== v && v && !reduced()) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } lastScore[k] = v; }); }
/** count-up for stat tiles on first view of a tab */
const counted = new Set(); export function countUp(tab, root = document) { if (counted.has(tab) || reduced()) return; counted.add(tab);
  root.querySelectorAll('.stat b.num').forEach(el => { const m = el.textContent.match(/^([^\d−-]*)([−-]?)(\d+(?:\.\d+)?)(.*)$/); if (!m) return; const to = +m[3], dp = (m[3].split('.')[1] || '').length, t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 600), e = 1 - (1 - k) ** 3; el.textContent = m[1] + m[2] + (to * e).toFixed(dp) + m[4]; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }); }
/** fair-vs-book edge bar: teal when the price beats fair, grey when not */
export const edgeBar = ev => { const w = Math.min(100, Math.abs(ev) * 100 * 10); return `<span class="edgebar ${ev > 0 ? 'pos' : 'neg'}" role="img" aria-label="${ev > 0 ? 'Edge' : 'No edge'} ${(ev * 100).toFixed(1)}%"><i style="width:${w.toFixed(0)}%"></i></span>`; };
/** grade legend + juice-cap explainer */
export const gradeLegend = () => `<details class="legend"><summary>How grades work</summary><div class="tbl"><table><tr><th>Grade</th><th>Model win chance</th><th>Meaning</th></tr><tr><td><span class="grade gA">A</span></td><td class="num">75%+</td><td class="small">Strongest. Official if 2 independent sources agree and the injury/lineup check passes.</td></tr><tr><td><span class="grade gB">B</span></td><td class="num">68–74%</td><td class="small">Can be Official with the same checks.</td></tr><tr><td><span class="grade gC">C</span></td><td class="num">58–67%</td><td class="small">Lean — never Official.</td></tr><tr><td><span class="grade gD">D</span></td><td class="num">under 58%</td><td class="small">Pass.</td></tr></table></div><p class="small muted">Juice cap: any price worse than −230 is marked <b>SIT</b>. At −230 you must win 70% just to break even, so small model errors wipe out the edge. Grades are estimates, not advice.</p></details>`;
/** calibration progress meter */
export function calMeter() { const n = L.cached().filter(r => r.result).length, need = C.MIN_CAL; if (n >= need) return `<div class="src">${ic('check')} Calibrated on ${n} graded picks.</div>`;
  return `<div class="meter" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${need}" aria-label="Calibration progress"><div class="small"><b>${n} of ${need}</b> graded picks until the Desk calibrates to your results</div><span class="bar"><i style="width:${(100 * n / need).toFixed(0)}%"></i></span></div>`; }
/** glossary used for "Explain this" tooltips and the Tools glossary card */
export const GLOSS = { 'No-vig': 'The price with the book’s built-in margin removed — the market’s fair estimate of the chance.', Vig: 'The book’s margin (hold). Two −110 sides imply 104.8%; the extra 4.8% is vig.', EV: 'Expected value: average profit per 1 unit if the fair chance is right. +3% EV = +0.03u per unit on average.', CLV: 'Closing line value: how much better your price was than the final price before the game. Beating the close is the best long-run skill signal.', Hold: 'Same as vig: how far the implied chances add up past 100%.', 'De-vig': 'Methods to strip the vig: multiplicative (proportional), additive, power, and Shin. They differ mostly on longshots.', Stale: 'A book whose price hasn’t caught up with the rest of the market.' };
export const gl = (term, label = term) => `<abbr class="gl" tabindex="0" title="${esc(GLOSS[term] || '')}">${esc(label)}</abbr>`;
export const glossaryCard = () => `<div class="card"><div class="card-h"><b>Glossary</b><span class="small muted">tap a dotted term anywhere for this</span></div><dl class="gloss">${Object.entries(GLOSS).map(([k, v]) => `<dt>${esc(k)}</dt><dd class="small muted">${esc(v)}</dd>`).join('')}</dl></div>`;
/** sign-in nudge after 3+ tracked bets (dismissible, once) */
export function syncNudge() { if (A.user || LS.get('nudge_sync', 0) || LS.get('bets', []).length < 3) return '';
  return `<div class="card nudge"><div class="row" style="align-items:center"><div style="flex:1"><b>Keep your ${LS.get('bets', []).length} bets safe</b><div class="small muted">Sign in to sync across devices. Your bets on this device stay and merge.</div></div><button class="btn pri sm" data-t="tools">Sign in</button><button class="icon-btn" data-act="nudgex" aria-label="Dismiss">${ic('x')}</button></div></div>`; }
/** what's new (returning users only, once per version) */
export const WHATS = { v: '2026-10-22c', items: ['1st half, 1st quarter/period, first-5 innings and team totals now graded from live book + Polymarket prices', 'Player props graded from the books’ no-vig median (plus Polymarket where liquid)', 'Stale-line finder on Odds: books paying more than the market’s fair price', 'CLV is now the headline skill score; the leaderboard ranks by it (50 verified picks)', 'Signed share links — anyone can verify a pick against the server', 'Decimal odds option, de-vig method choice, glossary', 'Export JSON/CSV, P/L statement, delete cloud data'] };
export function whatsNew() { const seen = LS.get('whats', null); if (seen === WHATS.v) return; LS.set('whats', WHATS.v); if (!seen && !LS.get('bets', []).length) return; // brand-new users get onboarding, not a changelog
  X?.modal?.(`<h3>What’s new</h3><ul class="why">${WHATS.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="actions"><button class="btn pri" data-act="closemodal">Got it</button></div>`); }
/** offline chip */
export function netChip() { const upd = () => { let c = document.getElementById('netchip'); if (navigator.onLine) { c?.remove(); return; } if (!c) { c = document.createElement('div'); c.id = 'netchip'; c.className = 'netchip'; c.setAttribute('role', 'status'); document.body.appendChild(c); } c.innerHTML = `${ic('wifi-off')} Offline — showing what was last loaded`; };
  addEventListener('online', upd); addEventListener('offline', upd); upd(); }
/** copy a line with a checkmark morph */
export async function copyLine(btn, text) { try { await navigator.clipboard.writeText(text); btn.classList.add('copied'); btn.innerHTML = ic('check'); setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = ic('copy'); }, 1200); } catch { prompt('Copy:', text); } }
/** link-in parameters: ?calc=novig&a=-110&b=+120, ?import=1 */
export function deepLinks(ctx) { const q = new URLSearchParams(location.search); if (q.get('calc') === 'novig') { ctx.S.tab = 'tools'; LS.set('calcPre', { a: q.get('a'), b: q.get('b') }); }
  if (q.get('import') === '1') { ctx.S.tab = 'tools'; setTimeout(() => ctx.importForm?.(), 300); } }
export const calcPre = () => { const v = LS.get('calcPre', null); if (v) localStorage.removeItem('ep_calcPre'); return v; };
/** quiet tone for losses: neutral toast, never sound or confetti */
export function settledToast(list) { const w = list.filter(b => b.result === 'win').length, l = list.filter(b => b.result === 'loss').length, o = list.length - w - l; if (!list.length) return;
  toast(`${list.length} bet${list.length === 1 ? '' : 's'} settled · ${w}W ${l}L${o ? ' ' + o + 'P' : ''}`); }

const fmtCard = () => { const f = C.oddsFmt(); return `<div class="card"><div class="card-h"><b>Display</b></div><div class="seg" role="radiogroup" aria-label="Odds format">${[['am', 'American −110'], ['dec', 'Decimal 1.91']].map(([v, t]) => `<button role="radio" aria-checked="${f === v}" class="${f === v ? 'on' : ''}" data-act="ofmt" data-v="${v}">${t}</button>`).join('')}</div><div class="src">Changes how prices are shown. Type prices in American (−110, +150) everywhere.</div></div>`; };

// ---------- odds failover: if ESPN has no line for a pre-game event, use the Odds API multi-book median (real prices, labeled) ----------
export async function fillOdds(events) { const miss = events.filter(e => e.state === 'pre' && (!e.odds || (e.odds.ml.home?.close == null && e.odds.total.line == null))); if (!miss.length) return 0; let n = 0;
  for (const e of miss.slice(0, 40)) { const bk = await X.I.books(e).catch(() => null); if (!bk?.rows?.length) continue; const r = bk.rows, md = f => { const v = C.median(r.map(f)); return v == null ? null : Math.round(v); };
    const tl = C.median(r.map(x => x.tot?.over?.point)), sl = C.median(r.map(x => x.sp?.home?.point));
    const sd = (close, line) => (close == null ? null : { close, open: null, line: line ?? null, openLine: null });
    e.odds = { provider: `Odds API median (${r.length} books)`, failover: true, fetchedAt: bk.fetched, ml: { home: sd(md(x => x.ml.home)), away: sd(md(x => x.ml.away)), draw: null },
      spread: { home: sd(md(x => x.sp?.home?.point === sl ? x.sp.home.price : null), sl), away: sd(md(x => x.sp?.away?.point === -sl ? x.sp.away.price : null), sl == null ? null : -sl) },
      total: { line: tl, over: sd(md(x => x.tot?.over?.point === tl ? x.tot.over.price : null), tl), under: sd(md(x => x.tot?.under?.point === tl ? x.tot.under.price : null), tl) } }; n++; }
  return n; }

/** multi-book prices for every pre-game event (one cached Odds API call per sport) — feeds the 2nd source on Desk grades */
/** period/team-total prices: today's slate only (next 18h), soonest first; the server enforces the daily free-credit budget */
export async function loadPeriods(S) { S.ev ||= {}; S.evNote = null; const soon = S.events.filter(e => e.state === 'pre' && new Date(e.start) - Date.now() < 18 * 3600e3).sort((a, b) => new Date(a.start) - new Date(b.start));
  for (const e of soon.slice(0, 25)) { if (S.ev[e.id]) continue; const bk = await X.I.books(e).catch(() => null); if (!bk?.id) continue;
    const r = await X.I.eventMarkets(e, bk.id).catch(x => ({ err: x.message })); if (r?.err) { S.evNote = r.err; if (/budget/.test(r.err)) break; continue; } S.ev[e.id] = r; } }
export async function loadBooks(S) { S.books ||= {}; const pre = S.events.filter(e => e.state === 'pre'); for (const e of pre.slice(0, 40)) { if (S.books[e.id]) continue; const bk = await X.I.books(e).catch(() => null); if (bk?.rows) S.books[e.id] = bk.rows; } }

// ================= Desk design pass (desk_design.md) =================
/** odds age for a game, from the feed's real fetched-at time */
const oddsAt = e => e.odds?.fetchedAt ? new Date(e.odds.fetchedAt).getTime() : X.S.fetched ? +X.S.fetched : null;
export function fresh(e) { const t = oddsAt(e); const m = t ? (Date.now() - t) / 60000 : null; return { t, m, warn: m == null || m > (e.state === 'in' ? 1 : 10), stale: m == null || m > (e.state === 'in' ? 5 : 60) }; } // no timestamp = stale, never assumed fresh
/** grade chip: letter + model % + plain label; greyed when a gate blocks it */
export function gradeChip(g, { blocked = null } = {}) { const L = g.grade, lab = blocked ? blocked : g.status === 'SIT' ? 'SIT' : L === 'D' ? 'Pass' : L === 'C' ? 'Lean' : g.official ? 'Official' : 'Not official';
  return `<span class="gchip g${L}${blocked ? ' blocked' : ''}" title="${esc(blocked ? 'Grade hidden: ' + blocked : 'Model ' + (g.conf == null ? 'n/a' : (g.conf * 100).toFixed(1) + '%'))}"><b>${blocked ? '–' : L}</b>${!blocked && g.conf != null ? `<span class="num">${Math.round(g.conf * 100)}%</span>` : ''}<span>${esc(lab)}</span></span>`; }
/** Polymarket vs sportsbook in cents and implied % */
export function crossRow(m) { const pm = m.quotes.find(q => /^Polymarket/.test(q.book)), bk = m.quotes[0]; if (!bk) return '';
  const bi = C.amToProb(bk.price); if (!pm) return `<div class="xrow small"><span>${esc(bk.book)} ${am(bk.price)} = ${pc(bi)}</span><span class="muted">no Polymarket market for this line</span></div>`;
  const gap = (pm.prob - bi) * 100; return `<div class="xrow small"><span>Polymarket <b class="num">${Math.round(pm.prob * 100)}¢</b> = ${pc(pm.prob)}</span><span>${esc(bk.book)} <b class="num">${am(bk.price)}</b> = ${pc(bi)}</span><span class="num ${gap < 0 ? 'mv-up' : 'mv-dn'}" title="Book % includes its vig">gap ${gap > 0 ? '+' : ''}${gap.toFixed(1)} pts</span></div>`; }
/** line-movement sparkline from this device's saved snapshots (real pulls only) */
const PH = {}; // Polymarket price history per token
const phDraw = (tok, w = 120, h = 32) => { const v = PH[tok]; if (!v || v.length < 2) return ''; const ps = v.map(x => x[1]), lo = Math.min(...ps), hi = Math.max(...ps), r = hi - lo || 0.01, t0 = v[0][0], t1 = v[v.length - 1][0];
  const pts = v.map(x => `${(((x[0] - t0) / (t1 - t0 || 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((x[1] - lo) / r) * (h - 6)).toFixed(1)}`).join(' ');
  return `<span class="spark pmh" role="img" aria-label="Polymarket price over 24 hours from ${Math.round(ps[0] * 100)} to ${Math.round(ps[ps.length - 1] * 100)} cents"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#5EEAD4" stroke-width="1.5" stroke-dasharray="3 2"/></svg><span class="small muted num">${Math.round(ps[0] * 100)}¢ → ${Math.round(ps[ps.length - 1] * 100)}¢ · 24h <span class="credit">Data: Polymarket</span></span></span>`; };
function polySpark(e, key) { const tok = (key === 'mh' || key === 'ma') && X?.S?.poly?.[e.id]?.mlTok?.[key === 'mh' ? 'home' : 'away']; if (!tok) return '';
  if (PH[tok] === undefined) { PH[tok] = null; X.D.polyHistory(tok).then(v => { PH[tok] = v; document.querySelectorAll(`[data-ptok="${tok}"]`).forEach(el => { el.outerHTML = phDraw(tok); }); }).catch(() => { PH[tok] = []; document.querySelectorAll(`[data-ptok="${tok}"]`).forEach(el => el.remove()); }); }
  return PH[tok] ? phDraw(tok) : `<span data-ptok="${esc(tok)}"></span>`; }
export function spark(e, key = 'mh', w = 120, h = 32) { return bookSpark(e, key, w, h) + polySpark(e, key); }
function bookSpark(e, key = 'mh', w = 120, h = 32) { const a = (LS.get('hist', {})[e.id] || []).filter(x => x[key] != null); if (a.length < 2) return '';
  const v = a.map(x => key === 'mh' || key === 'ma' ? C.amToProb(x[key]) : x[key]), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1, t0 = a[0].t, t1 = a[a.length - 1].t || t0 + 1;
  const pts = a.map((x, i) => `${(((x.t - t0) / (t1 - t0 || 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v[i] - lo) / r) * (h - 6)).toFixed(1)}`).join(' ');
  const first = a[0][key], last = a[a.length - 1][key];
  return `<span class="spark" role="img" aria-label="Line moved from ${esc(String(first))} to ${esc(String(last))} over ${a.length} pulls"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#A3ACB8" stroke-width="1.5"/><circle cx="${pts.split(' ').pop().split(',')[0]}" cy="${pts.split(' ').pop().split(',')[1]}" r="3" fill="#5EEAD4"/></svg><span class="small muted num">${key === 'tot' || key === 'sp' ? first + ' → ' + last : am(first) + ' → ' + am(last)}</span></span>`; }
/** one pick card: grade chip, why-this-grade, cross-market row, freshness + injury gates */
export function pickCard(m, g) { const e = m.e, f = fresh(e), gt = gateS[e.id], gateOpen = !gt?.ok;
  const blocked = f.stale ? 'Stale, refreshing' : null;
  const srcs = m.src.map(s => `<span class="pill">${esc(s.name)} ${pc(s.prob)}</span>`).join('');
  const fails = g.why.filter(w => w.startsWith('✗ ')).map(w => w.slice(2));
  const reasons = g.why.filter(w => !w.startsWith('✗ ') && !/^✓|^Not official/.test(w)).slice(0, 5);
  return `<div class="card pick${blocked ? ' greyed' : ''}" data-ev="${e.id}"><div class="row" style="justify-content:space-between;align-items:center;gap:12px">
  <div style="min-width:0">${gradeChip(g, { blocked })} <b>${esc(m.label)}</b> <span class="num">${am(m.price)}</span><div class="small muted">${esc(e.away.abbr)} @ ${esc(e.home.abbr)} · ${tm2(e.start)} · <span class="${f.warn ? 'warn-t' : ''}">Odds ${f.t ? tm2(f.t) + ' ET · ' + Math.round(f.m) + 'm' : 'no price'}</span>${gt?.espnAt ? ` · Injuries ${tm2(gt.espnAt)} ET` : ''}</div></div>
</div>
  ${crossRow(m)}${spark(e, m.market === 'total' ? 'tot' : m.market === 'spread' ? 'sp' : m.side === 'home' ? 'mh' : 'ma')}
  ${gateOpen ? `<div class="small warn-t">${ic('warn')} ${esc(gt?.why || 'Injury & lineup check not run yet')} — grade can't be Official.</div>` : ''}
  <details class="whyg"><summary>Why this grade</summary><ul class="why">${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul><div class="pills">${srcs}</div>
  ${fails.length ? `<div class="small"><b>What would change it</b><ul class="why">${fails.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '<div class="small mv-up">All Official checks pass.</div>'}<div class="src">Research only · <a href="terms.html">Not advice</a></div></details></div>`; }
const tm2 = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---------- Today: best per section, nothing-to-show said plainly ----------
const SECTIONS = [['ml', 'Moneyline'], ['spread', 'Spread'], ['total', 'Game total']];
const PSECS = ['1st half', '1st quarter', '1st period', 'First 5 innings', '1st inning', 'Team total'];
export function todayView() { const S = X.S; if (!S.events.length) return X.head() + states(S, X.D, () => '');
  const pre = S.events.filter(e => e.state === 'pre'); pre.slice(0, 6).forEach(loadGateFor);
  const gs = pre.flatMap(X.markets).map(m => { const g = X.grade(m); return { m, g }; });
  const bestOf = k => gs.filter(x => (x.m.section || x.m.market) === k && !fresh(x.m.e).stale && x.g.status !== 'SIT' && ['A', 'B'].includes(x.g.grade)).sort((a, b) => (b.g.official - a.g.official) || (b.g.conf - a.g.conf))[0];
  const secs = SECTIONS.map(([k, n]) => { const b = bestOf(k); return `<section class="sec"><h3>${n}</h3>${b ? pickCard(b.m, b.g) : `<div class="card none"><p class="small muted" style="margin:0">Nothing graded B or better in ${n.toLowerCase()} today. That's a valid result.</p></div>`}</section>`; }).join('');
  const have = PSECS.filter(n => gs.some(x => x.m.section === n));
  const un = have.map(n => { const b = bestOf(n), c = gs.filter(x => x.m.section === n).length; return `<section class="sec"><h3>${n} <span class="small muted">${c} priced</span></h3>${b ? pickCard(b.m, b.g) : `<div class="card none"><p class="small muted" style="margin:0">Nothing graded B or better in ${n.toLowerCase()} today. That's a valid result.</p></div>`}</section>`; }).join('')
    + `<div class="card none"><p class="small muted" style="margin:0">Period and team-total prices: sportsbooks via The Odds API (today's slate, soonest games first, within a daily free-credit budget) plus liquid Polymarket game markets. ${have.length ? '' : 'None are priced yet for today. '}${S.evNote ? 'Note: ' + esc(S.evNote) + '. ' : ''}Player props are graded in <button class="lnk" data-t="props">Props</button>.</p></div>`;
  const cards = S.events.slice(0, 30).map(e => { const best = gs.filter(x => x.m.e === e).sort((a, b) => (b.g.conf || 0) - (a.g.conf || 0))[0], f = fresh(e), gt = gateS[e.id];
    return `<button class="gcard" data-act="desk" data-id="${e.id}"><span class="gc-t"><b>${esc(e.away.abbr)} @ ${esc(e.home.abbr)}</b><span class="small muted">${e.state === 'pre' ? tm2(e.start) : esc(e.detail)}</span></span>${best ? gradeChip(best.g, { blocked: f.stale ? 'Stale' : null }) : '<span class="small muted">no grade</span>'}<span class="dot ${f.stale ? 'bad' : f.warn ? 'warn' : 'ok'}" title="${f.t ? 'Odds ' + Math.round(f.m) + ' min old' : 'No odds'}" aria-label="${f.stale ? 'stale odds' : 'fresh odds'}"></span>${gt?.tried ? `<span class="small ${gt.ok ? 'mv-up' : 'warn-t'}">${gt.ok ? '✓ injuries' : 'gate open'}</span>` : ''}${spark(e, 'mh', 64, 20)}</button>`; }).join('');
  return X.head() + `<h1 style="margin-top:8px">Today</h1><p class="muted" style="margin-top:0">The best graded pick in each section, from live prices. Research only.</p>${secs}${un}<h3>Games</h3><div class="glist">${cards}</div>`; }

/** historical record labels → A–D chip (no C+); the original label stays in the tooltip */
export const normGrade = g => { const m = String(g || '').toUpperCase().match(/\b([ABCD])[+-]?/); return m ? m[1] : null; };
const ledChip = g => { const n = normGrade(g); return n ? `<span class="grade g${n}" title="Logged as: ${esc(g)}">${n}</span>` : `<span class="muted small" title="Logged as: ${esc(g || '')}">ungraded</span>`; };

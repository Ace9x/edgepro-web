// design_v2.md (EdgePro): command palette, view transitions, session timer, density, loss-chasing guard, swipe rows.
let X; const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TABS = [['today', 'Today'], ['scores', 'Games'], ['props', 'Props'], ['record', 'Record'], ['odds', 'Odds & +EV'], ['desk', 'Research Desk'], ['bets', 'My bets'], ['trends', 'Trends'], ['ask', 'Ask'], ['tools', 'Tools'], ['limits', 'Limits']];
// #4 Cmd-K palette: teams/games, sections, actions
function items(q) { const S = X.S, out = []; const t = q.toLowerCase().trim();
  for (const e of S.events || []) { const n = `${e.away.full || e.away.name} @ ${e.home.full || e.home.name}`; if (!t || n.toLowerCase().includes(t) || `${e.away.abbr} ${e.home.abbr}`.toLowerCase().includes(t)) out.push({ k: 'game', id: e.id, label: n, sub: 'Game · desk' }); }
  for (const [id, n] of TABS) if (!t || n.toLowerCase().includes(t)) out.push({ k: 'tab', id, label: n, sub: 'Go to' });
  for (const [id, n] of [['manual', 'Add a bet'], ['csv', 'Export bets (CSV)'], ['import', 'Import bets']]) if (!t || n.toLowerCase().includes(t)) out.push({ k: 'act', id, label: n, sub: 'Action' });
  return out.slice(0, 30); }
let sel = 0;
function paint(q) { const L = items(q); sel = Math.min(sel, Math.max(0, L.length - 1)); $('#cmdk ul').innerHTML = L.map((x, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}"><span>${esc(x.label)}</span><small>${esc(x.sub)}</small></li>`).join('') || '<li><small>No match</small></li>'; return L; }
function run(x) { close(); if (!x) return; if (x.k === 'tab') X.go(x.id); else if (x.k === 'game') { X.S.deskOnly = x.id; X.go('desk'); } else { const b = document.createElement('button'); b.dataset.act = x.id; b.hidden = true; document.body.append(b); b.click(); b.remove(); } }
function open() { let el = $('#cmdk'); if (!el) { el = document.createElement('div'); el.id = 'cmdk'; el.innerHTML = '<div class="box" role="dialog" aria-label="Search and commands"><input id="ckq" placeholder="Search games, teams, sections, actions…" autocomplete="off" aria-label="Search"><ul role="listbox"></ul></div>'; document.body.append(el);
    el.addEventListener('click', ev => { if (ev.target === el) close(); const li = ev.target.closest('li[data-i]'); if (li) run(items($('#ckq').value)[+li.dataset.i]); });
    $('#ckq').addEventListener('input', ev => { sel = 0; paint(ev.target.value); });
    $('#ckq').addEventListener('keydown', ev => { const L = items(ev.target.value); if (ev.key === 'ArrowDown') { sel = Math.min(L.length - 1, sel + 1); paint(ev.target.value); ev.preventDefault(); } if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(ev.target.value); ev.preventDefault(); } if (ev.key === 'Enter') run(L[sel]); if (ev.key === 'Escape') close(); }); }
  el.classList.remove('hide'); sel = 0; $('#ckq').value = ''; paint(''); $('#ckq').focus(); }
const close = () => $('#cmdk')?.classList.add('hide');
// #11 session timer: after 45 minutes in a session
const T0 = +(sessionStorage.ep_t0 ||= Date.now());
export const sessionChip = () => Date.now() - T0 >= 45 * 60e3 ? `<div class="sess" role="status">You've been here ${Math.round((Date.now() - T0) / 60e3)} min · <button class="lnk" data-t="limits">limits</button></div>` : '';
// #16 loss-chasing guard: 3 settled losses within the last hour → calm pause before logging another bet
const recentLosses = () => (JSON.parse(localStorage.ep_bets || '[]')).filter(b => b.result === 'loss' && Date.now() - new Date(b.settledAt || 0) < 3600e3).length;
function guard(go) { X.modal(`<div class="guard"><h3>Take a breath</h3><p class="muted">Three losses settled in the last hour. Chasing losses is the most common way a bad day gets worse.</p><p class="small">1-800-GAMBLER · <button class="lnk" data-t="limits">set a limit</button></p><button class="btn" id="gGo" disabled>Continue in 5</button> <button class="btn pri" data-act="mclose">Stop for now</button></div>`);
  let n = 5; const t = setInterval(() => { n--; const b = $('#gGo'); if (!b) return clearInterval(t); if (n <= 0) { clearInterval(t); b.disabled = false; b.textContent = 'Continue'; b.onclick = () => { sessionStorage.ep_guard = Date.now(); go(); }; } else b.textContent = `Continue in ${n}`; }, 1000); }
export function init(ctx) { X = ctx;
  document.addEventListener('keydown', ev => { if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); open(); } else if (ev.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { ev.preventDefault(); open(); } });
  document.addEventListener('click', ev => { const a = ev.target.closest('[data-act="track"],[data-act="manual"]'); if (!a || a.dataset.guarded) return;
    if (recentLosses() >= 3 && !(Date.now() - (+sessionStorage.ep_guard || 0) < 3600e3)) { ev.preventDefault(); ev.stopImmediatePropagation(); guard(() => { a.dataset.guarded = '1'; a.click(); delete a.dataset.guarded; }); } }, true);
  // #13 density
  document.documentElement.dataset.density = localStorage.ep_density || 'comfortable';
  // #12 swipe left on a bet row reveals Edit / Delete (follows the finger, snaps on release)
  let sx = null, row = null, t0 = 0;
  document.addEventListener('pointerdown', ev => { row = ev.target.closest('tr[data-bid]'); if (row && ev.pointerType !== 'mouse') { sx = ev.clientX; t0 = performance.now(); } else row = null; });
  document.addEventListener('pointermove', ev => { if (row && sx != null) { const dx = Math.min(0, ev.clientX - sx); row.style.transform = `translateX(${Math.max(-120, dx)}px)`; } });
  document.addEventListener('pointerup', ev => { if (!row || sx == null) return; const dx = ev.clientX - sx, v = Math.abs(dx) / Math.max(1, performance.now() - t0); row.style.transition = 'transform 200ms var(--ease-out)'; row.style.transform = '';
    if (dx < -60 || (dx < -20 && v > 0.3)) row.classList.add('open'); else row.classList.remove('open'); setTimeout(() => { if (row) row.style.transition = ''; }, 220); sx = null; });
  window.EPK = { open }; }
/** #5 tab change through a View Transition where supported */
export const transition = f => (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(f) : f());

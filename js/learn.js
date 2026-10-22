// Self-learning ledger: every Desk pick/lean the app shows is logged in IndexedDB, graded from ESPN finals
// (result + CLV vs. the last pre-game price), and used to recalibrate source weights and confidence.
// Starts empty. Nothing here is ever invented: a record exists only after a pick was really shown.
import * as C from './core.js';
const DB = 'edgepro', ST = 'grades'; let dbp;
const db = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'key' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(ST, mode); const out = fn(t.objectStore(ST)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
export const all = () => tx('readonly', s => s.getAll());
export const putAll = recs => tx('readwrite', s => recs.forEach(r => s.put(r)));
let cache = null; export const cached = () => cache || [];
let cal = null; export const calibration = () => cal;
// Weekly retune: weights/slope are re-fit at most once every 7 days (or the first time enough data exists) and each
// change is logged, so grades don't drift day to day and every rule change is visible on the Record page.
export const calLog = () => { try { return JSON.parse(localStorage.ep_callog || '[]'); } catch { return []; } };
export async function refresh(force) { cache = await all(); const log = calLog(), last = log[log.length - 1];
  if (force || !last || Date.now() - new Date(last.at) > 7 * 864e5) { const fresh = C.calibrate(cache); const changed = !last || JSON.stringify([last.cal.k, last.cal.w]) !== JSON.stringify([fresh.k, fresh.w]);
    log.push({ at: new Date().toISOString(), cal: fresh, changed, note: changed ? (last ? `slope ${last.cal.k}→${fresh.k}; weights ${JSON.stringify(last.cal.w)}→${JSON.stringify(fresh.w)}` : `first fit from ${fresh.n} graded picks`) : `no change (${fresh.n} graded)` });
    localStorage.ep_callog = JSON.stringify(log.slice(-26)); cal = fresh; } else cal = last.cal;
  return cache; }
/** Log shown picks. A pick first shown keeps its first price; the last pre-game price seen becomes the close. */
export async function logShown(items) {
  if (!cache) await refresh(); const byKey = Object.fromEntries(cache.map(r => [r.key, r])); const out = [];
  for (const { m, g } of items) { if (m.e.state !== 'pre' || m.price == null) continue; const r = byKey[m.key];
    if (!r) out.push({ key: m.key, eventId: m.e.id, path: m.e.path, league: m.e.league, game: `${m.e.away.abbr} @ ${m.e.home.abbr}`, start: m.e.start, market: m.market, side: m.side, line: m.line ?? null, label: m.label,
      grade: g.grade, official: g.official, conf: g.conf, src: m.src.map(s => ({ name: s.name, prob: +s.prob.toFixed(4) })), shownPrice: m.price, lastPrice: m.price, shownAt: new Date().toISOString() });
    else if (!r.result && (r.lastPrice !== m.price || (m.line ?? null) !== r.line)) { if ((m.line ?? null) === r.line) out.push({ ...r, lastPrice: m.price }); }
  }
  if (out.length) { await putAll(out); await refresh(); } return out.length;
}
/** Grade every open record whose game is final. events: loaded ESPN events; eventFinal: fetcher for others. */
export async function gradeOpen(events, eventFinal, closeFor) {
  if (!cache) await refresh(); const out = [];
  for (const r of cache) { if (r.result || Date.now() - new Date(r.start) < 2 * 3600e3) continue;
    const ev = events.find(e => e.id === r.eventId); let fin = ev?.completed ? { home: ev.home.score, away: ev.away.score, completed: true } : null;
    if (!fin && !ev) fin = await eventFinal(r.path, r.eventId).catch(() => null); if (!fin?.completed) continue;
    const close = (ev && closeFor(ev, r)) ?? r.lastPrice; const g = C.gradeShown({ ...r, closePrice: close }, fin); if (!g) continue;
    out.push({ ...r, closePrice: close, ...g, final: `${fin.away}-${fin.home}`, gradedAt: new Date().toISOString() }); }
  if (out.length) { await putAll(out); await refresh(); sync(out); } return out.length;
}
// Optional anonymous sync to Supabase ace-platform (insert-only RLS; nobody can read others' rows from the client).
const SB = { url: 'https://czjwiudbasqwlwvezmaz.supabase.co', key: 'sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK' };
const device = () => localStorage.ep_dev || (localStorage.ep_dev = Math.random().toString(36).slice(2, 12));
export const syncOn = () => localStorage.ep_sync === '1';
export async function sync(recs) { if (!syncOn() || !recs.length) return;
  const rows = recs.map(r => ({ device: device(), pick_key: r.key.slice(0, 120), event_id: r.eventId, league: r.league, market: r.market, side: r.side, line: r.line, grade: r.grade, official: !!r.official, conf: r.conf, shown_price: r.shownPrice, close_price: r.closePrice ?? null, clv: r.clv, result: r.result, game_start: r.start }));
  try { await fetch(`${SB.url}/rest/v1/edgepro_grades`, { method: 'POST', headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows) }); } catch {}
}

// Feed layer: every live feed has 2–3 free sources tried in order with retry + backoff,
// the last good pull is cached with its timestamp, and every failure is logged to ep_feed_health.
// Never fills in or fakes data: if every source fails we return the last real pull (marked with its age) or throw.
const SB = 'https://czjwiudbasqwlwvezmaz.supabase.co', KEY = 'sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK';
export const status = {}; // feed -> { ok, source, at (last good), failSince, failover, tried:[{source, ok, ms, err}] }
const dev = () => (localStorage.ep_dev || '').slice(0, 40) || null;
const lastLog = {}; const queue = [];
/** log a pull: failures always; successes sampled once per source per 10 min (for uptime) */
function log(feed, source, ok, ms, err, failover) { const k = feed + '|' + source; if (ok && !failover && lastLog[k] && Date.now() - lastLog[k] < 6e5) return; lastLog[k] = Date.now();
  queue.push({ feed, source: String(source).slice(0, 60), ok, ms: Math.round(ms), err: err ? String(err).slice(0, 200) : null, failover: !!failover, device: dev() }); flush(); }
let flushT; function flush() { clearTimeout(flushT); flushT = setTimeout(() => { const rows = queue.splice(0); if (!rows.length || globalThis.EP_NO_HEALTH) return;
  fetch(`${SB}/rest/v1/ep_feed_health`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows), keepalive: true }).catch(() => {}); }, 1500); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cacheKey = k => 'ep_feed_' + k;
const save = (k, v) => { try { localStorage.setItem(cacheKey(k), JSON.stringify({ at: Date.now(), v })); } catch { /* quota: skip caching, never fake */ } };
export const lastGood = k => { try { return JSON.parse(localStorage.getItem(cacheKey(k))); } catch { return null; } };
/**
 * pull(feed, key, sources): sources = [{name, run: async () => value, ok?: v => bool}]
 * Each source gets `retries` attempts with exponential backoff (400ms, 1.2s). Returns {v, source, at, cached}.
 */
export async function pull(feed, key, sources, { retries = 2, cache = true, timeout = 9000 } = {}) {
  const st = status[feed] ||= {}; st.tried = [];
  for (let i = 0; i < sources.length; i++) { const s = sources[i];
    for (let a = 0; a <= retries; a++) { const t0 = performance.now();
      try { const v = await Promise.race([s.run(), sleep(timeout).then(() => { throw new Error('timeout'); })]);
        if (s.ok && !s.ok(v)) throw new Error('empty or invalid response');
        const ms = performance.now() - t0; st.tried.push({ source: s.name, ok: true, ms }); log(feed, s.name, true, ms, null, i > 0);
        Object.assign(st, { ok: true, source: s.name, at: Date.now(), failSince: null, failover: i > 0, cached: false }); if (cache) save(key, v); return { v, source: s.name, at: Date.now(), cached: false, failover: i > 0 };
      } catch (e) { const ms = performance.now() - t0; st.tried.push({ source: s.name, ok: false, ms, err: e.message }); log(feed, s.name, false, ms, e.message, i > 0);
        if ((/^4\d\d /.test(e.message) && !/^429/.test(e.message)) || /^empty/.test(e.message)) break; // a 4xx won't fix itself: move to the next source
        if (a < retries) await sleep(400 * 3 ** a); } } }
  st.ok = false; st.failSince ||= Date.now();
  const lg = cache && lastGood(key); if (lg) { Object.assign(st, { source: 'last good pull', cached: true, at: lg.at }); return { v: lg.v, source: 'cache', at: lg.at, cached: true }; }
  const err = new Error(`${feed}: all ${sources.length} sources failed`); err.all = true; throw err;
}
export const j = async (u, o) => { const r = await fetch(u, o); if (!r.ok) throw new Error(r.status + ' ' + u.split('?')[0]); return r.json(); };
/** compact header text: "updated 5:41 AM" — outage text only when every source of the main feed failed and nothing is cached */
export const hhmm = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export function outage(feed) { const s = status[feed]; return s && s.ok === false && !s.cached ? `${feed} unavailable since ${hhmm(s.failSince)} — all sources failed, retrying` : null; }

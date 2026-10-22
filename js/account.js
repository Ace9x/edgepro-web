// Optional accounts (Supabase ace-platform). Guests never load this SDK; nothing changes for them.
// Signed-in users get their tracker (bets) and self-learning grades merged across devices (RLS: own row only).
import * as L from './learn.js';
const URL_ = 'https://czjwiudbasqwlwvezmaz.supabase.co', KEY = 'sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK', SK = 'ep-sb-auth';
let sb = null; export let user = null; export let google = false; const subs = [];
export const onChange = f => subs.push(f); const emit = () => subs.forEach(f => f(user));
export const hasSession = () => !!localStorage.getItem(SK) || /access_token|code=/.test(location.href);
export async function init() {
  if (sb) return sb; const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.4');
  sb = createClient(URL_, KEY, { auth: { persistSession: true, storageKey: SK, detectSessionInUrl: true, flowType: 'pkce' } });
  fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } }).then(r => r.json()).then(s => { google = !!s.external?.google; emit(); }).catch(() => {});
  sb.auth.onAuthStateChange((_e, s) => { const was = user?.id; user = s?.user || null; emit(); if (user && user.id !== was) syncNow().catch(() => {}); });
  const { data } = await sb.auth.getSession(); user = data.session?.user || null; emit(); return sb;
}
const back = () => location.origin + location.pathname;
export async function googleIn() { await init(); const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back() } }); if (error) throw error; }
export async function emailIn(email, password) { await init(); const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new Error(error.message === 'Email not confirmed' ? 'Check your email to confirm your account first.' : error.message); }
export async function emailUp(email, password) { await init(); const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: back() } }); if (error) throw error; return data.session ? 'in' : 'confirm'; }
export async function reset(email) { await init(); const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back() }); if (error) throw error; }
export async function signOut() { await init(); await sb.auth.signOut(); user = null; emit(); }
// merge rules: union by id/key; a settled/graded copy wins over an open one; otherwise the newer edit wins.
export const mergeBy = (a, b, k, done) => { const m = new Map(); [...a, ...b].forEach(x => { const o = m.get(x[k]); if (!o || (done(x) && !done(o))) m.set(x[k], x); }); return [...m.values()]; };
export async function syncNow() { if (!user) return; await init();
  const { data, error } = await sb.from('edgepro_user_data').select('bets,grades').eq('user_id', user.id).maybeSingle(); if (error) throw error;
  const localBets = JSON.parse(localStorage.ep_bets || '[]'); const bets = mergeBy(localBets, data?.bets || [], 'id', x => !!x.result);
  const grades = mergeBy(await L.all(), data?.grades || [], 'key', x => !!x.result);
  localStorage.ep_bets = JSON.stringify(bets); await L.putAll(grades); await L.refresh();
  const { error: e2 } = await sb.from('edgepro_user_data').upsert({ user_id: user.id, bets, grades, updated_at: new Date().toISOString() }); if (e2) throw e2;
  localStorage.ep_synced = new Date().toISOString(); emit();
}

// Profiles, verified public picks, follows and leaderboard (Supabase ace-platform; RLS on every table).
import * as A from './account.js';
const FN = 'https://czjwiudbasqwlwvezmaz.supabase.co/functions/v1/ep-settle';
const sb = async () => { await A.init(); return A.client(); };
const T = (q) => q.then(({ data, error }) => { if (error) throw new Error(error.message); return data; });
export const USER_RE = /^[a-z0-9_]{3,20}$/;
export async function myProfile() { if (!A.user) return null; const c = await sb(); return T(c.from('edgepro_profiles').select('*').eq('user_id', A.user.id).maybeSingle()); }
export async function available(u) { const c = await sb(); return T(c.rpc('edgepro_username_available', { u })); }
export async function saveProfile(p) { const c = await sb(); const row = { user_id: A.user.id, username: p.username.toLowerCase(), display_name: p.display_name || null, bio: p.bio || null, fav_teams: p.fav_teams || [], fav_sports: p.fav_sports || [], is_public: !!p.is_public, ...(p.avatar_url !== undefined ? { avatar_url: p.avatar_url } : {}) };
  const { error } = await c.from('edgepro_profiles').upsert(row); if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'That username is taken.' : error.message); return row; }
export async function uploadAvatar(file) { if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use a PNG, JPG or WebP image.');
  const blob = await shrink(file); const c = await sb(); const path = `${A.user.id}/avatar-${Date.now()}.webp`;
  const { error } = await c.storage.from('ep-avatars').upload(path, blob, { contentType: 'image/webp', upsert: true }); if (error) throw new Error(error.message);
  return c.storage.from('ep-avatars').getPublicUrl(path).data.publicUrl; }
async function shrink(file) { const img = await createImageBitmap(file); const s = 256, cv = Object.assign(document.createElement('canvas'), { width: s, height: s }); const x = cv.getContext('2d'); const m = Math.min(img.width, img.height);
  x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s); return new Promise(r => cv.toBlob(r, 'image/webp', 0.85)); }
export async function postPick(p) { const c = await sb(); const { error } = await c.from('edgepro_picks').insert({ pick_key: p.key, event_id: p.eventId, path: p.path, league: p.league, market: p.market, side: p.side, line: p.line ?? null, label: p.label.slice(0, 60), game: p.game, price: p.price, grade: p.grade, official: !!p.official, game_start: p.start });
  if (error) throw new Error(/duplicate|unique/.test(error.message) ? 'Already posted.' : /row-level/.test(error.message) ? 'Picks can only be posted before the game starts.' : error.message); }
export async function leaderboard(sort = 'avg_clv') { const c = await sb(); const rows = await T(c.from('edgepro_leaderboard').select('*').limit(200));
  const n = r => +r.w + +r.l + +r.p; return rows.map(r => ({ ...r, n: n(r), qualified: +r.clv_n >= MIN_LB })).sort((a, b) => (b.qualified - a.qualified) || ((+b[sort] || -1e9) - (+a[sort] || -1e9)) || (+b.clv_n - +a.clv_n)); }
/** leaderboard qualification: 50 verified (posted before start) picks with a server-recorded closing price */
export const MIN_LB = 50;
export async function profileByName(u) { const c = await sb(); const p = await T(c.from('edgepro_profiles').select('*').ilike('username', u).maybeSingle()); if (!p) return null;
  const [picks, stat, fol] = await Promise.all([T(c.from('edgepro_picks').select('*').eq('user_id', p.user_id).order('game_start', { ascending: false }).limit(50)), T(c.from('edgepro_leaderboard').select('*').eq('user_id', p.user_id).maybeSingle()).catch(() => null),
    A.user ? T(c.from('edgepro_follows').select('followee').eq('follower', A.user.id).eq('followee', p.user_id)).catch(() => []) : []]);
  return { ...p, picks, stat, following: !!fol.length }; }
export async function follow(id, on) { const c = await sb(); const q = on ? c.from('edgepro_follows').insert({ follower: A.user.id, followee: id }) : c.from('edgepro_follows').delete().eq('follower', A.user.id).eq('followee', id); const { error } = await q; if (error && !/duplicate/.test(error.message)) throw new Error(error.message); }
export async function feed() { if (!A.user) return []; const c = await sb(); const f = await T(c.from('edgepro_follows').select('followee').eq('follower', A.user.id)); if (!f.length) return [];
  const ids = f.map(x => x.followee); const [picks, profs] = await Promise.all([T(c.from('edgepro_picks').select('*').in('user_id', ids).order('created_at', { ascending: false }).limit(40)), T(c.from('edgepro_profiles').select('user_id,username,avatar_url').in('user_id', ids))]);
  const by = Object.fromEntries(profs.map(p => [p.user_id, p])); return picks.map(p => ({ ...p, who: by[p.user_id] })); }
export const settleNow = () => fetch(FN, { method: 'POST' }).then(r => r.json()).catch(() => null);

// Server-signed share links for posted picks.
// POST {pick_id} (signed-in owner) -> {token}. GET ?t=token -> the pick as stored on the server, checked against the signature.
// The token is "<pick id>.<HMAC-SHA256 over id|user|created_at|price|label|game_start>", so a link can't be forged or point at edited data.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Content-Type": "application/json" };
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: H });
const enc = new TextEncoder();
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let keyP: Promise<CryptoKey> | null = null;
const key = () => keyP ??= (async () => { // key derived from the service secret; never leaves the server
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("edgepro-share-v1:" + (Deno.env.get("EP_SHARE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); })();
const sig = async (p: Record<string, unknown>) => b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode([p.id, p.user_id, new Date(p.created_at as string).toISOString(), p.price, p.label, new Date(p.game_start as string).toISOString()].join("|"))))).slice(0, 32);
const eq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cols = "id,user_id,label,game,league,market,side,line,price,grade,game_start,created_at,close_price,clv,result,units";
  if (req.method === "POST") {
    const { data: u } = await admin.auth.getUser((req.headers.get("authorization") || "").replace(/^Bearer /i, ""));
    if (!u?.user) return J({ error: "not signed in" }, 401);
    const { pick_id } = await req.json().catch(() => ({}));
    const { data: p } = await admin.from("edgepro_picks").select(cols).eq("id", pick_id).maybeSingle();
    if (!p || p.user_id !== u.user.id) return J({ error: "not your pick" }, 403);
    return J({ token: `${p.id}.${await sig(p)}` });
  }
  const t = new URL(req.url).searchParams.get("t") || ""; const [id, s] = t.split(".");
  if (!id || !s || !/^[\w-]{1,64}$/.test(id)) return J({ valid: false, why: "malformed link" }, 400);
  const { data: p } = await admin.from("edgepro_picks").select(cols).eq("id", id).maybeSingle();
  if (!p) return J({ valid: false, why: "pick not found (deleted?)" }, 404);
  if (!eq(await sig(p), s)) return J({ valid: false, why: "signature does not match the server record" }, 403);
  const { data: prof } = await admin.from("edgepro_profiles").select("username,display_name,avatar_url,is_public").eq("user_id", p.user_id).maybeSingle();
  const { user_id: _u, ...pick } = p;
  return J({ valid: true, verified: new Date(p.created_at) < new Date(p.game_start), pick, profile: prof?.is_public ? { username: prof.username, display_name: prof.display_name, avatar_url: prof.avatar_url } : null, checked: new Date().toISOString() });
});

// scope "edgepro": deletes all EdgePro cloud data for the caller; scope "account": also deletes the sign-in itself (shared with other Ace9x apps) (profile, picks, follows, synced data, avatar files).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: H });
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u, error } = await admin.auth.getUser(jwt);
  if (error || !u?.user) return new Response(JSON.stringify({ error: "not signed in" }), { status: 401, headers: H });
  const id = u.user.id; const scope = (await req.json().catch(() => ({}))).scope === "account" ? "account" : "edgepro";
  const { data: files } = await admin.storage.from("ep-avatars").list(id);
  if (files?.length) await admin.storage.from("ep-avatars").remove(files.map((f) => `${id}/${f.name}`));
  for (const [t, c] of [["edgepro_follows", "follower"], ["edgepro_follows", "followee"], ["edgepro_picks", "user_id"], ["edgepro_profiles", "user_id"], ["edgepro_user_data", "user_id"]]) await admin.from(t).delete().eq(c, id);
  if (scope === "edgepro") return new Response(JSON.stringify({ deleted: "edgepro" }), { headers: H });
  // full delete closes the shared sign-in used by the other apps too (the client warns first)
  const { error: e2 } = await admin.auth.admin.deleteUser(id);
  return new Response(JSON.stringify(e2 ? { error: e2.message } : { deleted: "account" }), { status: e2 ? 500 : 200, headers: H });
});

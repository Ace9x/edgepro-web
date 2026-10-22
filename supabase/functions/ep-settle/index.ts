// Server-side settlement for public EdgePro picks. Results, closing price and CLV come only from ESPN here,
// never from the client, so profile records are verified. Idempotent; anyone may trigger it (it only reads ESPN).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);
const prob = (a: number) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100));
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: open, error } = await sb.from("edgepro_picks").select("*").is("result", null).lt("game_start", new Date(Date.now() - 2 * 3600e3).toISOString()).limit(200);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: H });
  const byEv = new Map<string, any[]>(); for (const p of open!) byEv.set(p.path + "|" + p.event_id, [...(byEv.get(p.path + "|" + p.event_id) || []), p]);
  let settled = 0;
  for (const [k, ps] of [...byEv].slice(0, 40)) {
    const [path, id] = k.split("|");
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(id)}`); if (!r.ok) continue;
    const d = await r.json(); const c = d.header?.competitions?.[0]; if (!c) continue;
    const st = c.status?.type; const hc = c.competitors.find((t: any) => t.homeAway === "home"), ac = c.competitors.find((t: any) => t.homeAway === "away");
    const canceled = /cancel|postpon/i.test(st?.name || "") && Date.now() - new Date(ps[0].game_start).getTime() > 3 * 864e5;
    if (!st?.completed && !canceled) continue;
    const h = +hc.score, a = +ac.score, pc = d.pickcenter?.[0];
    for (const p of ps) {
      let res: string, close: number | null = null;
      if (canceled) res = "void";
      else if (p.market === "ml") { res = h === a ? "push" : (p.side === "home") === h > a ? "win" : "loss"; close = pc?.[p.side + "TeamOdds"]?.moneyLine ?? null; }
      else if (p.market === "spread") { const m = (p.side === "home" ? h - a : a - h) + +p.line; res = m === 0 ? "push" : m > 0 ? "win" : "loss";
        const ln = p.side === "home" ? pc?.spread : pc?.spread != null ? -pc.spread : null; if (ln === +p.line) close = pc?.[p.side + "TeamOdds"]?.spreadOdds ?? null; }
      else { const t = h + a - +p.line; res = t === 0 ? "push" : (t > 0) === (p.side === "over") ? "win" : "loss"; if (pc?.overUnder === +p.line) close = pc?.[p.side + "Odds"] ?? null; }
      const units = res === "win" ? +(dec(p.price) - 1).toFixed(3) : res === "loss" ? -1 : 0;
      const clv = close != null && Math.abs(close) >= 100 ? +((prob(close) - prob(p.price)) * 100).toFixed(2) : null;
      const { error: e } = await sb.from("edgepro_picks").update({ result: res, units, close_price: close != null ? Math.round(close) : null, clv, settled_at: new Date().toISOString() }).eq("id", p.id).is("result", null);
      if (!e) settled++;
    }
  }
  return new Response(JSON.stringify({ checked: open!.length, settled }), { headers: H });
});

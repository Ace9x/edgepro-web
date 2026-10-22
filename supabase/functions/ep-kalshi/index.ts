// CORS relay for Kalshi's public, keyless market data (Kalshi sends no CORS headers). Game series only; 2-minute edge cache.
const H = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json", "Cache-Control": "public, max-age=120" };
const OK = new Set(["KXMLBGAME", "KXNFLGAME", "KXNBAGAME", "KXNHLGAME"]);
Deno.serve(async (req) => {
  const s = new URL(req.url).searchParams.get("series") || "";
  if (!OK.has(s)) return new Response(JSON.stringify({ error: "unsupported series" }), { status: 400, headers: H });
  const r = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${s}&status=open&limit=1000`);
  return new Response(r.ok ? await r.text() : JSON.stringify({ error: "upstream " + r.status }), { status: r.ok ? 200 : 502, headers: H });
});

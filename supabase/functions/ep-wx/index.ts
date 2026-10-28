// EdgePro game-time weather from the US National Weather Service (api.weather.gov, public domain, no key).
// NWS asks for a User-Agent with contact info; browsers can't set one, so the call runs here. Geocoding: Photon (komoot), then OSM Nominatim
// (single lookups only, identified UA, cached a year per city). Forecasts cached 1h per grid point.
import { createClient } from "npm:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UA = "EdgePro/1.0 (https://ace9x.github.io/edgepro-web/; contact: https://github.com/ace9x/edgepro-web/issues)";
const H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: H });
const DIR: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
async function cached<T>(k: string, age: number, f: () => Promise<T>): Promise<T> { const { data } = await db.rpc("ep_cache_get", { key: k, max_age: age }); if (data) return data as T; const v = await f(); await db.rpc("ep_cache_put", { key: k, b: v }); return v; }
async function get(u: string) { const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/geo+json, application/json" } }); if (!r.ok) throw new Error(`${new URL(u).host} ${r.status}`); return r.json(); }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  const u = new URL(req.url), city = (u.searchParams.get("city") || "").slice(0, 60), state = (u.searchParams.get("state") || "").slice(0, 30), t = u.searchParams.get("t") || "";
  if (!city || !/^\d{4}-\d\d-\d\dT\d\d/.test(t)) return out({ error: "city and t required" }, 400);
  try {
    const geo = await cached(`geo:${city}|${state}`.toLowerCase(), 365 * 86400, async () => { const q = encodeURIComponent(city + (state ? ", " + state : ""));
      try { const g = await get(`https://photon.komoot.io/api/?q=${q}&limit=1&osm_tag=place`); const f = g.features?.find((x: any) => x.properties?.countrycode === "US"); if (f) return { lat: f.geometry.coordinates[1].toFixed(4), lon: f.geometry.coordinates[0].toFixed(4) }; } catch { /* next geocoder */ }
      const g = await get(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${q}`); return g[0] ? { lat: (+g[0].lat).toFixed(4), lon: (+g[0].lon).toFixed(4) } : { none: true }; });
    if ((geo as { none?: boolean }).none) return out({ error: "not a US location (NWS covers the US only)" }, 404);
    const { lat, lon } = geo as { lat: string; lon: string };
    const pt = await cached(`nwspt:${lat},${lon}`, 30 * 86400, async () => { const p = await get(`https://api.weather.gov/points/${lat},${lon}`); return { hourly: p.properties.forecastHourly }; });
    const fc = await cached(`nwsfc:${(pt as { hourly: string }).hourly}`, 3600, async () => { const f = await get((pt as { hourly: string }).hourly); return { periods: f.properties.periods.map((x: Record<string, any>) => ({ s: x.startTime, e: x.endTime, temp: x.temperature, unit: x.temperatureUnit, wind: x.windSpeed, dir: x.windDirection, rain: x.probabilityOfPrecipitation?.value ?? null })), updated: f.properties.updateTime || new Date().toISOString() }; });
    const at = new Date(t).getTime(); const p = (fc as { periods: any[] }).periods.find(x => new Date(x.s).getTime() <= at && at < new Date(x.e).getTime());
    if (!p) return out({ error: "game time outside the NWS hourly forecast window (about 6 days)" }, 404);
    const mph = Math.max(...String(p.wind).match(/\d+/g)!.map(Number));
    return out({ mph, dir: DIR[p.dir] ?? null, dirTxt: p.dir, temp: p.unit === "F" ? p.temp : Math.round(p.temp * 9 / 5 + 32), rain: p.rain, src: "NWS (weather.gov)", updated: (fc as { updated: string }).updated });
  } catch (e) { return out({ error: String((e as Error).message) }, 502); }
});

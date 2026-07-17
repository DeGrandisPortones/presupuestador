import axios from "axios";

const NOMINATIM_CONTACT = process.env.NOMINATIM_CONTACT_EMAIL || "sistemas@degrandis.com";
const NOMINATIM_MIN_INTERVAL_MS = 1100; // Política de uso de Nominatim: máx. 1 req/seg.

let lastNominatimCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const COORD_PATTERNS = [
  /[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
  /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/i,
  /[?&]ll=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/i,
];

export function extractCoordsFromMapsUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  for (const pattern of COORD_PATTERNS) {
    const m = raw.match(pattern);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  return null;
}

function isShortMapsHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "maps.app.goo.gl" || h === "goo.gl" || h === "app.goo.gl";
}

async function resolveShortMapsUrl(url) {
  let hostname = "";
  try { hostname = new URL(url).hostname; } catch { return null; }
  if (!isShortMapsHost(hostname)) return null;

  const res = await axios.get(url, {
    maxRedirects: 5,
    timeout: 6000,
    validateStatus: () => true,
    headers: { "User-Agent": `PresupuestadorCotizador/1.0 (${NOMINATIM_CONTACT})` },
  });

  const finalUrl = res?.request?.res?.responseUrl || "";
  const fromFinalUrl = extractCoordsFromMapsUrl(finalUrl);
  if (fromFinalUrl) return fromFinalUrl;

  // Google a veces sirve una página intermedia con la URL canónica embebida en el HTML.
  const body = typeof res?.data === "string" ? res.data : "";
  return extractCoordsFromMapsUrl(body);
}

async function geocodeAddress(address, city) {
  const parts = [address, city, "Argentina"].map((p) => String(p || "").trim()).filter(Boolean);
  if (!parts.length) return null;

  const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimCallAt);
  if (wait > 0) await sleep(wait);
  lastNominatimCallAt = Date.now();

  const res = await axios.get("https://nominatim.openstreetmap.org/search", {
    params: { format: "json", limit: 1, q: parts.join(", ") },
    timeout: 6000,
    headers: { "User-Agent": `PresupuestadorCotizador/1.0 (${NOMINATIM_CONTACT})` },
  });

  const hit = Array.isArray(res?.data) ? res.data[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

// Intenta resolver coordenadas para un portón, en orden de confianza/costo:
// 1) coordenadas embebidas directamente en el maps_url (link generado por geolocalización)
// 2) coordenadas embebidas en el destino de un link corto (maps.app.goo.gl / goo.gl)
// 3) geocodificación de dirección + localidad como último recurso
export async function resolveQuoteCoords(endCustomer) {
  const mapsUrl = String(endCustomer?.maps_url || "").trim();
  if (mapsUrl) {
    const direct = extractCoordsFromMapsUrl(mapsUrl);
    if (direct) return { ...direct, source: "maps_url" };

    const resolved = await resolveShortMapsUrl(mapsUrl).catch(() => null);
    if (resolved) return { ...resolved, source: "maps_url_short" };
  }

  const address = String(endCustomer?.address || "").trim();
  const city = String(endCustomer?.city || "").trim();
  if (address || city) {
    const geocoded = await geocodeAddress(address, city).catch(() => null);
    if (geocoded) return { ...geocoded, source: "nominatim" };
  }

  return null;
}

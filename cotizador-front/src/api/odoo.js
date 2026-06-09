import { http } from "./http.js";
import { getOdooBootstrap } from "../domain/odoo/bootstrap.js";
import { getFinancingPreviewFromSettings } from "./financingSettings.js";

const PRICE_CACHE_VERSION = "v1";
const PRICE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const priceCachePromises = new Map();
let lastEffectivePricelist = null;

function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function storageAvailable() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function priceCacheKey(pricelistId) {
  return `dg_presupuestador_prices_${PRICE_CACHE_VERSION}_${toPositiveInt(pricelistId)}`;
}

function buildPriceIndex(prices = []) {
  const index = {};
  for (const item of Array.isArray(prices) ? prices : []) {
    const ids = [
      item?.product_id,
      item?.odoo_product_id,
      item?.odoo_variant_id,
      item?.odoo_external_id,
      item?.odoo_template_id,
    ]
      .map((value) => toPositiveInt(value))
      .filter(Boolean);

    for (const id of ids) index[String(id)] = item;
  }
  return index;
}

function normalizePriceCachePayload(payload) {
  if (!payload?.ok || !payload?.pricelist_id) return null;
  const prices = Array.isArray(payload.prices) ? payload.prices : [];
  return {
    ok: true,
    version: PRICE_CACHE_VERSION,
    pricelist: payload.pricelist || null,
    pricelist_id: toPositiveInt(payload.pricelist_id),
    partner_id: payload.partner_id ?? null,
    prices,
    index: buildPriceIndex(prices),
    fetched_at: payload.fetched_at || new Date().toISOString(),
    saved_at: Date.now(),
  };
}

function readPriceCache(pricelistId) {
  const id = toPositiveInt(pricelistId);
  if (!id || !storageAvailable()) return null;

  try {
    const raw = window.localStorage.getItem(priceCacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== PRICE_CACHE_VERSION || toPositiveInt(parsed.pricelist_id) !== id) return null;
    if (Date.now() - Number(parsed.saved_at || 0) > PRICE_CACHE_TTL_MS) return null;
    parsed.index = parsed.index || buildPriceIndex(parsed.prices || []);
    return parsed;
  } catch {
    return null;
  }
}

function writePriceCache(payload) {
  const normalized = normalizePriceCachePayload(payload);
  if (!normalized) return null;

  if (storageAvailable()) {
    try {
      window.localStorage.setItem(priceCacheKey(normalized.pricelist_id), JSON.stringify(normalized));
    } catch {
      // Si localStorage esta lleno o bloqueado, igual devolvemos la cache en memoria.
    }
  }

  return normalized;
}

function findCachedPriceForLine(line, cache) {
  if (!cache?.index || !line) return null;
  const ids = [
    line?.product_id,
    line?.odoo_product_id,
    line?.odoo_variant_id,
    line?.odoo_external_id,
    line?.odoo_id,
    line?.odoo_template_id,
  ]
    .map((value) => toPositiveInt(value))
    .filter(Boolean);

  for (const id of ids) {
    const found = cache.index[String(id)];
    if (found) return found;
  }
  return null;
}

function mapCachedLinePrice(line, cached) {
  const qty = Number(line?.qty || 1) || 1;
  const productId = toPositiveInt(line?.product_id) || toPositiveInt(cached?.product_id) || toPositiveInt(cached?.odoo_product_id);
  const name = cached?.name || cached?.raw_name || line?.name || (productId ? `Producto ${productId}` : "Producto");

  return {
    product_id: productId,
    odoo_product_id: toPositiveInt(cached?.odoo_product_id) || productId,
    qty,
    price: Number(cached?.price || 0) || 0,
    name,
    raw_name: name,
    code: cached?.code || line?.code || null,
    odoo_template_id: toPositiveInt(cached?.odoo_template_id) || toPositiveInt(line?.odoo_template_id) || null,
    from_cache: true,
  };
}

async function fetchPriceCacheForPricelist(pricelistId, { force = false } = {}) {
  const id = toPositiveInt(pricelistId);
  if (!id) return null;

  if (!force) {
    const cached = readPriceCache(id);
    if (cached) return cached;
  }

  if (priceCachePromises.has(id)) return priceCachePromises.get(id);

  const promise = http
    .get(`/api/odoo-price-cache/prices?pricelist_id=${encodeURIComponent(String(id))}`)
    .then(({ data }) => {
      if (!data?.ok) throw new Error(data?.error || "No se pudieron precargar los precios");
      return writePriceCache(data);
    })
    .finally(() => {
      priceCachePromises.delete(id);
    });

  priceCachePromises.set(id, promise);
  return promise;
}

export async function preloadEffectivePriceCache({ force = false } = {}) {
  const effective = lastEffectivePricelist || (await getEffectivePricelist());
  if (!effective?.id) return null;
  return fetchPriceCacheForPricelist(effective.id, { force });
}

export async function getPricelists() {
  const boot = getOdooBootstrap();
  if (boot?.pricelists?.length) return boot.pricelists;
  const { data } = await http.get("/api/odoo/pricelists");
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar la lista de precios");
  return data.pricelists || [];
}

export async function getEffectivePricelist() {
  const { data } = await http.get("/api/odoo-price-cache/effective");
  if (!data?.ok) throw new Error(data?.error || "No se pudo resolver la lista de precios del usuario");

  lastEffectivePricelist = data.pricelist || null;
  if (lastEffectivePricelist?.id) {
    // Apenas se resuelve la conexion/lista efectiva, arranca la carga global de precios.
    // No bloquea la UI; getPrices usa esta misma promesa/cache cuando la necesita.
    void fetchPriceCacheForPricelist(lastEffectivePricelist.id).catch(() => null);
  }

  return lastEffectivePricelist;
}

export async function getEffectivePricelists() {
  const pricelist = await getEffectivePricelist();
  return pricelist?.id ? [pricelist] : [];
}

export async function searchProducts({ query = "", limit = 10 }) {
  const boot = getOdooBootstrap();
  const q = (query || "").toString().trim().toLowerCase();

  if (boot?.products?.length) {
    const items = boot.products;
    const filtered = !q
      ? items
      : items.filter((p) => {
          const name = (p.display_name || p.name || "").toString().toLowerCase();
          const raw = (p.name || "").toString().toLowerCase();
          const code = (p.code || "").toString().toLowerCase();
          return name.includes(q) || raw.includes(q) || code.includes(q);
        });
    return filtered.slice(0, Number(limit || 10));
  }

  const params = new URLSearchParams();
  params.set("query", query);
  params.set("limit", String(limit));

  const { data } = await http.get(`/api/odoo/products?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los productos");
  return data.products || [];
}

export async function getPrices({ pricelist_id, partner_id = null, lines }) {
  const requestedLines = Array.isArray(lines) ? lines : [];
  const requestedPricelistId = toPositiveInt(pricelist_id) || toPositiveInt(lastEffectivePricelist?.id);

  if (!requestedLines.length) {
    return { ok: true, pricelist_id: requestedPricelistId || null, partner_id: partner_id ?? null, prices: [] };
  }

  if (requestedPricelistId) {
    try {
      const cache = await fetchPriceCacheForPricelist(requestedPricelistId);
      if (cache?.index) {
        const prices = [];
        let missing = false;

        for (const line of requestedLines) {
          const cached = findCachedPriceForLine(line, cache);
          if (!cached) {
            missing = true;
            break;
          }
          prices.push(mapCachedLinePrice(line, cached));
        }

        if (!missing) {
          return {
            ok: true,
            from_cache: true,
            pricelist_id: requestedPricelistId,
            partner_id: partner_id ?? null,
            prices,
          };
        }
      }
    } catch {
      // Si la precarga falla, caemos al endpoint puntual anterior para no romper la cotizacion.
    }
  }

  const payload = {
    pricelist_id: pricelist_id ?? null,
    partner_id: partner_id ?? null,
    lines: requestedLines,
  };

  const { data } = await http.post("/api/odoo/prices", payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron calcular los precios");
  return data;
}

export async function getBillingOptions() {
  const { data } = await http.get("/api/odoo/billing-options");
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las opciones fiscales");
  return {
    identification_types: data.identification_types || [],
    afip_responsibility_types: data.afip_responsibility_types || [],
  };
}

export async function getFinancingPreview(paymentMethod) {
  return getFinancingPreviewFromSettings(paymentMethod);
}

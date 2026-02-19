// src/odooBootstrap.js

// Carga "catálogo" para el front (productos + listas) y lo cachea en memoria.
// Objetivo: que en el login ya exista data y el cotizador no tenga que esperar.

let cache = null;
let cacheAt = 0;

const TTL_MS = Number(process.env.ODOO_BOOTSTRAP_TTL_MS || 5 * 60 * 1000);
const DEFAULT_PRODUCTS_LIMIT = Number(process.env.ODOO_BOOTSTRAP_PRODUCTS_LIMIT || 2000);

export async function loadOdooBootstrap(odoo, { productsLimit } = {}) {
  const limit = Number(productsLimit || DEFAULT_PRODUCTS_LIMIT);
  const now = Date.now();

  if (cache && now - cacheAt < TTL_MS) return cache;

  // Pricelists
  const pls = await odoo.executeKw(
    "product.pricelist",
    "search_read",
    [[]],
    { fields: ["id", "name", "currency_id", "active"], limit: 200, order: "name asc" }
  );

  const pricelists = (pls || []).map((p) => ({
    id: p.id,
    name: p.name,
    active: p.active,
    currency_id: Array.isArray(p.currency_id) ? p.currency_id[0] : p.currency_id,
    currency_name: Array.isArray(p.currency_id) ? p.currency_id[1] : null,
  }));

  // Products (solo para la venta y activos)
  const domain = [
    ["sale_ok", "=", true],
    ["active", "=", true],
  ];
  // Traemos también product_tmpl_id para poder leer Tags (que viven en product.template)
  const productsRaw = await odoo.executeKw("product.product", "search_read", [domain], {
    fields: ["id", "name", "default_code", "uom_id", "list_price", "product_tmpl_id"],
    limit,
    order: "name asc",
  });

  // Tags por plantilla
  const tmplIds = [...new Set((productsRaw || [])
    .map((p) => (Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id))
    .filter(Boolean)
    .map((x) => Number(x))
  )];

  const tmplTags = tmplIds.length
    ? await odoo.executeKw("product.template", "read", [tmplIds], { fields: ["id", "product_tag_ids"] })
    : [];

  const tmplTagMap = new Map((tmplTags || []).map((t) => [Number(t.id), (t.product_tag_ids || []).map((x) => Number(x))]));

  const usedTagIds = [...new Set((tmplTags || []).flatMap((t) => (t.product_tag_ids || []).map((x) => Number(x))))];
  const tagsRaw = usedTagIds.length
    ? await odoo.executeKw("product.tag", "read", [usedTagIds], { fields: ["id", "name"] })
    : [];

  const tags = (tagsRaw || []).map((t) => ({ id: Number(t.id), name: t.name }));

  const products = (productsRaw || []).map((p) => {
    const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
    const tag_ids = tmplId ? (tmplTagMap.get(Number(tmplId)) || []) : [];
    return {
      id: p.id,
      name: p.name,
      code: p.default_code || null,
      uom_id: Array.isArray(p.uom_id) ? p.uom_id[0] : p.uom_id,
      template_id: tmplId ? Number(tmplId) : null,
      tag_ids,
      // precio "base" (list_price). Si después necesitás precio por lista, lo sigue calculando /api/odoo/prices
      list_price: typeof p.list_price === "number" ? p.list_price : null,
      // alias para que el front pueda usarlo directamente
      price: typeof p.list_price === "number" ? p.list_price : null,
    };
  });

  cache = {
    ok: true,
    generated_at: new Date().toISOString(),
    products_limit: limit,
    pricelists,
    products,
    tags,
  };
  cacheAt = now;

  return cache;
}

export function clearOdooBootstrapCache() {
  cache = null;
  cacheAt = 0;
}

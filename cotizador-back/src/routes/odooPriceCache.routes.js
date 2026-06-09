import express from "express";
import { requireAuth } from "../auth.js";

const DEFAULT_PRICELIST_ID = Number(process.env.ODOO_DEFAULT_PRICELIST_ID || 1);
const DEFAULT_PRICELIST_NAMES = [
  process.env.ODOO_BASE_PRICELIST_NAME,
  process.env.ODOO_CUSTOMER_PRICELIST_NAME,
  "Predeterminada",
  "Predeterminado",
]
  .map((value) => String(value || "").trim())
  .filter(Boolean);

function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function relId(value) {
  if (Array.isArray(value)) return toPositiveInt(value[0]);
  return toPositiveInt(value);
}

function cleanText(value) {
  return String(value || "").trim();
}

function userCanUseAssignedPricelist(user = {}) {
  // Regla pedida:
  // - vendedor => siempre Predeterminada
  // - distribuidor puro => lista asignada
  // - superusuario o usuario mixto => Predeterminada, para evitar tomar una lista equivocada
  return user?.is_distribuidor === true && user?.is_vendedor !== true && user?.is_superuser !== true;
}

function getAssignedPricelistIdFromUser(user = {}) {
  if (!userCanUseAssignedPricelist(user)) return 0;
  return toPositiveInt(user?.odoo_pricelist_id || user?.pricelist_id || user?.assigned_pricelist_id || null);
}

async function readPricelistById(odoo, pricelistId) {
  const id = toPositiveInt(pricelistId);
  if (!id) return null;

  try {
    const rows = await odoo.executeKw(
      "product.pricelist",
      "read",
      [[id]],
      { fields: ["id", "name", "currency_id", "active"] }
    );
    const p = Array.isArray(rows) ? rows[0] || null : null;
    if (!p?.id) return null;
    return normalizePricelist(p);
  } catch {
    return null;
  }
}

async function findPricelistByName(odoo, name) {
  const label = String(name || "").trim();
  if (!label) return null;

  const attempts = [
    [["name", "=", label]],
    [["name", "ilike", label]],
  ];

  for (const domain of attempts) {
    try {
      const rows = await odoo.executeKw(
        "product.pricelist",
        "search_read",
        [domain],
        { fields: ["id", "name", "currency_id", "active"], limit: 1, order: "id asc" }
      );
      const p = Array.isArray(rows) ? rows[0] || null : null;
      if (p?.id) return normalizePricelist(p);
    } catch {
      // siguiente intento
    }
  }

  return null;
}

async function readFirstPricelist(odoo) {
  try {
    const rows = await odoo.executeKw(
      "product.pricelist",
      "search_read",
      [["|", ["active", "=", true], ["active", "=", false]]],
      { fields: ["id", "name", "currency_id", "active"], limit: 1, order: "id asc" }
    );
    const p = Array.isArray(rows) ? rows[0] || null : null;
    if (!p?.id) return null;
    return normalizePricelist(p);
  } catch {
    return null;
  }
}

function normalizePricelist(p) {
  return {
    id: p.id,
    name: p.name,
    active: p.active,
    currency_id: Array.isArray(p.currency_id) ? p.currency_id[0] : p.currency_id,
    currency_name: Array.isArray(p.currency_id) ? p.currency_id[1] : null,
  };
}

async function resolvePredeterminadaPricelist(odoo) {
  for (const name of DEFAULT_PRICELIST_NAMES) {
    const found = await findPricelistByName(odoo, name);
    if (found?.id) return found;
  }

  const configured = await readPricelistById(odoo, process.env.ODOO_DEFAULT_PRICELIST_ID || DEFAULT_PRICELIST_ID);
  if (configured?.id) return configured;

  const first = await readFirstPricelist(odoo);
  if (first?.id) return first;

  throw new Error("No se pudo resolver la lista de precios Predeterminada");
}

async function resolveEffectivePricelistForUser(odoo, user, explicitPricelistId = null) {
  if (userCanUseAssignedPricelist(user)) {
    const explicit = toPositiveInt(explicitPricelistId);
    if (explicit) {
      const explicitPricelist = await readPricelistById(odoo, explicit);
      if (explicitPricelist?.id) return explicitPricelist;
    }

    const assigned = getAssignedPricelistIdFromUser(user);
    if (assigned) {
      const assignedPricelist = await readPricelistById(odoo, assigned);
      if (assignedPricelist?.id) return assignedPricelist;
    }
  }

  return await resolvePredeterminadaPricelist(odoo);
}

function normalizeOdooPriceValue(value, pricelistId, productId) {
  if (value === null || value === undefined || value === false) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const n = normalizeOdooPriceValue(item, pricelistId, productId);
      if (n > 0) return n;
    }
    return 0;
  }
  if (typeof value === "object") {
    const directKeys = [String(pricelistId || ""), String(productId || "")].filter(Boolean);
    for (const key of directKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const n = normalizeOdooPriceValue(value[key], pricelistId, productId);
        if (n > 0) return n;
      }
    }
    for (const item of Object.values(value)) {
      const n = normalizeOdooPriceValue(item, pricelistId, productId);
      if (n > 0) return n;
    }
  }
  return 0;
}

async function tryPricelistMethod(odoo, method, args, pricelistId, productId) {
  try {
    const result = await odoo.executeKw("product.pricelist", method, args);
    return normalizeOdooPriceValue(result, pricelistId, productId);
  } catch {
    return 0;
  }
}

async function getPriceFromOdooPricelist({ odoo, pricelistId, productId, qty = 1, partnerId = false }) {
  const plId = toPositiveInt(pricelistId);
  const requestedProductId = toPositiveInt(productId);
  const quantity = Number(qty || 1) || 1;
  const partner = partnerId ? Number(partnerId) : false;
  if (!plId || !requestedProductId) return 0;

  const attempts = [
    ["_get_product_price", [[plId], requestedProductId, quantity, partner]],
    ["_get_product_price", [[plId], requestedProductId, quantity]],
    ["get_product_price", [[plId], requestedProductId, quantity, partner]],
    ["get_product_price", [[plId], requestedProductId, quantity]],
    ["price_get", [[plId], requestedProductId, quantity, partner]],
    ["price_get", [[plId], requestedProductId, quantity]],
    ["_compute_price_rule", [[plId], [requestedProductId], quantity, partner]],
    ["_compute_price_rule", [[plId], [requestedProductId], quantity]],
  ];

  for (const [method, args] of attempts) {
    const price = await tryPricelistMethod(odoo, method, args, plId, requestedProductId);
    if (price > 0) return price;
  }

  return 0;
}

async function readSaleProducts(odoo, limit) {
  const products = await odoo.executeKw(
    "product.product",
    "search_read",
    [[["sale_ok", "=", true]]],
    {
      fields: ["id", "name", "display_name", "default_code", "uom_id", "product_tmpl_id", "list_price"],
      limit,
      order: "name asc",
    }
  );
  return Array.isArray(products) ? products : [];
}

export function buildOdooPriceCacheRouter(odoo) {
  const router = express.Router();

  router.get("/effective", requireAuth, async (req, res, next) => {
    try {
      const pricelist = await resolveEffectivePricelistForUser(odoo, req.user, req.query.pricelist_id);
      if (!pricelist?.id) throw new Error("No se pudo resolver la lista de precios efectiva");
      res.json({ ok: true, pricelist, pricelists: [pricelist] });
    } catch (e) {
      next(e);
    }
  });

  router.get("/prices", requireAuth, async (req, res, next) => {
    try {
      const requestedLimit = Number(req.query.limit || 500);
      const limit = Math.min(Math.max(Math.trunc(requestedLimit || 500), 1), 1000);
      const partnerId = req.query.partner_id ? Number(req.query.partner_id) : false;

      const pricelist = await resolveEffectivePricelistForUser(odoo, req.user, req.query.pricelist_id);
      const pricelistId = toPositiveInt(pricelist?.id);
      if (!pricelistId) throw new Error("No se pudo resolver la lista de precios para precargar precios");

      const products = await readSaleProducts(odoo, limit);
      const prices = [];

      for (const p of products) {
        const productId = toPositiveInt(p.id);
        if (!productId) continue;

        const templateId = relId(p.product_tmpl_id) || null;
        const odooPrice = await getPriceFromOdooPricelist({
          odoo,
          pricelistId,
          productId,
          qty: 1,
          partnerId,
        });
        const fallback = Number(p.list_price || 0) || 0;
        const finalPrice = odooPrice > 0 ? odooPrice : fallback;
        const name = cleanText(p.display_name || p.name) || `Producto ${productId}`;

        prices.push({
          product_id: productId,
          odoo_product_id: productId,
          odoo_template_id: templateId,
          price: round2(finalPrice),
          name,
          raw_name: name,
          code: p.default_code || null,
          qty: 1,
          uom_id: relId(p.uom_id) || null,
        });
      }

      res.json({
        ok: true,
        pricelist,
        pricelist_id: pricelistId,
        partner_id: partnerId || null,
        count: prices.length,
        fetched_at: new Date().toISOString(),
        prices,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

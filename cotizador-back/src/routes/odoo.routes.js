import express from "express";
import { requireAuth } from "../auth.js";

export function buildOdooRouter(odoo) {
  const router = express.Router();

  router.get("/health", (_req, res) => res.json({ ok: true }));

  router.get("/debug-auth", async (_req, res, next) => {
    try {
      const uid = await odoo._debugAuth();
      res.json({ ok: true, uid });
    } catch (e) {
      next(e);
    }
  });

  // -------------------------
  // Pricelists
  // -------------------------
  router.get("/pricelists", async (_req, res, next) => {
    try {
      const pls = await odoo.executeKw(
        "product.pricelist",
        "search_read",
        [[]],
        { fields: ["id", "name", "currency_id", "active"], limit: 200, order: "name asc" }
      );

      res.json({
        ok: true,
        pricelists: pls.map((p) => ({
          id: p.id,
          name: p.name,
          active: p.active,
          currency_id: Array.isArray(p.currency_id) ? p.currency_id[0] : p.currency_id,
          currency_name: Array.isArray(p.currency_id) ? p.currency_id[1] : null,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  // -------------------------
  // Products (búsqueda)
  // -------------------------
  router.get("/products", async (req, res, next) => {
    try {
      const query = (req.query.query || "").toString().trim();
      const limit = Number(req.query.limit || 30);

      const domain = [["sale_ok", "=", true]];
      if (query) domain.push("|", ["name", "ilike", query], ["default_code", "ilike", query]);

      const products = await odoo.executeKw("product.product", "search_read", [domain], {
        fields: ["id", "name", "default_code", "uom_id"],
        limit,
        order: "name asc",
      });

      res.json({
        ok: true,
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.default_code || null,
          uom_id: Array.isArray(p.uom_id) ? p.uom_id[0] : p.uom_id,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/billing-options", requireAuth, async (_req, res, next) => {
    try {
      const identificationTypes = await odoo.executeKw("l10n_latam.identification.type", "search_read", [[]], {
        fields: ["id", "name", "country_id"],
        limit: 200,
        order: "name asc",
      });

      const afipResponsibilityTypes = await odoo.executeKw("l10n_ar.afip.responsibility.type", "search_read", [[]], {
        fields: ["id", "name"],
        limit: 200,
        order: "name asc",
      });

      res.json({
        ok: true,
        identification_types: (identificationTypes || []).map((item) => ({
          id: item.id,
          name: item.name,
          country_id: Array.isArray(item.country_id) ? item.country_id[0] : item.country_id || null,
          country_name: Array.isArray(item.country_id) ? item.country_id[1] : null,
        })),
        afip_responsibility_types: (afipResponsibilityTypes || []).map((item) => ({
          id: item.id,
          name: item.name,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/prices", async (req, res, next) => {
    try {
      const body = req.body || {};
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length) throw new Error("Faltan lines[]");

      const partnerId = body.partner_id ? Number(body.partner_id) : false;
      let pricelistId = body.pricelist_id ? Number(body.pricelist_id) : null;

      if (!pricelistId) {
        const name = (process.env.ODOO_BASE_PRICELIST_NAME || process.env.ODOO_CUSTOMER_PRICELIST_NAME || "Predeterminado").trim();
        pricelistId = await findPricelistIdByName(odoo, name);
        if (!pricelistId) throw new Error(`No existe la lista de precios "${name}"`);
      }

      const productIds = [...new Set(lines.map((l) => Number(l.product_id)))];
      const products = await odoo.executeKw("product.product", "read", [productIds], {
        fields: ["id", "name", "default_code"],
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      const out = [];
      for (const l of lines) {
        const productId = Number(l.product_id);
        const qty = Number(l.qty || 1);
        const p = byId.get(productId);
        if (!p) throw new Error(`Producto no encontrado: ${productId}`);

        const price = await getPriceFromPricelist({ odoo, pricelistId, productId, qty, partnerId });

        out.push({
          product_id: productId,
          qty,
          price: round2(price),
          name: p.name,
          code: p.default_code || null,
        });
      }

      res.json({ ok: true, pricelist_id: pricelistId, partner_id: partnerId || null, prices: out });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function findPricelistIdByName(odoo, name) {
  const ids = await odoo.executeKw("product.pricelist", "search", [[[[ "name", "=", name ]]]], { limit: 1 });
  return ids?.[0] || null;
}

async function getPriceFromPricelist({ odoo, pricelistId, productId, qty, partnerId }) {
  try {
    const [p] = await odoo.executeKw("product.product", "read", [[productId]], { fields: ["list_price"] });
    if (typeof p?.list_price === "number") return p.list_price;
  } catch (_) {}

  try {
    const [p2] = await odoo.executeKw("product.product", "read", [[productId]], { fields: ["product_tmpl_id"] });
    const tmplId = Array.isArray(p2?.product_tmpl_id) ? p2.product_tmpl_id[0] : null;
    if (tmplId) {
      const [t] = await odoo.executeKw("product.template", "read", [[tmplId]], { fields: ["list_price"] });
      if (typeof t?.list_price === "number") return t.list_price;
    }
  } catch (_) {}

  return 0;
}

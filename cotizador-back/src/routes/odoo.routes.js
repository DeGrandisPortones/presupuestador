import express from "express";
import { requireAuth } from "../auth.js";

const TACA_TACA_PLAN_NAME = String(process.env.ODOO_TACA_TACA_PLAN_NAME || "Taca Taca").trim();

function cleanText(value) {
  return String(value || "").trim();
}
function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

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

  router.get("/debug-product/:id", async (req, res, next) => {
    try {
      const variantId = Number(req.params.id || 0);
      if (!variantId) throw new Error("id inválido");

      const variantRows = await odoo.executeKw("product.product", "read", [[variantId]], {
        fields: ["id", "name", "display_name", "product_tmpl_id", "write_date"],
      });

      const variant = Array.isArray(variantRows) ? variantRows[0] || null : null;
      const templateId = Array.isArray(variant?.product_tmpl_id)
        ? Number(variant.product_tmpl_id[0])
        : Number(variant?.product_tmpl_id || 0);

      let template = null;
      if (templateId) {
        const templateRows = await odoo.executeKw("product.template", "read", [[templateId]], {
          fields: ["id", "name", "display_name", "write_date"],
        });
        template = Array.isArray(templateRows) ? templateRows[0] || null : null;
      }

      console.log("[ODOO DEBUG PRODUCT]", {
        env: {
          url: process.env.ODOO_URL,
          db: process.env.ODOO_DB,
          username: process.env.ODOO_USERNAME,
          companyId: process.env.ODOO_COMPANY_ID || null,
        },
        requested_variant_id: variantId,
        variant,
        template,
      });

      res.json({
        ok: true,
        env: {
          url: process.env.ODOO_URL,
          db: process.env.ODOO_DB,
          username: process.env.ODOO_USERNAME,
          companyId: process.env.ODOO_COMPANY_ID || null,
        },
        requested_variant_id: variantId,
        variant,
        template,
      });
    } catch (e) {
      next(e);
    }
  });

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

  router.get("/financing-preview", requireAuth, async (req, res, next) => {
    try {
      const paymentMethod = String(req.query.payment_method || "").trim();
      const parsed = parseTacaTacaPaymentMethod(paymentMethod);

      if (!parsed) {
        return res.json({
          ok: true,
          applies_financing: false,
          percent: 0,
          card_type: null,
          installments: null,
          plan_id: null,
          rate_id: null,
          payment_method: paymentMethod,
        });
      }

      const planId = await resolveTacaTacaPlanId(odoo);
      if (!planId) {
        return res.json({
          ok: true,
          applies_financing: false,
          percent: 0,
          card_type: parsed.cardType,
          installments: parsed.installments,
          plan_id: null,
          rate_id: null,
          payment_method: paymentMethod,
        });
      }

      const rate = await resolveTacaTacaRate(odoo, {
        planId,
        cardType: parsed.cardType,
        installments: parsed.installments,
      });
      const meta = await resolveFinancingRateFieldMeta(odoo);
      const rawPercent = meta?.percentField ? rate?.[meta.percentField] : null;
      const percent = Number(rawPercent || 0) || 0;

      res.json({
        ok: true,
        applies_financing: !!rate?.id && percent > 0,
        percent: round2(percent),
        card_type: parsed.cardType,
        installments: parsed.installments,
        plan_id: Number(planId) || null,
        rate_id: toIntId(rate?.id),
        payment_method: paymentMethod,
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

      const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean))];
      const products = await odoo.executeKw("product.product", "read", [productIds], {
        fields: ["id", "name", "default_code", "product_tmpl_id"],
      });
      const byId = new Map((Array.isArray(products) ? products : []).map((p) => [Number(p.id), p]));

      const templateIds = [...new Set(
        (Array.isArray(products) ? products : [])
          .map((p) => Array.isArray(p.product_tmpl_id) ? Number(p.product_tmpl_id[0]) : 0)
          .filter(Boolean)
      )];
      let templates = [];
      if (templateIds.length) {
        templates = await odoo.executeKw("product.template", "read", [templateIds], {
          fields: ["id", "name"],
        });
      }
      const templateNameById = new Map(
        (Array.isArray(templates) ? templates : []).map((t) => [Number(t.id), cleanText(t.name)])
      );

      const out = [];
      for (const l of lines) {
        const productId = Number(l.product_id);
        const qty = Number(l.qty || 1);
        const p = byId.get(productId);
        if (!p) throw new Error(`Producto no encontrado: ${productId}`);

        const price = await getPriceFromPricelist({ odoo, pricelistId, productId, qty, partnerId });
        const templateId = Array.isArray(p.product_tmpl_id) ? Number(p.product_tmpl_id[0]) : 0;
        const templateName = cleanText(templateNameById.get(templateId));
        const productName = cleanText(p.name);
        const resolvedName = templateName || productName;

        out.push({
          product_id: productId,
          qty,
          price: round2(price),
          name: resolvedName,
          raw_name: resolvedName,
          code: p.default_code || null,
          odoo_template_id: templateId || null,
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

function toIntId(v) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : null;
}

function normalizePaymentMethodKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseTacaTacaPaymentMethod(paymentMethod) {
  const raw = String(paymentMethod || "").trim();
  const normalized = normalizePaymentMethodKey(raw);
  if (!normalized) return null;

  let cardType = "";
  if (normalized.startsWith("CORDOBESA")) cardType = "cordobesa";
  else if (normalized.startsWith("NARANJA")) cardType = "naranja";
  else if (normalized.startsWith("OTRAS TC BANC") || normalized.startsWith("OTRAS")) cardType = "otras";
  if (!cardType) return null;

  const installmentsMatch = normalized.match(/\b(\d{1,2})\b/);
  const installments = installmentsMatch ? Number(installmentsMatch[1]) : null;
  if (!Number.isFinite(installments) || installments <= 0) return null;

  return { raw, normalized, cardType, installments };
}

let financingRateFieldCache = undefined;
async function resolveFinancingRateFieldMeta(odoo) {
  if (financingRateFieldCache !== undefined) return financingRateFieldCache;
  try {
    const fields = await odoo.executeKw("sale.financing.rate", "fields_get", [], { attributes: ["type"] });
    financingRateFieldCache = {
      planField: fields?.plan_id ? "plan_id" : null,
      cardTypeField: fields?.card_type ? "card_type" : null,
      installmentsField: fields?.installments ? "installments" : (fields?.cuotas ? "cuotas" : null),
      percentField: fields?.rate_percent ? "rate_percent" : (fields?.percent ? "percent" : null),
      activeField: fields?.active ? "active" : null,
    };
    return financingRateFieldCache;
  } catch {
    financingRateFieldCache = null;
    return financingRateFieldCache;
  }
}

let tacaTacaPlanIdCache = undefined;
async function resolveTacaTacaPlanId(odoo) {
  if (tacaTacaPlanIdCache !== undefined) return tacaTacaPlanIdCache;
  try {
    let ids = await odoo.executeKw("sale.financing.plan", "search", [[["name", "=", TACA_TACA_PLAN_NAME]]], { limit: 1 });
    let id = toIntId(ids?.[0]);
    if (!id) {
      ids = await odoo.executeKw("sale.financing.plan", "search", [[["name", "ilike", TACA_TACA_PLAN_NAME]]], { limit: 1 });
      id = toIntId(ids?.[0]);
    }
    tacaTacaPlanIdCache = id || null;
    return tacaTacaPlanIdCache;
  } catch {
    tacaTacaPlanIdCache = null;
    return tacaTacaPlanIdCache;
  }
}

async function resolveTacaTacaRate(odoo, { planId, cardType, installments }) {
  const meta = await resolveFinancingRateFieldMeta(odoo);
  if (!meta?.planField || !meta?.cardTypeField || !meta?.installmentsField) return null;

  const baseDomain = [
    [meta.planField, "=", Number(planId)],
    [meta.cardTypeField, "=", String(cardType)],
    [meta.installmentsField, "=", Number(installments)],
  ];
  const fields = ["id", meta.planField, meta.cardTypeField, meta.installmentsField, meta.percentField].filter(Boolean);

  try {
    let domain = baseDomain.slice();
    if (meta.activeField) domain.push([meta.activeField, "=", true]);

    let rows = await odoo.executeKw("sale.financing.rate", "search_read", [domain], {
      fields,
      limit: 1,
      order: "id desc",
    });
    let rate = rows?.[0] || null;
    if (!rate) {
      rows = await odoo.executeKw("sale.financing.rate", "search_read", [baseDomain], {
        fields,
        limit: 1,
        order: "id desc",
      });
      rate = rows?.[0] || null;
    }
    return rate;
  } catch {
    return null;
  }
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

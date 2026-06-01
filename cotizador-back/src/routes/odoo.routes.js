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
      const requestedId = Number(req.params.id || 0);
      if (!requestedId) throw new Error("id inválido");

      const env = {
        url: process.env.ODOO_URL,
        db: process.env.ODOO_DB,
        username: process.env.ODOO_USERNAME,
        companyId: process.env.ODOO_COMPANY_ID || null,
      };

      const debug = {
        ok: true,
        env,
        requested_id: requestedId,
        product_product: { ok: false, data: null, error: null },
        product_template_same_id: { ok: false, data: null, error: null },
        product_template_from_variant: { ok: false, data: null, error: null },
      };

      let variantTemplateId = null;
      try {
        const variantRows = await odoo.executeKw("product.product", "read", [[requestedId]], {
          fields: ["id", "name", "display_name", "default_code", "list_price", "lst_price", "product_tmpl_id", "write_date"],
        });
        const variant = Array.isArray(variantRows) ? variantRows[0] || null : null;
        debug.product_product = { ok: !!variant, data: variant, error: null };
        variantTemplateId = Array.isArray(variant?.product_tmpl_id)
          ? Number(variant.product_tmpl_id[0])
          : Number(variant?.product_tmpl_id || 0) || null;
      } catch (e) {
        debug.product_product.error = String(e?.message || e || "Error leyendo product.product");
      }

      try {
        const templateRows = await odoo.executeKw("product.template", "read", [[requestedId]], {
          fields: ["id", "name", "display_name", "list_price", "write_date"],
        });
        const template = Array.isArray(templateRows) ? templateRows[0] || null : null;
        debug.product_template_same_id = { ok: !!template, data: template, error: null };
      } catch (e) {
        debug.product_template_same_id.error = String(e?.message || e || "Error leyendo product.template con mismo ID");
      }

      if (variantTemplateId && variantTemplateId !== requestedId) {
        try {
          const templateRows = await odoo.executeKw("product.template", "read", [[variantTemplateId]], {
            fields: ["id", "name", "display_name", "list_price", "write_date"],
          });
          const template = Array.isArray(templateRows) ? templateRows[0] || null : null;
          debug.product_template_from_variant = { ok: !!template, data: template, error: null };
        } catch (e) {
          debug.product_template_from_variant.error = String(e?.message || e || "Error leyendo product.template desde variante");
        }
      }

      console.log("[ODOO DEBUG PRODUCT]", debug);
      res.json(debug);
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

      const out = [];
      for (const l of lines) {
        const productId = toPositiveInt(l.product_id || l.odoo_product_id || l.odoo_external_id || l.odoo_variant_id || l.odoo_template_id);
        const sourceProductId = toPositiveInt(
          l.source_product_id ||
          l.presupuestador_product_id ||
          l.catalog_product_id ||
          l.local_product_id ||
          l.line_product_id ||
          productId
        );
        const qty = Number(l.qty || 1);
        if (!productId) throw new Error("Producto inválido en lines[]");

        const productInfo = await resolveProductInfoForPricing(odoo, l);
        const price = await getPriceFromPricelist({
          odoo,
          pricelistId,
          productId,
          qty,
          partnerId,
          templateId: productInfo.odoo_template_id || toPositiveInt(l.odoo_template_id) || null,
        });
        const finalPrice = price > 0 ? price : productInfo.list_price;
        const resolvedName = cleanText(productInfo.name) || `Producto ${productId}`;

        out.push({
          // product_id queda como ID interno/presupuestador para que el frontend actualice la linea correcta.
          product_id: sourceProductId || productId,
          odoo_product_id: productId,
          qty,
          price: round2(finalPrice),
          name: resolvedName,
          raw_name: resolvedName,
          code: productInfo.code || null,
          odoo_template_id: productInfo.odoo_template_id || null,
          product_product_access_error: productInfo.product_product_access_error || null,
          product_template_access_error: productInfo.product_template_access_error || null,
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


async function readProductProductForPricing(odoo, productId) {
  const id = toPositiveInt(productId);
  if (!id) return { data: null, error: null };
  try {
    const [product] = await odoo.executeKw("product.product", "read", [[id]], {
      fields: ["id", "name", "default_code", "list_price", "product_tmpl_id"],
    });
    return { data: product || null, error: null };
  } catch (e) {
    return { data: null, error: String(e?.message || e || "Error leyendo product.product") };
  }
}

async function readProductTemplateForPricing(odoo, templateId) {
  const id = toPositiveInt(templateId);
  if (!id) return { data: null, error: null };
  try {
    const [template] = await odoo.executeKw("product.template", "read", [[id]], {
      fields: ["id", "name", "display_name", "list_price"],
    });
    return { data: template || null, error: null };
  } catch (e) {
    return { data: null, error: String(e?.message || e || "Error leyendo product.template") };
  }
}

async function resolveProductInfoForPricing(odoo, line) {
  const productId = toPositiveInt(line?.product_id);
  const explicitTemplateId = toPositiveInt(line?.template_id || line?.odoo_template_id || line?.product_tmpl_id);
  const out = {
    product_id: productId,
    name: "",
    code: null,
    odoo_template_id: explicitTemplateId || null,
    list_price: 0,
    product_product_access_error: null,
    product_template_access_error: null,
  };

  const productResult = await readProductProductForPricing(odoo, productId);
  if (productResult.data) {
    const p = productResult.data;
    const variantTemplateId = Array.isArray(p.product_tmpl_id) ? Number(p.product_tmpl_id[0]) : Number(p.product_tmpl_id || 0) || null;
    out.name = cleanText(p.name);
    out.code = p.default_code || null;
    out.odoo_template_id = explicitTemplateId || variantTemplateId || null;
    out.list_price = Number(p.list_price || 0) || 0;
  } else if (productResult.error) {
    out.product_product_access_error = productResult.error;
  }

  const templateCandidates = [explicitTemplateId, out.odoo_template_id, productId]
    .map((id) => toPositiveInt(id))
    .filter((id, index, arr) => id > 0 && arr.indexOf(id) === index);

  for (const templateId of templateCandidates) {
    const templateResult = await readProductTemplateForPricing(odoo, templateId);
    if (templateResult.data) {
      const t = templateResult.data;
      out.odoo_template_id = Number(t.id) || out.odoo_template_id || templateId;
      out.name = cleanText(t.display_name || t.name) || out.name;
      const templatePrice = Number(t.list_price || 0) || 0;
      if (templatePrice > 0) out.list_price = templatePrice;
      out.product_template_access_error = null;
      break;
    }
    if (templateResult.error && !out.product_template_access_error) out.product_template_access_error = templateResult.error;
  }

  return out;
}

async function readProductTemplatePrice(odoo, templateId) {
  const id = toPositiveInt(templateId);
  if (!id) return 0;
  try {
    const [template] = await odoo.executeKw("product.template", "read", [[id]], { fields: ["list_price"] });
    const price = Number(template?.list_price || 0) || 0;
    return price > 0 ? price : 0;
  } catch (_) {
    return 0;
  }
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
  } catch (_) {
    return 0;
  }
}

async function getPriceFromOdooPricelist({ odoo, pricelistId, productId, qty, partnerId }) {
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

async function getPriceFromPricelist({ odoo, pricelistId, productId, qty, partnerId, templateId = null }) {
  const requestedProductId = toPositiveInt(productId);
  const explicitTemplateId = toPositiveInt(templateId);
  let variantTemplateId = null;

  // Primero usamos la lista de precios asignada. Esto permite que distribuidores vean y calculen
  // con Lista 2/3/6 en vez de caer siempre al precio predeterminado del producto.
  const pricelistPrice = await getPriceFromOdooPricelist({ odoo, pricelistId, productId: requestedProductId, qty, partnerId });
  if (pricelistPrice > 0) return pricelistPrice;

  try {
    const [product] = await odoo.executeKw("product.product", "read", [[requestedProductId]], { fields: ["list_price", "product_tmpl_id"] });
    const variantPrice = Number(product?.list_price || 0) || 0;
    if (variantPrice > 0) return variantPrice;
    variantTemplateId = Array.isArray(product?.product_tmpl_id) ? Number(product.product_tmpl_id[0]) : Number(product?.product_tmpl_id || 0) || null;
  } catch (_) {}

  // En Odoo la URL /odoo/products/<id> suele apuntar al product.template.
  // Para productos configurados desde el dashboard, a veces se guarda ese ID de plantilla
  // y no el ID real de variante. Si la variante leida devuelve 0, probamos la plantilla explicita
  // y tambien la plantilla con el mismo ID solicitado antes de rendirnos.
  const templateCandidates = [explicitTemplateId, requestedProductId, variantTemplateId]
    .map((id) => toPositiveInt(id))
    .filter((id, index, arr) => id > 0 && arr.indexOf(id) === index);

  for (const candidateTemplateId of templateCandidates) {
    const templatePrice = await readProductTemplatePrice(odoo, candidateTemplateId);
    if (templatePrice > 0) return templatePrice;
  }

  return 0;
}

import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import { getCommercialFinalTolerancePercent } from "../settingsDb.js";

// =========================
// Config
// =========================
const MEASUREMENT_PRODUCT_ID = Number(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865); // SERVICIO DE MEDICION Y RELEVAMIENTO
const PLACEHOLDER_PRODUCT_ID = Number(process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 2880); // Producto generico / anticipo
const IVA_RATE = 0.21;

const PORTON_TYPE_TO_ODOO_PRODUCT_ID = Object.freeze({
  acero_simil_aluminio_clasico: 3209,
  coplanar_acero_simil_aluminio_clasico: 3210,
  acero_simil_aluminio_doble_iny: 3211,
  coplanar_acero_simil_aluminio_doble_iny: 3212,
  para_revestir_con_al_pvc_otros: 3213,
  estandar_acero_simil_aluminio: 3214,
  estandar_acero_simil_madera: 3215,
  acero_simil_madera_clasico: 3216,
  coplanar_acero_simil_madera_clasico: 3217,
  acero_simil_madera_doble_iny: 3218,
  coplanar_acero_simil_madera_doble_iny: 3219,
  revestimiento_wpc: 3220,
  corredizo_simil_madera: 3221,
  corredizo_simil_aluminio_doble: 3222,
  corredizo_simil_madera_doble: 3223,
  corredizo_simil_aluminio: 3224,
});

/** RBAC */
function requireRole(flag) {
  return (req, res, next) => {
    if (!req.user?.[flag]) return res.status(403).json({ ok: false, error: "No autorizado" });
    next();
  };
}
function requireSellerOrDistributor(req, res, next) {
  const u = req.user || {};
  if (!u.is_vendedor && !u.is_distribuidor) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}

function normCatalogKind(kind) {
  const k = String(kind || "porton").toLowerCase().trim();
  if (!["porton", "ipanel"].includes(k)) throw new Error('catalog_kind invalido (usar "porton" o "ipanel")');
  return k;
}

function toScalar(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}
function toIntId(v) {
  const x = toScalar(v);
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function toText(v) {
  const x = toScalar(v);
  const s = x === null || x === undefined ? "" : String(x);
  return s.trim();
}
function isUuid(v) {
  const s = String(v || "").trim();
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function buildDistributorNote({ quote }) {
  const parts = [];
  parts.push(`PRESUPUESTADOR QUOTE: ${quote.id}`);
  parts.push(`Destino: ${quote.fulfillment_mode === "acopio" ? "ACOPIO" : "PRODUCCION"}`);
  parts.push("VENTA A DISTRIBUIDOR (cliente final NO cargado en Odoo).");

  const c = quote.end_customer || {};
  if (c?.name) parts.push(`Cliente final: ${c.name}`);
  if (c?.phone) parts.push(`Tel: ${c.phone}`);
  if (c?.email) parts.push(`Email: ${c.email}`);
  if (c?.address) parts.push(`Direccion: ${c.address}`);
  if (c?.maps_url) parts.push(`Maps: ${c.maps_url}`);
  if (quote.note) parts.push(`Obs: ${quote.note}`);

  return parts.join("\n");
}

async function getCreatorOdooPartnerId(createdByUserId) {
  try {
    const r = await dbQuery(`select odoo_partner_id from public.presupuestador_users where id=$1`, [Number(createdByUserId)]);
    const v = r.rows?.[0]?.odoo_partner_id;
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

async function findOrCreateCustomerPartner(odoo, customer) {
  const email = toText(customer?.email);
  if (email) {
    const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", email]]], { limit: 1 });
    if (ids?.[0]) return toIntId(ids[0]);
  }

  const name = toText(customer?.name);
  if (!name) throw new Error("Falta end_customer.name (vendedor)");

  const ids2 = await odoo.executeKw("res.partner", "search", [[["name", "=", name]]], { limit: 1 });
  if (ids2?.[0]) return toIntId(ids2[0]);

  const created = await odoo.executeKw("res.partner", "create", [{
    name,
    email: email || false,
    phone: toText(customer?.phone) || false,
    street: toText(customer?.street) || toText(customer?.address) || false,
    city: toText(customer?.city) || false,
    customer_rank: 1,
  }]);

  const id = toIntId(created);
  if (!id) throw new Error("No se pudo crear partner en Odoo");
  return id;
}

function vendedorNeedsEndCustomerName(quote) {
  return quote?.created_by_role === "vendedor";
}
function getEndCustomerName(quote) {
  return String(quote?.end_customer?.name || "").trim();
}
function validateEndCustomerDraft(end_customer) {
  const c = end_customer || {};
  const name = String(c.name || "").trim();
  if (!name) return "Falta end_customer.name";
  return null;
}
function validateEndCustomerRequired(end_customer) {
  const c = end_customer || {};
  const name = String(c.name || "").trim();
  const phone = String(c.phone || "").trim();
  const address = String(c.address || "").trim();
  const mapsUrl = String(c.maps_url || "").trim();

  if (!name) return "Falta end_customer.name";
  if (!phone) return "Falta end_customer.phone";
  if (!address) return "Falta end_customer.address";
  if (!mapsUrl) return "Falta end_customer.maps_url";
  return null;
}
function validateBusinessRequired(payload, catalog_kind) {
  const p = payload || {};
  const cond = String(p.condition_mode || "").trim();
  const condText = String(p.condition_text || "").trim();
  const payment = String(p.payment_method || "").trim();
  const portonType = String(p.porton_type || "").trim();

  if (!payment) return "Falta payload.payment_method";
  if (cond === "special" && !condText) return "Falta payload.condition_text (condicion especial)";

  const kind = String(catalog_kind || "porton").toLowerCase().trim();
  if (kind === "porton" && !portonType) return "Falta payload.porton_type";
  return null;
}

function hasMeasurementLine(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  return arr.some((l) => toIntId(l?.product_id) === MEASUREMENT_PRODUCT_ID);
}
function quoteNeedsMeasurement(quote) {
  return !!(quote?.requires_measurement === true || hasMeasurementLine(quote?.lines));
}
function calcQuoteSubtotal({ lines, payload }) {
  const arr = Array.isArray(lines) ? lines : [];
  const m = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(arr.reduce((acc, l) => {
    const qty = Number(l?.qty || 0) || 0;
    const base = Number(l?.basePrice ?? l?.base_price ?? l?.price ?? 0) || 0;
    const unit = base * (1 + m / 100);
    return acc + (qty * unit);
  }, 0));
}
function calcQuoteTotalWithIva({ lines, payload }) {
  const subtotal = calcQuoteSubtotal({ lines, payload });
  const iva = round2(subtotal * IVA_RATE);
  return round2(subtotal + iva);
}
function calcDetailedUnitWithIva(line, payload) {
  if (typeof line?.price_unit === "number") return round2(line.price_unit);
  if (typeof line?.unit_price === "number") return round2(line.unit_price);
  const base = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
  const margin = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(base * (1 + margin / 100) * (1 + IVA_RATE));
}

function normalizePortonTypeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function getInitialOdooProductIdForQuote(quote) {
  const kind = String(quote?.catalog_kind || "porton").toLowerCase().trim();
  if (kind !== "porton") return Number(PLACEHOLDER_PRODUCT_ID);
  const rawPortonType = quote?.payload?.porton_type ?? "";
  const normalizedPortonType = normalizePortonTypeKey(rawPortonType);
  const mapped =
    PORTON_TYPE_TO_ODOO_PRODUCT_ID[String(rawPortonType || "").trim()] ??
    PORTON_TYPE_TO_ODOO_PRODUCT_ID[normalizedPortonType];
  return Number(mapped || PLACEHOLDER_PRODUCT_ID);
}

async function resolveInitialOdooProduct(odoo, requestedProductId) {
  const requestedId = Number(requestedProductId);

  const [directVariant] = await odoo.executeKw("product.product", "read", [[requestedId]], { fields: ["id", "name", "uom_id", "product_tmpl_id"] });
  if (directVariant?.id) {
    const uomId = toIntId(directVariant.uom_id);
    if (!uomId) throw new Error(`Producto inicial sin uom_id: ${requestedId}`);
    return { productId: Number(directVariant.id), productName: directVariant.name, uomId };
  }

  const [template] = await odoo.executeKw("product.template", "read", [[requestedId]], { fields: ["id", "name"] });
  if (!template?.id) throw new Error(`Producto inicial no encontrado en Odoo: ${requestedId}`);

  const variantIds = await odoo.executeKw("product.product", "search", [[["product_tmpl_id", "=", Number(template.id)]]], { limit: 1 });
  const variantId = toIntId(variantIds?.[0]);
  if (!variantId) throw new Error(`Producto inicial sin variante en Odoo: ${requestedId}`);

  const [resolvedVariant] = await odoo.executeKw("product.product", "read", [[variantId]], { fields: ["id", "name", "uom_id"] });
  if (!resolvedVariant?.id) throw new Error(`Variante de producto inicial no encontrada en Odoo: ${variantId}`);

  const uomId = toIntId(resolvedVariant.uom_id);
  if (!uomId) throw new Error(`Producto inicial sin uom_id: ${variantId}`);
  return { productId: Number(resolvedVariant.id), productName: resolvedVariant.name, uomId };
}

async function syncQuoteToOdoo({ odoo, quote, approverUser }) {
  const pricelistId = toIntId(quote?.pricelist_id) || 1;

  let partnerId = null;
  if (quote.created_by_role === "distribuidor") {
    partnerId = toIntId(quote?.bill_to_odoo_partner_id) || await getCreatorOdooPartnerId(quote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
    if (!partnerId) throw new Error("Distribuidor sin bill_to_odoo_partner_id (quote) y sin odoo_partner_id (JWT/DB)");
  } else {
    partnerId = await findOrCreateCustomerPartner(odoo, quote.end_customer || {});
  }
  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id invalido para Odoo");

  const total = calcQuoteTotalWithIva({ lines: quote.lines, payload: quote.payload });
  const requestedInitialProductId = getInitialOdooProductIdForQuote(quote);
  const initialProduct = await resolveInitialOdooProduct(odoo, requestedInitialProductId);

  const orderLines = [[0, 0, {
    product_id: Number(initialProduct.productId),
    product_uom_qty: 1,
    product_uom: initialProduct.uomId,
    name: initialProduct.productName,
    price_unit: round2(total),
  }]];

  const note = quote.created_by_role === "distribuidor"
    ? buildDistributorNote({ quote })
    : `PRESUPUESTADOR QUOTE: ${quote.id}\nDestino: ${quote.fulfillment_mode === "acopio" ? "ACOPIO" : "PRODUCCION"}`
      + (quote?.end_customer?.maps_url ? `\nMaps: ${quote.end_customer.maps_url}` : "")
      + (quote.note ? `\n${quote.note}` : "");

  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    note,
  }]);
  const orderId = toIntId(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order en Odoo");

  const [order] = await odoo.executeKw("sale.order", "read", [[orderId]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id"],
  });

  return { order, deposit_amount: round2(total) };
}

async function markSyncingIfReady(id) {
  const r = await dbQuery(
    `
    update public.presupuestador_quotes
    set status='syncing_odoo'
    where id=$1
      and status='pending_approvals'
      and commercial_decision='approved'
      and technical_decision='approved'
      and odoo_sale_order_id is null
    returning *
    `,
    [id]
  );
  return r.rows?.[0] || null;
}
async function normalizeIfSyncingButHasOrder(id) {
  const r = await dbQuery(
    `
    update public.presupuestador_quotes
    set status='synced_odoo'
    where id=$1
      and status='syncing_odoo'
      and odoo_sale_order_id is not null
    returning *
    `,
    [id]
  );
  return r.rows?.[0] || null;
}

async function createEditCopyFromQuote(parentId) {
  const ins = await dbQuery(
    `
    insert into public.presupuestador_quotes
      (quote_kind, parent_quote_id,
       created_by_user_id, created_by_role,
       fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
       end_customer, lines, payload, note,
       catalog_kind,
       status, commercial_decision, technical_decision)
    select
      'copy', id,
      created_by_user_id, created_by_role,
      fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
      end_customer, lines, payload, note,
      catalog_kind,
      'draft', 'pending', 'pending'
    from public.presupuestador_quotes
    where id=$1
    returning *
    `,
    [parentId]
  );
  return ins.rows?.[0] || null;
}

async function getFinalCopyByParentId(parentId) {
  const r = await dbQuery(
    `select * from public.presupuestador_quotes where quote_kind='copy' and parent_quote_id=$1 order by created_at desc nulls last, id desc limit 1`,
    [parentId]
  );
  return r.rows?.[0] || null;
}

async function syncFinalQuoteToOdoo({ odoo, revisionQuote, originalQuote, approverUser }) {
  const pricelistId = toIntId(revisionQuote?.pricelist_id) || toIntId(originalQuote?.pricelist_id) || 1;

  let partnerId = null;
  if (originalQuote.created_by_role === "distribuidor") {
    partnerId = toIntId(originalQuote?.bill_to_odoo_partner_id) || await getCreatorOdooPartnerId(originalQuote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
    if (!partnerId) throw new Error("Distribuidor sin partner en Odoo");
  } else {
    partnerId = await findOrCreateCustomerPartner(odoo, originalQuote.end_customer || {});
  }
  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id invalido para Odoo");

  const lines = Array.isArray(revisionQuote.lines) ? revisionQuote.lines : [];
  if (!lines.length) throw new Error("La copia no tiene items");

  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean).concat([Number(PLACEHOLDER_PRODUCT_ID)]))];
  const products = await odoo.executeKw("product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));

  const orderLines = [];
  let detailedTotal = 0;

  for (const l of lines) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1) || 1;
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);

    const uomId = toIntId(p?.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);

    const priceUnit = calcDetailedUnitWithIva(l, revisionQuote.payload || originalQuote.payload || {});
    detailedTotal = round2(detailedTotal + (qty * priceUnit));

    orderLines.push([0, 0, {
      product_id: productId,
      product_uom_qty: qty,
      product_uom: uomId,
      name: p.name,
      price_unit: priceUnit,
    }]);
  }

  const depositAmount = round2(Number(originalQuote.deposit_amount || 0) || 0);
  const tolerancePercent = round2(await getCommercialFinalTolerancePercent());
  const toleranceAmount = round2((depositAmount * tolerancePercent) / 100);
  const rawDifference = round2(detailedTotal - depositAmount);

  let absorbedByCompany = false;
  let advanceToDiscount = 0;

  if (depositAmount > 0) {
    if (detailedTotal <= depositAmount) {
      absorbedByCompany = true;
      advanceToDiscount = detailedTotal;
    } else if (rawDifference <= toleranceAmount) {
      absorbedByCompany = true;
      advanceToDiscount = detailedTotal;
    } else {
      advanceToDiscount = depositAmount;
    }
  }

  if (advanceToDiscount > 0) {
    const ph = byId.get(Number(PLACEHOLDER_PRODUCT_ID));
    const uomId = toIntId(ph?.uom_id);
    if (!uomId) throw new Error(`Producto anticipo sin uom_id: ${PLACEHOLDER_PRODUCT_ID}`);

    orderLines.push([0, 0, {
      product_id: Number(PLACEHOLDER_PRODUCT_ID),
      product_uom_qty: 1,
      product_uom: uomId,
      name: `Pago anticipado según presupuesto ${originalQuote.odoo_sale_order_name || originalQuote.id}`,
      price_unit: round2(-advanceToDiscount),
    }]);
  }

  const finalAmountToCharge = round2(Math.max(0, detailedTotal - advanceToDiscount));
  const note = `PRESUPUESTADOR FINAL: COPY ${revisionQuote.id} (ORIG ${originalQuote.id})`
    + `\nReferencia seña: ${originalQuote.odoo_sale_order_name || originalQuote.odoo_sale_order_id || "-"}`
    + `\nTotal detallado: ${detailedTotal}`
    + `\nAnticipo descontado: ${advanceToDiscount}`
    + `\nDiferencia original: ${rawDifference}`
    + `\nTolerancia comercial %: ${tolerancePercent}`
    + `\nTolerancia comercial monto: ${toleranceAmount}`
    + (absorbedByCompany ? `\nAbsorbido por la empresa: SI` : `\nAbsorbido por la empresa: NO`)
    + `\nImporte final a facturar: ${finalAmountToCharge}`;

  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    note,
  }]);
  const orderId = toIntId(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order final en Odoo");

  const [order] = await odoo.executeKw("sale.order", "read", [[orderId]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id"],
  });

  return {
    order,
    metrics: {
      detailed_total: detailedTotal,
      advance_discounted_amount: round2(advanceToDiscount),
      tolerance_percent: tolerancePercent,
      tolerance_amount: toleranceAmount,
      difference_amount: rawDifference,
      absorbed_by_company: absorbedByCompany,
      final_amount_to_charge: finalAmountToCharge,
    },
  };
}

export function buildQuotesRouter(odoo) {
  const router = express.Router();

  router.use(async (_req, _res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      next();
    } catch (e) {
      next(e);
    }
  });

  router.use(requireAuth);

  router.post("/", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const body = req.body || {};
      const created_by_role =
        (body.created_by_role === "distribuidor" || body.created_by_role === "vendedor") ? body.created_by_role :
        (u.is_distribuidor ? "distribuidor" : "vendedor");

      const fulfillment_mode = String(body.fulfillment_mode || "acopio").trim();
      if (!["produccion", "acopio"].includes(fulfillment_mode)) throw new Error("fulfillment_mode debe ser 'produccion' o 'acopio'");

      const catalog_kind = normCatalogKind(body.catalog_kind || "porton");
      const end_customer = body.end_customer || {};
      const custErr = validateEndCustomerDraft(end_customer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });

      const lines = Array.isArray(body.lines) ? body.lines : [];
      const payload = body.payload || {};
      const note = body.note || null;

      const pricelist_id = Number(body.pricelist_id || 1);
      let bill_to_odoo_partner_id = body.bill_to_odoo_partner_id ? Number(body.bill_to_odoo_partner_id) : null;
      if (created_by_role === "distribuidor" && !bill_to_odoo_partner_id) {
        bill_to_odoo_partner_id = u.odoo_partner_id ? Number(u.odoo_partner_id) : null;
      }

      const q = await dbQuery(
        `
        insert into public.presupuestador_quotes
          (quote_kind, parent_quote_id,
           created_by_user_id, created_by_role, fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
           end_customer, lines, payload, note,
           catalog_kind, status, commercial_decision, technical_decision,
           requires_measurement)
        values
          ('original', null,
           $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9,
           $10, 'draft', 'pending', 'pending',
           $11)
        returning *
        `,
        [
          Number(u.user_id),
          created_by_role,
          fulfillment_mode,
          pricelist_id,
          bill_to_odoo_partner_id,
          JSON.stringify(end_customer),
          JSON.stringify(lines),
          JSON.stringify(payload),
          note,
          catalog_kind,
          hasMeasurementLine(lines),
        ]
      );

      res.json({ ok: true, quote: q.rows[0] });
    } catch (e) { next(e); }
  });

  router.get("/", async (req, res, next) => {
    try {
      const u = req.user || {};
      const scope = String(req.query.scope || "mine");
      let sql = "";
      let params = [];
      const onlyOriginal = "q.quote_kind = 'original'";

      if (scope === "mine") {
        if (!u.is_vendedor && !u.is_distribuidor) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and q.created_by_user_id = $1
          order by q.id desc
          limit 200
        `;
        params = [Number(u.user_id)];
      } else if (scope === "commercial_inbox") {
        if (!u.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and q.created_by_role = 'vendedor'
            and ((status = 'pending_approvals' and commercial_decision in ('pending','approved')) or (status = 'draft' and technical_decision = 'rejected'))
          order by q.id desc
          limit 200
        `;
      } else if (scope === "technical_inbox") {
        if (!u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and ((status = 'pending_approvals' and technical_decision in ('pending','approved')) or (status = 'draft' and commercial_decision = 'rejected'))
          order by q.id desc
          limit 200
        `;
      } else if (scope === "commercial_acopio") {
        if (!u.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and q.fulfillment_mode = 'acopio'
            and acopio_to_produccion_status = 'pending'
          order by acopio_to_produccion_requested_at desc nulls last, id desc
          limit 200
        `;
      } else if (scope === "technical_acopio") {
        if (!u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and q.fulfillment_mode = 'acopio'
            and acopio_to_produccion_status = 'pending'
          order by acopio_to_produccion_requested_at desc nulls last, id desc
          limit 200
        `;
      } else {
        return res.status(400).json({ ok: false, error: "scope invalido" });
      }

      const r = await dbQuery(sql, params);
      res.json({ ok: true, quotes: r.rows || [] });
    } catch (e) { next(e); }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      const isOwner = String(quote.created_by_user_id) === String(u.user_id);
      const canCommercial = u.is_enc_comercial && quote.created_by_role === "vendedor";
      const canTech = u.is_rev_tecnica;
      if (!isOwner && !canCommercial && !canTech) throw new Error("No autorizado");
      res.json({ ok: true, quote });
    } catch (e) { next(e); }
  });

  router.post("/:id/revision", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) throw new Error("No sos dueño");
      if ((quote.quote_kind || "original") !== "original") return res.status(400).json({ ok: false, error: "Solo se puede crear ajuste desde un presupuesto original" });

      const existing = await getFinalCopyByParentId(id);
      if (existing) return res.json({ ok: true, quote: existing });

      const copy = await createEditCopyFromQuote(id);
      if (!copy) throw new Error("No se pudo crear la copia");
      res.json({ ok: true, quote: copy });
    } catch (e) { next(e); }
  });

  router.put("/:id", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const body = req.body || {};
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) throw new Error("No sos dueño");

      const catalog_kind_locked = quote.catalog_kind || "porton";
      if (body.catalog_kind && normCatalogKind(body.catalog_kind) !== normCatalogKind(catalog_kind_locked)) return res.status(400).json({ ok: false, error: "No podes cambiar el tipo de cotizador (porton/ipanel)" });
      const catalog_kind = normCatalogKind(body.catalog_kind || catalog_kind_locked);

      if (!["draft", "rejected_commercial", "rejected_technical"].includes(quote.status)) throw new Error("Solo se edita en borrador");
      const nextEndCustomer = body.end_customer !== undefined ? body.end_customer : quote.end_customer;
      const custErr = validateEndCustomerDraft(nextEndCustomer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });

      const fulfillment_mode = body.fulfillment_mode ? String(body.fulfillment_mode) : quote.fulfillment_mode;
      if (!["produccion", "acopio"].includes(fulfillment_mode)) throw new Error("fulfillment_mode invalido");

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set fulfillment_mode=$2,
            pricelist_id=$3,
            bill_to_odoo_partner_id=$4,
            end_customer=$5::jsonb,
            lines=$6::jsonb,
            payload=$7::jsonb,
            note=$8,
            catalog_kind=$9,
            requires_measurement=$10
        where id=$1
        returning *
        `,
        [
          id,
          fulfillment_mode,
          body.pricelist_id ? Number(body.pricelist_id) : quote.pricelist_id,
          body.bill_to_odoo_partner_id !== undefined ? (body.bill_to_odoo_partner_id ? Number(body.bill_to_odoo_partner_id) : null) : quote.bill_to_odoo_partner_id,
          JSON.stringify(body.end_customer !== undefined ? body.end_customer : quote.end_customer),
          JSON.stringify(body.lines !== undefined ? body.lines : quote.lines),
          JSON.stringify(body.payload !== undefined ? body.payload : quote.payload),
          body.note !== undefined ? body.note : quote.note,
          catalog_kind,
          hasMeasurementLine(body.lines !== undefined ? body.lines : quote.lines),
        ]
      );

      res.json({ ok: true, quote: upd.rows[0] });
    } catch (e) { next(e); }
  });

  router.post("/:id/submit", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { fulfillment_mode } = req.body || {};
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) throw new Error("No sos dueño");

      const custErr = validateEndCustomerRequired(quote.end_customer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });
      const bizErr = validateBusinessRequired(quote.payload || {}, quote.catalog_kind || "porton");
      if (bizErr) return res.status(400).json({ ok: false, error: bizErr });
      if (vendedorNeedsEndCustomerName(quote) && !getEndCustomerName(quote)) return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      if (!["draft", "rejected_commercial", "rejected_technical"].includes(quote.status)) throw new Error("Solo confirmar desde borrador");

      const fm = String(fulfillment_mode || quote.fulfillment_mode || "acopio").trim();
      if (!["produccion", "acopio"].includes(fm)) return res.status(400).json({ ok: false, error: "fulfillment_mode invalido (usar 'acopio' o 'produccion')" });

      const isDistributor = quote.created_by_role === "distribuidor";
      const status = "pending_approvals";
      const commercial_decision = isDistributor ? "approved" : "pending";
      const technical_decision = "pending";
      const reqMeas = hasMeasurementLine(quote.lines);
      const nextMeasStatus = fm === "produccion" && reqMeas ? "pending" : "none";

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set status=$2,
            fulfillment_mode=$3,
            confirmed_at = now(),
            requires_measurement=$6,
            measurement_status=$7,
            commercial_decision=$4,
            technical_decision=$5,
            commercial_by_user_id=null,
            commercial_at=null,
            technical_by_user_id=null,
            technical_at=null,
            commercial_notes = case when $4='approved' and created_by_role='distribuidor' then 'AUTO: distribuidor' else null end,
            technical_notes = null,
            rejection_notes = null
        where id=$1
        returning *
        `,
        [id, status, fm, commercial_decision, technical_decision, reqMeas, nextMeasStatus]
      );

      const confirmed = upd.rows?.[0] || quote;
      try {
        const exists = await getFinalCopyByParentId(id);
        if (!exists) await createEditCopyFromQuote(id);
      } catch {
        // no bloqueamos la confirmación por la copia
      }

      res.json({ ok: true, quote: confirmed });
    } catch (e) { next(e); }
  });

  router.post("/:id/review/commercial", requireRole("is_enc_comercial"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes } = req.body || {};
      await normalizeIfSyncingButHasOrder(id);

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (quote.created_by_role !== "vendedor") throw new Error("Comercial solo revisa vendedores");
      if (quote.status === "synced_odoo" || quote.status === "syncing_odoo") return res.json({ ok: true, quote });
      if (quote.status !== "pending_approvals") return res.status(400).json({ ok: false, error: "No esta en revision (pending_approvals)" });
      if (quote.commercial_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(
          `
          update public.presupuestador_quotes
          set status='draft', commercial_decision='rejected', commercial_by_user_id=$2, commercial_at=now(), commercial_notes=$3,
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'COMERCIAL: ' || $3)
          where id=$1
          returning *
          `,
          [id, Number(u.user_id), msg]
        );
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const upd1 = await dbQuery(
        `
        update public.presupuestador_quotes
        set commercial_decision='approved', commercial_by_user_id=$2, commercial_at=now(), commercial_notes=$3
        where id=$1 and status='pending_approvals' and commercial_decision='pending'
        returning *
        `,
        [id, Number(u.user_id), notes || null]
      );
      const q1 = upd1.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
      const qSync = await markSyncingIfReady(id);
      if (!qSync) return res.json({ ok: true, quote: q1 });

      if (vendedorNeedsEndCustomerName(qSync) && !getEndCustomerName(qSync)) {
        await dbQuery(`update public.presupuestador_quotes set status='draft', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'VALIDACION: Falta end_customer.name (vendedor)') where id=$1 and status='syncing_odoo'`, [id]);
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }

      try {
        const { order, deposit_amount } = await syncQuoteToOdoo({ odoo, quote: qSync, approverUser: u });
        const upd2 = await dbQuery(
          `
          update public.presupuestador_quotes
          set status='synced_odoo', odoo_sale_order_id=$2, odoo_sale_order_name=$3, deposit_amount=$4,
              requires_measurement = case when exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $5) then true else requires_measurement end,
              measurement_status = case
                when fulfillment_mode='produccion' and (requires_measurement = true or exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $5)) and (measurement_status is null or measurement_status='none') then 'pending'
                else measurement_status
              end
          where id=$1 and status='syncing_odoo'
          returning *
          `,
          [id, Number(order.id), order.name, deposit_amount, String(MEASUREMENT_PRODUCT_ID)]
        );
        const finalQuote = upd2.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
        return res.json({ ok: true, quote: finalQuote, order });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar a Odoo");
        console.error("SYNC ODOO ERROR:", msg);
        if (e?.odoo) console.error("ODOO:", e.odoo);
        if (e?.debug) console.error("ODOO DEBUG:", e.debug);
        await dbQuery(`update public.presupuestador_quotes set status='pending_approvals', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2) where id=$1 and status='syncing_odoo'`, [id, msg]);
        return res.status(502).json({ ok: false, error: process.env.NODE_ENV === "development" ? `Error al sincronizar a Odoo: ${msg}` : "Error al sincronizar a Odoo. Reintenta." });
      }
    } catch (e) { next(e); }
  });

  router.post("/:id/review/technical", requireRole("is_rev_tecnica"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes } = req.body || {};
      await normalizeIfSyncingButHasOrder(id);

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (quote.status === "synced_odoo" || quote.status === "syncing_odoo") return res.json({ ok: true, quote });
      if (quote.status !== "pending_approvals") return res.status(400).json({ ok: false, error: "No esta en revision (pending_approvals)" });
      if (quote.technical_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(
          `
          update public.presupuestador_quotes
          set status='draft', technical_decision='rejected', technical_by_user_id=$2, technical_at=now(), technical_notes=$3,
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'TECNICA: ' || $3)
          where id=$1
          returning *
          `,
          [id, Number(u.user_id), msg]
        );
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const upd1 = await dbQuery(
        `
        update public.presupuestador_quotes
        set technical_decision='approved', technical_by_user_id=$2, technical_at=now(), technical_notes=$3
        where id=$1 and status='pending_approvals' and technical_decision='pending'
        returning *
        `,
        [id, Number(u.user_id), notes || null]
      );
      const q1 = upd1.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
      const qSync = await markSyncingIfReady(id);
      if (!qSync) return res.json({ ok: true, quote: q1 });

      if (vendedorNeedsEndCustomerName(qSync) && !getEndCustomerName(qSync)) {
        await dbQuery(`update public.presupuestador_quotes set status='draft', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'VALIDACION: Falta end_customer.name (vendedor)') where id=$1 and status='syncing_odoo'`, [id]);
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }

      try {
        const { order, deposit_amount } = await syncQuoteToOdoo({ odoo, quote: qSync, approverUser: u });
        const upd2 = await dbQuery(
          `
          update public.presupuestador_quotes
          set status='synced_odoo', odoo_sale_order_id=$2, odoo_sale_order_name=$3, deposit_amount=$4,
              requires_measurement = case when exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $5) then true else requires_measurement end,
              measurement_status = case
                when fulfillment_mode='produccion' and (requires_measurement = true or exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $5)) and (measurement_status is null or measurement_status='none') then 'pending'
                else measurement_status
              end
          where id=$1 and status='syncing_odoo'
          returning *
          `,
          [id, Number(order.id), order.name, deposit_amount, String(MEASUREMENT_PRODUCT_ID)]
        );
        const finalQuote = upd2.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
        return res.json({ ok: true, quote: finalQuote, order });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar a Odoo");
        console.error("SYNC ODOO ERROR:", msg);
        if (e?.odoo) console.error("ODOO:", e.odoo);
        if (e?.debug) console.error("ODOO DEBUG:", e.debug);
        await dbQuery(`update public.presupuestador_quotes set status='pending_approvals', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2) where id=$1 and status='syncing_odoo'`, [id, msg]);
        return res.status(502).json({ ok: false, error: process.env.NODE_ENV === "development" ? `Error al sincronizar a Odoo: ${msg}` : "Error al sincronizar a Odoo. Reintenta." });
      }
    } catch (e) { next(e); }
  });

  router.post("/:id/acopio/request_production", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { notes } = req.body || {};
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) return res.status(403).json({ ok: false, error: "No sos dueño" });
      if (quote.fulfillment_mode !== "acopio") return res.status(400).json({ ok: false, error: "Solo aplica a portones en acopio" });
      if (quote.acopio_to_produccion_status === "pending") return res.json({ ok: true, quote });

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set acopio_to_produccion_status='pending',
            acopio_to_produccion_requested_by_user_id=$2,
            acopio_to_produccion_requested_at=now(),
            acopio_to_produccion_notes=$3,
            acopio_to_produccion_commercial_decision='pending',
            acopio_to_produccion_commercial_by_user_id=null,
            acopio_to_produccion_commercial_at=null,
            acopio_to_produccion_commercial_notes=null,
            acopio_to_produccion_technical_decision='pending',
            acopio_to_produccion_technical_by_user_id=null,
            acopio_to_produccion_technical_at=null,
            acopio_to_produccion_technical_notes=null
        where id=$1 and fulfillment_mode='acopio'
        returning *
        `,
        [id, Number(u.user_id), notes ? String(notes) : null]
      );
      res.json({ ok: true, quote: upd.rows?.[0] || quote });
    } catch (e) { next(e); }
  });

  async function finalizeAcopioToProduccionIfReady(id) {
    const r = await dbQuery(
      `
      update public.presupuestador_quotes
      set fulfillment_mode='produccion',
          acopio_to_produccion_status='approved',
          requires_measurement = case
            when exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $2) then true
            else requires_measurement
          end,
          measurement_status = case
            when catalog_kind='porton' and status='synced_odoo' and (
              requires_measurement = true
              or exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $2)
            ) and (measurement_status is null or measurement_status='none') then 'pending'
            else measurement_status
          end
      where id=$1
        and fulfillment_mode='acopio'
        and acopio_to_produccion_status='pending'
        and acopio_to_produccion_commercial_decision='approved'
        and acopio_to_produccion_technical_decision='approved'
      returning *
      `,
      [id, String(MEASUREMENT_PRODUCT_ID)]
    );
    return r.rows?.[0] || null;
  }

  router.post("/:id/acopio/review/commercial", requireRole("is_enc_comercial"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes } = req.body || {};
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (quote.fulfillment_mode !== "acopio") return res.json({ ok: true, quote });
      if (quote.acopio_to_produccion_status !== "pending") return res.json({ ok: true, quote });
      if (quote.acopio_to_produccion_commercial_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(
          `update public.presupuestador_quotes set acopio_to_produccion_status='rejected', acopio_to_produccion_commercial_decision='rejected', acopio_to_produccion_commercial_by_user_id=$2, acopio_to_produccion_commercial_at=now(), acopio_to_produccion_commercial_notes=$3 where id=$1 returning *`,
          [id, Number(u.user_id), msg]
        );
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const upd1 = await dbQuery(
        `update public.presupuestador_quotes set acopio_to_produccion_commercial_decision='approved', acopio_to_produccion_commercial_by_user_id=$2, acopio_to_produccion_commercial_at=now(), acopio_to_produccion_commercial_notes=$3 where id=$1 and fulfillment_mode='acopio' and acopio_to_produccion_status='pending' and acopio_to_produccion_commercial_decision='pending' returning *`,
        [id, Number(u.user_id), notes ? String(notes) : null]
      );
      const q1 = upd1.rows?.[0] || quote;
      const qFinal = await finalizeAcopioToProduccionIfReady(id);
      return res.json({ ok: true, quote: qFinal || q1 });
    } catch (e) { next(e); }
  });

  router.post("/:id/acopio/review/technical", requireRole("is_rev_tecnica"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes } = req.body || {};
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (quote.fulfillment_mode !== "acopio") return res.json({ ok: true, quote });
      if (quote.acopio_to_produccion_status !== "pending") return res.json({ ok: true, quote });
      if (quote.acopio_to_produccion_technical_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(
          `update public.presupuestador_quotes set acopio_to_produccion_status='rejected', acopio_to_produccion_technical_decision='rejected', acopio_to_produccion_technical_by_user_id=$2, acopio_to_produccion_technical_at=now(), acopio_to_produccion_technical_notes=$3 where id=$1 returning *`,
          [id, Number(u.user_id), msg]
        );
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const upd1 = await dbQuery(
        `update public.presupuestador_quotes set acopio_to_produccion_technical_decision='approved', acopio_to_produccion_technical_by_user_id=$2, acopio_to_produccion_technical_at=now(), acopio_to_produccion_technical_notes=$3 where id=$1 and fulfillment_mode='acopio' and acopio_to_produccion_status='pending' and acopio_to_produccion_technical_decision='pending' returning *`,
        [id, Number(u.user_id), notes ? String(notes) : null]
      );
      const q1 = upd1.rows?.[0] || quote;
      const qFinal = await finalizeAcopioToProduccionIfReady(id);
      return res.json({ ok: true, quote: qFinal || q1 });
    } catch (e) { next(e); }
  });

  router.post("/:id/move_to_produccion", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (String(quote.created_by_user_id) !== String(u.user_id)) return res.status(403).json({ ok: false, error: "No sos dueño" });
      if (quote.fulfillment_mode !== "acopio") return res.status(400).json({ ok: false, error: "Solo aplica a portones en acopio" });

      const nextMeas = quoteNeedsMeasurement(quote);
      const nextMeasStatus = nextMeas ? "pending" : "none";
      const upd = await dbQuery(`update public.presupuestador_quotes set fulfillment_mode='produccion', measurement_status=$2 where id=$1 returning *`, [id, nextMeasStatus]);
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) { next(e); }
  });

  // ============================================================
  // FINAL detallado a Odoo sobre la COPIA
  // ============================================================
  router.post("/:id/final/submit", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id invalido" });

      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const q = cur.rows?.[0];
      if (!q) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (q.quote_kind !== "copy") return res.status(400).json({ ok: false, error: "final/submit solo aplica a la COPIA" });
      if (String(q.created_by_user_id) !== String(u.user_id)) return res.status(403).json({ ok: false, error: "No sos dueño" });
      if (q.final_status === "synced_odoo" || q.final_status === "syncing_odoo") return res.json({ ok: true, quote: q });

      const custErr = validateEndCustomerRequired(q.end_customer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });
      const bizErr = validateBusinessRequired(q.payload || {}, q.catalog_kind || "porton");
      if (bizErr) return res.status(400).json({ ok: false, error: bizErr });

      const parentId = String(q.parent_quote_id || "").trim();
      if (!parentId) return res.status(400).json({ ok: false, error: "La copia no tiene parent_quote_id" });
      const pr = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [parentId]);
      const orig = pr.rows?.[0];
      if (!orig) return res.status(400).json({ ok: false, error: "No se encontro el original" });
      if (!orig.odoo_sale_order_id) return res.status(409).json({ ok: false, error: "El original todavía no fue enviado a Odoo" });
      if (quoteNeedsMeasurement(orig) && orig.measurement_status !== "approved") return res.status(409).json({ ok: false, error: "Primero debe estar aprobada la medición" });

      const updSync = await dbQuery(
        `
        update public.presupuestador_quotes
        set final_status='syncing_odoo',
            final_technical_decision='approved',
            final_logistics_decision='approved',
            final_technical_notes=null,
            final_logistics_notes=null
        where id=$1
          and coalesce(final_sale_order_id, 0) = 0
          and coalesce(final_status, 'draft') <> 'syncing_odoo'
        returning *
        `,
        [id]
      );
      const qSync = updSync.rows?.[0] || q;
      if (qSync.final_sale_order_id) return res.json({ ok: true, quote: qSync });

      try {
        const { order, metrics } = await syncFinalQuoteToOdoo({
          odoo,
          revisionQuote: qSync,
          originalQuote: orig,
          approverUser: u,
        });

        const updFinal = await dbQuery(
          `
          update public.presupuestador_quotes
          set final_status='synced_odoo',
              final_sale_order_id=$2,
              final_sale_order_name=$3,
              final_synced_at=now(),
              final_tolerance_percent=$4,
              final_tolerance_amount=$5,
              final_difference_amount=$6,
              final_absorbed_by_company=$7
          where id=$1
          returning *
          `,
          [
            id,
            Number(order.id),
            order.name,
            metrics.tolerance_percent,
            metrics.tolerance_amount,
            metrics.difference_amount,
            metrics.absorbed_by_company,
          ]
        );

        return res.json({ ok: true, quote: updFinal.rows?.[0] || qSync, order, metrics });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar cotización final a Odoo");
        console.error("FINAL SYNC ODOO ERROR:", msg);
        if (e?.odoo) console.error("ODOO:", e.odoo);
        if (e?.debug) console.error("ODOO DEBUG:", e.debug);
        await dbQuery(
          `update public.presupuestador_quotes set final_status='draft' where id=$1`,
          [id]
        );
        return res.status(502).json({ ok: false, error: process.env.NODE_ENV === "development" ? `Error al sincronizar cotización final a Odoo: ${msg}` : "Error al sincronizar cotización final a Odoo. Reintentá." });
      }
    } catch (e) { next(e); }
  });

  // Compatibilidad con el flujo final previo. Si se siguen usando, el sync detallado ya contempla tolerancia.
  router.post("/:id/final/review/technical", requireRole("is_rev_tecnica"), async (req, res, next) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const q = cur.rows?.[0];
      if (!q) return res.status(404).json({ ok: false, error: "No encontrado" });
      return res.json({ ok: true, quote: q });
    } catch (e) { next(e); }
  });

  router.post("/:id/final/review/logistics", requireRole("is_logistica"), async (req, res, next) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const q = cur.rows?.[0];
      if (!q) return res.status(404).json({ ok: false, error: "No encontrado" });
      return res.json({ ok: true, quote: q });
    } catch (e) { next(e); }
  });

  return router;
}

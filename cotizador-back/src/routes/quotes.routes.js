import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import { getCommercialFinalTolerancePercent } from "../settingsDb.js";

const MEASUREMENT_PRODUCT_ID = Number(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865);
const PLACEHOLDER_PRODUCT_ID = Number(process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 2880);
const IVA_RATE = 0.21;
const TACA_TACA_PLAN_NAME = String(process.env.ODOO_TACA_TACA_PLAN_NAME || "Taca Taca").trim();

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
function toScalar(v) { return Array.isArray(v) ? v[0] : v; }
function toIntId(v) { const n = Number(toScalar(v)); return Number.isFinite(n) ? n : null; }
function toText(v) { const x = toScalar(v); return x === null || x === undefined ? "" : String(x).trim(); }
function isUuid(v) { return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(v || "").trim()); }
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

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

function normalizeSellerDisplayName(value) {
  return String(value || "").trim();
}
async function getCreatorDisplayData(createdByUserId) {
  try {
    const r = await dbQuery(`select full_name, username from public.presupuestador_users where id=$1 limit 1`, [Number(createdByUserId)]);
    const row = r.rows?.[0] || {};
    return {
      full_name: normalizeSellerDisplayName(row.full_name),
      username: normalizeSellerDisplayName(row.username),
    };
  } catch {
    return { full_name: "", username: "" };
  }
}
async function resolveSellerDisplayNameForQuote(quote, fallbackUser = null) {
  const directFullName = normalizeSellerDisplayName(quote?.created_by_full_name || quote?.seller_name || quote?.sellerName);
  if (directFullName) return directFullName;
  const directUsername = normalizeSellerDisplayName(quote?.created_by_username);
  if (directUsername) return directUsername;
  const created = await getCreatorDisplayData(quote?.created_by_user_id);
  if (created.full_name) return created.full_name;
  if (created.username) return created.username;
  return normalizeSellerDisplayName(fallbackUser?.full_name || fallbackUser?.username || "");
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

function vendedorNeedsEndCustomerName(quote) { return quote?.created_by_role === "vendedor"; }
function getEndCustomerName(quote) { return String(quote?.end_customer?.name || "").trim(); }
function validateEndCustomerDraft(end_customer) {
  const name = String(end_customer?.name || "").trim();
  if (!name) return "Falta end_customer.name";
  return null;
}
function validateEndCustomerRequired(end_customer) {
  const c = end_customer || {};
  if (!String(c.name || "").trim()) return "Falta end_customer.name";
  if (!String(c.phone || "").trim()) return "Falta end_customer.phone";
  if (!String(c.address || "").trim()) return "Falta end_customer.address";
  if (!String(c.maps_url || "").trim()) return "Falta end_customer.maps_url";
  return null;
}
function validateBusinessRequired(payload, catalog_kind) {
  const p = payload || {};
  if (!String(p.payment_method || "").trim()) return "Falta payload.payment_method";
  if (String(p.condition_mode || "") === "special" && !String(p.condition_text || "").trim()) return "Falta payload.condition_text (condicion especial)";
  if (String(catalog_kind || "porton").toLowerCase().trim() === "porton" && !String(p.porton_type || "").trim()) return "Falta payload.porton_type";
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
  return round2(subtotal + round2(subtotal * IVA_RATE));
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
    .replace(/[\u0300-\u036f]/g, "")
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
  const mapped = PORTON_TYPE_TO_ODOO_PRODUCT_ID[String(rawPortonType || "").trim()] ?? PORTON_TYPE_TO_ODOO_PRODUCT_ID[normalizedPortonType];
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
async function renameOrderToReference(odoo, orderId, reference) {
  const ref = toText(reference);
  if (!orderId || !ref) return null;
  try {
    await odoo.executeKw("sale.order", "write", [[Number(orderId)], { name: ref, origin: ref, client_order_ref: ref }]);
  } catch {
    // Si no deja escribir el name, igual quedan origin/client_order_ref.
  }
  const [order] = await odoo.executeKw("sale.order", "read", [[Number(orderId)]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id", "origin", "client_order_ref"],
  });
  return order || null;
}

const ODOO_SALE_ORDER_VENDOR_FIELD_CANDIDATES = Object.freeze([
  "x_studio_vendedora",
  "x_studio_vendedor",
  "x_vendedor",
  "x_vendedor_presupuestador",
]);
let saleOrderVendorFieldCache = undefined;
async function resolveSaleOrderVendorFieldMeta(odoo) {
  if (saleOrderVendorFieldCache !== undefined) return saleOrderVendorFieldCache;
  const preferred = normalizeSellerDisplayName(process.env.ODOO_SALE_ORDER_VENDOR_FIELD);
  const candidates = [preferred, ...ODOO_SALE_ORDER_VENDOR_FIELD_CANDIDATES].filter(Boolean);
  try {
    const fields = await odoo.executeKw("sale.order", "fields_get", [], { attributes: ["string", "type", "relation"] });
    for (const fieldName of candidates) {
      const meta = fields?.[fieldName];
      if (!meta) continue;
      saleOrderVendorFieldCache = {
        name: fieldName,
        type: String(meta.type || "").trim(),
        relation: String(meta.relation || "").trim(),
      };
      return saleOrderVendorFieldCache;
    }
  } catch {}
  saleOrderVendorFieldCache = null;
  return saleOrderVendorFieldCache;
}
async function resolveEmployeeIdByName(odoo, employeeName) {
  const name = normalizeSellerDisplayName(employeeName);
  if (!name) return null;
  try {
    const exactIds = await odoo.executeKw("hr.employee", "search", [[["name", "=", name]]], { limit: 1 });
    const exactId = toIntId(exactIds?.[0]);
    if (exactId) return exactId;
  } catch {}
  try {
    const ilikeIds = await odoo.executeKw("hr.employee", "search", [[["name", "ilike", name]]], { limit: 1 });
    return toIntId(ilikeIds?.[0]);
  } catch {
    return null;
  }
}
async function applySellerToSaleOrder(odoo, orderId, sellerName) {
  const cleanName = normalizeSellerDisplayName(sellerName);
  if (!orderId || !cleanName) return;
  const fieldMeta = await resolveSaleOrderVendorFieldMeta(odoo);
  if (!fieldMeta?.name) return;
  try {
    if (fieldMeta.type === "many2one" && ["hr.employee", "hr.employee.public"].includes(fieldMeta.relation)) {
      const employeeId = await resolveEmployeeIdByName(odoo, cleanName);
      if (!employeeId) return;
      await odoo.executeKw("sale.order", "write", [[Number(orderId)], { [fieldMeta.name]: employeeId }]);
      return;
    }
    await odoo.executeKw("sale.order", "write", [[Number(orderId)], { [fieldMeta.name]: cleanName }]);
  } catch {}
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
  const raw = toText(paymentMethod);
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

function buildFinancingEmptyValue(fieldMeta) {
  if (!fieldMeta?.type) return false;
  if (["integer", "float", "monetary"].includes(fieldMeta.type)) return 0;
  return false;
}

let saleOrderFinancingFieldCache = undefined;
async function resolveSaleOrderFinancingFieldMeta(odoo) {
  if (saleOrderFinancingFieldCache !== undefined) return saleOrderFinancingFieldCache;
  try {
    const fields = await odoo.executeKw("sale.order", "fields_get", [], { attributes: ["type", "relation", "selection"] });
    const pick = (name) => fields?.[name] ? { name, type: String(fields[name].type || "").trim(), relation: String(fields[name].relation || "").trim() } : null;
    saleOrderFinancingFieldCache = {
      planField: pick("financing_plan_id"),
      cardTypeField: pick("financing_card_type"),
      rateField: pick("financing_rate_id"),
      ratePercentField: pick("financing_rate_percent"),
    };
    return saleOrderFinancingFieldCache;
  } catch {
    saleOrderFinancingFieldCache = null;
    return saleOrderFinancingFieldCache;
  }
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
    let rows = await odoo.executeKw("sale.financing.rate", "search_read", [domain], { fields, limit: 1, order: "id desc" });
    let rate = rows?.[0] || null;
    if (!rate) {
      rows = await odoo.executeKw("sale.financing.rate", "search_read", [baseDomain], { fields, limit: 1, order: "id desc" });
      rate = rows?.[0] || null;
    }
    return rate;
  } catch {
    return null;
  }
}

async function buildFinancingSaleOrderVals(odoo, paymentMethod) {
  const fieldMeta = await resolveSaleOrderFinancingFieldMeta(odoo);
  if (!fieldMeta) return {};

  const empty = {};
  for (const meta of [fieldMeta.planField, fieldMeta.cardTypeField, fieldMeta.rateField, fieldMeta.ratePercentField]) {
    if (meta?.name) empty[meta.name] = buildFinancingEmptyValue(meta);
  }

  const parsed = parseTacaTacaPaymentMethod(paymentMethod);
  if (!parsed) return empty;

  const planId = await resolveTacaTacaPlanId(odoo);
  if (!planId) return empty;
  const rate = await resolveTacaTacaRate(odoo, { planId, cardType: parsed.cardType, installments: parsed.installments });
  if (!rate?.id) return empty;

  const vals = { ...empty };
  if (fieldMeta.planField?.name) vals[fieldMeta.planField.name] = Number(planId);
  if (fieldMeta.cardTypeField?.name) vals[fieldMeta.cardTypeField.name] = String(parsed.cardType);
  if (fieldMeta.rateField?.name) vals[fieldMeta.rateField.name] = Number(rate.id);
  if (fieldMeta.ratePercentField?.name) {
    const percentFieldName = (await resolveFinancingRateFieldMeta(odoo))?.percentField;
    const rawPercent = percentFieldName ? rate?.[percentFieldName] : null;
    vals[fieldMeta.ratePercentField.name] = rawPercent === null || rawPercent === undefined || rawPercent === ""
      ? buildFinancingEmptyValue(fieldMeta.ratePercentField)
      : Number(rawPercent);
  }
  return vals;
}

async function submitLinkedDoorsForQuote({ quote, isDistributor = false }) {
  if (!quote?.id) return;
  const r = await dbQuery(`select id, record from public.presupuestador_doors where linked_quote_id=$1`, [quote.id]);
  for (const row of (r.rows || [])) {
    const currentRecord = row.record && typeof row.record === "object" ? { ...row.record } : {};
    const nextRecord = {
      ...currentRecord,
      fulfillment_mode: String(quote.fulfillment_mode || currentRecord.fulfillment_mode || "").trim(),
    };
    await dbQuery(
      `update public.presupuestador_doors
          set status='pending_approvals',
              commercial_decision=$2,
              technical_decision='pending',
              commercial_notes=case when $2='approved' then 'AUTO: distribuidor' else null end,
              technical_notes=null,
              record=$3::jsonb,
              updated_at=now()
        where id=$1`,
      [Number(row.id), isDistributor ? "approved" : "pending", JSON.stringify(nextRecord)]
    );
  }
}

function appendPaymentMethodToNote(note, paymentMethod) {
  const pm = toText(paymentMethod);
  if (!pm) return note;
  return `${note}\nForma de pago: ${pm}`;
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
  const sellerName = await resolveSellerDisplayNameForQuote(quote, approverUser);
  const requestedInitialProductId = getInitialOdooProductIdForQuote(quote);
  const initialProduct = await resolveInitialOdooProduct(odoo, requestedInitialProductId);

  const orderLines = [[0, 0, {
    product_id: Number(initialProduct.productId),
    product_uom_qty: 1,
    product_uom: initialProduct.uomId,
    name: initialProduct.productName,
    price_unit: round2(total),
  }]];

  const noteBase = quote.created_by_role === "distribuidor"
    ? buildDistributorNote({ quote })
    : `PRESUPUESTADOR QUOTE: ${quote.id}\nDestino: ${quote.fulfillment_mode === "acopio" ? "ACOPIO" : "PRODUCCION"}`
      + (quote?.end_customer?.maps_url ? `\nMaps: ${quote.end_customer.maps_url}` : "")
      + (quote.note ? `\n${quote.note}` : "");
  let note = noteBase + (sellerName ? `\nVendedor: ${sellerName}` : "");
  note = appendPaymentMethodToNote(note, quote?.payload?.payment_method);

  const financingVals = await buildFinancingSaleOrderVals(odoo, quote?.payload?.payment_method);
  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    note,
    ...financingVals,
  }]);
  const orderId = toIntId(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order en Odoo");
  await applySellerToSaleOrder(odoo, orderId, sellerName);

  const orderReference = quote?.quote_number ? `S${quote.quote_number}` : null;
  const order = orderReference
    ? (await renameOrderToReference(odoo, orderId, orderReference))
    : (await odoo.executeKw("sale.order", "read", [[orderId]], { fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id"] }))?.[0];
  return { order, deposit_amount: round2(total) };
}

async function syncFinalQuoteToOdoo({ odoo, revisionQuote, originalQuote, approverUser }) {
  const pricelistId = toIntId(revisionQuote?.pricelist_id) || toIntId(originalQuote?.pricelist_id) || 1;
  const sellerName = await resolveSellerDisplayNameForQuote(originalQuote, approverUser);
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
    orderLines.push([0, 0, { product_id: productId, product_uom_qty: qty, product_uom: uomId, name: p.name, price_unit: priceUnit }]);
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
  const referenceNv = originalQuote.odoo_sale_order_name ? `NV${originalQuote.odoo_sale_order_name}` : `NV${String(originalQuote.id).slice(0, 8)}`;
  let note = `PRESUPUESTADOR FINAL: COPY ${revisionQuote.id} (ORIG ${originalQuote.id})`
    + `\nReferencia: ${referenceNv}`
    + `\nReferencia seña: ${originalQuote.odoo_sale_order_name || originalQuote.odoo_sale_order_id || "-"}`
    + `\nTotal detallado: ${detailedTotal}`
    + `\nAnticipo descontado: ${advanceToDiscount}`
    + `\nDiferencia original: ${rawDifference}`
    + `\nTolerancia comercial %: ${tolerancePercent}`
    + `\nTolerancia comercial monto: ${toleranceAmount}`
    + (absorbedByCompany ? `\nAbsorbido por la empresa: SI` : `\nAbsorbido por la empresa: NO`)
    + `\nImporte final a facturar: ${finalAmountToCharge}`
    + (sellerName ? `\nVendedor: ${sellerName}` : "");
  note = appendPaymentMethodToNote(note, revisionQuote?.payload?.payment_method || originalQuote?.payload?.payment_method);

  const financingVals = await buildFinancingSaleOrderVals(odoo, revisionQuote?.payload?.payment_method || originalQuote?.payload?.payment_method);
  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    origin: referenceNv,
    client_order_ref: referenceNv,
    note,
    ...financingVals,
  }]);
  const orderId = toIntId(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order final en Odoo");
  await applySellerToSaleOrder(odoo, orderId, sellerName);
  const order = await renameOrderToReference(odoo, orderId, referenceNv);
  if (!order?.id) throw new Error("No se pudo leer sale.order final en Odoo");

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
      reference_nv: referenceNv,
    },
  };
}

async function syncDirectProductionFinalToOdoo({ odoo, quote, approverUser }) {
  const pricelistId = toIntId(quote?.pricelist_id) || 1;
  const sellerName = await resolveSellerDisplayNameForQuote(quote, approverUser);
  let partnerId = null;
  if (quote.created_by_role === "distribuidor") {
    partnerId = toIntId(quote?.bill_to_odoo_partner_id) || await getCreatorOdooPartnerId(quote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
    if (!partnerId) throw new Error("Distribuidor sin partner en Odoo");
  } else {
    partnerId = await findOrCreateCustomerPartner(odoo, quote.end_customer || {});
  }
  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id invalido para Odoo");

  const initialProduct = await resolveInitialOdooProduct(odoo, getInitialOdooProductIdForQuote(quote));
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  if (!lines.length) throw new Error("El presupuesto no tiene items");

  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean).concat([Number(initialProduct.productId)]))];
  const products = await odoo.executeKw("product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));

  const orderLines = [[0, 0, {
    product_id: Number(initialProduct.productId),
    product_uom_qty: 1,
    product_uom: initialProduct.uomId,
    name: initialProduct.productName,
    price_unit: 0,
  }]];

  let detailedTotal = 0;
  for (const l of lines) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1) || 1;
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);
    const uomId = toIntId(p?.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);
    const priceUnit = calcDetailedUnitWithIva(l, quote.payload || {});
    detailedTotal = round2(detailedTotal + (qty * priceUnit));
    orderLines.push([0, 0, { product_id: productId, product_uom_qty: qty, product_uom: uomId, name: p.name, price_unit: priceUnit }]);
  }

  let note = `PRESUPUESTADOR FINAL DIRECTO: ${quote.id}`
    + `\nDestino: PRODUCCION`
    + `\nPortón sin medición: se envía el detalle completo sin instancia adicional de edición.`
    + (quote.note ? `\n${quote.note}` : "")
    + (sellerName ? `\nVendedor: ${sellerName}` : "");
  note = appendPaymentMethodToNote(note, quote?.payload?.payment_method);

  const financingVals = await buildFinancingSaleOrderVals(odoo, quote?.payload?.payment_method);
  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    note,
    ...financingVals,
  }]);
  const orderId = toIntId(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order final directa en Odoo");
  await applySellerToSaleOrder(odoo, orderId, sellerName);
  const [createdOrder] = await odoo.executeKw("sale.order", "read", [[orderId]], { fields: ["id", "name"] });
  const referenceNv = createdOrder?.name ? `NV${createdOrder.name}` : `NV${String(quote.id).slice(0, 8)}`;
  const order = await renameOrderToReference(odoo, orderId, referenceNv);
  if (!order?.id) throw new Error("No se pudo leer sale.order directa en Odoo");

  return {
    order,
    metrics: {
      detailed_total: detailedTotal,
      reference_nv: referenceNv,
    },
  };
}

async function markSyncingIfReady(id) {
  const r = await dbQuery(
    `update public.presupuestador_quotes set status='syncing_odoo' where id=$1 and status='pending_approvals' and commercial_decision='approved' and technical_decision='approved' and odoo_sale_order_id is null returning *`,
    [id]
  );
  return r.rows?.[0] || null;
}
async function normalizeIfSyncingButHasOrder(id) {
  const r = await dbQuery(`update public.presupuestador_quotes set status='synced_odoo' where id=$1 and status='syncing_odoo' and odoo_sale_order_id is not null returning *`, [id]);
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
  const r = await dbQuery(`select * from public.presupuestador_quotes where quote_kind='copy' and parent_quote_id=$1 order by created_at desc nulls last, id desc limit 1`, [parentId]);
  return r.rows?.[0] || null;
}
async function ensureFinalCopyForAcopioToProduction(quote) {
  if (!quote || quote.fulfillment_mode !== "produccion" || quoteNeedsMeasurement(quote)) return null;
  const existing = await getFinalCopyByParentId(quote.id);
  if (existing) return existing;
  return await createEditCopyFromQuote(quote.id);
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
      const created_by_role = (body.created_by_role === "distribuidor" || body.created_by_role === "vendedor") ? body.created_by_role : (u.is_distribuidor ? "distribuidor" : "vendedor");
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
      if (created_by_role === "distribuidor" && !bill_to_odoo_partner_id) bill_to_odoo_partner_id = u.odoo_partner_id ? Number(u.odoo_partner_id) : null;

      const q = await dbQuery(
        `insert into public.presupuestador_quotes (quote_kind, parent_quote_id, created_by_user_id, created_by_role, fulfillment_mode, pricelist_id, bill_to_odoo_partner_id, end_customer, lines, payload, note, catalog_kind, status, commercial_decision, technical_decision, requires_measurement)
         values ('original', null, $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, 'draft', 'pending', 'pending', $11)
         returning *`,
        [Number(u.user_id), created_by_role, fulfillment_mode, pricelist_id, bill_to_odoo_partner_id, JSON.stringify(end_customer), JSON.stringify(lines), JSON.stringify(payload), note, catalog_kind, hasMeasurementLine(lines)]
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
      const lateralFinal = `left join lateral (
        select c.id as final_copy_id,
               c.final_status as final_copy_status,
               c.final_sale_order_name as final_copy_sale_order_name,
               c.status as final_copy_quote_status
        from public.presupuestador_quotes c
        where c.quote_kind = 'copy'
          and c.parent_quote_id = q.id
        order by c.created_at desc nulls last, c.id desc
        limit 1
      ) fc on true`;

      if (scope === "mine") {
        if (!u.is_vendedor && !u.is_distribuidor) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name, fc.final_copy_id, fc.final_copy_status, fc.final_copy_sale_order_name, fc.final_copy_quote_status
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               ${lateralFinal}
               where ${onlyOriginal} and q.created_by_user_id = $1
               order by q.created_at desc nulls last, q.id desc
               limit 200`;
        params = [Number(u.user_id)];
      } else if (scope === "commercial_inbox") {
        if (!u.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               where ${onlyOriginal} and q.created_by_role = 'vendedor'
                 and ((status = 'pending_approvals' and commercial_decision in ('pending','approved')) or (status = 'draft' and technical_decision = 'rejected'))
               order by q.created_at desc nulls last, q.id desc limit 200`;
      } else if (scope === "technical_inbox") {
        if (!u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               where ${onlyOriginal}
                 and ((status = 'pending_approvals' and technical_decision in ('pending','approved')) or (status = 'draft' and commercial_decision = 'rejected'))
               order by q.created_at desc nulls last, q.id desc limit 200`;
      } else if (scope === "commercial_acopio") {
        if (!u.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               where ${onlyOriginal} and q.fulfillment_mode = 'acopio' and acopio_to_produccion_status = 'pending'
               order by q.acopio_to_produccion_requested_at desc nulls last, q.id desc limit 200`;
      } else if (scope === "technical_acopio") {
        if (!u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               where ${onlyOriginal} and q.fulfillment_mode = 'acopio' and acopio_to_produccion_status = 'pending'
               order by q.acopio_to_produccion_requested_at desc nulls last, q.id desc limit 200`;
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
      const r = await dbQuery(
        `select q.*, fc.final_copy_id, fc.final_copy_status, fc.final_copy_sale_order_name, fc.final_copy_quote_status
         from public.presupuestador_quotes q
         left join lateral (
           select c.id as final_copy_id,
                  c.final_status as final_copy_status,
                  c.final_sale_order_name as final_copy_sale_order_name,
                  c.status as final_copy_quote_status
           from public.presupuestador_quotes c
           where c.quote_kind = 'copy' and c.parent_quote_id = q.id
           order by c.created_at desc nulls last, c.id desc
           limit 1
         ) fc on true
         where q.id=$1`,
        [id]
      );
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
        `update public.presupuestador_quotes set fulfillment_mode=$2, pricelist_id=$3, bill_to_odoo_partner_id=$4, end_customer=$5::jsonb, lines=$6::jsonb, payload=$7::jsonb, note=$8, catalog_kind=$9, requires_measurement=$10 where id=$1 returning *`,
        [id, fulfillment_mode, body.pricelist_id ? Number(body.pricelist_id) : quote.pricelist_id, body.bill_to_odoo_partner_id !== undefined ? (body.bill_to_odoo_partner_id ? Number(body.bill_to_odoo_partner_id) : null) : quote.bill_to_odoo_partner_id, JSON.stringify(body.end_customer !== undefined ? body.end_customer : quote.end_customer), JSON.stringify(body.lines !== undefined ? body.lines : quote.lines), JSON.stringify(body.payload !== undefined ? body.payload : quote.payload), body.note !== undefined ? body.note : quote.note, catalog_kind, hasMeasurementLine(body.lines !== undefined ? body.lines : quote.lines)]
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
      const reqMeas = hasMeasurementLine(quote.lines);
      const nextMeasStatus = fm === "produccion" && reqMeas ? "pending" : "none";
      const upd = await dbQuery(
        `update public.presupuestador_quotes
         set status='pending_approvals',
             fulfillment_mode=$2,
             confirmed_at=now(),
             requires_measurement=$5,
             measurement_status=$6,
             commercial_decision=$3,
             technical_decision=$4,
             commercial_by_user_id=null,
             commercial_at=null,
             technical_by_user_id=null,
             technical_at=null,
             commercial_notes = case when $3='approved' and created_by_role='distribuidor' then 'AUTO: distribuidor' else null end,
             technical_notes=null,
             rejection_notes=null
         where id=$1
         returning *`,
        [id, fm, isDistributor ? "approved" : "pending", "pending", reqMeas, nextMeasStatus]
      );
      const confirmed = upd.rows?.[0] || quote;
      await submitLinkedDoorsForQuote({ quote: confirmed, isDistributor });
      try {
        if (fm === "acopio") {
          const exists = await getFinalCopyByParentId(id);
          if (!exists) await createEditCopyFromQuote(id);
        }
      } catch {}
      res.json({ ok: true, quote: confirmed });
    } catch (e) { next(e); }
  });

  async function handleReadyQuoteSync({ qSync, approverUser }) {
    const directFinal = qSync.fulfillment_mode === "produccion" && !quoteNeedsMeasurement(qSync);
    if (directFinal) {
      const { order } = await syncDirectProductionFinalToOdoo({ odoo, quote: qSync, approverUser });
      const upd = await dbQuery(
        `update public.presupuestador_quotes set status='synced_odoo', odoo_sale_order_id=$2, odoo_sale_order_name=$3, deposit_amount=0, final_status='synced_odoo', final_sale_order_id=$2, final_sale_order_name=$3, final_synced_at=now(), final_tolerance_percent=0, final_tolerance_amount=0, final_difference_amount=0, final_absorbed_by_company=false, requires_measurement=false, measurement_status='none' where id=$1 returning *`,
        [qSync.id, Number(order.id), order.name]
      );
      return { quote: upd.rows?.[0] || qSync, order, directFinal: true };
    }

    const { order, deposit_amount } = await syncQuoteToOdoo({ odoo, quote: qSync, approverUser });
    const upd2 = await dbQuery(
      `update public.presupuestador_quotes set status='synced_odoo', odoo_sale_order_id=$2, odoo_sale_order_name=$3, deposit_amount=$4, requires_measurement = case when exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $5) then true else requires_measurement end, measurement_status = case when fulfillment_mode='produccion' and (requires_measurement = true or exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $5)) and (measurement_status is null or measurement_status='none') then 'pending' else measurement_status end where id=$1 and status='syncing_odoo' returning *`,
      [qSync.id, Number(order.id), order.name, deposit_amount, String(MEASUREMENT_PRODUCT_ID)]
    );
    return { quote: upd2.rows?.[0] || qSync, order, directFinal: false };
  }

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
        const upd = await dbQuery(`update public.presupuestador_quotes set status='draft', commercial_decision='rejected', commercial_by_user_id=$2, commercial_at=now(), commercial_notes=$3, rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'COMERCIAL: ' || $3) where id=$1 returning *`, [id, Number(u.user_id), msg]);
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
      const upd1 = await dbQuery(`update public.presupuestador_quotes set commercial_decision='approved', commercial_by_user_id=$2, commercial_at=now(), commercial_notes=$3 where id=$1 and status='pending_approvals' and commercial_decision='pending' returning *`, [id, Number(u.user_id), notes || null]);
      const q1 = upd1.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
      const qSync = await markSyncingIfReady(id);
      if (!qSync) return res.json({ ok: true, quote: q1 });
      if (vendedorNeedsEndCustomerName(qSync) && !getEndCustomerName(qSync)) {
        await dbQuery(`update public.presupuestador_quotes set status='draft', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'VALIDACION: Falta end_customer.name (vendedor)') where id=$1 and status='syncing_odoo'`, [id]);
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }
      try {
        const result = await handleReadyQuoteSync({ qSync, approverUser: u });
        return res.json({ ok: true, quote: result.quote, order: result.order });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar a Odoo");
        console.error("SYNC ODOO ERROR:", msg);
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
        const upd = await dbQuery(`update public.presupuestador_quotes set status='draft', technical_decision='rejected', technical_by_user_id=$2, technical_at=now(), technical_notes=$3, rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'TECNICA: ' || $3) where id=$1 returning *`, [id, Number(u.user_id), msg]);
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
      const upd1 = await dbQuery(`update public.presupuestador_quotes set technical_decision='approved', technical_by_user_id=$2, technical_at=now(), technical_notes=$3 where id=$1 and status='pending_approvals' and technical_decision='pending' returning *`, [id, Number(u.user_id), notes || null]);
      const q1 = upd1.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
      const qSync = await markSyncingIfReady(id);
      if (!qSync) return res.json({ ok: true, quote: q1 });
      if (vendedorNeedsEndCustomerName(qSync) && !getEndCustomerName(qSync)) {
        await dbQuery(`update public.presupuestador_quotes set status='draft', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'VALIDACION: Falta end_customer.name (vendedor)') where id=$1 and status='syncing_odoo'`, [id]);
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }
      try {
        const result = await handleReadyQuoteSync({ qSync, approverUser: u });
        return res.json({ ok: true, quote: result.quote, order: result.order });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar a Odoo");
        console.error("SYNC ODOO ERROR:", msg);
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
      if (quote.status !== "synced_odoo") return res.status(409).json({ ok: false, error: "Primero debe quedar aprobado y enviado a Odoo" });
      if (quote.acopio_to_produccion_status === "pending") return res.json({ ok: true, quote });
      const upd = await dbQuery(
        `update public.presupuestador_quotes set acopio_to_produccion_status='pending', acopio_to_produccion_requested_by_user_id=$2, acopio_to_produccion_requested_at=now(), acopio_to_produccion_notes=$3, acopio_to_produccion_commercial_decision='pending', acopio_to_produccion_commercial_by_user_id=null, acopio_to_produccion_commercial_at=null, acopio_to_produccion_commercial_notes=null, acopio_to_produccion_technical_decision='pending', acopio_to_produccion_technical_by_user_id=null, acopio_to_produccion_technical_at=null, acopio_to_produccion_technical_notes=null where id=$1 and fulfillment_mode='acopio' returning *`,
        [id, Number(u.user_id), notes ? String(notes) : null]
      );
      res.json({ ok: true, quote: upd.rows?.[0] || quote });
    } catch (e) { next(e); }
  });

  async function finalizeAcopioToProduccionIfReady(id) {
    const r = await dbQuery(
      `update public.presupuestador_quotes set fulfillment_mode='produccion', acopio_to_produccion_status='approved', requires_measurement = case when exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $2) then true else requires_measurement end, measurement_status = case when catalog_kind='porton' and status='synced_odoo' and (requires_measurement = true or exists (select 1 from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem where (elem->>'product_id') = $2)) and (measurement_status is null or measurement_status='none') then 'pending' else measurement_status end where id=$1 and fulfillment_mode='acopio' and acopio_to_produccion_status='pending' and acopio_to_produccion_commercial_decision='approved' and acopio_to_produccion_technical_decision='approved' returning *`,
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
        const upd = await dbQuery(`update public.presupuestador_quotes set acopio_to_produccion_status='rejected', acopio_to_produccion_commercial_decision='rejected', acopio_to_produccion_commercial_by_user_id=$2, acopio_to_produccion_commercial_at=now(), acopio_to_produccion_commercial_notes=$3 where id=$1 returning *`, [id, Number(u.user_id), msg]);
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
      const upd1 = await dbQuery(`update public.presupuestador_quotes set acopio_to_produccion_commercial_decision='approved', acopio_to_produccion_commercial_by_user_id=$2, acopio_to_produccion_commercial_at=now(), acopio_to_produccion_commercial_notes=$3 where id=$1 and fulfillment_mode='acopio' and acopio_to_produccion_status='pending' and acopio_to_produccion_commercial_decision='pending' returning *`, [id, Number(u.user_id), notes ? String(notes) : null]);
      const q1 = upd1.rows?.[0] || quote;
      const qFinal = await finalizeAcopioToProduccionIfReady(id);
      if (qFinal && !quoteNeedsMeasurement(qFinal)) await ensureFinalCopyForAcopioToProduction(qFinal);
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
        const upd = await dbQuery(`update public.presupuestador_quotes set acopio_to_produccion_status='rejected', acopio_to_produccion_technical_decision='rejected', acopio_to_produccion_technical_by_user_id=$2, acopio_to_produccion_technical_at=now(), acopio_to_produccion_technical_notes=$3 where id=$1 returning *`, [id, Number(u.user_id), msg]);
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
      const upd1 = await dbQuery(`update public.presupuestador_quotes set acopio_to_produccion_technical_decision='approved', acopio_to_produccion_technical_by_user_id=$2, acopio_to_produccion_technical_at=now(), acopio_to_produccion_technical_notes=$3 where id=$1 and fulfillment_mode='acopio' and acopio_to_produccion_status='pending' and acopio_to_produccion_technical_decision='pending' returning *`, [id, Number(u.user_id), notes ? String(notes) : null]);
      const q1 = upd1.rows?.[0] || quote;
      const qFinal = await finalizeAcopioToProduccionIfReady(id);
      if (qFinal && !quoteNeedsMeasurement(qFinal)) await ensureFinalCopyForAcopioToProduction(qFinal);
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
      const updSync = await dbQuery(`update public.presupuestador_quotes set final_status='syncing_odoo', final_technical_decision='approved', final_logistics_decision='approved', final_technical_notes=null, final_logistics_notes=null where id=$1 and coalesce(final_sale_order_id, 0) = 0 and coalesce(final_status, 'draft') <> 'syncing_odoo' returning *`, [id]);
      const qSync = updSync.rows?.[0] || q;
      if (qSync.final_sale_order_id) return res.json({ ok: true, quote: qSync });
      try {
        const { order, metrics } = await syncFinalQuoteToOdoo({ odoo, revisionQuote: qSync, originalQuote: orig, approverUser: u });
        const updFinal = await dbQuery(`update public.presupuestador_quotes set final_status='synced_odoo', final_sale_order_id=$2, final_sale_order_name=$3, final_synced_at=now(), final_tolerance_percent=$4, final_tolerance_amount=$5, final_difference_amount=$6, final_absorbed_by_company=$7 where id=$1 returning *`, [id, Number(order.id), order.name, metrics.tolerance_percent, metrics.tolerance_amount, metrics.difference_amount, metrics.absorbed_by_company]);
        return res.json({ ok: true, quote: updFinal.rows?.[0] || qSync, order, metrics });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar cotización final a Odoo");
        console.error("FINAL SYNC ODOO ERROR:", msg);
        await dbQuery(`update public.presupuestador_quotes set final_status='draft' where id=$1`, [id]);
        return res.status(502).json({ ok: false, error: process.env.NODE_ENV === "development" ? `Error al sincronizar cotización final a Odoo: ${msg}` : "Error al sincronizar cotización final a Odoo. Reintentá." });
      }
    } catch (e) { next(e); }
  });

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

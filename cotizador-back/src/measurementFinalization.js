import { dbQuery } from "./db.js";
import { getCommercialFinalTolerancePercent, getMeasurementProductMappings } from "./settingsDb.js";

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
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}
function normalizeMeasurementMode(value) {
  return String(value || "medidor").toLowerCase().trim() === "tecnica_only" ? "tecnica_only" : "medidor";
}
function normalizeMeasurementSubtype(value) {
  return String(value || "normal").toLowerCase().trim() === "sin_medicion" ? "sin_medicion" : "normal";
}
function isTecnicaOnlyQuote(quote) {
  return normalizeMeasurementMode(quote?.measurement_mode) === "tecnica_only"
    || normalizeMeasurementSubtype(quote?.measurement_subtype) === "sin_medicion";
}
function normalizeBoolish(v) {
  const s = String(v ?? "").toLowerCase().trim();
  if (["true", "1", "si", "sí", "yes"].includes(s)) return "si";
  if (["false", "0", "no"].includes(s)) return "no";
  return s;
}
function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}
function normalizeValue(v) {
  if (typeof v === "boolean") return v ? "si" : "no";
  if (v === null || v === undefined) return "";
  return normalizeBoolish(String(v).trim().toLowerCase());
}
function buildMeasurementLinesFromRules(form, rules) {
  const out = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule?.active || !rule?.field_key) continue;
    const values = Array.isArray(rule.values) ? rule.values : [];
    const current = getByPath(form, rule.field_key);
    const currentNorm = normalizeValue(current);

    for (const entry of values) {
      if (!entry?.product_id) continue;
      const expectedNorm = normalizeValue(entry.expected_value || "");
      const matches = expectedNorm ? currentNorm === expectedNorm : !!currentNorm;
      if (!matches) continue;

      out.push({
        product_id: Number(entry.product_id),
        qty: 1,
        name: String(entry.label || rule.label || rule.field_key || `Producto ${entry.product_id}`).trim(),
        raw_name: String(entry.label || rule.label || rule.field_key || `Producto ${entry.product_id}`).trim(),
        code: null,
        basePrice: 0,
      });
    }
  }
  return out;
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

function normalizePhoneForLookup(v) { return String(v || "").replace(/\D+/g, "").trim(); }
function normalizeNameForLookup(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
function partnerLooksLikeSameCustomer(partner, customer) {
  const partnerName = normalizeNameForLookup(partner?.name);
  const customerName = normalizeNameForLookup(customer?.name);
  if (!partnerName || !customerName || partnerName !== customerName) return false;

  const customerEmail = toText(customer?.email).toLowerCase();
  const partnerEmail = toText(partner?.email).toLowerCase();
  if (customerEmail && partnerEmail && customerEmail === partnerEmail) return true;

  const customerPhone = normalizePhoneForLookup(customer?.phone);
  const partnerPhone = normalizePhoneForLookup(partner?.phone || partner?.mobile);
  if (customerPhone && partnerPhone && customerPhone === partnerPhone) return true;

  const customerStreet = normalizeNameForLookup(customer?.street || customer?.address);
  const partnerStreet = normalizeNameForLookup(partner?.street);
  if (customerStreet && partnerStreet && customerStreet === partnerStreet) return true;

  const customerCity = normalizeNameForLookup(customer?.city);
  const partnerCity = normalizeNameForLookup(partner?.city);
  if (customerCity && partnerCity && customerCity === partnerCity) return true;

  return !customerEmail && !customerPhone && !customerStreet && !customerCity;
}
async function readPartnerLite(odoo, partnerId) {
  const id = toIntId(partnerId);
  if (!id) return null;
  try {
    const rows = await odoo.executeKw("res.partner", "read", [[id]], {
      fields: ["id", "name", "email", "phone", "mobile", "street", "city"],
    });
    return rows?.[0] || null;
  } catch {
    return null;
  }
}
async function findOrCreateCustomerPartner(odoo, customer) {
  const name = toText(customer?.name);
  if (!name) throw new Error("Falta end_customer.name");

  const email = toText(customer?.email).toLowerCase();
  if (email) {
    const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", email]]], { limit: 5 });
    for (const candidateId of ids || []) {
      const partner = await readPartnerLite(odoo, candidateId);
      if (partnerLooksLikeSameCustomer(partner, customer)) return toIntId(candidateId);
    }
  }

  const phone = toText(customer?.phone);
  const normalizedPhone = normalizePhoneForLookup(phone);
  if (phone) {
    try {
      const idsPhone = await odoo.executeKw("res.partner", "search", [[["phone", "=", phone]]], { limit: 5 });
      for (const candidateId of idsPhone || []) {
        const partner = await readPartnerLite(odoo, candidateId);
        if (partnerLooksLikeSameCustomer(partner, customer)) return toIntId(candidateId);
      }
    } catch {}
    try {
      const idsMobile = await odoo.executeKw("res.partner", "search", [[["mobile", "=", phone]]], { limit: 5 });
      for (const candidateId of idsMobile || []) {
        const partner = await readPartnerLite(odoo, candidateId);
        if (partnerLooksLikeSameCustomer(partner, customer)) return toIntId(candidateId);
      }
    } catch {}
  }

  const allowNameFallback = !email && !normalizedPhone && !toText(customer?.address) && !toText(customer?.city);
  if (allowNameFallback) {
    const ids2 = await odoo.executeKw("res.partner", "search", [[["name", "=", name]]], { limit: 5 });
    for (const candidateId of ids2 || []) {
      const partner = await readPartnerLite(odoo, candidateId);
      if (partnerLooksLikeSameCustomer(partner, customer)) return toIntId(candidateId);
    }
  }

  const created = await odoo.executeKw("res.partner", "create", [{
    name,
    email: email || false,
    phone: phone || false,
    street: toText(customer?.street) || toText(customer?.address) || false,
    city: toText(customer?.city) || false,
    customer_rank: 1,
  }]);
  const id = toIntId(created);
  if (!id) throw new Error("No se pudo crear partner en Odoo");
  return id;
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

function appendPaymentMethodToNote(note, paymentMethod) {
  const pm = toText(paymentMethod);
  if (!pm) return note;
  return `${note}\nForma de pago: ${pm}`;
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
    let ids = await odooExecuteKwCompat(odoo, "sale.financing.plan", "search", [[["name", "=", TACA_TACA_PLAN_NAME]]], { limit: 1 });
    let id = toIntId(ids?.[0]);
    if (!id) {
      ids = await odooExecuteKwCompat(odoo, "sale.financing.plan", "search", [[["name", "ilike", TACA_TACA_PLAN_NAME]]], { limit: 1 });
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
    let rows = await odooExecuteKwCompat(odoo, "sale.financing.rate", "search_read", [domain], { fields, limit: 1, order: "id desc" });
    let rate = rows?.[0] || null;
    if (!rate) {
      rows = await odooExecuteKwCompat(odoo, "sale.financing.rate", "search_read", [baseDomain], { fields, limit: 1, order: "id desc" });
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

async function odooExecuteKwCompat(odoo, model, method, args = [], kwargs = {}) {
  if (typeof odoo?.executeKw === "function") {
    return odoo.executeKw(model, method, args, kwargs);
  }
  throw new Error("Odoo no disponible");
}

async function renameOrderToReference(odoo, orderId, reference) {
  const ref = toText(reference);
  if (!orderId || !ref) return null;
  try {
    await odooExecuteKwCompat(odoo, "sale.order", "write", [[Number(orderId)], {
      name: ref,
      origin: ref,
      client_order_ref: ref,
    }]);
  } catch {
    // Si Odoo no deja escribir name, al menos quedan origin/client_order_ref del create.
  }
  const [order] = await odooExecuteKwCompat(odoo, "sale.order", "read", [[Number(orderId)]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id", "origin", "client_order_ref"],
  });
  return order || null;
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
  const rawPortonType = quote?.payload?.porton_type ?? "";
  const normalizedPortonType = normalizePortonTypeKey(rawPortonType);
  const mapped = PORTON_TYPE_TO_ODOO_PRODUCT_ID[String(rawPortonType || "").trim()] ?? PORTON_TYPE_TO_ODOO_PRODUCT_ID[normalizedPortonType];
  return Number(mapped || PLACEHOLDER_PRODUCT_ID);
}
async function resolveInitialOdooProduct(odoo, requestedProductId) {
  const requestedId = Number(requestedProductId);
  const [directVariant] = await odooExecuteKwCompat(odoo, "product.product", "read", [[requestedId]], { fields: ["id", "name", "uom_id", "product_tmpl_id"] });
  if (directVariant?.id) {
    const uomId = toIntId(directVariant.uom_id);
    if (!uomId) throw new Error(`Producto inicial sin uom_id: ${requestedId}`);
    return { productId: Number(directVariant.id), productName: directVariant.name, uomId };
  }
  const [template] = await odooExecuteKwCompat(odoo, "product.template", "read", [[requestedId]], { fields: ["id", "name"] });
  if (!template?.id) throw new Error(`Producto inicial no encontrado en Odoo: ${requestedId}`);
  const variantIds = await odooExecuteKwCompat(odoo, "product.product", "search", [[["product_tmpl_id", "=", Number(template.id)]]], { limit: 1 });
  const variantId = toIntId(variantIds?.[0]);
  if (!variantId) throw new Error(`Producto inicial sin variante en Odoo: ${requestedId}`);
  const [resolvedVariant] = await odooExecuteKwCompat(odoo, "product.product", "read", [[variantId]], { fields: ["id", "name", "uom_id"] });
  if (!resolvedVariant?.id) throw new Error(`Variante de producto inicial no encontrada en Odoo: ${variantId}`);
  const uomId = toIntId(resolvedVariant.uom_id);
  if (!uomId) throw new Error(`Producto inicial sin uom_id: ${variantId}`);
  return { productId: Number(resolvedVariant.id), productName: resolvedVariant.name, uomId };
}
function buildFinalReferenceName(originalQuote) {
  const odooDigits = onlyDigits(originalQuote?.odoo_sale_order_name);
  if (odooDigits) return `NVS${odooDigits}`;
  const quoteNumber = Number(originalQuote?.quote_number || 0);
  if (Number.isFinite(quoteNumber) && quoteNumber > 0) return `NVS${quoteNumber}`;
  return null;
}
function buildBudgetReferenceLabel(originalQuote) {
  const saleName = toText(originalQuote?.odoo_sale_order_name);
  if (saleName) return saleName;
  const quoteNumber = Number(originalQuote?.quote_number || 0);
  if (Number.isFinite(quoteNumber) && quoteNumber > 0) return String(quoteNumber);
  return "-";
}

async function getOrCreateRevisionQuote(originalQuote, finalLines) {
  const existing = await dbQuery(
    `select * from public.presupuestador_quotes where quote_kind='copy' and parent_quote_id=$1 order by created_at desc nulls last, id desc limit 1`,
    [originalQuote.id]
  );
  const copy = existing.rows?.[0];
  if (copy) {
    const upd = await dbQuery(
      `
      update public.presupuestador_quotes
      set lines=$2::jsonb,
          end_customer=$3::jsonb,
          payload=$4::jsonb,
          note=$5,
          final_status='draft'
      where id=$1
      returning *
      `,
      [
        copy.id,
        JSON.stringify(finalLines),
        JSON.stringify(originalQuote.end_customer || {}),
        JSON.stringify(originalQuote.payload || {}),
        originalQuote.note || null,
      ]
    );
    return upd.rows?.[0] || copy;
  }

  const ins = await dbQuery(
    `
    insert into public.presupuestador_quotes
      (quote_kind, parent_quote_id,
       created_by_user_id, created_by_role,
       fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
       end_customer, lines, payload, note,
       catalog_kind,
       status, commercial_decision, technical_decision,
       final_status)
    values
      ('copy', $1,
       $2, $3,
       $4, $5, $6,
       $7::jsonb, $8::jsonb, $9::jsonb, $10,
       $11,
       'draft', 'pending', 'pending',
       'draft')
    returning *
    `,
    [
      originalQuote.id,
      originalQuote.created_by_user_id,
      originalQuote.created_by_role,
      originalQuote.fulfillment_mode,
      originalQuote.pricelist_id,
      originalQuote.bill_to_odoo_partner_id,
      JSON.stringify(originalQuote.end_customer || {}),
      JSON.stringify(finalLines),
      JSON.stringify(originalQuote.payload || {}),
      originalQuote.note || null,
      originalQuote.catalog_kind || "porton",
    ]
  );
  return ins.rows?.[0] || null;
}

function calcDetailedUnitWithIva(line, payload) {
  if (typeof line?.price_unit === "number") return round2(line.price_unit);
  if (typeof line?.unit_price === "number") return round2(line.unit_price);
  const base = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
  const margin = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(base * (1 + margin / 100) * (1 + IVA_RATE));
}

async function syncSingleDispatchTechnicalToOdoo({ odoo, revisionQuote, originalQuote, approverUser }) {
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

  const initialProduct = await resolveInitialOdooProduct(odoo, getInitialOdooProductIdForQuote(originalQuote));
  const lines = Array.isArray(revisionQuote.lines) ? revisionQuote.lines : [];
  if (!lines.length) throw new Error("La copia no tiene items");

  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean).concat([Number(initialProduct.productId)]))];
  const products = await odooExecuteKwCompat(odoo, "product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
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

  const referenceNv = buildFinalReferenceName(originalQuote);
  if (!referenceNv) {
    throw new Error("No se pudo resolver el correlativo final NVS del presupuesto");
  }

  let note = `PRESUPUESTADOR FINAL DIRECTO TECNICA: ${originalQuote.id}`
    + `\nReferencia: ${referenceNv}`
    + `\nPresupuesto: ${buildBudgetReferenceLabel(originalQuote)}`
    + `\nDestino: PRODUCCION`
    + `\nPortón sin medición: detalle técnico completado por Técnica.`
    + (originalQuote.note ? `\n${originalQuote.note}` : "")
    + (sellerName ? `\nVendedor: ${sellerName}` : "");
  note = appendPaymentMethodToNote(note, revisionQuote?.payload?.payment_method || originalQuote?.payload?.payment_method);

  const financingVals = await buildFinancingSaleOrderVals(odoo, revisionQuote?.payload?.payment_method || originalQuote?.payload?.payment_method);
  const createdOrderId = await odooExecuteKwCompat(odoo, "sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    origin: referenceNv,
    client_order_ref: referenceNv,
    note,
    ...financingVals,
  }]);
  const orderId = toIntId(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order final directa desde Técnica");
  await applySellerToSaleOrder(odoo, orderId, sellerName);
  const order = await renameOrderToReference(odoo, orderId, referenceNv);
  if (!order?.id) throw new Error("No se pudo leer sale.order final directa desde Técnica");

  return {
    order,
    metrics: {
      detailed_total: detailedTotal,
      reference_nv: referenceNv,
      single_dispatch: true,
    },
  };
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
  const products = await odooExecuteKwCompat(odoo, "product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
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
      name: `Pago anticipado según presupuesto ${buildBudgetReferenceLabel(originalQuote)}`,
      price_unit: round2(-advanceToDiscount),
    }]);
  }

  const finalAmountToCharge = round2(Math.max(0, detailedTotal - advanceToDiscount));
  const referenceNv = buildFinalReferenceName(originalQuote);
  if (!referenceNv) {
    throw new Error("No se pudo resolver la referencia final NVS del presupuesto");
  }
  let note = `PRESUPUESTADOR FINAL: COPY ${revisionQuote.id} (ORIG ${originalQuote.id})`
    + `\nReferencia: ${referenceNv}`
    + `\nReferencia seña: ${buildBudgetReferenceLabel(originalQuote)}`
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
  const createdOrderId = await odooExecuteKwCompat(odoo, "sale.order", "create", [{
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

export async function finalizeMeasurementToRevisionQuote({ odoo, originalQuote, measurementForm, approverUser }) {
  const mappings = await getMeasurementProductMappings();
  const finalLines = buildMeasurementLinesFromRules(measurementForm || {}, mappings.rules || []);
  if (!finalLines.length) {
    return { revisionQuote: null, generated_lines: [], synced: false, reason: "Sin reglas aplicables" };
  }

  const revisionQuote = await getOrCreateRevisionQuote(originalQuote, finalLines);
  if (!revisionQuote || !odoo) {
    return { revisionQuote, generated_lines: finalLines, synced: false, reason: !odoo ? "Odoo no disponible" : "No se pudo crear la copia" };
  }

  const updSync = await dbQuery(
    `
    update public.presupuestador_quotes
    set status='syncing_odoo',
        final_status='syncing_odoo',
        final_technical_decision='approved',
        final_logistics_decision='approved',
        final_technical_notes=null,
        final_logistics_notes=null
    where id=$1
    returning *
    `,
    [revisionQuote.id]
  );
  const qSync = updSync.rows?.[0] || revisionQuote;

  const singleDispatchFromTechnical = String(originalQuote?.fulfillment_mode || "").toLowerCase().trim() === "produccion"
    && isTecnicaOnlyQuote(originalQuote)
    && !toIntId(originalQuote?.odoo_sale_order_id);

  const { order, metrics } = singleDispatchFromTechnical
    ? await syncSingleDispatchTechnicalToOdoo({
        odoo,
        revisionQuote: qSync,
        originalQuote,
        approverUser,
      })
    : await syncFinalQuoteToOdoo({
        odoo,
        revisionQuote: qSync,
        originalQuote,
        approverUser,
      });

  const updFinal = await dbQuery(
    `
    update public.presupuestador_quotes
    set status='synced_odoo',
        final_status='synced_odoo',
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
      qSync.id,
      Number(order.id),
      order.name,
      metrics.tolerance_percent ?? 0,
      metrics.tolerance_amount ?? 0,
      metrics.difference_amount ?? 0,
      typeof metrics.absorbed_by_company === "boolean" ? metrics.absorbed_by_company : false,
    ]
  );

  return {
    revisionQuote: updFinal.rows?.[0] || qSync,
    generated_lines: finalLines,
    synced: true,
    order,
    metrics,
  };
}

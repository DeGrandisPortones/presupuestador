import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import { getCommercialFinalTolerancePercent } from "../settingsDb.js";
import { commitQuoteProductionWeek } from "../productionPlanning.js";
import { triggerPreproductionForClientAcceptance } from "../measurementFinalization.js";

const MEASUREMENT_PRODUCT_ID = Number(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865);
const PLACEHOLDER_PRODUCT_ID = Number(process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 3575);
const IPANEL_ACOPIO_PRODUCT_ID = Number(process.env.ODOO_IPANEL_ACOPIO_PRODUCT_ID || 3607);
const PLEGADOS_ACOPIO_PRODUCT_ID = Number(process.env.ODOO_PLEGADOS_ACOPIO_PRODUCT_ID || IPANEL_ACOPIO_PRODUCT_ID);
const PUERTA_ACOPIO_PRODUCT_ID = Number(process.env.ODOO_PUERTA_ACOPIO_PRODUCT_ID || 3558);
const DEFAULT_PRICELIST_ID = Number(process.env.ODOO_DEFAULT_PRICELIST_ID || 1);
const IVA_RATE = 0.21;
const TACA_TACA_PLAN_NAME = String(process.env.ODOO_TACA_TACA_PLAN_NAME || "Taca Taca").trim();
const SHIPPING_PRODUCT_IDS = new Set([2842]);
const DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS = new Set([3956, 3957, 3961, 3962, 3963, 3966, 4037, 3991, 3992, 3993, 3994, 3995, 3996, 3485, 3486, 3490, 3491, 3492, 3495, 3566, 3520, 3521, 3522, 3523, 3524, 3525]);
const IPANEL_LAMAS_22_PRODUCT_IDS = new Set([4061, 3590]);
const IPANEL_DIVIDER_LINE_MM = 10;

// Casos puntuales migrados: fuerzan nombre y monto de la orden en Odoo.
// Se limitan por quote_id y etapa para no afectar el flujo general ni la secuencia normal.
const HARDCODED_ODOO_QUOTES = Object.freeze({
  "4ecc5ed8-f41d-41dd-93d2-7e90c718debf": { stage: "nv", reference: "NV4238", amount: 3486887.45, fulfillment_mode: "produccion", label: "Rodrigo Fernandez" },
  "27c8625d-6b44-4293-8d8d-8d580ebc7a91": { stage: "nv", reference: "NV4237", amount: 3220305.39, fulfillment_mode: "produccion", label: "Juan Molina" },
  "55f11cf2-1205-4bd2-9471-ca7d1109b4ff": { stage: "np", reference: "NP4236", amount: 3371576.90, fulfillment_mode: "acopio", label: "Daniel Caon" },
  "035c6c9b-a07d-474e-9c31-744c379b6fe7": { stage: "nv", reference: "NV4235", amount: 4223523.26, fulfillment_mode: "produccion", label: "German Ortiz" },
  "3e3ec6a3-af1a-4c86-8471-39dbcf372533": { stage: "nv", reference: "NV4231", amount: 1662817.53, fulfillment_mode: "produccion", label: "Pastore" },
});

const PORTON_TYPE_TO_ODOO_PRODUCT_ID = Object.freeze({
  // Portones estándar / base
  apto_para_revestir: 3233,
  para_revestir: 3233,
  para_revestir_con_al_pvc_otros: 3233,
  acero_simil_aluminio_clasico: 3234,
  acero_simil_aluminio_madera_clasico: 3235,
  acero_simil_madera_clasico: 3235,
  acero_simil_madera_doble_iny: 3236,
  acero_simil_madera_doble_inyectado: 3236,
  acero_simil_aluminio_doble_iny: 3237,
  acero_simil_aluminio_doble_inyectado: 3237,

  // Portones estándar
  estandar_acero_simil_aluminio: 3238,
  estandar_acero_simil_aluminio_clasico: 3238,
  estandar_acero_simil_madera: 3239,
  estandar_acero_simil_madera_clasico: 3239,

  // Portones coplanares
  coplanar_acero_simil_aluminio_clasico: 3240,
  coplanar_acero_simil_madera_clasico: 3242,
  coplanar_acero_simil_madera_doble_iny: 3243,
  coplanar_acero_simil_madera_doble_inyectado: 3243,
  coplanar_acero_simil_aluminio_doble_iny: 3244,
  coplanar_acero_simil_aluminio_doble_inyectado: 3244,

  // Portones corredizos
  corredizo_simil_aluminio: 3241,
  corredizo_simil_aluminio_clasico: 3241,
  corredizo_simil_aluminio_doble: 3245,
  corredizo_simil_aluminio_doble_inyectado: 3245,
  corredizo_simil_madera: 3246,
  corredizo_simil_madera_clasico: 3246,

  // Compatibilidad con claves viejas/no listadas.
  revestimiento_wpc: 3220,
  corredizo_simil_madera_doble: 3223,
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
  if (!["porton", "ipanel", "plegados", "otros", "puerta"].includes(k)) throw new Error('catalog_kind invalido (usar "porton", "ipanel", "plegados", "otros" o "puerta")');
  return k;
}
function toScalar(v) { return Array.isArray(v) ? v[0] : v; }
function toIntId(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(toScalar(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function lineMatchesProductSet(line = {}, productSet) {
  const ids = [line?.product_id, line?.odoo_id, line?.odoo_template_id, line?.odoo_variant_id, line?.odoo_external_id];
  return ids.some((value) => productSet.has(Number(value || 0)));
}
function isShippingLine(line = {}) {
  return lineMatchesProductSet(line, SHIPPING_PRODUCT_IDS);
}
function isDistributorOwnSupplyLine(line = {}) {
  return lineMatchesProductSet(line, DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS);
}
function isDistributorQuote(quote = {}) {
  return String(quote?.created_by_role || quote?.payload?.created_by_role || "").trim().toLowerCase() === "distribuidor";
}
function shouldZeroShippingForOdoo(quote = {}, line = {}) {
  return isDistributorQuote(quote) && isDistributorOwnSupplyLine(line);
}
// Precio de Envío tomado de Odoo y congelado en envio_odoo_price_snapshot al crear
// el presupuesto, o al apretar "Actualizar presupuesto" (refresh_emission_date) en
// uno viejo. No se recalcula solo en ningun otro guardado, para no cambiarle el
// numero a un presupuesto ya armado. Lo usan la proforma y el envio real a Odoo.
async function fetchShippingOdooListPrice(odoo, productId) {
  const id = Number(productId) || 0;
  if (!odoo || !id) return null;
  try {
    const [row] = await odoo.executeKw("product.product", "read", [[id]], { fields: ["list_price"] });
    const price = Number(row?.list_price);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}
async function computeEnvioOdooPriceSnapshot({ odoo, createdByRole, lines }) {
  if (String(createdByRole || "").trim().toLowerCase() !== "distribuidor") return null;
  const shippingLine = (Array.isArray(lines) ? lines : []).find((l) => isShippingLine(l));
  if (!shippingLine) return null;
  const productId = shippingLine?.odoo_variant_id || shippingLine?.product_id || shippingLine?.odoo_external_id;
  return await fetchShippingOdooListPrice(odoo, productId);
}
function getEnvioOdooPriceSnapshot(quote = {}) {
  const n = Number(quote?.envio_odoo_price_snapshot);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function toText(v) { const x = toScalar(v); return x === null || x === undefined ? "" : String(x).trim(); }
function isUuid(v) { return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(v || "").trim()); }
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
function getHardcodedOdooOverride(quote, stage = null) {
  const id = String(quote?.id || quote?.parent_quote_id || "").toLowerCase().trim();
  const forced = HARDCODED_ODOO_QUOTES[id] || null;
  if (!forced) return null;
  const wantedStage = stage ? String(stage).toLowerCase().trim() : "";
  if (wantedStage && forced.stage !== wantedStage) return null;
  return forced;
}
function formatHardcodedOdooNote(forced) {
  if (!forced) return "";
  return `
Hardcode migración: ${forced.reference} · monto ${round2(forced.amount)}`;
}
function assertHardcodedOdooReferenceApplied(order, forced) {
  if (!forced?.reference) return;
  if (String(order?.name || "") !== forced.reference) {
    throw new Error(`No se pudo aplicar el número Odoo forzado ${forced.reference}. Revisar si ya existe en Odoo o si Odoo bloqueó el renombrado.`);
  }
}
function resolveQuotePricelistId(roleOrQuote, requestedPricelistId, fallbackPricelistId = null) {
  const role = typeof roleOrQuote === "object"
    ? String(roleOrQuote?.created_by_role || "vendedor").trim().toLowerCase()
    : String(roleOrQuote || "vendedor").trim().toLowerCase();
  if (role !== "distribuidor") return DEFAULT_PRICELIST_ID;
  return toIntId(requestedPricelistId) || toIntId(fallbackPricelistId) || DEFAULT_PRICELIST_ID;
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

  const customerVat = toText(customer?.vat);
  const partnerVat = toText(partner?.vat);
  if (customerVat && partnerVat && customerVat === partnerVat) return true;

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
      fields: ["id", "name", "email", "phone", "mobile", "street", "city", "vat"],
    });
    return rows?.[0] || null;
  } catch {
    return null;
  }
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

function shouldSendSellerToOdoo(quote) {
  return String(quote?.created_by_role || "").trim().toLowerCase() !== "distribuidor";
}
async function resolveSellerDisplayNameForOdoo(quote, fallbackUser = null) {
  if (!shouldSendSellerToOdoo(quote)) return "";
  return await resolveSellerDisplayNameForQuote(quote, fallbackUser);
}

function buildCustomerPartnerFiscalVals(customer, { includeName = false } = {}) {
  const vals = { customer_rank: 1 };
  const name = toText(customer?.name);
  const vat = toText(customer?.vat);
  const email = toText(customer?.email).toLowerCase();
  const phone = toText(customer?.phone);
  const street = toText(customer?.street) || toText(customer?.address);
  const city = toText(customer?.city);
  const identificationTypeId = toIntId(customer?.identification_type_id);
  const afipResponsibilityTypeId = toIntId(customer?.afip_responsibility_type_id);

  if (includeName) vals.name = name;
  if (vat) vals.vat = vat;
  if (email) vals.email = email;
  if (phone) vals.phone = phone;
  if (street) vals.street = street;
  if (city) vals.city = city;
  if (identificationTypeId) vals.l10n_latam_identification_type_id = identificationTypeId;
  if (afipResponsibilityTypeId) vals.l10n_ar_afip_responsibility_type_id = afipResponsibilityTypeId;

  return vals;
}

async function applyCustomerPartnerFiscalVals(odoo, partnerId, customer) {
  const id = toIntId(partnerId);
  if (!id) return null;
  const vals = buildCustomerPartnerFiscalVals(customer, { includeName: false });
  if (Object.keys(vals).length <= 1) return id;
  await odoo.executeKw("res.partner", "write", [[id], vals]);
  return id;
}

async function findOrCreateCustomerPartner(odoo, customer) {
  const name = toText(customer?.name);
  if (!name) throw new Error("Falta end_customer.name (vendedor)");

  const email = toText(customer?.email).toLowerCase();
  if (email) {
    const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", email]]], { limit: 5 });
    for (const candidateId of ids || []) {
      const partner = await readPartnerLite(odoo, candidateId);
      if (partnerLooksLikeSameCustomer(partner, customer)) return await applyCustomerPartnerFiscalVals(odoo, candidateId, customer);
    }
  }

  const phone = toText(customer?.phone);
  const normalizedPhone = normalizePhoneForLookup(phone);
  if (phone) {
    try {
      const idsPhone = await odoo.executeKw("res.partner", "search", [[["phone", "=", phone]]], { limit: 5 });
      for (const candidateId of idsPhone || []) {
        const partner = await readPartnerLite(odoo, candidateId);
        if (partnerLooksLikeSameCustomer(partner, customer)) return await applyCustomerPartnerFiscalVals(odoo, candidateId, customer);
      }
    } catch {}
    try {
      const idsMobile = await odoo.executeKw("res.partner", "search", [[["mobile", "=", phone]]], { limit: 5 });
      for (const candidateId of idsMobile || []) {
        const partner = await readPartnerLite(odoo, candidateId);
        if (partnerLooksLikeSameCustomer(partner, customer)) return await applyCustomerPartnerFiscalVals(odoo, candidateId, customer);
      }
    } catch {}
  }

  const allowNameFallback = !email && !normalizedPhone && !toText(customer?.address) && !toText(customer?.city);
  if (allowNameFallback) {
    const ids2 = await odoo.executeKw("res.partner", "search", [[["name", "=", name]]], { limit: 5 });
    for (const candidateId of ids2 || []) {
      const partner = await readPartnerLite(odoo, candidateId);
      if (partnerLooksLikeSameCustomer(partner, customer)) return await applyCustomerPartnerFiscalVals(odoo, candidateId, customer);
    }
  }

  const created = await odoo.executeKw("res.partner", "create", [buildCustomerPartnerFiscalVals(customer, { includeName: true })]);
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
function hasPlegadoAttachmentForPayload(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const d = p?.dimensions && typeof p.dimensions === "object" ? p.dimensions : {};
  const candidates = [
    d?.plegado_plano_attachment,
    d?.plano_plegado_attachment,
    d?.plegado_plano,
    d?.plano_plegado,
    p?.plegado_plano_attachment,
    p?.plano_plegado_attachment,
  ];
  return candidates.some((item) => {
    if (!item) return false;
    if (typeof item === "string") return !!item.trim();
    if (typeof item === "object") return !!String(item.data_url || item.dataUrl || item.url || item.href || "").trim();
    return false;
  });
}
function paymentAllowsCondition2ForQuote(paymentMethod) {
  const key = normalizePaymentMethodKey(paymentMethod);
  return key === normalizePaymentMethodKey("Efectivo") || key === normalizePaymentMethodKey("Cheques 30") || key === normalizePaymentMethodKey("Cheque 30");
}
function validateBusinessRequired(payload, catalog_kind) {
  const p = payload || {};
  if (!String(p.payment_method || "").trim()) return "Falta payload.payment_method";
  if (String(p.condition_mode || "") === "cond2" && !paymentAllowsCondition2ForQuote(p.payment_method)) return "Condicion 2 solo para Efectivo o Cheques 30";
  if (String(p.condition_mode || "") === "special" && !String(p.condition_text || "").trim()) return "Falta payload.condition_text (condicion especial)";
  const normalizedKind = String(catalog_kind || "porton").toLowerCase().trim();
  if (normalizedKind === "porton" && !String(p.porton_type || "").trim()) return "Falta payload.porton_type";
  if (normalizedKind === "plegados" && !hasPlegadoAttachmentForPayload(p)) return "Falta adjuntar el plano del plegado";
  return null;
}
function normalizeIpanelLamasOrientation(value) {
  const raw = String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (raw.includes("vert")) return "vertical";
  if (raw.includes("horiz")) return "horizontal";
  return "horizontal";
}
function toPositiveNumber(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function sanitizeIpanelSectionSizes(value, count = 0) {
  const list = Array.isArray(value) ? value : [];
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  return list.slice(0, safeCount).map((item) => String(item ?? "").replace(/[^0-9.,]/g, ""));
}
function validateIpanelLamasLogicalMeasuresForQuote(quote = {}) {
  const kind = String(quote?.catalog_kind || quote?.payload?.quote_subkind || quote?.payload?.catalog_kind || "").toLowerCase().trim();
  if (kind !== "ipanel") return null;
  const hasLamas22 = (Array.isArray(quote?.lines) ? quote.lines : []).some((line) => lineMatchesProductSet(line, IPANEL_LAMAS_22_PRODUCT_IDS));
  if (!hasLamas22) return null;

  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  const dimensions = payload?.dimensions && typeof payload.dimensions === "object" ? payload.dimensions : {};
  const orientation = normalizeIpanelLamasOrientation(
    dimensions?.ipanel_lamas_orientacion
    ?? dimensions?.orientacion_ipanel_lamas
    ?? dimensions?.ipanel_orientacion_lamas
    ?? dimensions?.ipanel_lamas_orientation
    ?? "horizontal"
  );
  const maxDivisions = orientation === "vertical" ? 7 : 18;
  const divisionsRaw = dimensions?.ipanel_divisiones ?? dimensions?.cantidad_divisiones_ipanel;
  const divisions = Number(String(divisionsRaw ?? "").trim());
  if (!Number.isInteger(divisions) || divisions < 2 || divisions > maxDivisions) {
    return `Completá la cantidad de divisiones del Ipanel con un número entero entre 2 y ${maxDivisions}.`;
  }

  const sectionValues = sanitizeIpanelSectionSizes(
    dimensions?.ipanel_divisiones_medidas_mm ?? dimensions?.medidas_divisiones_ipanel_mm ?? dimensions?.ipanel_section_sizes_mm ?? [],
    divisions,
  );
  if (sectionValues.length !== divisions || sectionValues.some((item) => !String(item || "").trim())) {
    return `Completá las medidas de las ${divisions} secciones del Ipanel.`;
  }
  const parsed = sectionValues.map((item) => Number(String(item).replace(",", ".")));
  if (parsed.some((item) => !Number.isFinite(item) || item <= 0)) {
    return "Las medidas de las divisiones del Ipanel deben ser números positivos en mm.";
  }

  const widthM = toPositiveNumber(dimensions?.width);
  const heightM = toPositiveNumber(dimensions?.height);
  const axisDimensionMm = (orientation === "vertical" ? widthM : heightM) * 1000;
  if (!(axisDimensionMm > 0)) return "Completá las medidas del Ipanel antes de confirmar.";

  const distribution = String(dimensions?.ipanel_distribucion_divisiones || dimensions?.ipanel_divisiones_distribucion || "").trim().toLowerCase();
  const dividersIncluded = dimensions?.ipanel_divisiones_incluyen_liston === true
    || String(dimensions?.ipanel_divisiones_incluyen_liston || "").trim().toLowerCase() === "true"
    || distribution === "clasica";
  const dividersTotalMm = dividersIncluded ? 0 : Math.max(0, divisions - 1) * IPANEL_DIVIDER_LINE_MM;
  const totalUsedMm = parsed.reduce((acc, item) => acc + item, 0) + dividersTotalMm;
  const diff = Math.round((axisDimensionMm - totalUsedMm) * 100) / 100;
  if (diff > 0.5) return `Las divisiones del Ipanel no completan la medida disponible. Faltan ${diff} mm.`;
  if (diff < -0.5) return `Las divisiones del Ipanel superan la medida disponible. Sobran ${Math.abs(diff)} mm.`;
  return null;
}
function hasMeasurementLine(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  return arr.some((l) => toIntId(l?.product_id) === MEASUREMENT_PRODUCT_ID);
}
function normalizeMeasurementMode(value) {
  return String(value || "medidor").toLowerCase().trim() === "tecnica_only" ? "tecnica_only" : "medidor";
}
function normalizeMeasurementSubtype(value) {
  return String(value || "normal").toLowerCase().trim() === "sin_medicion" ? "sin_medicion" : "normal";
}
const ACTIVE_MEASUREMENT_WORKFLOW_STATUSES = ["returned_to_seller", "submitted", "approved", "needs_fix"];
function quoteNeedsMeasurement(quote) {
  const kind = String(quote?.catalog_kind || quote?.payload?.catalog_kind || "porton").toLowerCase().trim();
  if (kind === "otros") return false;
  return !!(
    quote?.requires_measurement === true
    || hasMeasurementLine(quote?.lines)
    || normalizeMeasurementMode(quote?.measurement_mode) === "tecnica_only"
    || normalizeMeasurementSubtype(quote?.measurement_subtype) === "sin_medicion"
  );
}
function getMeasurementFlowForQuote({ catalog_kind, fulfillment_mode, lines }) {
  const kind = String(catalog_kind || "porton").toLowerCase().trim();
  const mode = kind === "otros" ? "produccion" : String(fulfillment_mode || "acopio").trim();
  const hasLine = kind === "otros" ? false : hasMeasurementLine(lines);

  if (kind === "otros") {
    return {
      requires_measurement: false,
      measurement_mode: "medidor",
      measurement_subtype: "normal",
      measurement_status: "none",
    };
  }

  if (kind === "ipanel") {
    if (mode === "produccion") {
      return {
        requires_measurement: true,
        measurement_mode: "tecnica_only",
        measurement_subtype: "sin_medicion",
        measurement_status: "pending",
      };
    }
    return {
      requires_measurement: false,
      measurement_mode: "medidor",
      measurement_subtype: "normal",
      measurement_status: "none",
    };
  }

  if (["porton", "puerta"].includes(kind) && mode === "produccion") {
    return {
      requires_measurement: true,
      measurement_mode: hasLine ? "medidor" : "tecnica_only",
      measurement_subtype: hasLine ? "normal" : "sin_medicion",
      measurement_status: "pending",
    };
  }

  return {
    requires_measurement: hasLine,
    measurement_mode: "medidor",
    measurement_subtype: "normal",
    measurement_status: hasLine && mode === "produccion" ? "pending" : "none",
  };
}
function isDirectProductionTechnicalOnlyQuote(quote) {
  return ["porton", "puerta"].includes(String(quote?.catalog_kind || "porton").toLowerCase().trim())
    && String(quote?.fulfillment_mode || "").trim() === "produccion"
    && (
      normalizeMeasurementMode(quote?.measurement_mode) === "tecnica_only"
      || normalizeMeasurementSubtype(quote?.measurement_subtype) === "sin_medicion"
    );
}
function shouldDeferSyncUntilMeasurement(quote) {
  const forced = getHardcodedOdooOverride(quote);
  if (forced?.stage === "nv") return false;
  // Porton a produccion sin medicion: se crea la NV en la aprobacion inicial,
  // pero queda en circuito tecnico para la aprobacion final/WhatsApp.
  if (isDirectProductionTechnicalOnlyQuote(quote)) return false;
  return ["porton", "puerta", "ipanel"].includes(String(quote?.catalog_kind || "porton").toLowerCase().trim())
    && String(quote?.fulfillment_mode || "").trim() === "produccion"
    && (
      quote?.requires_measurement === true
      || hasMeasurementLine(quote?.lines)
    );
}
function getPayloadQuoteAdjustmentPercent(payload) {
  const candidates = [
    payload?.quote_adjustment_percent_snapshot,
    payload?.financing_percent_snapshot,
    payload?.financing_percent,
    payload?.payment_adjustment_percent,
  ];
  for (const value of candidates) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const n = Number(String(value).replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
function shouldUseDistributorProformaPricesForOdoo(quote = {}) {
  return isDistributorQuote(quote);
}
function getLineBasePriceForOdoo(line = {}) {
  const value = line?.basePrice ?? line?.base_price ?? line?.price ?? line?.list_price ?? line?.lst_price ?? 0;
  const n = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(n) ? round2(n) : 0;
}
function calcOdooUnitPrice(line, payload, quote = null) {
  if (shouldZeroShippingForOdoo(quote, line)) return 0;

  // Envío: si ya existe el precio de Odoo congelado (envio_odoo_price_snapshot),
  // se usa ese en vez del que quedó en la línea (que el distribuidor puede editar
  // para su propio presupuesto). Si es un presupuesto viejo sin ese snapshot,
  // sigue exactamente como estaba: usa el precio guardado en la línea.
  if (isDistributorQuote(quote) && isShippingLine(line)) {
    const snapshot = getEnvioOdooPriceSnapshot(quote);
    if (snapshot != null) {
      const adjustment = getPayloadQuoteAdjustmentPercent(payload || {});
      return round2(snapshot * (1 + adjustment / 100) * getOdooConditionPriceFactor(payload || {}));
    }
  }

  // Distribuidores: precio base/lista sin margen (coeficiente), pero con la
  // financiacion/ajuste por forma de pago aplicado igual que al vendedor.
  // Se ignoran price_unit/unit_price porque pueden venir ya valorizados.
  // Si es Condición 2 se incluye el IVA 10,5% en el neto enviado a Odoo.
  if (shouldUseDistributorProformaPricesForOdoo(quote)) {
    const base = getLineBasePriceForOdoo(line);
    const adjustment = getPayloadQuoteAdjustmentPercent(payload || {});
    return round2(base * (1 + adjustment / 100) * getOdooConditionPriceFactor(payload || {}));
  }

  if (typeof line?.price_unit === "number") return round2(line.price_unit);
  if (typeof line?.unit_price === "number") return round2(line.unit_price);
  const base = getLineBasePriceForOdoo(line);
  const margin = Number(payload?.margin_percent_ui || 0) || 0;
  const adjustment = getPayloadQuoteAdjustmentPercent(payload || {});
  return round2(base * (1 + margin / 100) * (1 + adjustment / 100) * getOdooConditionPriceFactor(payload || {}));
}
function calcQuoteSubtotal({ lines, payload, quote = null }) {
  const arr = Array.isArray(lines) ? lines : [];
  return round2(arr.reduce((acc, l) => {
    const qty = Number(l?.qty || 0) || 0;
    const unit = calcOdooUnitPrice(l, payload || {}, quote);
    return acc + (qty * unit);
  }, 0));
}
function getPayloadConditionMode(payload) {
  return String(payload?.condition_mode || "cond1").trim().toLowerCase();
}
function getOdooConditionPriceFactor(payload) {
  // Odoo recibe valores sin IVA para Condición 1.
  // Para Condición 2 se envía neto + 10,5%.
  return getPayloadConditionMode(payload) === "cond2" ? 1.105 : 1;
}
function getOdooConditionLabel(payload) {
  const mode = getPayloadConditionMode(payload);
  if (mode === "cond2") return "Condición 2";
  if (mode === "special") {
    const text = toText(payload?.condition_text);
    return text ? `Condición especial: ${text}` : "Condición especial";
  }
  return "Condición 1";
}
function appendSaleConditionToNote(note, quoteOrPayload) {
  const payload = quoteOrPayload?.payload && typeof quoteOrPayload.payload === "object"
    ? quoteOrPayload.payload
    : (quoteOrPayload && typeof quoteOrPayload === "object" ? quoteOrPayload : {});
  return `${note}
Condición vendida: ${getOdooConditionLabel(payload)}`;
}
function calcQuoteTotalWithIva({ lines, payload, quote = null }) {
  // Nombre legacy: este total es el que se envía a Odoo.
  // calcQuoteSubtotal ya aplica el factor de condición linea por linea (via calcOdooUnitPrice),
  // tanto para distribuidor como para vendedor. No volver a aplicarlo aca o Condicion 2 duplica el 10,5%.
  return calcQuoteSubtotal({ lines, payload, quote });
}
function calcDetailedUnitWithIva(line, payload, quote = null) {
  // Nombre legacy: este precio unitario es el que se envía a Odoo.
  return calcOdooUnitPrice(line, payload || {}, quote);
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
  if (kind === "ipanel") return Number(IPANEL_ACOPIO_PRODUCT_ID);
  if (kind === "plegados") return Number(PLEGADOS_ACOPIO_PRODUCT_ID);
  if (kind === "puerta") return Number(PUERTA_ACOPIO_PRODUCT_ID);
  if (kind !== "porton") return Number(PLACEHOLDER_PRODUCT_ID);
  const rawPortonType = quote?.payload?.porton_type ?? "";
  const normalizedPortonType = normalizePortonTypeKey(rawPortonType);
  const mapped = PORTON_TYPE_TO_ODOO_PRODUCT_ID[String(rawPortonType || "").trim()] ?? PORTON_TYPE_TO_ODOO_PRODUCT_ID[normalizedPortonType];
  return Number(mapped || PLACEHOLDER_PRODUCT_ID);
}
function shouldUseDetailedInitialOrderLines(quote) {
  // La NP inicial usa un único producto resumen:
  // - Portones: producto definido por tipo de portón.
  // - Ipanel en acopio: producto Odoo 3557.
  // - Puertas en acopio: producto Odoo 3558.
  // Otros nunca debe generar NP; siempre sale como NV/ONV en producción.
  return false;
}
async function buildDetailedOrderLinesForOdoo({ odoo, lines, payload, quote = null }) {
  const arr = Array.isArray(lines) ? lines : [];
  if (!arr.length) throw new Error("El presupuesto no tiene items");

  const productIds = [...new Set(arr.map((l) => Number(l.product_id)).filter(Boolean))];
  if (!productIds.length) throw new Error("El presupuesto no tiene productos válidos");

  const products = await odoo.executeKw("product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));

  const orderLines = [];
  let detailedTotal = 0;
  for (const l of arr) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1) || 1;
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);
    const uomId = toIntId(p?.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);
    const priceUnit = calcDetailedUnitWithIva(l, payload || {}, quote);
    detailedTotal = round2(detailedTotal + (qty * priceUnit));
    orderLines.push([0, 0, {
      product_id: productId,
      product_uom_qty: qty,
      product_uom: uomId,
      name: p.name,
      price_unit: priceUnit,
    }]);
  }

  return { orderLines, detailedTotal: round2(detailedTotal) };
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

// Cliente externo: el cliente real del distribuidor (no el partner de Odoo, que es
// siempre el distribuidor). Mismo patron que el campo de vendedor: prueba nombres de
// campo candidatos vía fields_get y no hace nada si todavia no existe en Odoo.
const ODOO_SALE_ORDER_EXTERNAL_CUSTOMER_FIELD_CANDIDATES = Object.freeze([
  "x_studio_cliente_externo",
  "x_cliente_externo",
  "x_studio_cliente_final",
]);
let saleOrderExternalCustomerFieldCache = undefined;
async function resolveSaleOrderExternalCustomerFieldMeta(odoo) {
  if (saleOrderExternalCustomerFieldCache !== undefined) return saleOrderExternalCustomerFieldCache;
  const preferred = toText(process.env.ODOO_SALE_ORDER_EXTERNAL_CUSTOMER_FIELD);
  const candidates = [preferred, ...ODOO_SALE_ORDER_EXTERNAL_CUSTOMER_FIELD_CANDIDATES].filter(Boolean);
  try {
    const fields = await odoo.executeKw("sale.order", "fields_get", [], { attributes: ["string", "type"] });
    for (const fieldName of candidates) {
      const meta = fields?.[fieldName];
      if (!meta) continue;
      saleOrderExternalCustomerFieldCache = { name: fieldName, type: String(meta.type || "").trim() };
      return saleOrderExternalCustomerFieldCache;
    }
  } catch {}
  saleOrderExternalCustomerFieldCache = null;
  return saleOrderExternalCustomerFieldCache;
}
function buildClientOrderRefWithExternalCustomer(reference, externalCustomerName) {
  const ref = toText(reference);
  const name = toText(externalCustomerName);
  if (!name) return ref;
  return ref ? `${ref} Cliente ${name}` : `Cliente ${name}`;
}
// Se llama DESPUES de fijar name/origin/client_order_ref con la referencia NV/NP (ej.
// renameOrderToReference), asi el client_order_ref combinado ("NV4253 Cliente Pedrito
// Gomez") no se pisa. name/origin quedan con la referencia limpia unicamente.
async function applyExternalCustomerToSaleOrder(odoo, orderId, { reference, externalCustomerName } = {}) {
  const cleanName = toText(externalCustomerName);
  if (!orderId || !cleanName) return;
  const fieldMeta = await resolveSaleOrderExternalCustomerFieldMeta(odoo);
  const patch = { client_order_ref: buildClientOrderRefWithExternalCustomer(reference, cleanName) };
  if (fieldMeta?.name) patch[fieldMeta.name] = cleanName;
  try {
    await odoo.executeKw("sale.order", "write", [[Number(orderId)], patch]);
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

async function submitLinkedDoorsForQuote({ quote }) {
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
              commercial_notes=null,
              technical_notes=null,
              record=$3::jsonb,
              updated_at=now()
        where id=$1`,
      [Number(row.id), "pending", JSON.stringify(nextRecord)]
    );
  }
}

function appendPaymentMethodToNote(note, paymentMethod) {
  const pm = toText(paymentMethod);
  if (!pm) return note;
  return `${note}\nForma de pago: ${pm}`;
}
function getBudgetObservation(quote) {
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  return toText(quote?.budget_observation || payload?.budget_observation || payload?.presupuesto_observacion || payload?.quote_observation || "");
}
function appendBudgetObservationToNote(note, quote) {
  const observation = getBudgetObservation(quote);
  if (!observation) return note;
  return `${note}\nObservación presupuesto / NP / NV: ${observation}`;
}

function normalizeBillingTypeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}
function digitsOnly(value) {
  return String(value || "").replace(/\D+/g, "");
}
function sanitizeDocumentNumber(value, identificationTypeName) {
  const raw = toText(value);
  const key = normalizeBillingTypeKey(identificationTypeName);
  if (["cuit", "cuil", "dni"].includes(key)) return digitsOnly(raw);
  return raw;
}
function isValidCuitCuil(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * weights[i];
  let verifier = 11 - (sum % 11);
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 9;
  return verifier === Number(digits[10]);
}
function normalizeBillingCustomer(value) {
  const raw = value && typeof value === "object" ? value : {};
  const identificationTypeName = toText(raw?.identification_type_name);
  return {
    name: toText(raw?.name),
    vat: sanitizeDocumentNumber(raw?.vat, identificationTypeName),
    email: toText(raw?.email).toLowerCase(),
    phone: toText(raw?.phone),
    address: toText(raw?.address || raw?.street),
    city: toText(raw?.city),
    identification_type_id: toIntId(raw?.identification_type_id),
    identification_type_name: identificationTypeName,
    afip_responsibility_type_id: toIntId(raw?.afip_responsibility_type_id),
    afip_responsibility_type_name: toText(raw?.afip_responsibility_type_name),
  };
}
function hasBillingCustomerData(value) {
  const c = normalizeBillingCustomer(value);
  return !!(c.name || c.vat || c.email || c.phone || c.address || c.city || c.identification_type_id || c.afip_responsibility_type_id);
}
function getQuoteConditionMode(quote) {
  return String(quote?.payload?.condition_mode || "cond1").trim().toLowerCase();
}
function requiresBillingCustomerForQuote(quote) {
  return quote?.created_by_role === "vendedor" && ["cond1", "special"].includes(getQuoteConditionMode(quote));
}
function validateBillingDocument(value) {
  const c = normalizeBillingCustomer(value);
  const typeName = toText(c.identification_type_name);
  const typeKey = normalizeBillingTypeKey(typeName);
  if (!typeKey || !c.vat) return null;
  const digits = digitsOnly(c.vat);
  if (typeKey === "cuit" || typeKey === "cuil") {
    if (digits.length !== 11) return `El ${typeName} debe tener 11 dígitos.`;
    if (!isValidCuitCuil(digits)) return `El ${typeName} ingresado no es válido.`;
  }
  if (typeKey === "dni") {
    if (digits.length < 7 || digits.length > 8) return "El DNI debe tener 7 u 8 dígitos.";
  }
  return null;
}
function validateBillingCustomerRequired(value) {
  const c = normalizeBillingCustomer(value);
  if (!c.name) return "Falta razón social / nombre fiscal";
  if (!c.identification_type_id) return "Falta tipo de identificación";
  if (!c.vat) return "Falta número de identificación";
  if (!c.afip_responsibility_type_id) return "Falta tipo de responsabilidad AFIP";
  if (!c.phone) return "Falta teléfono fiscal";
  if (!c.address) return "Falta dirección fiscal";
  if (!c.city) return "Falta localidad fiscal";
  return validateBillingDocument(c);
}
function resolveCustomerForOdoo(quote, revisionQuote = null) {
  if (requiresBillingCustomerForQuote(quote)) {
    const revisionPayload = revisionQuote?.payload && typeof revisionQuote.payload === "object" ? revisionQuote.payload : {};
    const quotePayload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
    const source = hasBillingCustomerData(revisionPayload?.billing_customer)
      ? revisionPayload.billing_customer
      : (hasBillingCustomerData(quotePayload?.billing_customer) ? quotePayload.billing_customer : {});
    const c = normalizeBillingCustomer(source);
    return {
      name: c.name,
      vat: c.vat,
      email: c.email,
      phone: c.phone,
      address: c.address,
      street: c.address,
      city: c.city,
      identification_type_id: c.identification_type_id,
      identification_type_name: c.identification_type_name,
      afip_responsibility_type_id: c.afip_responsibility_type_id,
      afip_responsibility_type_name: c.afip_responsibility_type_name,
    };
  }
  return quote?.end_customer || {};
}
function extractReferenceCore(value) {
  const raw = toText(value);
  if (!raw) return "";
  const cleaned = raw.replace(/^[A-Za-z]+/, "").trim();
  return cleaned || raw;
}
function extractOdooReferenceCore(value, { allowBareNumber = false } = {}) {
  const raw = toText(value);
  if (!raw) return "";
  const hasPrefix = /^[A-Za-z]+/.test(raw);
  if (!hasPrefix && !allowBareNumber) return "";
  const core = extractReferenceCore(raw);
  return /^\d+$/.test(core) ? core : "";
}
function getQuoteCatalogKind(quote) {
  return String(quote?.catalog_kind || quote?.payload?.catalog_kind || "porton").toLowerCase().trim();
}
function getReferenceFamilyPrefix(quote) {
  const kind = getQuoteCatalogKind(quote);
  if (kind === "ipanel") return "I";
  if (kind === "plegados") return "PL";
  if (kind === "puerta") return "P";
  if (kind === "otros") return "O";
  return "";
}
function isLinkedPortonChildKind(kind) {
  return ["ipanel", "plegados", "puerta", "otros"].includes(String(kind || "").toLowerCase().trim());
}
function getOdooReferenceCoreFromQuoteRow(quote) {
  const candidates = [
    quote?.odoo_sale_order_name,
    quote?.final_sale_order_name,
    quote?.payload?.linked_porton_odoo_sale_order_name,
    quote?.payload?.linked_porton_final_sale_order_name,
  ];
  for (const candidate of candidates) {
    const core = extractOdooReferenceCore(candidate);
    if (core) return core;
  }
  return "";
}
function hasLinkedPortonPayload(quote) {
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  return !!(
    toText(payload.linked_porton_quote_id)
    || toText(payload.porton_quote_id)
    || toText(payload.linked_porton_reference)
    || toText(payload.linked_porton_odoo_sale_order_name)
    || toText(payload.linked_porton_final_sale_order_name)
    || toText(payload.linked_porton_reference_core)
  );
}
async function getLinkedPortonReferenceCore(quote) {
  const kind = getQuoteCatalogKind(quote);
  if (!isLinkedPortonChildKind(kind)) return "";
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};

  const directCandidates = [
    payload.linked_porton_odoo_sale_order_name,
    payload.linked_porton_final_sale_order_name,
    payload.linked_porton_reference,
  ];
  for (const candidate of directCandidates) {
    const core = extractOdooReferenceCore(candidate);
    if (core) return core;
  }

  const explicitCore = extractOdooReferenceCore(payload.linked_porton_reference_core);
  if (explicitCore) return explicitCore;

  const linkedQuoteId = toText(payload.linked_porton_quote_id || payload.porton_quote_id || "");
  if (isUuid(linkedQuoteId)) {
    const r = await dbQuery(
      `select odoo_sale_order_name, final_sale_order_name, payload from public.presupuestador_quotes where id=$1 limit 1`,
      [linkedQuoteId],
    );
    const linkedQuote = r.rows?.[0] || null;
    const core = getOdooReferenceCoreFromQuoteRow(linkedQuote);
    if (core) return core;
  }

  return "";
}
function getQuoteReferenceCore(quote) {
  return extractReferenceCore(quote?.odoo_sale_order_name || quote?.final_sale_order_name || quote?.quote_number || "");
}
let odooReferenceSequenceEnsured = false;

async function ensureOdooReferenceSequence() {
  if (odooReferenceSequenceEnsured) return;
  await dbQuery(`create sequence if not exists public.presupuestador_odoo_reference_seq start with 4239 increment by 1;`);
  odooReferenceSequenceEnsured = true;
}

async function nextOdooReferenceNumber() {
  await ensureOdooReferenceSequence();
  const r = await dbQuery(`select nextval('public.presupuestador_odoo_reference_seq') as value`);
  const value = Number(r.rows?.[0]?.value || 0);
  if (!Number.isFinite(value) || value <= 0) throw new Error("No se pudo obtener el próximo número Odoo");
  return value;
}

function getExistingInitialOdooReferenceNumber(quote) {
  return extractOdooReferenceCore(quote?.odoo_sale_order_name || "");
}

async function buildQuoteOdooReference(quote, stage = "np") {
  const forced = getHardcodedOdooOverride(quote, stage);
  if (forced?.reference) return forced.reference;
  const familyPrefix = getReferenceFamilyPrefix(quote);
  const stagePrefix = String(stage || "np").toLowerCase() === "nv" ? "NV" : "NP";

  // Si es Ipanel/Puerta/Otros/Plegados vinculado a un porton, no consume un numero nuevo:
  // reutiliza el numero Odoo del porton y solo cambia la sigla: NP4239 -> INP/PNP/ONP/PLNP4239
  // o NV4239 -> INV/PNV/ONV/PLNV4239.
  const linkedPortonNumber = await getLinkedPortonReferenceCore(quote);
  if (linkedPortonNumber) return `${familyPrefix}${stagePrefix}${linkedPortonNumber}`;
  if (hasLinkedPortonPayload(quote) && isLinkedPortonChildKind(getQuoteCatalogKind(quote))) {
    throw new Error("El presupuesto vinculado al portón no tiene NP/NV de Odoo generada todavía. Primero debe quedar aprobado el portón vinculado.");
  }

  // Si el presupuesto ya genero una NP inicial en acopio, la NV final debe conservar
  // el mismo numero y solo cambiar el prefijo: NP4240 -> NV4240, INP4241 -> INV4241, etc.
  if (stagePrefix === "NV") {
    const existingInitialNumber = getExistingInitialOdooReferenceNumber(quote);
    if (existingInitialNumber) return `${familyPrefix}${stagePrefix}${existingInitialNumber}`;
  }

  const referenceNumber = await nextOdooReferenceNumber();
  return `${familyPrefix}${stagePrefix}${referenceNumber}`;
}

const LINKED_PORTON_PAYLOAD_KEYS = Object.freeze([
  "linked_porton_quote_id",
  "linked_porton_quote_number",
  "linked_porton_odoo_sale_order_name",
  "linked_porton_final_sale_order_name",
  "linked_porton_reference",
  "linked_porton_reference_core",
]);
function preserveLinkedPortonPayload(existingPayload = {}, nextPayload = {}) {
  const existing = existingPayload && typeof existingPayload === "object" ? existingPayload : {};
  const out = nextPayload && typeof nextPayload === "object" ? { ...nextPayload } : {};
  for (const key of LINKED_PORTON_PAYLOAD_KEYS) {
    if ((out[key] === undefined || out[key] === null || String(out[key]).trim() === "") && existing[key] !== undefined && existing[key] !== null && String(existing[key]).trim() !== "") {
      out[key] = existing[key];
    }
  }
  return out;
}

function getLinkedPortonQuoteIdFromBody(body = {}) {
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
  return toText(body?.linked_porton_quote_id || payload?.linked_porton_quote_id || payload?.porton_quote_id || "");
}
async function getQuoteOwnedBySeller(quoteId, userId) {
  const r = await dbQuery(`select * from public.presupuestador_quotes where id = $1 and created_by_user_id = $2 limit 1`, [quoteId, Number(userId)]);
  return r.rows?.[0] || null;
}
function mergeLinkedPortonPayload(payload = {}, linkedPorton = null) {
  const next = payload && typeof payload === "object" ? { ...payload } : {};
  if (!linkedPorton?.id) return next;
  const linkedReferenceCore = getOdooReferenceCoreFromQuoteRow(linkedPorton);
  const linkedOdooReference = linkedPorton.odoo_sale_order_name || linkedPorton.final_sale_order_name || "";
  next.linked_porton_quote_id = String(linkedPorton.id);
  next.linked_porton_quote_number = linkedPorton.quote_number || next.linked_porton_quote_number || "";
  next.linked_porton_odoo_sale_order_name = linkedPorton.odoo_sale_order_name || next.linked_porton_odoo_sale_order_name || "";
  next.linked_porton_final_sale_order_name = linkedPorton.final_sale_order_name || next.linked_porton_final_sale_order_name || "";
  next.linked_porton_reference_core = linkedReferenceCore || next.linked_porton_reference_core || "";
  next.linked_porton_reference = linkedOdooReference || next.linked_porton_reference || "";
  return next;
}

async function syncQuoteToOdoo({ odoo, quote, approverUser }) {
  const pricelistId = resolveQuotePricelistId(quote, quote?.pricelist_id);
  let partnerId = toIntId(quote?.bill_to_odoo_partner_id);
  if (!partnerId) {
    if (quote.created_by_role === "distribuidor") {
      partnerId = await getCreatorOdooPartnerId(quote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
      if (!partnerId) throw new Error("Distribuidor sin bill_to_odoo_partner_id (quote) y sin odoo_partner_id (JWT/DB)");
    } else {
      const customerForOdoo = resolveCustomerForOdoo(quote);
      if (requiresBillingCustomerForQuote(quote)) {
        const billingErr = validateBillingCustomerRequired(customerForOdoo);
        if (billingErr) throw new Error(billingErr);
      }
      partnerId = await findOrCreateCustomerPartner(odoo, customerForOdoo);
    }
  }
  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id invalido para Odoo");
  // Se persiste el partner que efectivamente se uso en Odoo, para que la NV final
  // (syncFinalQuoteToOdoo / syncDirectProductionFinalToOdoo) reutilice el mismo en vez
  // de volver a buscar/crear un partner por su cuenta y terminar en uno distinto.
  if (toIntId(quote?.bill_to_odoo_partner_id) !== partnerId) {
    try {
      await dbQuery(`update public.presupuestador_quotes set bill_to_odoo_partner_id=$2 where id=$1`, [quote.id, partnerId]);
      quote.bill_to_odoo_partner_id = partnerId;
    } catch {}
  }

  const sellerName = await resolveSellerDisplayNameForOdoo(quote, approverUser);
  let total = calcQuoteTotalWithIva({ lines: quote.lines, payload: quote.payload, quote });
  const forcedNp = getHardcodedOdooOverride(quote, "np");
  if (forcedNp?.amount) total = round2(forcedNp.amount);
  let orderLines = [];

  if (shouldUseDetailedInitialOrderLines(quote)) {
    const detailed = await buildDetailedOrderLinesForOdoo({
      odoo,
      lines: quote.lines,
      payload: quote.payload,
      quote,
    });
    orderLines = detailed.orderLines;
    total = detailed.detailedTotal;
  } else {
    const requestedInitialProductId = getInitialOdooProductIdForQuote(quote);
    const initialProduct = await resolveInitialOdooProduct(odoo, requestedInitialProductId);
    orderLines = [[0, 0, {
      product_id: Number(initialProduct.productId),
      product_uom_qty: 1,
      product_uom: initialProduct.uomId,
      name: initialProduct.productName,
      price_unit: round2(total),
    }]];
  }

  const noteBase = quote.created_by_role === "distribuidor"
    ? buildDistributorNote({ quote })
    : `PRESUPUESTADOR QUOTE: ${quote.id}\nDestino: ${quote.fulfillment_mode === "acopio" ? "ACOPIO" : "PRODUCCION"}`
      + (quote?.end_customer?.maps_url ? `\nMaps: ${quote.end_customer.maps_url}` : "")
      + (quote.note ? `\n${quote.note}` : "");
  let note = appendBudgetObservationToNote(noteBase, quote) + (sellerName ? `\nVendedor: ${sellerName}` : "");
  if (forcedNp) note += formatHardcodedOdooNote(forcedNp);
  note = appendPaymentMethodToNote(note, quote?.payload?.payment_method);
  note = appendSaleConditionToNote(note, quote);

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

  const orderReference = await buildQuoteOdooReference(quote, "np");
  let order = orderReference
    ? (await renameOrderToReference(odoo, orderId, orderReference))
    : (await odoo.executeKw("sale.order", "read", [[orderId]], { fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id", "client_order_ref"] }))?.[0];
  assertHardcodedOdooReferenceApplied(order, forcedNp);
  if (quote.created_by_role === "distribuidor") {
    await applyExternalCustomerToSaleOrder(odoo, orderId, { reference: order?.name || orderReference, externalCustomerName: quote?.end_customer?.name });
    if (order) order = { ...order, client_order_ref: buildClientOrderRefWithExternalCustomer(order?.name || orderReference, quote?.end_customer?.name) };
  }
  return { order, deposit_amount: round2(total) };
}

async function syncFinalQuoteToOdoo({ odoo, revisionQuote, originalQuote, approverUser }) {
  const pricelistId = resolveQuotePricelistId(originalQuote, revisionQuote?.pricelist_id, originalQuote?.pricelist_id);
  const sellerName = await resolveSellerDisplayNameForOdoo(originalQuote, approverUser);
  // Se reutiliza el mismo partner que ya se uso para la NP inicial (guardado en
  // bill_to_odoo_partner_id) en vez de volver a buscar/crear un partner por su cuenta:
  // eso es lo que hacia que NP y NV terminaran con clientes distintos en Odoo.
  let partnerId = toIntId(revisionQuote?.bill_to_odoo_partner_id) || toIntId(originalQuote?.bill_to_odoo_partner_id);
  if (!partnerId) {
    if (originalQuote.created_by_role === "distribuidor") {
      partnerId = await getCreatorOdooPartnerId(originalQuote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
      if (!partnerId) throw new Error("Distribuidor sin partner en Odoo");
    } else {
      const customerForOdoo = resolveCustomerForOdoo(originalQuote, revisionQuote);
      if (requiresBillingCustomerForQuote(originalQuote)) {
        const billingErr = validateBillingCustomerRequired(customerForOdoo);
        if (billingErr) throw new Error(billingErr);
      }
      partnerId = await findOrCreateCustomerPartner(odoo, customerForOdoo);
    }
  }
  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id invalido para Odoo");
  if (revisionQuote?.id && toIntId(revisionQuote?.bill_to_odoo_partner_id) !== partnerId) {
    try {
      await dbQuery(`update public.presupuestador_quotes set bill_to_odoo_partner_id=$2 where id=$1`, [revisionQuote.id, partnerId]);
      revisionQuote.bill_to_odoo_partner_id = partnerId;
    } catch {}
  }

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
    const priceUnit = calcDetailedUnitWithIva(l, revisionQuote.payload || originalQuote.payload || {}, originalQuote);
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

  let finalAmountToCharge = round2(Math.max(0, detailedTotal - advanceToDiscount));
  const forcedNv = getHardcodedOdooOverride(originalQuote, "nv");
  if (forcedNv?.amount) {
    const forcedFinalAmount = round2(forcedNv.amount);
    const adjustment = round2(forcedFinalAmount - finalAmountToCharge);
    if (adjustment !== 0) {
      const ph = byId.get(Number(PLACEHOLDER_PRODUCT_ID));
      const uomId = toIntId(ph?.uom_id);
      if (!uomId) throw new Error(`Producto ajuste hardcode sin uom_id: ${PLACEHOLDER_PRODUCT_ID}`);
      orderLines.push([0, 0, {
        product_id: Number(PLACEHOLDER_PRODUCT_ID),
        product_uom_qty: 1,
        product_uom: uomId,
        name: `Ajuste monto ${forcedNv.reference}`,
        price_unit: adjustment,
      }]);
    }
    finalAmountToCharge = forcedFinalAmount;
  }
  const referenceNv = await buildQuoteOdooReference(originalQuote, "nv");
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
  if (forcedNv) note += formatHardcodedOdooNote(forcedNv);
  note = appendBudgetObservationToNote(note, revisionQuote || originalQuote);
  note = appendPaymentMethodToNote(note, revisionQuote?.payload?.payment_method || originalQuote?.payload?.payment_method);
  note = appendSaleConditionToNote(note, revisionQuote?.payload?.condition_mode ? revisionQuote : originalQuote);

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
  if (originalQuote.created_by_role === "distribuidor") {
    const externalCustomerName = revisionQuote?.end_customer?.name || originalQuote?.end_customer?.name;
    await applyExternalCustomerToSaleOrder(odoo, orderId, { reference: referenceNv, externalCustomerName });
    if (order) order.client_order_ref = buildClientOrderRefWithExternalCustomer(referenceNv, externalCustomerName);
  }
  if (!order?.id) throw new Error("No se pudo leer sale.order final en Odoo");
  assertHardcodedOdooReferenceApplied(order, forcedNv);

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
  const pricelistId = resolveQuotePricelistId(quote, quote?.pricelist_id);
  const sellerName = await resolveSellerDisplayNameForOdoo(quote, approverUser);
  // Se reutiliza el mismo partner que ya se uso para la NP inicial (guardado en
  // bill_to_odoo_partner_id) en vez de volver a buscar/crear un partner por su cuenta:
  // eso es lo que hacia que NP y NV terminaran con clientes distintos en Odoo.
  let partnerId = toIntId(quote?.bill_to_odoo_partner_id);
  if (!partnerId) {
    if (quote.created_by_role === "distribuidor") {
      partnerId = await getCreatorOdooPartnerId(quote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
      if (!partnerId) throw new Error("Distribuidor sin partner en Odoo");
    } else {
      const customerForOdoo = resolveCustomerForOdoo(quote);
      if (requiresBillingCustomerForQuote(quote)) {
        const billingErr = validateBillingCustomerRequired(customerForOdoo);
        if (billingErr) throw new Error(billingErr);
      }
      partnerId = await findOrCreateCustomerPartner(odoo, customerForOdoo);
    }
  }
  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id invalido para Odoo");
  if (toIntId(quote?.bill_to_odoo_partner_id) !== partnerId) {
    try {
      await dbQuery(`update public.presupuestador_quotes set bill_to_odoo_partner_id=$2 where id=$1`, [quote.id, partnerId]);
      quote.bill_to_odoo_partner_id = partnerId;
    } catch {}
  }

  const kind = String(quote?.catalog_kind || "porton").toLowerCase().trim();
  const includeInitialProductLine = kind === "porton";
  const initialProduct = includeInitialProductLine ? await resolveInitialOdooProduct(odoo, getInitialOdooProductIdForQuote(quote)) : null;
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  if (!lines.length) throw new Error("El presupuesto no tiene items");

  const forcedDirectNv = getHardcodedOdooOverride(quote, "nv");
  const extraProductIds = includeInitialProductLine && initialProduct?.productId ? [Number(initialProduct.productId)] : [];
  const adjustmentProductIds = forcedDirectNv?.amount ? [Number(PLACEHOLDER_PRODUCT_ID)] : [];
  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean).concat(extraProductIds, adjustmentProductIds))];
  const products = await odoo.executeKw("product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));

  const orderLines = includeInitialProductLine ? [[0, 0, {
    product_id: Number(initialProduct.productId),
    product_uom_qty: 1,
    product_uom: initialProduct.uomId,
    name: initialProduct.productName,
    price_unit: 0,
  }]] : [];

  let detailedTotal = 0;
  for (const l of lines) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1) || 1;
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);
    const uomId = toIntId(p?.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);
    const priceUnit = calcDetailedUnitWithIva(l, quote.payload || {}, quote);
    detailedTotal = round2(detailedTotal + (qty * priceUnit));
    orderLines.push([0, 0, { product_id: productId, product_uom_qty: qty, product_uom: uomId, name: p.name, price_unit: priceUnit }]);
  }

  if (forcedDirectNv?.amount) {
    const forcedTotal = round2(forcedDirectNv.amount);
    const adjustment = round2(forcedTotal - detailedTotal);
    if (adjustment !== 0) {
      const ph = byId.get(Number(PLACEHOLDER_PRODUCT_ID));
      const uomId = toIntId(ph?.uom_id);
      if (!uomId) throw new Error(`Producto ajuste hardcode sin uom_id: ${PLACEHOLDER_PRODUCT_ID}`);
      orderLines.push([0, 0, {
        product_id: Number(PLACEHOLDER_PRODUCT_ID),
        product_uom_qty: 1,
        product_uom: uomId,
        name: `Ajuste monto ${forcedDirectNv.reference}`,
        price_unit: adjustment,
      }]);
    }
    detailedTotal = forcedTotal;
  }

  let note = `PRESUPUESTADOR FINAL DIRECTO: ${quote.id}`
    + `\nDestino: PRODUCCION`
    + `\nPortón sin medición: se envía el detalle completo sin instancia adicional de edición.`
    + (quote.note ? `\n${quote.note}` : "")
    + (sellerName ? `\nVendedor: ${sellerName}` : "");
  note = appendBudgetObservationToNote(note, quote);
  if (forcedDirectNv) note += formatHardcodedOdooNote(forcedDirectNv);
  note = appendPaymentMethodToNote(note, quote?.payload?.payment_method);
  note = appendSaleConditionToNote(note, quote);

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
  const referenceNv = await buildQuoteOdooReference(quote, "nv");
  const order = await renameOrderToReference(odoo, orderId, referenceNv);
  if (!order?.id) throw new Error("No se pudo leer sale.order directa en Odoo");
  if (quote.created_by_role === "distribuidor") {
    await applyExternalCustomerToSaleOrder(odoo, orderId, { reference: referenceNv, externalCustomerName: quote?.end_customer?.name });
    order.client_order_ref = buildClientOrderRefWithExternalCustomer(referenceNv, quote?.end_customer?.name);
  }
  assertHardcodedOdooReferenceApplied(order, forcedDirectNv);

  return {
    order,
    metrics: {
      detailed_total: detailedTotal,
      reference_nv: referenceNv,
    },
  };
}

async function markSyncingIfReady(id) {
  const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
  const quote = cur.rows?.[0];
  if (!quote) return null;
  if (shouldDeferSyncUntilMeasurement(quote)) return null;

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
async function syncLatestFinalCopyForApprovedAcopio({ originalQuote, approverUser, odoo }) {
  if (!originalQuote?.id) return null;
  const existing = await getFinalCopyByParentId(originalQuote.id);
  if (!existing) return null;
  if (existing.final_sale_order_id || ["syncing_odoo", "synced_odoo"].includes(String(existing.final_status || ""))) return existing;
  const approverUserId = Number(approverUser?.user_id || approverUser?.id || 0) || null;
  const updSync = await dbQuery(
    `update public.presupuestador_quotes
        set final_status='syncing_odoo',
            final_technical_decision='approved',
            final_technical_decision_at=now(),
            final_technical_decision_by_user_id=$2,
            final_logistics_decision='approved',
            final_logistics_decision_at=now(),
            final_logistics_decision_by_user_id=$2,
            final_technical_notes=null,
            final_logistics_notes=null
      where id=$1
        and coalesce(final_sale_order_id, 0) = 0
        and coalesce(final_status, 'draft') <> 'syncing_odoo'
      returning *`,
    [existing.id, approverUserId]
  );
  const qSync = updSync.rows?.[0] || existing;
  if (qSync.final_sale_order_id) return qSync;
  try {
    const { order, metrics } = await syncFinalQuoteToOdoo({ odoo, revisionQuote: qSync, originalQuote, approverUser });
    const updFinal = await dbQuery(
      `update public.presupuestador_quotes
          set final_status='synced_odoo',
              final_sale_order_id=$2,
              final_sale_order_name=$3,
              final_synced_at=now(),
              final_tolerance_percent=$4,
              final_tolerance_amount=$5,
              final_difference_amount=$6,
              final_absorbed_by_company=$7
        where id=$1 and coalesce(final_sale_order_id, 0) = 0
        returning *`,
      [qSync.id, Number(order.id), order.name, metrics.tolerance_percent, metrics.tolerance_amount, metrics.difference_amount, metrics.absorbed_by_company]
    );
    return updFinal.rows?.[0] || qSync;
  } catch (e) {
    // Only reset to draft if Odoo did NOT create the NV — prevents retry from generating a duplicate
    await dbQuery(`update public.presupuestador_quotes set final_status='draft' where id=$1 and coalesce(final_sale_order_id, 0) = 0`, [qSync.id]);
    throw e;
  }
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


  router.get("/customer-lookup", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user || {};
      const query = toText(req.query.query);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 25) || 25));
      if (query.length < 2) return res.json({ ok: true, customers: [] });

      const like = `%${query}%`;
      const digits = digitsOnly(query);
      const digitLike = digits ? `%${digits}%` : "";
      const r = await dbQuery(
        `select q.id,
                q.quote_number,
                q.end_customer,
                q.odoo_sale_order_name,
                q.final_sale_order_name,
                q.created_at,
                q.confirmed_at,
                q.catalog_kind,
                q.fulfillment_mode,
                q.status,
                u.username as created_by_username,
                u.full_name as created_by_full_name
           from public.presupuestador_quotes q
           left join public.presupuestador_users u on u.id = q.created_by_user_id
          where q.created_by_user_id = $1
            and coalesce(q.end_customer, '{}'::jsonb) <> '{}'::jsonb
            and (
              coalesce(q.end_customer->>'name', '') ilike $2
              or coalesce(q.end_customer->>'first_name', '') ilike $2
              or coalesce(q.end_customer->>'last_name', '') ilike $2
              or coalesce(q.end_customer->>'email', '') ilike $2
              or coalesce(q.end_customer->>'phone', '') ilike $2
              or coalesce(q.end_customer->>'address', '') ilike $2
              or coalesce(q.end_customer->>'city', '') ilike $2
              or coalesce(q.end_customer->>'maps_url', '') ilike $2
              or coalesce(q.quote_number::text, '') ilike $2
              or coalesce(q.odoo_sale_order_name, '') ilike $2
              or coalesce(q.final_sale_order_name, '') ilike $2
              or ($3 <> '' and regexp_replace(coalesce(q.end_customer->>'phone', ''), '\\D', '', 'g') like $3)
            )
          order by coalesce(q.confirmed_at, q.created_at) desc nulls last, q.id desc
          limit 150`,
        [Number(u.user_id), like, digitLike]
      );

      const seen = new Set();
      const customers = [];
      for (const row of r.rows || []) {
        const customer = row.end_customer && typeof row.end_customer === "object" ? row.end_customer : {};
        const name = toText(customer.name || [customer.first_name, customer.last_name].filter(Boolean).join(" "));
        const phone = toText(customer.phone);
        const email = toText(customer.email).toLowerCase();
        const address = toText(customer.address);
        const city = toText(customer.city);
        if (!name && !phone && !email && !address && !city) continue;
        const key = [normalizeNameForLookup(name), normalizePhoneForLookup(phone), email, normalizeNameForLookup(address), normalizeNameForLookup(city)].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        const reference = row.final_sale_order_name || row.odoo_sale_order_name || (row.quote_number ? `Presupuesto #${row.quote_number}` : "Presupuesto guardado");
        customers.push({
          key,
          quote_id: row.id,
          quote_number: row.quote_number,
          reference,
          catalog_kind: row.catalog_kind,
          fulfillment_mode: row.fulfillment_mode,
          status: row.status,
          created_by_username: row.created_by_username || "",
          created_by_full_name: row.created_by_full_name || "",
          customer: {
            name,
            first_name: toText(customer.first_name),
            last_name: toText(customer.last_name),
            phone,
            email,
            address,
            maps_url: toText(customer.maps_url),
            city,
          },
        });
        if (customers.length >= limit) break;
      }

      res.json({ ok: true, customers });
    } catch (e) { next(e); }
  });

  router.post("/", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const body = req.body || {};
      const created_by_role = (body.created_by_role === "distribuidor" || body.created_by_role === "vendedor") ? body.created_by_role : (u.is_distribuidor ? "distribuidor" : "vendedor");
      const catalog_kind = normCatalogKind(body.catalog_kind || "porton");
      const fulfillment_mode = catalog_kind === "otros" ? "produccion" : String(body.fulfillment_mode || "acopio").trim();
      if (!["produccion", "acopio"].includes(fulfillment_mode)) throw new Error("fulfillment_mode debe ser 'produccion' o 'acopio'");
      const linkedPortonQuoteId = getLinkedPortonQuoteIdFromBody(body);
      let linkedPortonQuote = null;
      if (linkedPortonQuoteId) {
        if (!isUuid(linkedPortonQuoteId)) return res.status(400).json({ ok: false, error: "linked_porton_quote_id invalido" });
        if (!["ipanel", "plegados", "otros", "puerta"].includes(catalog_kind)) return res.status(400).json({ ok: false, error: "Solo Ipanel, Plegados, Otros o Puerta pueden vincularse a un porton" });
        linkedPortonQuote = await getQuoteOwnedBySeller(linkedPortonQuoteId, u.user_id);
        if (!linkedPortonQuote) return res.status(404).json({ ok: false, error: "Presupuesto de porton no encontrado o no sos dueno" });
        if (String(linkedPortonQuote.catalog_kind || "porton").toLowerCase() !== "porton") return res.status(400).json({ ok: false, error: "El presupuesto vinculado debe ser de porton" });
      }
      const end_customer = body.end_customer || linkedPortonQuote?.end_customer || {};
      const custErr = validateEndCustomerDraft(end_customer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const payload = mergeLinkedPortonPayload(body.payload || {}, linkedPortonQuote);
      const note = body.note || null;
      const pricelist_id = resolveQuotePricelistId(created_by_role, body.pricelist_id, linkedPortonQuote?.pricelist_id);
      let bill_to_odoo_partner_id = body.bill_to_odoo_partner_id ? Number(body.bill_to_odoo_partner_id) : (linkedPortonQuote?.bill_to_odoo_partner_id ? Number(linkedPortonQuote.bill_to_odoo_partner_id) : null);
      if (created_by_role === "distribuidor" && !bill_to_odoo_partner_id) bill_to_odoo_partner_id = u.odoo_partner_id ? Number(u.odoo_partner_id) : null;

      const measurementFlow = getMeasurementFlowForQuote({ catalog_kind, fulfillment_mode, lines });
      const envioOdooPriceSnapshot = await computeEnvioOdooPriceSnapshot({ odoo, createdByRole: created_by_role, lines });

      const q = await dbQuery(
        `insert into public.presupuestador_quotes (
            quote_kind, parent_quote_id, created_by_user_id, created_by_role, fulfillment_mode, pricelist_id,
            bill_to_odoo_partner_id, end_customer, lines, payload, note, catalog_kind, status,
            commercial_decision, technical_decision, requires_measurement, measurement_mode, measurement_subtype,
            envio_odoo_price_snapshot
         )
         values ('original', null, $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, 'draft', 'pending', 'pending', $11, $12, $13, $14)
         returning *`,
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
          measurementFlow.requires_measurement,
          measurementFlow.measurement_mode,
          measurementFlow.measurement_subtype,
          envioOdooPriceSnapshot,
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
               where ${onlyOriginal}
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
      } else if (scope === "commercial_approved") {
        if (!u.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               where ${onlyOriginal}
                 and q.commercial_decision = 'approved'
                 and q.status not in ('pending_approvals', 'draft')
               order by q.commercial_at desc nulls last, q.id desc limit 200`;
      } else if (scope === "technical_approved") {
        if (!u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               where ${onlyOriginal}
                 and q.technical_decision = 'approved'
                 and q.status not in ('pending_approvals', 'draft')
               order by q.technical_at desc nulls last, q.id desc limit 200`;
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
      } else if (scope === "commercial_acopio_all") {
        if (!u.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               where ${onlyOriginal} and q.fulfillment_mode = 'acopio'
               order by q.confirmed_at desc nulls last, q.id desc limit 200`;
      } else if (scope === "technical_acopio_all") {
        if (!u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               where ${onlyOriginal} and q.fulfillment_mode = 'acopio'
               order by q.confirmed_at desc nulls last, q.id desc limit 200`;
      } else if (scope === "production_sent") {
        if (!u.is_enc_comercial && !u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.*,
                      u.username as created_by_username,
                      u.full_name as created_by_full_name,
                      fc.final_copy_id,
                      fc.final_copy_status,
                      fc.final_copy_sale_order_name,
                      fc.final_copy_quote_status,
                      fc.final_copy_synced_at,
                      coalesce(q.final_sale_order_name, fc.final_copy_sale_order_name, q.odoo_sale_order_name) as production_sale_order_name,
                      coalesce(q.measurement_review_at, fc.final_copy_synced_at, q.final_synced_at, q.production_delivery_committed_at, q.confirmed_at) as production_sent_at
                 from public.presupuestador_quotes q
                 left join public.presupuestador_users u on u.id = q.created_by_user_id
                 left join lateral (
                   select c.id as final_copy_id,
                          c.final_status as final_copy_status,
                          c.final_sale_order_name as final_copy_sale_order_name,
                          c.status as final_copy_quote_status,
                          c.final_synced_at as final_copy_synced_at,
                          c.final_sale_order_id as final_copy_sale_order_id
                     from public.presupuestador_quotes c
                    where c.quote_kind = 'copy'
                      and c.parent_quote_id = q.id
                    order by c.final_synced_at desc nulls last, c.created_at desc nulls last, c.id desc
                    limit 1
                 ) fc on true
                where ${onlyOriginal}
                  and coalesce(q.catalog_kind, 'porton') in ('porton', 'ipanel', 'puerta')
                  and (
                    (q.measurement_status = 'approved' and (
                      q.final_status = 'synced_odoo'
                      or coalesce(q.final_sale_order_id, 0) <> 0
                      or q.final_sale_order_name is not null
                      or fc.final_copy_status = 'synced_odoo'
                      or coalesce(fc.final_copy_sale_order_id, 0) <> 0
                    ))
                    or fc.final_copy_status = 'synced_odoo'
                    or coalesce(fc.final_copy_sale_order_id, 0) <> 0
                  )
                order by coalesce(q.measurement_review_at, fc.final_copy_synced_at, q.final_synced_at, q.production_delivery_committed_at, q.confirmed_at) desc nulls last, q.id desc
                limit 500`;
      } else if (scope === "portones_estado") {
        if (!u.is_rev_tecnica && !u.is_superuser && !u.is_enc_comercial && !u.is_logistica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select q.id, q.quote_number, q.odoo_sale_order_name, q.final_sale_order_name,
                      q.status, q.commercial_decision, q.technical_decision,
                      q.measurement_status, q.requires_measurement, q.measurement_review_at,
                      q.measurement_share_enabled_at, q.measurement_client_accepted_at,
                      q.measurement_share_token,
                      q.measurement_link_sent_confirmed_at, q.measurement_link_sent_confirmed_by_user_id,
                      q.payload->'measurement_client_acceptance' as measurement_client_acceptance,
                      q.measurement_commercial_review_required, q.measurement_commercial_review_status,
                      q.fulfillment_mode, q.final_status, q.final_technical_decision, q.final_logistics_decision,
                      q.acopio_to_produccion_status, q.catalog_kind,
                      q.end_customer, q.created_at, q.updated_at,
                      q.payload->'extra_contact' as extra_contact,
                      q.created_by_role,
                      u.username as created_by_username, u.full_name as created_by_full_name,
                      u.phone as created_by_phone,
                      fc.final_copy_id, fc.final_copy_status, fc.final_copy_sale_order_name
               from public.presupuestador_quotes q
               left join public.presupuestador_users u on u.id = q.created_by_user_id
               left join lateral (
                 select c.id as final_copy_id, c.final_status as final_copy_status,
                        c.final_sale_order_name as final_copy_sale_order_name
                 from public.presupuestador_quotes c
                 where c.quote_kind = 'copy' and c.parent_quote_id = q.id
                 order by c.created_at desc nulls last, c.id desc
                 limit 1
               ) fc on true
               where q.quote_kind = 'original'
                 and coalesce(q.catalog_kind, 'porton') = 'porton'
                 and q.status != 'draft'
               order by q.updated_at desc nulls last, q.id desc
               limit 500`;
      } else {
        return res.status(400).json({ ok: false, error: "scope invalido" });
      }
      const r = await dbQuery(sql, params);
      res.json({ ok: true, quotes: r.rows || [] });
    } catch (e) { next(e); }
  });

  // Control manual (no automatico) para "Estado de Portones": el usuario confirma a mano
  // que ya le mando el link de aceptacion al cliente. Mismos roles que pueden ver esa pantalla.
  router.post("/:id/measurement-link-sent-confirm", async (req, res, next) => {
    try {
      const u = req.user;
      if (!u.is_rev_tecnica && !u.is_superuser && !u.is_enc_comercial && !u.is_logistica) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      const r = await dbQuery(
        `update public.presupuestador_quotes
            set measurement_link_sent_confirmed_at = now(),
                measurement_link_sent_confirmed_by_user_id = $2
          where id = $1
          returning id, measurement_link_sent_confirmed_at, measurement_link_sent_confirmed_by_user_id`,
        [id, Number(u.user_id)],
      );
      const row = r.rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      res.json({ ok: true, quote: row });
    } catch (e) { next(e); }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const r = await dbQuery(
        `select q.*, fc.final_copy_id, fc.final_copy_status, fc.final_sale_order_name, fc.final_copy_quote_status
         from public.presupuestador_quotes q
         left join lateral (
           select c.id as final_copy_id,
                  c.final_status as final_copy_status,
                  c.final_sale_order_name as final_sale_order_name,
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
      const canCommercial = !!u.is_enc_comercial;
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
      if (body.catalog_kind && normCatalogKind(body.catalog_kind) !== normCatalogKind(catalog_kind_locked)) return res.status(400).json({ ok: false, error: "No podes cambiar el tipo de cotizador (porton/ipanel/plegados/otros/puerta)" });
      const catalog_kind = normCatalogKind(body.catalog_kind || catalog_kind_locked);
      if (!["draft", "rejected_commercial", "rejected_technical", "synced_odoo"].includes(quote.status)) throw new Error("Solo se edita en borrador o en acopio ya enviado");
      if (quote.status === "synced_odoo" && quote.fulfillment_mode !== "acopio") throw new Error("Solo se puede editar un presupuesto sincronizado si está en acopio");

      const nextEndCustomer = body.end_customer !== undefined ? body.end_customer : quote.end_customer;
      const custErr = validateEndCustomerDraft(nextEndCustomer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });

      const requestedFulfillmentMode = body.fulfillment_mode ? String(body.fulfillment_mode) : quote.fulfillment_mode;
      const fulfillment_mode = catalog_kind === "otros" ? "produccion" : requestedFulfillmentMode;
      if (!["produccion", "acopio"].includes(fulfillment_mode)) throw new Error("fulfillment_mode invalido");

      const nextAcopioStatus = quote.status === "synced_odoo" && quote.fulfillment_mode === "acopio"
        ? (quote.acopio_to_produccion_status || null)
        : quote.acopio_to_produccion_status;

      const nextLines = body.lines !== undefined ? body.lines : quote.lines;
      const measurementFlow = getMeasurementFlowForQuote({ catalog_kind, fulfillment_mode, lines: nextLines });
      // No pisar measurement_status si el presupuesto ya está en un estado activo del circuito de
      // medición (p.ej. devuelto al vendedor por el medidor/técnica): ese devuelve status='draft'
      // a propósito para que se pueda editar, y un guardado normal no debe perder esa marca.
      const currentMeasurementStatus = String(quote.measurement_status || "none").toLowerCase().trim();
      const nextMeasurementStatus =
        quote.status === "draft" && !ACTIVE_MEASUREMENT_WORKFLOW_STATUSES.includes(currentMeasurementStatus)
          ? measurementFlow.measurement_status
          : quote.measurement_status;
      // El precio de Envío congelado solo se recalcula cuando el usuario aprieta
      // explícitamente "Actualizar presupuesto" (refresh_emission_date). En
      // cualquier otro guardado se mantiene el valor ya congelado tal cual estaba.
      const isRefreshEmissionDate = body.refresh_emission_date === true;
      const envioOdooPriceSnapshot = isRefreshEmissionDate
        ? await computeEnvioOdooPriceSnapshot({ odoo, createdByRole: quote.created_by_role, lines: nextLines })
        : quote.envio_odoo_price_snapshot;

      const upd = await dbQuery(
        `update public.presupuestador_quotes
            set fulfillment_mode=$2,
                pricelist_id=$3,
                bill_to_odoo_partner_id=$4,
                end_customer=$5::jsonb,
                lines=$6::jsonb,
                payload=$7::jsonb,
                note=$8,
                catalog_kind=$9,
                requires_measurement=$10,
                measurement_mode=$11,
                measurement_subtype=$12,
                measurement_status=$13,
                acopio_to_produccion_status=$14,
                created_at=case when $15::boolean then now() else created_at end,
                envio_odoo_price_snapshot=$16
          where id=$1
          returning *`,
        [
          id,
          fulfillment_mode,
          resolveQuotePricelistId(quote, body.pricelist_id, quote.pricelist_id),
          body.bill_to_odoo_partner_id !== undefined ? (body.bill_to_odoo_partner_id ? Number(body.bill_to_odoo_partner_id) : null) : quote.bill_to_odoo_partner_id,
          JSON.stringify(body.end_customer !== undefined ? body.end_customer : quote.end_customer),
          JSON.stringify(nextLines),
          JSON.stringify(body.payload !== undefined ? preserveLinkedPortonPayload(quote.payload, body.payload) : quote.payload),
          body.note !== undefined ? body.note : quote.note,
          catalog_kind,
          measurementFlow.requires_measurement,
          measurementFlow.measurement_mode,
          measurementFlow.measurement_subtype,
          nextMeasurementStatus,
          nextAcopioStatus,
          isRefreshEmissionDate,
          envioOdooPriceSnapshot,
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
      const ipanelMeasuresErr = validateIpanelLamasLogicalMeasuresForQuote(quote);
      if (ipanelMeasuresErr) return res.status(400).json({ ok: false, error: ipanelMeasuresErr });
      if (vendedorNeedsEndCustomerName(quote) && !getEndCustomerName(quote)) return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      if (quote.status === "synced_odoo" && quote.fulfillment_mode === "acopio") {
        return res.status(409).json({ ok: false, error: "Este presupuesto ya está en Acopio. Guardá los cambios y usá 'Solicitar paso a Producción'." });
      }
      if (!["draft", "rejected_commercial", "rejected_technical"].includes(quote.status)) throw new Error("Solo confirmar desde borrador");

      const quoteCatalogKind = normCatalogKind(quote.catalog_kind || "porton");
      const fm = quoteCatalogKind === "otros" ? "produccion" : String(fulfillment_mode || quote.fulfillment_mode || "acopio").trim();
      if (!["produccion", "acopio"].includes(fm)) return res.status(400).json({ ok: false, error: "fulfillment_mode invalido (usar 'acopio' o 'produccion')" });

      const measurementFlow = getMeasurementFlowForQuote({
        catalog_kind: quote.catalog_kind || "porton",
        fulfillment_mode: fm,
        lines: quote.lines,
      });

      const upd = await dbQuery(
        `update public.presupuestador_quotes
         set status='pending_approvals',
             fulfillment_mode=$2,
             confirmed_at=now(),
             requires_measurement=$5,
             measurement_status=$6,
             measurement_mode=$7,
             measurement_subtype=$8,
             commercial_decision=$3,
             technical_decision=$4,
             commercial_by_user_id=null,
             commercial_at=null,
             technical_by_user_id=null,
             technical_at=null,
             commercial_notes=null,
             technical_notes=null,
             rejection_notes=null
         where id=$1
         returning *`,
        [
          id,
          fm,
          "pending",
          "pending",
          measurementFlow.requires_measurement,
          measurementFlow.measurement_status,
          measurementFlow.measurement_mode,
          measurementFlow.measurement_subtype,
        ]
      );
      const confirmed = upd.rows?.[0] || quote;
      await submitLinkedDoorsForQuote({ quote: confirmed });
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
    // Re-read from DB right before calling Odoo to prevent race-condition duplicates
    const freshRow = (await dbQuery(`select odoo_sale_order_id, final_sale_order_id, status from public.presupuestador_quotes where id=$1`, [qSync.id])).rows?.[0];
    if (freshRow?.odoo_sale_order_id || freshRow?.final_sale_order_id) {
      // Already synced by a concurrent request — return current state without calling Odoo
      const cur = (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [qSync.id])).rows?.[0];
      return { quote: cur || qSync, directFinal: false, alreadySynced: true };
    }

    const forced = getHardcodedOdooOverride(qSync);
    const directTechnicalOnly = isDirectProductionTechnicalOnlyQuote(qSync);
    const directFinal = forced?.stage === "nv" || directTechnicalOnly || (qSync.fulfillment_mode === "produccion" && !quoteNeedsMeasurement(qSync));
    if (directFinal) {
      const { order } = await syncDirectProductionFinalToOdoo({ odoo, quote: qSync, approverUser });
      const upd = await dbQuery(
        `update public.presupuestador_quotes
            set status='synced_odoo',
                odoo_sale_order_id=$2,
                odoo_sale_order_name=$3,
                deposit_amount=0,
                final_status='synced_odoo',
                final_sale_order_id=$2,
                final_sale_order_name=$3,
                final_synced_at=now(),
                final_tolerance_percent=0,
                final_tolerance_amount=0,
                final_difference_amount=0,
                final_absorbed_by_company=false,
                requires_measurement=case when $4::boolean then true else false end,
                measurement_mode=case when $4::boolean then 'tecnica_only' else measurement_mode end,
                measurement_subtype=case when $4::boolean then 'sin_medicion' else measurement_subtype end,
                measurement_status=case when $4::boolean then 'pending' else 'none' end
          where id=$1 and status='syncing_odoo' and odoo_sale_order_id is null
          returning *`,
        [qSync.id, Number(order.id), order.name, directTechnicalOnly]
      );
      const syncedQuote = upd.rows?.[0] || qSync;
      // Los pedidos directFinal (sin medicion) nunca pasan por la aceptacion del
      // cliente, asi que preproduccion_valores no se carga solo. Los "tecnica_only"
      // todavia tienen que pasar la revision tecnica interna (measurement_status
      // 'pending'), asi que esos se dejan para que ese paso dispare la carga.
      if (!directTechnicalOnly) {
        try {
          await triggerPreproductionForClientAcceptance(odoo, syncedQuote);
        } catch (err) {
          console.error("[quotes.routes] triggerPreproductionForClientAcceptance (directFinal) fallo:", err);
        }
      }
      return { quote: syncedQuote, order, directFinal: true, directTechnicalOnly };
    }

    const { order, deposit_amount } = await syncQuoteToOdoo({ odoo, quote: qSync, approverUser });
    const upd2 = await dbQuery(
      `update public.presupuestador_quotes
          set status='synced_odoo',
              odoo_sale_order_id=$2,
              odoo_sale_order_name=$3,
              deposit_amount=$4,
              requires_measurement = case
                when exists (
                  select 1
                  from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem
                  where (elem->>'product_id') = $5
                ) then true
                else requires_measurement
              end,
              measurement_status = case
                when fulfillment_mode='produccion'
                 and (
                   requires_measurement = true
                   or exists (
                     select 1
                     from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem
                     where (elem->>'product_id') = $5
                   )
                 )
                 and (measurement_status is null or measurement_status='none')
                then 'pending'
                else measurement_status
              end
        where id=$1 and status='syncing_odoo'
        returning *`,
        [qSync.id, Number(order.id), order.name, deposit_amount, String(MEASUREMENT_PRODUCT_ID)]
      );
      return { quote: upd2.rows?.[0] || qSync, order, directFinal: false };
  }

  router.post("/:id/review/commercial", requireRole("is_enc_comercial"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes, billing_customer } = req.body || {};
      await normalizeIfSyncingButHasOrder(id);
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (quote.status === "synced_odoo" || quote.status === "syncing_odoo") return res.json({ ok: true, quote });
      if (quote.status !== "pending_approvals") return res.status(400).json({ ok: false, error: "No esta en revision (pending_approvals)" });
      if (quote.commercial_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(`update public.presupuestador_quotes set status='draft', commercial_decision='rejected', commercial_by_user_id=$2, commercial_at=now(), commercial_notes=$3, rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'COMERCIAL: ' || $3) where id=$1 returning *`, [id, Number(u.user_id), msg]);
        return res.json({ ok: true, quote: upd.rows[0] });
      }
      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const nextBillingCustomer = normalizeBillingCustomer(billing_customer || {});
      if (requiresBillingCustomerForQuote(quote)) {
        const billingErr = validateBillingCustomerRequired(nextBillingCustomer);
        if (billingErr) return res.status(400).json({ ok: false, error: billingErr });
      } else if (hasBillingCustomerData(nextBillingCustomer)) {
        const billingErr = validateBillingDocument(nextBillingCustomer);
        if (billingErr) return res.status(400).json({ ok: false, error: billingErr });
      }
      const mergedPayload = {
        ...(quote.payload && typeof quote.payload === "object" ? quote.payload : {}),
      };
      if (hasBillingCustomerData(nextBillingCustomer)) mergedPayload.billing_customer = nextBillingCustomer;
      else delete mergedPayload.billing_customer;

      const upd1 = await dbQuery(
        `update public.presupuestador_quotes
            set commercial_decision='approved',
                commercial_by_user_id=$2,
                commercial_at=now(),
                commercial_notes=$3,
                payload=$4::jsonb
          where id=$1 and status='pending_approvals' and commercial_decision='pending'
          returning *`,
        [id, Number(u.user_id), notes || null, JSON.stringify(mergedPayload)]
      );
      const q1 = upd1.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
      let qSync = await markSyncingIfReady(id);
      if (!qSync) return res.json({ ok: true, quote: q1 });

      await commitQuoteProductionWeek(id);
      qSync = (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0] || qSync;

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
        // Only reset to pending_approvals if Odoo did NOT create an order.
        // If odoo_sale_order_id was already written, keep synced_odoo to prevent a duplicate sync on retry.
        await dbQuery(`update public.presupuestador_quotes set status='pending_approvals', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2) where id=$1 and status='syncing_odoo' and odoo_sale_order_id is null`, [id, msg]);
        const isPortonPendingError = /portón vinculado|porton vinculado|Primero debe quedar aprobado/i.test(msg);
        if (isPortonPendingError) return res.status(400).json({ ok: false, error: msg });
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
      let qSync = await markSyncingIfReady(id);
      if (!qSync) return res.json({ ok: true, quote: q1 });

      await commitQuoteProductionWeek(id);
      qSync = (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0] || qSync;

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
        // Only reset to pending_approvals if Odoo did NOT create an order.
        // If odoo_sale_order_id was already written, keep synced_odoo to prevent a duplicate sync on retry.
        await dbQuery(`update public.presupuestador_quotes set status='pending_approvals', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2) where id=$1 and status='syncing_odoo' and odoo_sale_order_id is null`, [id, msg]);
        const isPortonPendingError = /portón vinculado|porton vinculado|Primero debe quedar aprobado/i.test(msg);
        if (isPortonPendingError) return res.status(400).json({ ok: false, error: msg });
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
    const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
    const quote = cur.rows?.[0];
    if (!quote) return null;
    if (quote.fulfillment_mode !== "acopio") return null;
    if (quote.acopio_to_produccion_status !== "pending") return null;
    if (quote.acopio_to_produccion_commercial_decision !== "approved" || quote.acopio_to_produccion_technical_decision !== "approved") return null;

    const measurementFlow = getMeasurementFlowForQuote({
      catalog_kind: quote.catalog_kind || "porton",
      fulfillment_mode: "produccion",
      lines: quote.lines,
    });

    const upd = await dbQuery(
      `update public.presupuestador_quotes
          set fulfillment_mode='produccion',
              acopio_to_produccion_status='approved',
              requires_measurement=$2,
              measurement_mode=$3,
              measurement_subtype=$4,
              measurement_status=$5
        where id=$1
          and fulfillment_mode='acopio'
          and acopio_to_produccion_status='pending'
          and acopio_to_produccion_commercial_decision='approved'
          and acopio_to_produccion_technical_decision='approved'
        returning *`,
      [
        id,
        measurementFlow.requires_measurement,
        measurementFlow.measurement_mode,
        measurementFlow.measurement_subtype,
        measurementFlow.measurement_status,
      ]
    );
    return upd.rows?.[0] || null;
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
      let qFinal = await finalizeAcopioToProduccionIfReady(id);
      if (qFinal) {
        await commitQuoteProductionWeek(id);
        qFinal = (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0] || qFinal;
      }
      if (qFinal && !quoteNeedsMeasurement(qFinal)) {
        await ensureFinalCopyForAcopioToProduction(qFinal);
        await syncLatestFinalCopyForApprovedAcopio({ originalQuote: qFinal, approverUser: u, odoo });
      }
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
      let qFinal = await finalizeAcopioToProduccionIfReady(id);
      if (qFinal) {
        await commitQuoteProductionWeek(id);
        qFinal = (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0] || qFinal;
      }
      if (qFinal && !quoteNeedsMeasurement(qFinal)) {
        await ensureFinalCopyForAcopioToProduction(qFinal);
        await syncLatestFinalCopyForApprovedAcopio({ originalQuote: qFinal, approverUser: u, odoo });
      }
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

      const measurementFlow = getMeasurementFlowForQuote({
        catalog_kind: quote.catalog_kind || "porton",
        fulfillment_mode: "produccion",
        lines: quote.lines,
      });

      const upd = await dbQuery(
        `update public.presupuestador_quotes
            set fulfillment_mode='produccion',
                requires_measurement=$2,
                measurement_mode=$3,
                measurement_subtype=$4,
                measurement_status=$5
          where id=$1
          returning *`,
        [
          id,
          measurementFlow.requires_measurement,
          measurementFlow.measurement_mode,
          measurementFlow.measurement_subtype,
          measurementFlow.measurement_status,
        ]
      );
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
      if (q.fulfillment_mode === "acopio") return res.status(409).json({ ok: false, error: "Este ajuste corresponde a un presupuesto en acopio. Guardá los cambios y usá 'Solicitar paso a Producción'." });
      if (q.final_status === "synced_odoo" || q.final_status === "syncing_odoo") return res.json({ ok: true, quote: q });
      const custErr = validateEndCustomerRequired(q.end_customer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });
      const bizErr = validateBusinessRequired(q.payload || {}, q.catalog_kind || "porton");
      if (bizErr) return res.status(400).json({ ok: false, error: bizErr });
      const ipanelMeasuresErr = validateIpanelLamasLogicalMeasuresForQuote(q);
      if (ipanelMeasuresErr) return res.status(400).json({ ok: false, error: ipanelMeasuresErr });
      const parentId = String(q.parent_quote_id || "").trim();
      if (!parentId) return res.status(400).json({ ok: false, error: "La copia no tiene parent_quote_id" });
      const pr = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [parentId]);
      const orig = pr.rows?.[0];
      if (!orig) return res.status(400).json({ ok: false, error: "No se encontro el original" });
      if (!orig.odoo_sale_order_id) return res.status(409).json({ ok: false, error: "El original todavía no fue enviado a Odoo" });
      if (quoteNeedsMeasurement(orig) && orig.measurement_status !== "approved") return res.status(409).json({ ok: false, error: "Primero debe estar aprobada la medición" });

      const updSync = await dbQuery(`update public.presupuestador_quotes set final_status='syncing_odoo', final_technical_decision='approved', final_technical_decision_at=now(), final_technical_decision_by_user_id=$2, final_logistics_decision='approved', final_logistics_decision_at=now(), final_logistics_decision_by_user_id=$2, final_technical_notes=null, final_logistics_notes=null where id=$1 and coalesce(final_sale_order_id, 0) = 0 and coalesce(final_status, 'draft') <> 'syncing_odoo' returning *`, [id, Number(u.user_id)]);
      const qSync = updSync.rows?.[0] || q;
      if (qSync.final_sale_order_id) return res.json({ ok: true, quote: qSync });

      try {
        const { order, metrics } = await syncFinalQuoteToOdoo({ odoo, revisionQuote: qSync, originalQuote: orig, approverUser: u });
        const updFinal = await dbQuery(`update public.presupuestador_quotes set final_status='synced_odoo', final_sale_order_id=$2, final_sale_order_name=$3, final_synced_at=now(), final_tolerance_percent=$4, final_tolerance_amount=$5, final_difference_amount=$6, final_absorbed_by_company=$7 where id=$1 and coalesce(final_sale_order_id, 0) = 0 returning *`, [id, Number(order.id), order.name, metrics.tolerance_percent, metrics.tolerance_amount, metrics.difference_amount, metrics.absorbed_by_company]);
        return res.json({ ok: true, quote: updFinal.rows?.[0] || qSync, order, metrics });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar cotización final a Odoo");
        console.error("FINAL SYNC ODOO ERROR:", msg);
        // Only reset to draft if Odoo did NOT create the NV — prevents retry from generating a duplicate
        await dbQuery(`update public.presupuestador_quotes set final_status='draft' where id=$1 and coalesce(final_sale_order_id, 0) = 0`, [id]);
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

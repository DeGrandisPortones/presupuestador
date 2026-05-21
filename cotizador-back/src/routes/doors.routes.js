import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureDoorsSchema } from "../doorsSchema.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import { createOdooClient } from "../odoo.js";
import {
  calcDoorTechnicalDimensions,
  getDoorTechnicalRules,
} from "../doorTechnicalRulesDb.js";

const ODOO_DOOR_PRODUCT_ID = Number(process.env.ODOO_DOOR_PRODUCT_ID || 3226);
const IVA_RATE = 0.21;
const DOOR_STRUCTURE_CATALOG_KIND = "puerta";
const DOOR_STRUCTURE_FALLBACK_CATALOG_KIND = "otros";
const CUSTOMER_KEYS = Object.freeze(["name", "phone", "email", "address", "maps_url", "city", "first_name", "last_name"]);

function requireSeller(req, res, next) {
  if (!req.user?.is_vendedor) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function requireCommercial(req, res, next) {
  if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function requireTech(req, res, next) {
  if (!req.user?.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}

function isUuid(v) { return /^[0-9a-fA-F-]{36}$/.test(String(v || "").trim()); }
function safeText(v) { return String(v ?? "").trim(); }
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
function toInt(v) { const n = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(n) ? n : null; }
function nowDate() { return new Date().toISOString().slice(0, 10); }
function nowDateTime() { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function parseAmount(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? round2(n) : 0; }
function normalizeMode(value, fallback = "acopio") { const v = safeText(value).toLowerCase(); return ["acopio", "produccion"].includes(v) ? v : fallback; }
function extractReferenceCore(value) { const raw = safeText(value); if (!raw) return ""; return raw.replace(/^(NV|NP|S|P|I)+/i, ""); }
function normalizeDoorBaseCode(value) { const core = extractReferenceCore(value); return core ? `P${core}` : ""; }
function buildFallbackDoorCode(seed) { const raw = safeText(seed).replace(/[^A-Za-z0-9]/g, "").toUpperCase(); return `P${raw || "PUERTA"}`; }
function buildDoorCodeFromQuote(quote) {
  if (!quote) return "";
  const base = safeText(quote.odoo_sale_order_name) || safeText(quote.final_sale_order_name) || safeText(quote.quote_number) || String(quote.id || "").slice(0, 8);
  return normalizeDoorBaseCode(base) || buildFallbackDoorCode(String(quote.id || "").slice(0, 8));
}
function buildLinkedPortonLabel(quote) {
  if (!quote) return "";
  return safeText(quote.odoo_sale_order_name) || safeText(quote.final_sale_order_name) || safeText(quote.quote_number) || (safeText(quote.id) ? `Presupuesto ${String(quote.id).slice(0, 8)}` : "");
}
function buildStandaloneDoorCode(id) { return `P${String(Number(id || 0)).padStart(5, "0")}`; }
function canReadDoor(user, door) { if (!user || !door) return false; const isOwner = String(door.created_by_user_id) === String(user.user_id); return isOwner || !!user.is_enc_comercial || !!user.is_rev_tecnica || !!user.is_superuser; }
function customerDisplayName(customer = {}) {
  const direct = safeText(customer?.name);
  if (direct) return direct;
  return [safeText(customer?.first_name), safeText(customer?.last_name)].filter(Boolean).join(" ");
}
function normalizeCustomer(value) {
  const base = value && typeof value === "object" ? value : {};
  const out = CUSTOMER_KEYS.reduce((acc, key) => { acc[key] = safeText(base?.[key]); return acc; }, {});
  if (!out.name) out.name = [out.first_name, out.last_name].filter(Boolean).join(" ");
  if (!out.first_name && out.name) out.first_name = out.name.split(/\s+/)[0] || out.name;
  if (!out.last_name && out.name) out.last_name = out.name.split(/\s+/).slice(1).join(" ");
  return out;
}
function customerFromQuote(quote) { return normalizeCustomer(quote?.end_customer || {}); }
function emptyCustomer() { return normalizeCustomer({}); }
function mergeCustomers(...sources) {
  const merged = emptyCustomer();
  for (const source of sources) {
    const candidate = normalizeCustomer(source);
    for (const key of CUSTOMER_KEYS) if (!merged[key] && candidate[key]) merged[key] = candidate[key];
  }
  if (!merged.name) merged.name = [merged.first_name, merged.last_name].filter(Boolean).join(" ");
  return merged;
}
function overlayCustomer(existing, merged) {
  const base = normalizeCustomer(existing);
  const normalized = normalizeCustomer(merged);
  for (const key of CUSTOMER_KEYS) if (normalized[key]) base[key] = normalized[key];
  if (!base.name) base.name = [base.first_name, base.last_name].filter(Boolean).join(" ");
  return base;
}
function buildChecklist(responsible = "") {
  const date = nowDate();
  const mk = (section, item) => ({ section, item, status: "Pendiente", notes: "", responsible, date, ok: false });
  return [
    mk("A", "Confirmar que la puerta esta vinculada al porton correcto."),
    mk("B", "Definir sentido de giro."),
    mk("C", "Definir mano desde exterior."),
    mk("D", "Verificar interferencias y accesorios."),
    mk("E", "Validar estructura y revestimiento Ipanel."),
    mk("F", "Validar con obra/cliente antes de fabricar."),
  ];
}
function buildInitialDoorRecord({ quote = null, user }) {
  const responsible = safeText(user?.full_name || user?.username);
  const endCustomer = quote ? customerFromQuote(quote) : emptyCustomer();
  return {
    end_customer: endCustomer,
    obra_cliente: customerDisplayName(endCustomer),
    nv: "",
    tipo: "Puerta principal",
    vista: "Exterior",
    responsable: responsible,
    fecha: nowDate(),
    asociado_porton: buildLinkedPortonLabel(quote),
    fulfillment_mode: safeText(quote?.fulfillment_mode),
    sentido_apertura: "ADENTRO",
    mano_bisagras: "IZQUIERDA",
    angulo_apertura: "90",
    angulo_otro: "",
    motivo_no_estandar: "",
    interferencias: "Ninguna",
    accesorios: "Ninguno",
    tipo_estructura: "",
    tipo_hoja: "",
    lado_cerradura: "",
    ancho_puerta_mm: "",
    alto_puerta_mm: "",
    ancho_marco_mm: "",
    alto_marco_mm: "",
    structure_quote_id: "",
    structure_quote_label: "",
    ipanel_quote_id: "",
    ipanel_quote_label: "",
    observaciones: "",
    checklist: buildChecklist(responsible),
  };
}
function extractDoorCore(record) {
  const r = record && typeof record === "object" ? record : {};
  const endCustomer = r.end_customer && typeof r.end_customer === "object" ? r.end_customer : {};
  const fulfillmentMode = safeText(r.fulfillment_mode).toLowerCase();
  return {
    customer: {
      ...normalizeCustomer(endCustomer),
      name: safeText(endCustomer?.name || r?.obra_cliente || [endCustomer?.first_name, endCustomer?.last_name].filter(Boolean).join(" ")),
    },
    anchoPuertaMm: safeText(r.ancho_puerta_mm || r.ancho_marco_mm),
    altoPuertaMm: safeText(r.alto_puerta_mm || r.alto_marco_mm),
    structureQuoteId: safeText(r.structure_quote_id),
    ipanelQuoteId: safeText(r.ipanel_quote_id),
    fulfillmentMode: ["acopio", "produccion"].includes(fulfillmentMode) ? fulfillmentMode : "",
  };
}
async function getQuoteById(quoteId) {
  if (!quoteId || !isUuid(quoteId)) return null;
  const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [quoteId]);
  return r.rows?.[0] || null;
}
async function getQuoteOwnedBySeller(quoteId, userId) {
  const r = await dbQuery(`select * from public.presupuestador_quotes where id = $1 and created_by_user_id = $2 limit 1`, [quoteId, Number(userId)]);
  return r.rows?.[0] || null;
}
async function getReadableQuote(quoteId, user) {
  const quote = await getQuoteById(quoteId);
  if (!quote) return null;
  const isOwner = String(quote.created_by_user_id) === String(user.user_id);
  const canCommercial = !!user.is_enc_comercial && quote.created_by_role === "vendedor";
  const canTech = !!user.is_rev_tecnica;
  return (isOwner || canCommercial || canTech || user.is_superuser) ? quote : null;
}
async function getCreatorOdooPartnerId(createdByUserId) {
  const r = await dbQuery(`select odoo_partner_id from public.presupuestador_users where id=$1 limit 1`, [Number(createdByUserId)]);
  return toInt(r.rows?.[0]?.odoo_partner_id);
}
async function getLinkedQuoteForDoor(door) { return door?.linked_quote_id ? await getQuoteById(door.linked_quote_id) : null; }
async function getStructureQuoteForDoor(door) {
  const recordId = safeText(door?.record?.structure_quote_id);
  const id = safeText(door?.structure_quote_id || recordId);
  return id && isUuid(id) ? await getQuoteById(id) : null;
}
async function getIpanelQuoteForDoor(door) {
  const id = safeText(door?.record?.ipanel_quote_id);
  return id && isUuid(id) ? await getQuoteById(id) : null;
}
function calcQuoteSubtotal({ lines, payload }) {
  const arr = Array.isArray(lines) ? lines : [];
  const m = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(arr.reduce((acc, l) => acc + ((Number(l?.qty || 0) || 0) * ((Number(l?.basePrice ?? l?.base_price ?? l?.price ?? 0) || 0) * (1 + m / 100))), 0));
}
function calcQuoteTotalWithIva({ lines, payload }) { const subtotal = calcQuoteSubtotal({ lines, payload }); return round2(subtotal + round2(subtotal * IVA_RATE)); }
function quoteHasLines(quote) { return !!(quote && Array.isArray(quote.lines) && quote.lines.length); }
function isDoorStructureQuote(quote) {
  const kind = String(quote?.catalog_kind || "").toLowerCase();
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  return kind === DOOR_STRUCTURE_CATALOG_KIND || (kind === DOOR_STRUCTURE_FALLBACK_CATALOG_KIND && payload.door_structure_quote === true);
}
function isCatalogKindPuertaError(error) {
  const msg = String(error?.message || error?.detail || error?.constraint || "").toLowerCase();
  return msg.includes("catalog_kind") || msg.includes("puerta") || msg.includes("check constraint") || msg.includes("invalid input value");
}
function mergeDoorRecordWithCustomer(record, mergedCustomer) {
  const nextRecord = { ...(record || {}), end_customer: normalizeCustomer(mergedCustomer) };
  if (!safeText(nextRecord.obra_cliente)) nextRecord.obra_cliente = customerDisplayName(nextRecord.end_customer);
  return nextRecord;
}
async function persistMergedCustomerOnLinkedQuotes({ linkedQuote = null, structureQuote = null, ipanelQuote = null, mergedCustomer }) {
  const normalized = normalizeCustomer(mergedCustomer);
  for (const quote of [linkedQuote, structureQuote, ipanelQuote]) {
    if (!quote?.id) continue;
    await dbQuery(`update public.presupuestador_quotes set end_customer=$2::jsonb, updated_at=now() where id=$1`, [quote.id, JSON.stringify(overlayCustomer(quote.end_customer, normalized))]);
  }
}
async function createDraftQuoteForDoor({ userId, createdByRole = "vendedor", catalogKind, fulfillmentMode = "acopio", pricelistId = 1, billToOdooPartnerId = null, endCustomer = {}, note = "" }) {
  const basePayload = { margin_percent_ui: 0, payment_method: "", condition_mode: "", condition_text: "" };
  const normalizedCustomer = normalizeCustomer(endCustomer);

  async function insertQuote(kind, payloadExtra = {}) {
    const payload = { ...basePayload, ...payloadExtra };
    const q = await dbQuery(
      `insert into public.presupuestador_quotes (
          quote_kind, parent_quote_id, created_by_user_id, created_by_role, fulfillment_mode, pricelist_id,
          bill_to_odoo_partner_id, end_customer, lines, payload, note, catalog_kind, status,
          commercial_decision, technical_decision, requires_measurement, measurement_status, measurement_mode, measurement_subtype
       ) values ('original', null, $1, $2, $3, $4, $5, $6::jsonb, '[]'::jsonb, $7::jsonb, $8, $9, 'draft', 'pending', 'pending', false, 'none', 'medidor', 'normal') returning *`,
      [Number(userId), createdByRole, normalizeMode(fulfillmentMode), Number(pricelistId || 1), billToOdooPartnerId ? Number(billToOdooPartnerId) : null, JSON.stringify(normalizedCustomer), JSON.stringify(payload), note || null, kind],
    );
    return q.rows?.[0] || null;
  }

  if (String(catalogKind || "").toLowerCase() !== DOOR_STRUCTURE_CATALOG_KIND) {
    return await insertQuote(catalogKind);
  }

  try {
    return await insertQuote(DOOR_STRUCTURE_CATALOG_KIND, { door_structure_quote: true, door_structure_catalog_kind: DOOR_STRUCTURE_CATALOG_KIND });
  } catch (e) {
    if (!isCatalogKindPuertaError(e)) throw e;
    // Compatibilidad: si la BD/despliegue todavia no tiene habilitado catalog_kind='puerta',
    // se crea la estructura como 'otros' marcada internamente como estructura de puerta.
    return await insertQuote(DOOR_STRUCTURE_FALLBACK_CATALOG_KIND, { door_structure_quote: true, door_structure_catalog_kind: DOOR_STRUCTURE_CATALOG_KIND });
  }
}

async function updateQuoteDimensionsIfNeeded({ quote, dimensions, notePrefix = "" }) {
  if (!quote?.id || !dimensions) return quote;
  const payload = quote.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
  const currentDims = payload.dimensions && typeof payload.dimensions === "object" ? { ...payload.dimensions } : {};
  const nextDims = { ...currentDims };
  if (dimensions.width_m > 0) nextDims.width = String(dimensions.width_m);
  if (dimensions.height_m > 0) nextDims.height = String(dimensions.height_m);
  if (dimensions.width_mm > 0) nextDims.width_mm = String(dimensions.width_mm);
  if (dimensions.height_mm > 0) nextDims.height_mm = String(dimensions.height_mm);
  payload.dimensions = nextDims;
  const note = [notePrefix, quote.note].filter(Boolean).join("\n").trim() || quote.note || null;
  const r = await dbQuery(`update public.presupuestador_quotes set payload=$2::jsonb, note=$3, updated_at=now() where id=$1 returning *`, [quote.id, JSON.stringify(payload), note]);
  return r.rows?.[0] || quote;
}
async function ensureDoorQuotes({ door, linkedQuote = null, user = null }) {
  if (!door?.id) return door;
  const record = door.record && typeof door.record === "object" ? { ...door.record } : {};
  const rules = await getDoorTechnicalRules();
  const technicalDims = calcDoorTechnicalDimensions(record, rules);
  const customer = mergeCustomers(record.end_customer, linkedQuote?.end_customer);
  const createdByRole = linkedQuote?.created_by_role || "vendedor";
  const pricelistId = linkedQuote?.pricelist_id || 1;
  const billTo = linkedQuote?.bill_to_odoo_partner_id || null;

  let structureQuote = await getQuoteById(safeText(door.structure_quote_id || record.structure_quote_id));
  if (!structureQuote) {
    structureQuote = await createDraftQuoteForDoor({
      userId: door.created_by_user_id || user?.user_id,
      createdByRole,
      catalogKind: DOOR_STRUCTURE_CATALOG_KIND,
      fulfillmentMode: record.fulfillment_mode || linkedQuote?.fulfillment_mode || rules.structure_fulfillment_mode,
      pricelistId,
      billToOdooPartnerId: billTo,
      endCustomer: customer,
      note: `Estructura vinculada a puerta ${door.door_code || door.id}`,
    });
  }
  if (structureQuote && technicalDims.structure_width_m > 0 && technicalDims.structure_height_m > 0) {
    structureQuote = await updateQuoteDimensionsIfNeeded({
      quote: structureQuote,
      dimensions: { width_m: technicalDims.structure_width_m, height_m: technicalDims.structure_height_m, width_mm: technicalDims.structure_width_mm, height_mm: technicalDims.structure_height_mm },
      notePrefix: `Estructura vinculada a puerta ${door.door_code || door.id}`,
    });
  }

  let ipanelQuote = await getQuoteById(safeText(record.ipanel_quote_id));
  if (!ipanelQuote) {
    ipanelQuote = await createDraftQuoteForDoor({
      userId: door.created_by_user_id || user?.user_id,
      createdByRole,
      catalogKind: "ipanel",
      fulfillmentMode: rules.ipanel_fulfillment_mode || "acopio",
      pricelistId,
      billToOdooPartnerId: billTo,
      endCustomer: customer,
      note: `Ipanel revestimiento de puerta ${door.door_code || door.id}`,
    });
  }
  if (rules.auto_update_ipanel_dimensions && ipanelQuote && technicalDims.ipanel_width_m > 0 && technicalDims.ipanel_height_m > 0) {
    ipanelQuote = await updateQuoteDimensionsIfNeeded({
      quote: ipanelQuote,
      dimensions: { width_m: technicalDims.ipanel_width_m, height_m: technicalDims.ipanel_height_m, width_mm: technicalDims.ipanel_width_mm, height_mm: technicalDims.ipanel_height_mm },
      notePrefix: `Ipanel revestimiento de puerta ${door.door_code || door.id}`,
    });
  }

  const nextRecord = {
    ...record,
    end_customer: normalizeCustomer(customer),
    structure_quote_id: structureQuote?.id || record.structure_quote_id || "",
    structure_quote_label: structureQuote?.quote_number ? `Presupuesto ${structureQuote.quote_number}` : (record.structure_quote_label || ""),
    structure_catalog_kind: structureQuote?.catalog_kind || record.structure_catalog_kind || DOOR_STRUCTURE_CATALOG_KIND,
    ipanel_quote_id: ipanelQuote?.id || record.ipanel_quote_id || "",
    ipanel_quote_label: ipanelQuote?.quote_number ? `Presupuesto ${ipanelQuote.quote_number}` : (record.ipanel_quote_label || ""),
    door_technical_rules_snapshot: rules,
    door_technical_dimensions: technicalDims,
  };

  await dbQuery(
    `update public.presupuestador_doors set structure_quote_id=$2, record=$3::jsonb, updated_at=now() where id=$1`,
    [Number(door.id), structureQuote?.id || null, JSON.stringify(nextRecord)],
  );
  return await getDoorHydratedById(door.id);
}

function normalizeSellerDisplayName(value) { return String(value || "").trim(); }
const ODOO_SALE_ORDER_VENDOR_FIELD_CANDIDATES = Object.freeze(["x_studio_vendedor", "x_vendedor", "x_vendedor_presupuestador"]);
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
      saleOrderVendorFieldCache = { name: fieldName, type: String(meta.type || "").trim(), relation: String(meta.relation || "").trim() };
      return saleOrderVendorFieldCache;
    }
  } catch {}
  saleOrderVendorFieldCache = null;
  return saleOrderVendorFieldCache;
}
async function resolveEmployeeIdByName(odoo, employeeName) {
  const name = normalizeSellerDisplayName(employeeName);
  if (!name) return null;
  try { const ids = await odoo.executeKw("hr.employee", "search", [[["name", "=", name]]], { limit: 1 }); const id = toInt(ids?.[0]); if (id) return id; } catch {}
  try { const ids = await odoo.executeKw("hr.employee", "search", [[["name", "ilike", name]]], { limit: 1 }); return toInt(ids?.[0]); } catch { return null; }
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
async function getDoorHydratedById(id) {
  const r = await dbQuery(`
    select d.*, u.username as created_by_username, u.full_name as created_by_full_name,
           q.odoo_sale_order_name as linked_quote_odoo_name, q.final_sale_order_name as linked_quote_final_name,
           q.quote_number as linked_quote_number, q.status as linked_quote_status,
           q.fulfillment_mode as linked_quote_fulfillment_mode, q.end_customer as linked_quote_end_customer
      from public.presupuestador_doors d
      left join public.presupuestador_users u on u.id = d.created_by_user_id
      left join public.presupuestador_quotes q on q.id = d.linked_quote_id
     where d.id = $1 limit 1`, [Number(id)]);
  const row = r.rows?.[0] || null;
  if (!row) return null;
  const record = row.record && typeof row.record === "object" ? { ...row.record } : {};
  if (!safeText(record.asociado_porton) && row.linked_quote_id) record.asociado_porton = buildLinkedPortonLabel({ id: row.linked_quote_id, odoo_sale_order_name: row.linked_quote_odoo_name, final_sale_order_name: row.linked_quote_final_name, quote_number: row.linked_quote_number });
  if (row.linked_quote_id) record.fulfillment_mode = safeText(row.linked_quote_fulfillment_mode || record.fulfillment_mode);
  const linkedQuoteReference = row.linked_quote_odoo_name || row.linked_quote_final_name || row.linked_quote_number;
  const resolvedDoorCode = linkedQuoteReference ? buildDoorCodeFromQuote({ id: row.linked_quote_id, odoo_sale_order_name: row.linked_quote_odoo_name, final_sale_order_name: row.linked_quote_final_name, quote_number: row.linked_quote_number }) : (row.door_code || buildStandaloneDoorCode(row.id));
  return { ...row, record, door_code: resolvedDoorCode };
}
async function resolveProductInfo(odoo, rawId) {
  const id = Number(rawId);
  const [prod] = await odoo.executeKw("product.product", "read", [[id]], { fields: ["id", "name", "uom_id"] });
  if (prod?.id) { const uomId = toInt(prod.uom_id); if (!uomId) throw new Error(`Producto sin uom_id: ${id}`); return { productId: Number(prod.id), name: prod.name, uomId }; }
  const [tmpl] = await odoo.executeKw("product.template", "read", [[id]], { fields: ["id", "name", "uom_id"] });
  if (!tmpl?.id) throw new Error(`Producto no encontrado en Odoo: ${id}`);
  const variantIds = await odoo.executeKw("product.product", "search", [[["product_tmpl_id", "=", Number(tmpl.id)]]], { limit: 1 });
  const variantId = toInt(Array.isArray(variantIds) ? variantIds[0] : 0);
  if (!variantId) throw new Error(`No se encontro variante de producto para template: ${id}`);
  const [variant] = await odoo.executeKw("product.product", "read", [[variantId]], { fields: ["id", "name", "uom_id"] });
  const uomId = toInt(variant?.uom_id || tmpl.uom_id);
  if (!uomId) throw new Error(`Producto sin uom_id: ${id}`);
  return { productId: Number(variant.id), name: variant.name || tmpl.name, uomId };
}
async function findOrCreateCustomerPartner(odoo, customer) {
  const c = normalizeCustomer(customer);
  const email = safeText(c.email);
  if (email) { const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", email]]], { limit: 1 }); if (ids?.[0]) return Number(ids[0]); }
  const name = customerDisplayName(c);
  if (!name) throw new Error("Falta nombre del cliente");
  const ids2 = await odoo.executeKw("res.partner", "search", [[["name", "=", name]]], { limit: 1 });
  if (ids2?.[0]) return Number(ids2[0]);
  const created = await odoo.executeKw("res.partner", "create", [{ name, email: email || false, phone: safeText(c.phone) || false, street: safeText(c.address) || false, city: safeText(c.city) || false, customer_rank: 1 }]);
  return Number(Array.isArray(created) ? created[0] : created);
}
async function renameOrderToReference(odoo, orderId, reference) {
  const ref = safeText(reference);
  if (!orderId || !ref) return null;
  try { await odoo.executeKw("sale.order", "write", [[Number(orderId)], { name: ref, origin: ref, client_order_ref: ref }]); } catch {}
  const [order] = await odoo.executeKw("sale.order", "read", [[Number(orderId)]], { fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id", "origin", "client_order_ref"] });
  return order || null;
}
async function buildDoorQuoteSummary(door, mode = "presupuesto") {
  const record = door?.record || {};
  const core = extractDoorCore(record);
  const sellerName = normalizeSellerDisplayName(door?.created_by_full_name || door?.created_by_username);
  const linkedQuote = await getLinkedQuoteForDoor(door);
  const structureQuote = await getStructureQuoteForDoor(door);
  const ipanelQuote = await getIpanelQuoteForDoor(door);
  if (!isDoorStructureQuote(structureQuote)) throw new Error("La puerta debe tener una estructura vinculada.");
  if (!ipanelQuote || String(ipanelQuote.catalog_kind || "").toLowerCase() !== "ipanel") throw new Error("La puerta debe tener un Ipanel vinculado.");
  const precioEstructura = mode === "proforma" ? calcQuoteSubtotal({ lines: structureQuote.lines, payload: {} }) : calcQuoteTotalWithIva({ lines: structureQuote.lines, payload: structureQuote.payload || {} });
  const precioIpanel = mode === "proforma" ? calcQuoteSubtotal({ lines: ipanelQuote.lines, payload: {} }) : calcQuoteTotalWithIva({ lines: ipanelQuote.lines, payload: ipanelQuote.payload || {} });
  const total = round2(precioEstructura + precioIpanel);
  const mergedCustomer = mergeCustomers(record?.end_customer, linkedQuote?.end_customer, structureQuote?.end_customer, ipanelQuote?.end_customer);
  const technicalDims = record?.door_technical_dimensions || calcDoorTechnicalDimensions(record, await getDoorTechnicalRules());
  const dimsLabel = [core.anchoPuertaMm ? `${core.anchoPuertaMm} mm` : "", core.altoPuertaMm ? `${core.altoPuertaMm} mm` : ""].filter(Boolean).join(" x ");
  const lines = [{ product_id: 0, qty: 1, raw_name: "Puerta", basePrice: total }];
  const noteLines = [
    linkedQuote?.id ? `Porton vinculado: ${buildLinkedPortonLabel(linkedQuote)} (${linkedQuote.id})` : "Porton vinculado: pendiente",
    structureQuote?.quote_number ? `Estructura puerta: ${structureQuote.quote_number}` : `Estructura puerta: ${structureQuote?.id || "-"}`,
    ipanelQuote?.quote_number ? `Ipanel puerta: ${ipanelQuote.quote_number}` : `Ipanel puerta: ${ipanelQuote?.id || "-"}`,
    dimsLabel ? `Medida puerta: ${dimsLabel}` : "",
    technicalDims?.ipanel_width_mm ? `Ipanel calculado: ${technicalDims.ipanel_width_mm} x ${technicalDims.ipanel_height_mm} mm` : "",
    `Total estructura=${round2(precioEstructura)}`,
    `Total Ipanel=${round2(precioIpanel)}`,
    `Total puerta=${round2(total)}`,
  ].filter(Boolean);
  return {
    mode,
    variables: { precio_estructura: round2(precioEstructura), precio_ipanel: round2(precioIpanel) },
    total,
    structure_quote_id: structureQuote?.id || null,
    structure_quote_label: structureQuote?.quote_number || "",
    ipanel_quote_id: ipanelQuote?.id || null,
    ipanel_quote_label: ipanelQuote?.quote_number || "",
    technical_dimensions: technicalDims,
    payload: {
      quote_number: normalizeDoorBaseCode(door?.door_code || linkedQuote?.odoo_sale_order_name || linkedQuote?.quote_number || `P${door?.id || ""}`),
      created_by_role: "vendedor",
      seller_name: sellerName,
      fulfillment_mode: core.fulfillmentMode || linkedQuote?.fulfillment_mode || "produccion",
      end_customer: mergedCustomer,
      lines,
      payload: { margin_percent_ui: 0, payment_method: structureQuote?.payload?.payment_method || ipanelQuote?.payload?.payment_method || linkedQuote?.payload?.payment_method || "", condition_mode: structureQuote?.payload?.condition_mode || ipanelQuote?.payload?.condition_mode || linkedQuote?.payload?.condition_mode || "", condition_text: structureQuote?.payload?.condition_text || ipanelQuote?.payload?.condition_text || linkedQuote?.payload?.condition_text || "" },
      note: noteLines.join("\n"),
    },
  };
}
function validateDoorForSubmit(door, record) {
  const core = extractDoorCore(record);
  if (!door?.linked_quote_id || !isUuid(door.linked_quote_id)) throw new Error("Vincula la puerta a un presupuesto de porton antes de confirmarla.");
  if (!core.customer.name) throw new Error("Completa el nombre del cliente.");
  if (!core.customer.phone) throw new Error("Completa el telefono del cliente.");
  if (!core.structureQuoteId || !isUuid(core.structureQuoteId)) throw new Error("Completa la estructura de la puerta.");
  if (!core.ipanelQuoteId || !isUuid(core.ipanelQuoteId)) throw new Error("Completa el Ipanel de la puerta.");
  if (!core.fulfillmentMode) throw new Error("Selecciona si la puerta va a Acopio o Produccion.");
  return core;
}
async function syncDoorSaleToOdoo({ odoo, door, linkedQuote = null }) {
  if (door.odoo_sale_order_id) return null;
  const mode = linkedQuote?.created_by_role === "distribuidor" ? "proforma" : "presupuesto";
  const summary = await buildDoorQuoteSummary(door, mode);
  const sellerName = normalizeSellerDisplayName(door?.created_by_full_name || door?.created_by_username || linkedQuote?.created_by_full_name || linkedQuote?.created_by_username);
  const { productId, name, uomId } = await resolveProductInfo(odoo, ODOO_DOOR_PRODUCT_ID);
  let partnerId = null;
  if (linkedQuote?.created_by_role === "distribuidor") {
    partnerId = toInt(linkedQuote?.bill_to_odoo_partner_id) || await getCreatorOdooPartnerId(linkedQuote?.created_by_user_id);
    if (!partnerId) throw new Error("Distribuidor sin partner Odoo para venta de puerta");
  } else {
    partnerId = await findOrCreateCustomerPartner(odoo, summary.payload.end_customer || {});
  }
  const saleOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    order_line: [[0, 0, { product_id: productId, product_uom_qty: 1, product_uom: uomId, name: `${name} - ${door.door_code} - puerta DB ${door.id}`, price_unit: round2(summary.total) }]],
    note: `PUERTA VINCULADA: ${door.door_code}` + (linkedQuote?.id ? `\nPresupuesto porton: ${linkedQuote.id}` : "") + (linkedQuote?.odoo_sale_order_name ? `\nNV porton: ${linkedQuote.odoo_sale_order_name}` : "") + (sellerName ? `\nVendedor: ${sellerName}` : "") + `\n${summary.payload.note || ""}`,
  }]);
  const saleOrderReadId = Number(Array.isArray(saleOrderId) ? saleOrderId[0] : saleOrderId);
  await applySellerToSaleOrder(odoo, saleOrderReadId, sellerName);
  const order = await renameOrderToReference(odoo, saleOrderReadId, door.door_code);
  return { saleOrder: order, summary };
}
async function trySyncDoorOrders({ odoo, id }) {
  let door = await getDoorHydratedById(id);
  if (!door) throw new Error("Puerta no encontrada");
  if (!["pending_approvals", "syncing_odoo", "synced_odoo"].includes(String(door.status || ""))) return door;
  if (door.commercial_decision !== "approved" || door.technical_decision !== "approved") return door;
  if (door.status === "pending_approvals") {
    const r = await dbQuery(`update public.presupuestador_doors set status='syncing_odoo', updated_at=now() where id=$1 and status='pending_approvals' returning id`, [Number(id)]);
    if (!r.rows?.[0]) return await getDoorHydratedById(id);
    door = await getDoorHydratedById(id);
  }
  const linkedQuote = await getLinkedQuoteForDoor(door);
  try {
    if (!door.odoo_sale_order_id) {
      const { saleOrder } = await syncDoorSaleToOdoo({ odoo, door, linkedQuote });
      if (saleOrder?.id) await dbQuery(`update public.presupuestador_doors set odoo_sale_order_id=$2, odoo_sale_order_name=$3, updated_at=now() where id=$1`, [Number(id), Number(saleOrder.id), saleOrder.name]);
    }
    const finalDoor = await getDoorHydratedById(id);
    if (finalDoor?.odoo_sale_order_id) {
      await dbQuery(`update public.presupuestador_doors set status='synced_odoo', synced_at=coalesce(synced_at, now()), updated_at=now() where id=$1`, [Number(id)]);
      return await getDoorHydratedById(id);
    }
    return finalDoor;
  } catch (e) {
    const currentDoor = await getDoorHydratedById(id);
    const fallbackStatus = currentDoor?.odoo_sale_order_id ? "syncing_odoo" : "pending_approvals";
    await dbQuery(`update public.presupuestador_doors set status=$2, updated_at=now() where id=$1`, [Number(id), fallbackStatus]);
    throw e;
  }
}

export function buildDoorsRouter(odooArg) {
  const router = express.Router();
  const odoo = odooArg || createOdooClient({ url: process.env.ODOO_URL, db: process.env.ODOO_DB, username: process.env.ODOO_USERNAME, password: process.env.ODOO_PASSWORD, companyId: process.env.ODOO_COMPANY_ID || null });
  router.use(async (_req, _res, next) => { try { await ensureDoorsSchema(); await ensureQuotesMeasurementColumns(); next(); } catch (e) { next(e); } });
  router.use(requireAuth);

  router.get("/suppliers", requireSeller, async (_req, res) => res.json({ ok: true, suppliers: [] }));

  router.get("/by-quote/:quoteId", async (req, res, next) => {
    try {
      const quoteId = safeText(req.params.quoteId);
      if (!isUuid(quoteId)) return res.status(400).json({ ok: false, error: "quoteId invalido" });
      const quote = await getReadableQuote(quoteId, req.user);
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no autorizado" });
      const r = await dbQuery(`select d.id from public.presupuestador_doors d where d.linked_quote_id = $1 order by d.id desc`, [quoteId]);
      const doors = [];
      for (const row of (r.rows || [])) { const door = await getDoorHydratedById(row.id); if (door) doors.push(door); }
      res.json({ ok: true, doors });
    } catch (e) { next(e); }
  });

  router.post("/by-quote/:quoteId/sync-sale", async (req, res, next) => {
    try {
      const quoteId = safeText(req.params.quoteId);
      if (!isUuid(quoteId)) return res.status(400).json({ ok: false, error: "quoteId invalido" });
      const quote = await getReadableQuote(quoteId, req.user);
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no autorizado" });
      const r = await dbQuery(`select id from public.presupuestador_doors where linked_quote_id=$1 order by id asc`, [quoteId]);
      const doors = [];
      for (const row of (r.rows || [])) doors.push(await trySyncDoorOrders({ odoo, id: row.id }));
      return res.json({ ok: true, doors, door: doors[0] || null });
    } catch (e) { next(e); }
  });

  router.get("/", async (req, res, next) => {
    try {
      const scope = safeText(req.query.scope || "mine");
      let sql = ""; let params = [];
      if (scope === "mine") {
        if (!req.user?.is_vendedor && !req.user?.is_superuser) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select id from public.presupuestador_doors where created_by_user_id = $1 order by id desc limit 300`; params = [Number(req.user.user_id)];
      } else if (scope === "commercial_inbox") {
        if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select id from public.presupuestador_doors where status = 'pending_approvals' and commercial_decision = 'pending' order by id desc limit 300`;
      } else if (scope === "technical_inbox") {
        if (!req.user?.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select id from public.presupuestador_doors where status = 'pending_approvals' and technical_decision = 'pending' order by id desc limit 300`;
      } else return res.status(400).json({ ok: false, error: "scope invalido" });
      const r = await dbQuery(sql, params);
      const doors = [];
      for (const row of (r.rows || [])) { const door = await getDoorHydratedById(row.id); if (door) doors.push(door); }
      res.json({ ok: true, doors });
    } catch (e) { next(e); }
  });

  router.post("/", requireSeller, async (req, res, next) => {
    let insertedDoorId = null;
    try {
      const linkedQuoteId = safeText(req.body?.linked_quote_id);
      let linkedQuote = null;
      if (linkedQuoteId) {
        if (!isUuid(linkedQuoteId)) return res.status(400).json({ ok: false, error: "linked_quote_id invalido" });
        linkedQuote = await getQuoteOwnedBySeller(linkedQuoteId, req.user.user_id);
        if (!linkedQuote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no sos dueno" });
        if (String(linkedQuote.catalog_kind || "porton").toLowerCase() !== "porton") return res.status(400).json({ ok: false, error: "La puerta solo puede vincularse a un presupuesto de porton" });
      }
      const record = buildInitialDoorRecord({ quote: linkedQuote, user: req.user });
      const doorCode = linkedQuote ? (buildDoorCodeFromQuote(linkedQuote) || buildFallbackDoorCode(linkedQuoteId)) : "PENDIENTE";
      const ins = await dbQuery(`insert into public.presupuestador_doors (created_by_user_id, linked_quote_id, door_code, status, commercial_decision, technical_decision, record, updated_at) values ($1, $2, $3, 'draft', 'pending', 'pending', $4::jsonb, now()) returning id`, [Number(req.user.user_id), linkedQuoteId || null, doorCode, JSON.stringify(record)]);
      insertedDoorId = Number(ins.rows?.[0]?.id || 0) || null;
      let door = await getDoorHydratedById(insertedDoorId);
      if (!linkedQuote) { const id = Number(door.id); const code = buildStandaloneDoorCode(id); await dbQuery(`update public.presupuestador_doors set door_code=$2 where id=$1`, [id, code]); door = await getDoorHydratedById(id); }
      door = await ensureDoorQuotes({ door, linkedQuote, user: req.user });
      return res.json({ ok: true, door });
    } catch (e) {
      if (insertedDoorId) {
        try { await dbQuery(`delete from public.presupuestador_doors where id=$1 and status='draft' and odoo_sale_order_id is null`, [insertedDoorId]); } catch {}
      }
      next(e);
    }
  });

  router.post("/from-quote/:quoteId", requireSeller, async (req, res, next) => {
    let insertedDoorId = null;
    try {
      const linkedQuoteId = safeText(req.params.quoteId);
      if (!isUuid(linkedQuoteId)) return res.status(400).json({ ok: false, error: "linked_quote_id invalido" });
      const quote = await getQuoteOwnedBySeller(linkedQuoteId, req.user.user_id);
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no sos dueno" });
      if (String(quote.catalog_kind || "porton").toLowerCase() !== "porton") return res.status(400).json({ ok: false, error: "La puerta solo puede vincularse a un presupuesto de porton" });
      const record = buildInitialDoorRecord({ quote, user: req.user });
      const doorCode = buildDoorCodeFromQuote(quote) || buildFallbackDoorCode(linkedQuoteId);
      const ins = await dbQuery(`insert into public.presupuestador_doors (created_by_user_id, linked_quote_id, door_code, status, commercial_decision, technical_decision, record, updated_at) values ($1, $2, $3, 'draft', 'pending', 'pending', $4::jsonb, now()) returning id`, [Number(req.user.user_id), linkedQuoteId, doorCode, JSON.stringify(record)]);
      insertedDoorId = Number(ins.rows?.[0]?.id || 0) || null;
      const door = await ensureDoorQuotes({ door: await getDoorHydratedById(insertedDoorId), linkedQuote: quote, user: req.user });
      return res.json({ ok: true, door });
    } catch (e) {
      if (insertedDoorId) {
        try { await dbQuery(`delete from public.presupuestador_doors where id=$1 and status='draft' and odoo_sale_order_id is null`, [insertedDoorId]); } catch {}
      }
      next(e);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      let door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (!canReadDoor(req.user, door)) return res.status(403).json({ ok: false, error: "No autorizado" });
      door = await ensureDoorQuotes({ door, linkedQuote: await getLinkedQuoteForDoor(door), user: req.user });
      return res.json({ ok: true, door });
    } catch (e) { next(e); }
  });

  router.get("/:id/quote-summary", async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (!canReadDoor(req.user, door)) return res.status(403).json({ ok: false, error: "No autorizado" });
      const mode = String(req.query.mode || "presupuesto").toLowerCase() === "proforma" ? "proforma" : "presupuesto";
      return res.json({ ok: true, summary: await buildDoorQuoteSummary(door, mode) });
    } catch (e) { next(e); }
  });

  router.get("/:id/quote-pdf-payload", async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (!canReadDoor(req.user, door)) return res.status(403).json({ ok: false, error: "No autorizado" });
      const mode = String(req.query.mode || "presupuesto").toLowerCase() === "proforma" ? "proforma" : "presupuesto";
      const summary = await buildDoorQuoteSummary(door, mode);
      return res.json({ ok: true, payload: summary.payload, summary });
    } catch (e) { next(e); }
  });

  router.put("/:id", requireSeller, async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      const cur = await getDoorHydratedById(id); if (!cur) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (String(cur.created_by_user_id) !== String(req.user.user_id)) return res.status(403).json({ ok: false, error: "No autorizado" });
      const record = req.body?.record; if (!record || typeof record !== "object") return res.status(400).json({ ok: false, error: "Falta record (objeto)" });
      let linkedQuoteId = safeText(req.body?.linked_quote_id || cur.linked_quote_id);
      if (safeText(req.body?.linked_quote_id) && !isUuid(linkedQuoteId)) return res.status(400).json({ ok: false, error: "linked_quote_id invalido" });
      let linkedQuote = linkedQuoteId ? await getQuoteOwnedBySeller(linkedQuoteId, req.user.user_id) : null;
      if (linkedQuoteId && !linkedQuote) return res.status(404).json({ ok: false, error: "Presupuesto de porton no encontrado o no sos dueno" });
      if (linkedQuote && String(linkedQuote.catalog_kind || "porton").toLowerCase() !== "porton") return res.status(400).json({ ok: false, error: "La puerta solo puede vincularse a un presupuesto de porton" });
      const structureQuote = await getQuoteById(safeText(record.structure_quote_id || cur.structure_quote_id));
      const ipanelQuote = await getQuoteById(safeText(record.ipanel_quote_id));
      const mergedCustomer = mergeCustomers(record?.end_customer, linkedQuote?.end_customer, structureQuote?.end_customer, ipanelQuote?.end_customer);
      const nextDoorCode = linkedQuote ? (buildDoorCodeFromQuote(linkedQuote) || cur.door_code) : (cur.door_code || buildStandaloneDoorCode(id));
      const nextRecord = mergeDoorRecordWithCustomer({ ...record, asociado_porton: linkedQuote ? buildLinkedPortonLabel(linkedQuote) : safeText(record?.asociado_porton), fulfillment_mode: linkedQuote ? safeText(linkedQuote?.fulfillment_mode) : safeText(record?.fulfillment_mode) }, mergedCustomer);
      const core = extractDoorCore(nextRecord);
      await dbQuery(`update public.presupuestador_doors set linked_quote_id=$2, structure_quote_id=$3, record=$4::jsonb, door_code=$5, supplier_odoo_partner_id=null, sale_amount=null, purchase_amount=null, updated_at=now() where id=$1`, [id, linkedQuoteId || null, core.structureQuoteId || null, JSON.stringify(nextRecord), nextDoorCode]);
      let door = await getDoorHydratedById(id);
      door = await ensureDoorQuotes({ door, linkedQuote, user: req.user });
      await persistMergedCustomerOnLinkedQuotes({ linkedQuote, structureQuote: await getStructureQuoteForDoor(door), ipanelQuote: await getIpanelQuoteForDoor(door), mergedCustomer });
      return res.json({ ok: true, door });
    } catch (e) { next(e); }
  });

  router.post("/:id/submit", requireSeller, async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      let door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (String(door.created_by_user_id) !== String(req.user.user_id)) return res.status(403).json({ ok: false, error: "No autorizado" });
      door = await ensureDoorQuotes({ door, linkedQuote: await getLinkedQuoteForDoor(door), user: req.user });
      const core = validateDoorForSubmit(door, door.record);
      const linkedQuote = await getLinkedQuoteForDoor(door);
      if (!linkedQuote || String(linkedQuote.catalog_kind || "").toLowerCase() !== "porton") throw new Error("La puerta debe estar vinculada a un presupuesto de porton valido.");
      const structureQuote = await getStructureQuoteForDoor(door);
      const ipanelQuote = await getIpanelQuoteForDoor(door);
      if (!quoteHasLines(structureQuote)) throw new Error("Completa el presupuesto de estructura de la puerta.");
      if (!quoteHasLines(ipanelQuote)) throw new Error("Completa el presupuesto Ipanel de la puerta.");
      await buildDoorQuoteSummary(door, "presupuesto");
      await dbQuery(`update public.presupuestador_doors set status='pending_approvals', commercial_decision='pending', technical_decision='pending', commercial_notes=null, technical_notes=null, updated_at=now() where id=$1`, [id]);
      return res.json({ ok: true, door: await getDoorHydratedById(id) });
    } catch (e) { next(e); }
  });

  router.post("/:id/review/commercial", requireCommercial, async (req, res, next) => {
    try {
      const id = Number(req.params.id); const action = safeText(req.body?.action).toLowerCase(); const notes = safeText(req.body?.notes);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ ok: false, error: "action invalida" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (door.status !== "pending_approvals") return res.status(409).json({ ok: false, error: "La puerta no esta en aprobacion" });
      if (door.commercial_decision !== "pending") return res.status(409).json({ ok: false, error: "La revision comercial ya fue resuelta" });
      if (action === "reject") { await dbQuery(`update public.presupuestador_doors set status='draft', commercial_decision='rejected', commercial_notes=$2, updated_at=now() where id=$1`, [id, notes || "Rechazado"]); return res.json({ ok: true, door: await getDoorHydratedById(id) }); }
      await dbQuery(`update public.presupuestador_doors set commercial_decision='approved', commercial_notes=$2, updated_at=now() where id=$1`, [id, notes || null]);
      return res.json({ ok: true, door: await trySyncDoorOrders({ odoo, id }) });
    } catch (e) { next(e); }
  });

  router.post("/:id/review/technical", requireTech, async (req, res, next) => {
    try {
      const id = Number(req.params.id); const action = safeText(req.body?.action).toLowerCase(); const notes = safeText(req.body?.notes);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id invalido" });
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ ok: false, error: "action invalida" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (door.status !== "pending_approvals") return res.status(409).json({ ok: false, error: "La puerta no esta en aprobacion" });
      if (door.technical_decision !== "pending") return res.status(409).json({ ok: false, error: "La revision tecnica ya fue resuelta" });
      if (action === "reject") { await dbQuery(`update public.presupuestador_doors set status='draft', technical_decision='rejected', technical_notes=$2, updated_at=now() where id=$1`, [id, notes || "Rechazado"]); return res.json({ ok: true, door: await getDoorHydratedById(id) }); }
      await dbQuery(`update public.presupuestador_doors set technical_decision='approved', technical_notes=$2, updated_at=now() where id=$1`, [id, notes || null]);
      return res.json({ ok: true, door: await trySyncDoorOrders({ odoo, id }) });
    } catch (e) { next(e); }
  });

  return router;
}

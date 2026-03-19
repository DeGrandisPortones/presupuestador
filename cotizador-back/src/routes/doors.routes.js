import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureDoorsSchema } from "../doorsSchema.js";
import { createOdooClient } from "../odoo.js";
import { getDoorQuoteSettings } from "../settingsDb.js";
import { evaluateDoorQuoteFormula } from "../doorQuoteFormula.js";

const ODOO_DOOR_PRODUCT_ID = Number(process.env.ODOO_DOOR_PRODUCT_ID || 3226);
const ODOO_DOOR_SUPPLIER_TAG_NAME = String(process.env.ODOO_DOOR_SUPPLIER_TAG_NAME || "Puerta").trim();
const IVA_RATE = 0.21;

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

function isUuid(v) {
  return /^[0-9a-fA-F-]{36}$/.test(String(v || "").trim());
}
function safeText(v) { return String(v ?? "").trim(); }
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
function toInt(v) { const n = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(n) ? n : null; }
function nowDate() { return new Date().toISOString().slice(0, 10); }
function nowDateTime() { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function parseAmount(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? round2(n) : 0; }
function normalizeDoorBaseCode(value) { const raw = safeText(value).toUpperCase(); return raw ? (raw.startsWith("P") ? raw : `P${raw}`) : ""; }
function buildFallbackDoorCode(seed) { const raw = safeText(seed).replace(/[^A-Za-z0-9]/g, "").toUpperCase(); return `P${raw || "PUERTA"}`; }
function buildDoorCodeFromQuote(quote) { if (!quote) return ""; return quote.odoo_sale_order_name ? normalizeDoorBaseCode(quote.odoo_sale_order_name) : buildFallbackDoorCode(String(quote.id || "").slice(0, 8)); }
function buildLinkedPortonLabel(quote) { if (!quote) return ""; return safeText(quote.odoo_sale_order_name) || (safeText(quote.id) ? `Presupuesto ${String(quote.id).slice(0, 8)}` : ""); }
function buildStandaloneDoorCode(id) { return `P${String(Number(id || 0)).padStart(5, "0")}`; }
function canReadDoor(user, door) { if (!user || !door) return false; const isOwner = String(door.created_by_user_id) === String(user.user_id); return isOwner || !!user.is_enc_comercial || !!user.is_rev_tecnica; }
function customerFromQuote(quote) { return { name: safeText(quote?.end_customer?.name), phone: safeText(quote?.end_customer?.phone), email: safeText(quote?.end_customer?.email), address: safeText(quote?.end_customer?.address), maps_url: safeText(quote?.end_customer?.maps_url), city: safeText(quote?.end_customer?.city) }; }
function buildChecklist(responsible = "") { const date = nowDate(); const mk = (section, item) => ({ section, item, status: "Pendiente", notes: "", responsible, date, ok: false }); return [mk("A", "Confirmar que es puerta principal de acceso."), mk("B", "Definir sentido de giro."), mk("C", "Definir mano desde exterior."), mk("D", "Verificar interferencias y accesorios."), mk("E", "Definir tipo de marco y hoja."), mk("F", "Validar con obra/cliente antes de compra.")]; }
function buildInitialDoorRecord({ quote = null, user }) {
  const responsible = safeText(user?.full_name || user?.username);
  const endCustomer = quote
    ? customerFromQuote(quote)
    : { name: "", phone: "", email: "", address: "", maps_url: "", city: "" };

  return {
    end_customer: endCustomer,
    obra_cliente: endCustomer.name || "",
    nv: "",
    tipo: "Puerta principal",
    vista: "Exterior",
    responsable: responsible,
    proveedor: "",
    proveedor_condiciones: "",
    fecha: nowDate(),
    nv_proveedor: "",
    asociado_porton: buildLinkedPortonLabel(quote),
    fulfillment_mode: safeText(quote?.fulfillment_mode),
    sentido_apertura: "ADENTRO",
    mano_bisagras: "IZQUIERDA",
    angulo_apertura: "90",
    angulo_otro: "",
    motivo_no_estandar: "",
    interferencias: "Ninguna",
    accesorios: "Ninguno",
    tipo_marco: "",
    tipo_hoja: "",
    lado_cerradura: "",
    ancho_marco_mm: "",
    alto_marco_mm: "",
    ipanel_quote_id: "",
    ipanel_quote_label: "",
    observaciones: "",
    sale_amount: "",
    purchase_amount: "",
    supplier_odoo_partner_id: "",
    checklist: buildChecklist(responsible),
  };
}
function extractDoorCore(record) {
  const endCustomer = record?.end_customer && typeof record === "object" ? record.end_customer : {};
  const fulfillmentMode = safeText(record?.fulfillment_mode).toLowerCase();
  return {
    supplierId: toInt(record?.supplier_odoo_partner_id),
    saleAmount: parseAmount(record?.sale_amount),
    purchaseAmount: parseAmount(record?.purchase_amount),
    customer: {
      name: safeText(endCustomer?.name || record?.obra_cliente),
      phone: safeText(endCustomer?.phone),
      email: safeText(endCustomer?.email),
      address: safeText(endCustomer?.address),
      maps_url: safeText(endCustomer?.maps_url),
      city: safeText(endCustomer?.city),
    },
    proveedorCondiciones: safeText(record?.proveedor_condiciones),
    anchoMarcoMm: safeText(record?.ancho_marco_mm),
    altoMarcoMm: safeText(record?.alto_marco_mm),
    ipanelQuoteId: safeText(record?.ipanel_quote_id),
    ipanelQuoteLabel: safeText(record?.ipanel_quote_label),
    fulfillmentMode: ["acopio", "produccion"].includes(fulfillmentMode) ? fulfillmentMode : "",
  };
}
function validateDoorForSubmit(door, record) {
  const core = extractDoorCore(record);
  if (!core.customer.name) throw new Error("Completá el nombre del cliente.");
  if (!core.customer.phone) throw new Error("Completá el teléfono del cliente.");
  if (!core.customer.address) throw new Error("Completá la dirección del cliente.");
  if (!core.ipanelQuoteId || !isUuid(core.ipanelQuoteId)) throw new Error("Vinculá el presupuesto Ipanel de la puerta.");
  if (!core.supplierId) throw new Error("Seleccioná un proveedor.");
  if (core.saleAmount <= 0) throw new Error("Completá el importe de venta del marco de puerta.");
  if (core.purchaseAmount <= 0) throw new Error("Completá el importe de compra del marco de puerta.");
  if (!core.fulfillmentMode) throw new Error("Seleccioná si la puerta va a Acopio o Producción.");
  return core;
}
function calcQuoteSubtotal({ lines, payload }) {
  const arr = Array.isArray(lines) ? lines : [];
  const m = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(arr.reduce((acc, l) => acc + ((Number(l?.qty || 0) || 0) * ((Number(l?.basePrice ?? l?.base_price ?? l?.price ?? 0) || 0) * (1 + m / 100))), 0));
}
function calcQuoteTotalWithIva({ lines, payload }) { const subtotal = calcQuoteSubtotal({ lines, payload }); return round2(subtotal + round2(subtotal * IVA_RATE)); }
function calcQuoteBaseTotalWithIva({ lines }) { const arr = Array.isArray(lines) ? lines : []; const subtotal = round2(arr.reduce((acc, l) => acc + ((Number(l?.qty || 0) || 0) * (Number(l?.basePrice ?? l?.base_price ?? l?.price ?? 0) || 0)), 0)); return round2(subtotal + round2(subtotal * IVA_RATE)); }

async function getQuoteOwnedBySeller(quoteId, userId) {
  const r = await dbQuery(`select * from public.presupuestador_quotes where id = $1 and created_by_user_id = $2 and created_by_role = 'vendedor' limit 1`, [quoteId, Number(userId)]);
  return r.rows?.[0] || null;
}
async function getQuoteReadable(quoteId, user) {
  const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [quoteId]);
  const quote = r.rows?.[0] || null;
  if (!quote) return null;
  const isOwner = String(quote.created_by_user_id) === String(user.user_id);
  const canCommercial = !!user.is_enc_comercial && quote.created_by_role === "vendedor";
  const canTech = !!user.is_rev_tecnica;
  return (isOwner || canCommercial || canTech) ? quote : null;
}
async function getCreatorOdooPartnerId(createdByUserId) {
  const r = await dbQuery(`select odoo_partner_id from public.presupuestador_users where id=$1 limit 1`, [Number(createdByUserId)]);
  return toInt(r.rows?.[0]?.odoo_partner_id);
}

function normalizeSellerDisplayName(value) {
  return String(value || "").trim();
}
const ODOO_SALE_ORDER_VENDOR_FIELD_CANDIDATES = Object.freeze([
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
    const exactId = toInt(exactIds?.[0]);
    if (exactId) return exactId;
  } catch {}
  try {
    const ilikeIds = await odoo.executeKw("hr.employee", "search", [[["name", "ilike", name]]], { limit: 1 });
    return toInt(ilikeIds?.[0]);
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

async function getDoorHydratedById(id) {
  const r = await dbQuery(`
    select d.*, u.username as created_by_username, u.full_name as created_by_full_name,
           q.odoo_sale_order_name as linked_quote_odoo_name, q.status as linked_quote_status, q.end_customer as linked_quote_end_customer
      from public.presupuestador_doors d
      left join public.presupuestador_users u on u.id = d.created_by_user_id
      left join public.presupuestador_quotes q on q.id = d.linked_quote_id
     where d.id = $1 limit 1`, [Number(id)]);
  const row = r.rows?.[0] || null;
  if (!row) return null;
  const record = row.record && typeof row.record === "object" ? { ...row.record } : {};
  if (!safeText(record.asociado_porton) && row.linked_quote_id) record.asociado_porton = buildLinkedPortonLabel({ id: row.linked_quote_id, odoo_sale_order_name: row.linked_quote_odoo_name });
  if (!safeText(record.fulfillment_mode) && row.linked_quote_id) record.fulfillment_mode = "";
  const resolvedDoorCode = row.linked_quote_odoo_name ? buildDoorCodeFromQuote({ id: row.linked_quote_id, odoo_sale_order_name: row.linked_quote_odoo_name }) : (row.door_code || buildStandaloneDoorCode(row.id));
  return { ...row, record, door_code: resolvedDoorCode };
}
async function getLinkedQuoteForDoor(door) {
  if (!door?.linked_quote_id) return null;
  const qr = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [door.linked_quote_id]);
  return qr.rows?.[0] || null;
}
async function resolveProductInfo(odoo, rawId) {
  const id = Number(rawId);
  const [prod] = await odoo.executeKw("product.product", "read", [[id]], { fields: ["id", "name", "uom_id"] });
  if (prod?.id) { const uomId = toInt(prod.uom_id); if (!uomId) throw new Error(`Producto sin uom_id: ${id}`); return { productId: Number(prod.id), name: prod.name, uomId }; }
  const [tmpl] = await odoo.executeKw("product.template", "read", [[id]], { fields: ["id", "name", "uom_id"] });
  if (!tmpl?.id) throw new Error(`Producto no encontrado en Odoo: ${id}`);
  const variantIds = await odoo.executeKw("product.product", "search", [[["product_tmpl_id", "=", Number(tmpl.id)]]], { limit: 1 });
  const variantId = toInt(Array.isArray(variantIds) ? variantIds[0] : 0);
  if (!variantId) throw new Error(`No se encontró variante de producto para template: ${id}`);
  const [variant] = await odoo.executeKw("product.product", "read", [[variantId]], { fields: ["id", "name", "uom_id"] });
  const uomId = toInt(variant?.uom_id || tmpl.uom_id);
  if (!uomId) throw new Error(`Producto sin uom_id: ${id}`);
  return { productId: Number(variant.id), name: variant.name || tmpl.name, uomId };
}
async function findOrCreateCustomerPartner(odoo, customer) {
  const email = safeText(customer?.email);
  if (email) {
    const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", email]]], { limit: 1 });
    if (ids?.[0]) return Number(ids[0]);
  }
  const name = safeText(customer?.name);
  if (!name) throw new Error("Falta nombre del cliente");
  const ids2 = await odoo.executeKw("res.partner", "search", [[["name", "=", name]]], { limit: 1 });
  if (ids2?.[0]) return Number(ids2[0]);
  const created = await odoo.executeKw("res.partner", "create", [[{ name, email: email || false, phone: safeText(customer?.phone) || false, street: safeText(customer?.address) || false, customer_rank: 1 }]]);
  return Number(created);
}
async function listSuppliersByTag(odoo, query = "") {
  const tagIds = await odoo.executeKw("res.partner.category", "search", [[["name", "ilike", ODOO_DOOR_SUPPLIER_TAG_NAME]]], { limit: 20 });
  const ids = Array.isArray(tagIds) ? tagIds.map(Number).filter(Boolean) : [];
  if (!ids.length) return [];
  const domain = [["category_id", "in", ids]];
  if (safeText(query)) domain.push(["name", "ilike", safeText(query)]);
  const rows = await odoo.executeKw("res.partner", "search_read", [domain], { fields: ["id", "name", "phone", "email", "category_id"], limit: 80, order: "name asc" });
  return (rows || []).map((r) => ({ id: r.id, name: r.name, phone: r.phone || "", email: r.email || "" }));
}
async function buildDoorQuoteSummary(door, mode = "presupuesto") {
  const record = door?.record || {};
  const core = extractDoorCore(record);
  const sellerName = normalizeSellerDisplayName(door?.created_by_full_name || door?.created_by_username);
  let ipanelQuote = null;
  let precioIpanel = 0;
  if (!core.ipanelQuoteId || !isUuid(core.ipanelQuoteId)) {
    throw new Error("La puerta debe tener un presupuesto Ipanel vinculado.");
  }
  const qr = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [core.ipanelQuoteId]);
  const q = qr.rows?.[0] || null;
  if (!q || String(q.catalog_kind || "").toLowerCase() !== "ipanel") {
    throw new Error("El Ipanel vinculado de la puerta es inválido.");
  }
  if (!Array.isArray(q.lines) || !q.lines.length) {
    throw new Error("Completá el presupuesto Ipanel de la puerta.");
  }
  ipanelQuote = q;
  precioIpanel = mode === "proforma" ? calcQuoteBaseTotalWithIva({ lines: q.lines }) : calcQuoteTotalWithIva({ lines: q.lines, payload: q.payload || {} });
  const settings = await getDoorQuoteSettings();
  const variables = { precio_ipanel: round2(precioIpanel), precio_compra_marco: round2(core.purchaseAmount), precio_venta_marco: round2(core.saleAmount) };
  const total = evaluateDoorQuoteFormula(settings.formula, variables);
  const marcoDims = [core.anchoMarcoMm ? `${core.anchoMarcoMm} mm` : "", core.altoMarcoMm ? `${core.altoMarcoMm} mm` : ""].filter(Boolean).join(" x ");
  const lines = [
    { product_id: 0, qty: 1, raw_name: "Puerta", basePrice: round2(total) },
  ];
  const noteLines = [
    core.ipanelQuoteLabel || ipanelQuote?.odoo_sale_order_name ? `Ipanel: ${core.ipanelQuoteLabel || ipanelQuote?.odoo_sale_order_name}` : "Ipanel: no vinculado",
    `Marco de puerta${marcoDims ? ` · Medida ${marcoDims}` : ""}`,
    `Fórmula: ${settings.formula}`,
    `Variables → precio_ipanel=${variables.precio_ipanel} · precio_compra_marco=${variables.precio_compra_marco} · precio_venta_marco=${variables.precio_venta_marco}`,
    `Total puerta=${round2(total)}`,
  ].filter(Boolean);
  const payload = {
    quote_number: normalizeDoorBaseCode(door?.door_code || `P${door?.id || ""}`),
    created_by_role: "vendedor",
    seller_name: sellerName,
    fulfillment_mode: core.fulfillmentMode || "produccion",
    end_customer: record?.end_customer || {},
    lines,
    payload: { margin_percent_ui: 0, payment_method: ipanelQuote?.payload?.payment_method || "", condition_mode: ipanelQuote?.payload?.condition_mode || "", condition_text: ipanelQuote?.payload?.condition_text || "" },
    note: noteLines.join("\n"),
  };
  return { mode, formula: settings.formula, variables, total: round2(total), ipanel_quote_id: ipanelQuote?.id || null, ipanel_quote_label: ipanelQuote?.odoo_sale_order_name || core.ipanelQuoteLabel || "", marco_dimensions_label: marcoDims, payload };
}
async function syncDoorPurchaseToOdoo({ odoo, door }) {
  const core = validateDoorForSubmit(door, door.record || {});
  const { productId, name, uomId } = await resolveProductInfo(odoo, ODOO_DOOR_PRODUCT_ID);
  const purchaseOrderId = await odoo.executeKw("purchase.order", "create", [{
    partner_id: core.supplierId,
    order_line: [[0, 0, { product_id: productId, product_qty: 1, product_uom: uomId, name: `${name} · ${door.door_code}`, price_unit: core.purchaseAmount, date_planned: nowDateTime() }]],
    notes: `MARCO DE PUERTA TERCERIZADO: ${door.door_code}` + (door.linked_quote_id ? `\nPortón vinculado: ${door.linked_quote_id}` : "") + (core.proveedorCondiciones ? `\nCondiciones: ${core.proveedorCondiciones}` : ""),
  }]);
  const purchaseOrderReadId = Number(Array.isArray(purchaseOrderId) ? purchaseOrderId[0] : purchaseOrderId);
  const [purchaseOrder] = await odoo.executeKw("purchase.order", "read", [[purchaseOrderReadId]], { fields: ["id", "name", "state", "partner_id"] });
  return { purchaseOrder };
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
    order_line: [[0, 0, { product_id: productId, product_uom_qty: 1, product_uom: uomId, name: `${name} · ${door.door_code}`, price_unit: round2(summary.total) }]],
    note: `${linkedQuote?.id ? "PUERTA VINCULADA" : "PUERTA"}: ${door.door_code}` + (linkedQuote?.id ? `\nPresupuesto portón: ${linkedQuote.id}` : "") + (linkedQuote?.odoo_sale_order_name ? `\nNV portón: ${linkedQuote.odoo_sale_order_name}` : "") + (sellerName ? `\nVendedor: ${sellerName}` : "") + `\n${summary.payload.note || ""}`,
  }]);
  const saleOrderReadId = Number(Array.isArray(saleOrderId) ? saleOrderId[0] : saleOrderId);
  await applySellerToSaleOrder(odoo, saleOrderReadId, sellerName);
  const [saleOrder] = await odoo.executeKw("sale.order", "read", [[saleOrderReadId]], { fields: ["id", "name", "amount_total", "state", "partner_id"] });
  return { saleOrder, summary };
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
    if (!door.odoo_purchase_order_id) {
      const { purchaseOrder } = await syncDoorPurchaseToOdoo({ odoo, door });
      await dbQuery(`update public.presupuestador_doors set odoo_purchase_order_id=$2, odoo_purchase_order_name=$3, updated_at=now() where id=$1`, [Number(id), Number(purchaseOrder.id), purchaseOrder.name]);
      door = await getDoorHydratedById(id);
    }

    if (!door.odoo_sale_order_id) {
      const { saleOrder } = await syncDoorSaleToOdoo({ odoo, door, linkedQuote });
      if (saleOrder?.id) {
        await dbQuery(`update public.presupuestador_doors set odoo_sale_order_id=$2, odoo_sale_order_name=$3, updated_at=now() where id=$1`, [Number(id), Number(saleOrder.id), saleOrder.name]);
        door = await getDoorHydratedById(id);
      }
    }

    const finalDoor = await getDoorHydratedById(id);
    if (finalDoor?.odoo_purchase_order_id && finalDoor?.odoo_sale_order_id) {
      await dbQuery(`update public.presupuestador_doors set status='synced_odoo', synced_at=coalesce(synced_at, now()), updated_at=now() where id=$1`, [Number(id)]);
      return await getDoorHydratedById(id);
    }
    return finalDoor;
  } catch (e) {
    const currentDoor = await getDoorHydratedById(id);
    const fallbackStatus = currentDoor?.odoo_purchase_order_id || currentDoor?.odoo_sale_order_id ? "syncing_odoo" : "pending_approvals";
    await dbQuery(`update public.presupuestador_doors set status=$2, updated_at=now() where id=$1`, [Number(id), fallbackStatus]);
    throw e;
  }
}

export function buildDoorsRouter(odooArg) {
  const router = express.Router();
  const odoo = odooArg || createOdooClient({ url: process.env.ODOO_URL, db: process.env.ODOO_DB, username: process.env.ODOO_USERNAME, password: process.env.ODOO_PASSWORD, companyId: process.env.ODOO_COMPANY_ID || null });

  router.use(async (_req, _res, next) => { try { await ensureDoorsSchema(); next(); } catch (e) { next(e); } });
  router.use(requireAuth);

  router.get("/suppliers", requireSeller, async (req, res, next) => { try { res.json({ ok: true, suppliers: await listSuppliersByTag(odoo, req.query.query || "") }); } catch (e) { next(e); } });

  router.get("/by-quote/:quoteId", async (req, res, next) => {
    try {
      const quoteId = safeText(req.params.quoteId);
      if (!isUuid(quoteId)) return res.status(400).json({ ok: false, error: "quoteId inválido" });
      const quote = await getQuoteReadable(quoteId, req.user);
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
      if (!isUuid(quoteId)) return res.status(400).json({ ok: false, error: "quoteId inválido" });
      const quote = await getQuoteReadable(quoteId, req.user);
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no autorizado" });
      const r = await dbQuery(`select id from public.presupuestador_doors where linked_quote_id=$1 limit 1`, [quoteId]);
      const id = Number(r.rows?.[0]?.id || 0);
      if (!id) return res.json({ ok: true, door: null });
      const door = await trySyncDoorOrders({ odoo, id });
      return res.json({ ok: true, door });
    } catch (e) { next(e); }
  });

  router.get("/", async (req, res, next) => {
    try {
      const scope = safeText(req.query.scope || "mine");
      let sql = ""; let params = [];
      if (scope === "mine") {
        if (!req.user?.is_vendedor) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select id from public.presupuestador_doors where created_by_user_id = $1 order by id desc limit 300`; params = [Number(req.user.user_id)];
      } else if (scope === "commercial_inbox") {
        if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select id from public.presupuestador_doors where status = 'pending_approvals' and commercial_decision = 'pending' order by id desc limit 300`;
      } else if (scope === "technical_inbox") {
        if (!req.user?.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `select id from public.presupuestador_doors where status = 'pending_approvals' and technical_decision = 'pending' order by id desc limit 300`;
      } else {
        return res.status(400).json({ ok: false, error: "scope inválido" });
      }
      const r = await dbQuery(sql, params); const doors = []; for (const row of (r.rows || [])) { const door = await getDoorHydratedById(row.id); if (door) doors.push(door); } res.json({ ok: true, doors });
    } catch (e) { next(e); }
  });

  router.post("/", requireSeller, async (req, res, next) => {
    try {
      const linkedQuoteId = safeText(req.body?.linked_quote_id);
      if (linkedQuoteId) {
        if (!isUuid(linkedQuoteId)) return res.status(400).json({ ok: false, error: "linked_quote_id inválido" });
        const quote = await getQuoteOwnedBySeller(linkedQuoteId, req.user.user_id);
        if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no sos dueño" });
        const existing = await dbQuery(`select id from public.presupuestador_doors where linked_quote_id=$1 limit 1`, [linkedQuoteId]);
        if (existing.rows?.[0]?.id) return res.json({ ok: true, door: await getDoorHydratedById(existing.rows[0].id) });
        const record = buildInitialDoorRecord({ quote, user: req.user });
        const doorCode = buildDoorCodeFromQuote(quote) || buildFallbackDoorCode(linkedQuoteId);
        const ins = await dbQuery(`insert into public.presupuestador_doors (created_by_user_id, linked_quote_id, door_code, status, commercial_decision, technical_decision, record, updated_at) values ($1, $2, $3, 'draft', 'pending', 'pending', $4::jsonb, now()) returning id`, [Number(req.user.user_id), linkedQuoteId, doorCode, JSON.stringify(record)]);
        return res.json({ ok: true, door: await getDoorHydratedById(ins.rows?.[0]?.id) });
      }
      const ins = await dbQuery(`insert into public.presupuestador_doors (created_by_user_id, linked_quote_id, door_code, status, commercial_decision, technical_decision, record, updated_at) values ($1, null, 'PENDIENTE', 'draft', 'pending', 'pending', $2::jsonb, now()) returning id`, [Number(req.user.user_id), JSON.stringify(buildInitialDoorRecord({ quote: null, user: req.user }))]);
      const id = Number(ins.rows?.[0]?.id); const doorCode = buildStandaloneDoorCode(id); await dbQuery(`update public.presupuestador_doors set door_code=$2 where id=$1`, [id, doorCode]);
      return res.json({ ok: true, door: await getDoorHydratedById(id) });
    } catch (e) { next(e); }
  });

  router.post("/from-quote/:quoteId", requireSeller, async (req, res, next) => {
    try {
      const linkedQuoteId = safeText(req.params.quoteId);
      if (!isUuid(linkedQuoteId)) return res.status(400).json({ ok: false, error: "linked_quote_id inválido" });
      const quote = await getQuoteOwnedBySeller(linkedQuoteId, req.user.user_id);
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no sos dueño" });
      const existing = await dbQuery(`select id from public.presupuestador_doors where linked_quote_id=$1 limit 1`, [linkedQuoteId]);
      if (existing.rows?.[0]?.id) return res.json({ ok: true, door: await getDoorHydratedById(existing.rows[0].id) });
      const record = buildInitialDoorRecord({ quote, user: req.user });
      const doorCode = buildDoorCodeFromQuote(quote) || buildFallbackDoorCode(linkedQuoteId);
      const ins = await dbQuery(`insert into public.presupuestador_doors (created_by_user_id, linked_quote_id, door_code, status, commercial_decision, technical_decision, record, updated_at) values ($1, $2, $3, 'draft', 'pending', 'pending', $4::jsonb, now()) returning id`, [Number(req.user.user_id), linkedQuoteId, doorCode, JSON.stringify(record)]);
      return res.json({ ok: true, door: await getDoorHydratedById(ins.rows?.[0]?.id) });
    } catch (e) { next(e); }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (!canReadDoor(req.user, door)) return res.status(403).json({ ok: false, error: "No autorizado" });
      return res.json({ ok: true, door });
    } catch (e) { next(e); }
  });

  router.get("/:id/quote-summary", async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (!canReadDoor(req.user, door)) return res.status(403).json({ ok: false, error: "No autorizado" });
      const mode = String(req.query.mode || "presupuesto").toLowerCase() === "proforma" ? "proforma" : "presupuesto";
      return res.json({ ok: true, summary: await buildDoorQuoteSummary(door, mode) });
    } catch (e) { next(e); }
  });

  router.get("/:id/quote-pdf-payload", async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (!canReadDoor(req.user, door)) return res.status(403).json({ ok: false, error: "No autorizado" });
      const mode = String(req.query.mode || "presupuesto").toLowerCase() === "proforma" ? "proforma" : "presupuesto";
      const summary = await buildDoorQuoteSummary(door, mode);
      return res.json({ ok: true, payload: summary.payload, summary });
    } catch (e) { next(e); }
  });

  router.put("/:id", requireSeller, async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const cur = await getDoorHydratedById(id); if (!cur) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (String(cur.created_by_user_id) !== String(req.user.user_id)) return res.status(403).json({ ok: false, error: "No autorizado" });
      const record = req.body?.record; if (!record || typeof record !== "object") return res.status(400).json({ ok: false, error: "Falta record (objeto)" });
      let linkedQuote = null; if (cur.linked_quote_id) linkedQuote = await getQuoteOwnedBySeller(cur.linked_quote_id, req.user.user_id);
      const nextDoorCode = linkedQuote ? (buildDoorCodeFromQuote(linkedQuote) || cur.door_code) : (cur.door_code || buildStandaloneDoorCode(id));
      const nextRecord = {
        ...record,
        asociado_porton: linkedQuote ? buildLinkedPortonLabel(linkedQuote) : safeText(record?.asociado_porton),
        fulfillment_mode: safeText(record?.fulfillment_mode),
      };
      const core = extractDoorCore(nextRecord);
      await dbQuery(`update public.presupuestador_doors set record = $2::jsonb, door_code = $3, supplier_odoo_partner_id = $4, sale_amount = $5, purchase_amount = $6, updated_at = now() where id = $1`, [id, JSON.stringify(nextRecord), nextDoorCode, core.supplierId, core.saleAmount || null, core.purchaseAmount || null]);
      return res.json({ ok: true, door: await getDoorHydratedById(id) });
    } catch (e) { next(e); }
  });

  router.post("/:id/submit", requireSeller, async (req, res, next) => {
    try {
      const id = Number(req.params.id); if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (String(door.created_by_user_id) !== String(req.user.user_id)) return res.status(403).json({ ok: false, error: "No autorizado" });
      validateDoorForSubmit(door, door.record);
      await buildDoorQuoteSummary(door, "presupuesto");
      await dbQuery(`update public.presupuestador_doors set status='pending_approvals', commercial_decision='pending', technical_decision='pending', commercial_notes=null, technical_notes=null, updated_at=now() where id=$1`, [id]);
      return res.json({ ok: true, door: await getDoorHydratedById(id) });
    } catch (e) { next(e); }
  });

  router.post("/:id/review/commercial", requireCommercial, async (req, res, next) => {
    try {
      const id = Number(req.params.id); const action = safeText(req.body?.action).toLowerCase(); const notes = safeText(req.body?.notes);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ ok: false, error: "action inválida" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (door.status !== "pending_approvals") return res.status(409).json({ ok: false, error: "La puerta no está en aprobación" });
      if (door.commercial_decision !== "pending") return res.status(409).json({ ok: false, error: "La revisión comercial ya fue resuelta" });
      if (action === "reject") {
        await dbQuery(`update public.presupuestador_doors set status='draft', commercial_decision='rejected', commercial_notes=$2, updated_at=now() where id=$1`, [id, notes || "Rechazado"]);
        return res.json({ ok: true, door: await getDoorHydratedById(id) });
      }
      await dbQuery(`update public.presupuestador_doors set commercial_decision='approved', commercial_notes=$2, updated_at=now() where id=$1`, [id, notes || null]);
      return res.json({ ok: true, door: await trySyncDoorOrders({ odoo, id }) });
    } catch (e) { next(e); }
  });

  router.post("/:id/review/technical", requireTech, async (req, res, next) => {
    try {
      const id = Number(req.params.id); const action = safeText(req.body?.action).toLowerCase(); const notes = safeText(req.body?.notes);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ ok: false, error: "action inválida" });
      const door = await getDoorHydratedById(id); if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (door.status !== "pending_approvals") return res.status(409).json({ ok: false, error: "La puerta no está en aprobación" });
      if (door.technical_decision !== "pending") return res.status(409).json({ ok: false, error: "La revisión técnica ya fue resuelta" });
      if (action === "reject") {
        await dbQuery(`update public.presupuestador_doors set status='draft', technical_decision='rejected', technical_notes=$2, updated_at=now() where id=$1`, [id, notes || "Rechazado"]);
        return res.json({ ok: true, door: await getDoorHydratedById(id) });
      }
      await dbQuery(`update public.presupuestador_doors set technical_decision='approved', technical_notes=$2, updated_at=now() where id=$1`, [id, notes || null]);
      return res.json({ ok: true, door: await trySyncDoorOrders({ odoo, id }) });
    } catch (e) { next(e); }
  });

  return router;
}

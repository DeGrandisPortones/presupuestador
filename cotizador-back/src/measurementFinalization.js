import { randomBytes } from "crypto";
import { dbQuery } from "./db.js";
import {
  getCommercialFinalToleranceAreaM2,
  getMeasurementProductMappings,
  getTechnicalMeasurementRules,
  getTechnicalMeasurementFieldDefinitions,
} from "./settingsDb.js";
import {
  getProductionPropertyAssignmentsMap,
  applyProductionPropertyAssignments,
  buildSectionSourceKey,
} from "./productionPropertyAssignments.js";
import {
  getIpanelPropertyAssignmentsMap,
  applyIpanelPropertyAssignments,
} from "./ipanelPropertyAssignments.js";
import { loadCatalogBootstrap } from "./catalogBootstrap.js";
import { computeOfficialPortonMeasurements } from "./portonVanoMeasurements.js";
import {
  buildFinancingSaleOrderVals,
  appendPaymentMethodToNote,
  appendBudgetObservationToNote,
  appendCommercialCommentToNote,
} from "./routes/quotes.routes.js";

const PLACEHOLDER_PRODUCT_ID = Number(
  process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 3575,
);
function parseMeasurementProductIds(raw) {
  return String(raw || "2865,2961,4229")
    .split(",")
    .map((item) => Number(String(item || "").trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

// 4229 = "Servicio de Medicion y Relevamiento" de Puertas (duplicado dedicado, antes
// compartia el 2961 con Portones).
const MEASUREMENT_PRODUCT_IDS = parseMeasurementProductIds(
  process.env.ODOO_MEASUREMENT_PRODUCT_IDS ||
    process.env.ODOO_MEASUREMENT_PRODUCT_ID ||
    "2865,2961,4229",
);
const IVA_RATE = 0.21;
// 4230 = "Servicio de Traslado a destino" de Puertas (duplicado dedicado, antes
// compartia el 2842 con Portones).
const SHIPPING_PRODUCT_IDS = new Set([2842, 4230]);
// El envío (2842) lo sigue cobrando De Grandis al distribuidor, a diferencia del
// resto de esta lista que sí provee el distribuidor por su cuenta: no debe ir a $0
// en la orden real de Odoo. Mismo criterio ya aplicado en quotes.routes.js.
const DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS = new Set([3956, 3957, 3961, 3962, 3963, 3966, 4037, 3991, 3992, 3993, 3994, 3995, 3996, 3485, 3486, 3490, 3491, 3492, 3495, 3566, 3520, 3521, 3522, 3523, 3524, 3525]);

function toScalar(v) {
  return Array.isArray(v) ? v[0] : v;
}
function toIntId(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = toScalar(v);
  const n = Number(x);
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
// Precio de Envío: se usa el valor ya congelado en envio_odoo_price_snapshot
// (armado al crear el presupuesto, o al apretar "Actualizar presupuesto" en uno
// viejo). Si no existe (presupuesto viejo nunca actualizado) se mantiene el
// comportamiento historico: va a $0, igual que siempre.
function getEnvioOdooPriceSnapshot(quote = {}) {
  const raw = quote?.envio_odoo_price_snapshot;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function shouldZeroShippingForOdoo(quote = {}, line = {}) {
  if (!isDistributorQuote(quote)) return false;
  if (isShippingLine(line)) return getEnvioOdooPriceSnapshot(quote) == null;
  return isDistributorOwnSupplyLine(line);
}
// Cliente externo: el cliente real del distribuidor (no el partner de Odoo, que es
// siempre el distribuidor). Mismo patron usado en quotes.routes.js: prueba nombres de
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
// Se llama DESPUES de fijar name/origin/client_order_ref con la referencia NV, asi el
// client_order_ref combinado ("NV4253 Cliente Pedrito Gomez") no se pisa. name/origin
// quedan con la referencia limpia unicamente.
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
function toText(v) {
  const x = toScalar(v);
  return x === null || x === undefined ? "" : String(x).trim();
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
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
function round4(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
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
function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}
function toNumberLike(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function referenceNumberFromQuote(originalQuote, revisionQuote) {
  const direct =
    toText(originalQuote?.odoo_sale_order_name) ||
    toText(originalQuote?.final_sale_order_name) ||
    toText(originalQuote?.quote_number) ||
    toText(revisionQuote?.final_sale_order_name) ||
    toText(revisionQuote?.quote_number);
  const digits = onlyDigits(direct);
  if (digits) return digits;
  return direct || "";
}
function getReferenceFamilyPrefix(quote) {
  const kind = String(quote?.catalog_kind || quote?.payload?.catalog_kind || "porton").toLowerCase().trim();
  if (kind === "ipanel") return "I";
  if (kind === "plegados") return "PL";
  if (kind === "puerta") return "P";
  if (kind === "otros") return "O";
  return "";
}
function extractNvInteger(value) {
  const digits = onlyDigits(value);
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
function extractNvTipo(value) {
  const match = String(value || "").trim().match(/^([A-Za-z]+)\d/);
  if (!match) return "NV";
  const prefix = match[1].toUpperCase();
  return ["INV", "ONV", "PLNV", "PNV"].includes(prefix) ? prefix : "NV";
}
export function formatPortonTypeLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
function formatDateOnly(value) {
  const raw = toText(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw;
}
async function resolveSellerActorInfo(sourceQuote, originalQuote) {
  const fallbackRole =
    toText(sourceQuote?.created_by_role) ||
    toText(originalQuote?.created_by_role);

  const fallbackName =
    toText(sourceQuote?.created_by_full_name) ||
    toText(sourceQuote?.created_by_username) ||
    toText(originalQuote?.created_by_full_name) ||
    toText(originalQuote?.created_by_username);

  const fallbackUsername =
    toText(sourceQuote?.created_by_username) ||
    toText(originalQuote?.created_by_username);

  const userId =
    toIntId(sourceQuote?.created_by_user_id) ||
    toIntId(originalQuote?.created_by_user_id);

  if (!userId) {
    return {
      role: fallbackRole,
      full_name: fallbackName,
      username: fallbackUsername,
      vendedor_nombre: fallbackRole === "vendedor" ? fallbackName : "",
      distribuidor_nombre: fallbackRole === "distribuidor" ? fallbackName : "",
    };
  }

  try {
    const q = await dbQuery(
      `select id, username, full_name, is_vendedor, is_distribuidor
         from public.presupuestador_users
        where id = $1
        limit 1`,
      [userId],
    );
    const row = q.rows?.[0] || null;
    const role = fallbackRole || (row?.is_distribuidor ? "distribuidor" : row?.is_vendedor ? "vendedor" : "");
    const fullName = toText(row?.full_name) || fallbackName;
    const username = toText(row?.username) || fallbackUsername;

    return {
      role,
      full_name: fullName,
      username,
      vendedor_nombre: role === "vendedor" ? fullName : "",
      distribuidor_nombre: role === "distribuidor" ? fullName : "",
    };
  } catch {
    return {
      role: fallbackRole,
      full_name: fallbackName,
      username: fallbackUsername,
      vendedor_nombre: fallbackRole === "vendedor" ? fallbackName : "",
      distribuidor_nombre: fallbackRole === "distribuidor" ? fallbackName : "",
    };
  }
}
async function buildSectionValues({ odoo, catalogKind, lines }) {
  const out = {};
  const selectedLines = Array.isArray(lines) ? lines : [];
  if (!odoo || !selectedLines.length) return out;

  try {
    const bootstrap = await loadCatalogBootstrap(odoo, catalogKind || "porton");
    const sections = Array.isArray(bootstrap?.sections) ? bootstrap.sections : [];
    const products = Array.isArray(bootstrap?.products) ? bootstrap.products : [];

    const sectionNameById = new Map(
      sections.map((section) => [Number(section?.id || 0), toText(section?.name)]).filter(([id, name]) => id && name)
    );
    const productById = new Map(
      products.map((product) => [Number(product?.id || 0), product]).filter(([id]) => id)
    );

    for (const line of selectedLines) {
      const productId = toIntId(line?.product_id);
      if (!productId) continue;

      const product = productById.get(productId);
      const aliasValue =
        toText(product?.alias) ||
        toText(product?.internal_alias) ||
        toText(product?.display_name) ||
        toText(line?.name) ||
        toText(line?.raw_name);
      if (!aliasValue) continue;

      const sectionIds = Array.isArray(product?.section_ids) ? product.section_ids : [];
      for (const rawSectionId of sectionIds) {
        const sectionName = sectionNameById.get(Number(rawSectionId || 0));
        const sourceKey = buildSectionSourceKey(sectionName);
        if (!sectionName || !sourceKey) continue;

        if (!Array.isArray(out[sourceKey])) out[sourceKey] = [];
        if (!out[sourceKey].includes(aliasValue)) out[sourceKey].push(aliasValue);
      }
    }

    for (const key of Object.keys(out)) {
      out[key] = out[key].join(", ");
    }

    return out;
  } catch {
    return {};
  }
}
async function buildPreproduccionPayload({ originalQuote, sourceQuote, revisionQuote, order, metrics, generatedLines, odoo }) {
  const originalPayload =
    originalQuote?.payload && typeof originalQuote.payload === "object"
      ? originalQuote.payload
      : {};
  const sourcePayload =
    sourceQuote?.payload && typeof sourceQuote.payload === "object"
      ? sourceQuote.payload
      : {};
  const revisionPayload =
    revisionQuote?.payload && typeof revisionQuote.payload === "object"
      ? revisionQuote.payload
      : {};
  const dimensions =
    revisionPayload?.dimensions && typeof revisionPayload.dimensions === "object"
      ? revisionPayload.dimensions
      : sourcePayload?.dimensions && typeof sourcePayload.dimensions === "object"
        ? sourcePayload.dimensions
        : originalPayload?.dimensions && typeof originalPayload.dimensions === "object"
          ? originalPayload.dimensions
          : {};
  const measurementForm =
    originalQuote?.measurement_form && typeof originalQuote.measurement_form === "object"
      ? originalQuote.measurement_form
      : {};
  const endCustomer =
    revisionQuote?.end_customer && typeof revisionQuote.end_customer === "object"
      ? revisionQuote.end_customer
      : sourceQuote?.end_customer && typeof sourceQuote.end_customer === "object"
        ? sourceQuote.end_customer
        : originalQuote?.end_customer && typeof originalQuote.end_customer === "object"
          ? originalQuote.end_customer
          : {};

  const sellerInfo = await resolveSellerActorInfo(sourceQuote, originalQuote);

  const rawPortonType =
    toText(revisionPayload?.porton_type) ||
    toText(sourcePayload?.porton_type) ||
    toText(originalPayload?.porton_type);

  const visiblePortonType = formatPortonTypeLabel(rawPortonType);

  const lines = (Array.isArray(generatedLines) ? generatedLines : []).map((line) => ({
    product_id: toIntId(line?.product_id),
    odoo_id: toIntId(line?.odoo_id),
    odoo_template_id: toIntId(line?.odoo_template_id),
    odoo_variant_id: toIntId(line?.odoo_variant_id),
    qty: Number(line?.qty || 0) || 0,
    name: toText(line?.name),
    raw_name: toText(line?.raw_name),
    price_unit: typeof line?.price_unit === "number" ? line.price_unit : calcDetailedUnitWithIva(line, revisionPayload || sourcePayload || originalPayload || {}, sourceQuote || originalQuote),
  }));

  const sectionValues = await buildSectionValues({
    odoo,
    catalogKind:
      toText(revisionQuote?.catalog_kind) ||
      toText(sourceQuote?.catalog_kind) ||
      toText(originalQuote?.catalog_kind) ||
      "porton",
    lines,
  });

  const clienteNombre = toText(endCustomer?.name);
  const clienteApellido =
    toText(endCustomer?.last_name) ||
    toText(endCustomer?.lastname) ||
    toText(endCustomer?.apellido);

  return {
    nv: extractNvInteger(order?.name || metrics?.reference_nv),
    referencia_nv: toText(order?.name || metrics?.reference_nv),
    referencia_np:
      toText(sourceQuote?.odoo_sale_order_name) ||
      toText(originalQuote?.odoo_sale_order_name),
    quote_number:
      toText(originalQuote?.quote_number) ||
      toText(sourceQuote?.quote_number) ||
      toText(revisionQuote?.quote_number),

    fecha_presupuesto:
      formatDateOnly(originalQuote?.created_at) ||
      formatDateOnly(sourceQuote?.created_at) ||
      formatDateOnly(revisionQuote?.created_at),
    fecha_confirmacion:
      formatDateOnly(sourceQuote?.confirmed_at) ||
      formatDateOnly(originalQuote?.confirmed_at),
    fecha_aprobacion_comercial:
      formatDateOnly(sourceQuote?.commercial_at) ||
      formatDateOnly(originalQuote?.commercial_at),
    fecha_aprobacion_tecnica:
      formatDateOnly(sourceQuote?.technical_at) ||
      formatDateOnly(originalQuote?.technical_at),
    fecha_np:
      formatDateOnly(sourceQuote?.synced_at) ||
      formatDateOnly(sourceQuote?.odoo_synced_at) ||
      formatDateOnly(originalQuote?.synced_at) ||
      formatDateOnly(originalQuote?.odoo_synced_at),
    fecha_medicion:
      formatDateOnly(originalQuote?.measurement_at) ||
      formatDateOnly(sourceQuote?.measurement_at),
    fecha_revision_tecnica_final:
      formatDateOnly(originalQuote?.measurement_review_at) ||
      formatDateOnly(sourceQuote?.measurement_review_at),
    fecha_solicitud_salida_acopio:
      formatDateOnly(originalQuote?.acopio_to_produccion_requested_at) ||
      formatDateOnly(sourceQuote?.acopio_to_produccion_requested_at),
    fecha_nv:
      formatDateOnly(revisionQuote?.final_synced_at) ||
      formatDateOnly(order?.write_date) ||
      formatDateOnly(new Date().toISOString()),
    catalog_kind:
      toText(revisionQuote?.catalog_kind) ||
      toText(sourceQuote?.catalog_kind) ||
      toText(originalQuote?.catalog_kind) ||
      "porton",
    fulfillment_mode:
      toText(revisionQuote?.fulfillment_mode) ||
      toText(sourceQuote?.fulfillment_mode) ||
      toText(originalQuote?.fulfillment_mode),
    payment_method:
      toText(revisionPayload?.payment_method) ||
      toText(sourcePayload?.payment_method) ||
      toText(originalPayload?.payment_method),

    cliente_nombre: clienteNombre,
    cliente_apellido: clienteApellido,
    cliente_nombre_completo: [clienteNombre, clienteApellido].filter(Boolean).join(" ").trim() || clienteNombre,
    cliente_telefono: toText(endCustomer?.phone),
    cliente_email: toText(endCustomer?.email),
    cliente_direccion: toText(endCustomer?.address || endCustomer?.street),
    cliente_localidad: toText(endCustomer?.city),
    cliente_maps_url: toText(endCustomer?.maps_url),

    vendido_por_rol: toText(sellerInfo?.role),
    vendido_por_nombre: toText(sellerInfo?.full_name),
    vendido_por_username: toText(sellerInfo?.username),
    vendedor_nombre: toText(sellerInfo?.vendedor_nombre),
    distribuidor_nombre: toText(sellerInfo?.distribuidor_nombre),

    porton_type: visiblePortonType || rawPortonType,
    porton_type_key: rawPortonType,

    alto_final_mm:
      toText(measurementForm?.alto_final_mm) ||
      toText(dimensions?.height_mm) ||
      toText(dimensions?.alto_final_mm),
    ancho_final_mm:
      toText(measurementForm?.ancho_final_mm) ||
      toText(dimensions?.width_mm) ||
      toText(dimensions?.ancho_final_mm),

    // Estos 4 vienen siempre del presupuesto: el unico que puede modificar el esquema de
    // parantes es el vendedor, editando el presupuesto. measurementForm queda solo como
    // respaldo para presupuestos viejos que no tengan nada cargado en dimensions.
    cantidad_parantes:
      toText(dimensions?.cantidad_parantes) ||
      toText(measurementForm?.cantidad_parantes) ||
      toText(measurementForm?.parantes?.cant),
    orientacion_parantes:
      toText(dimensions?.orientacion_parantes) ||
      toText(measurementForm?.orientacion_parantes) ||
      toText(measurementForm?.parantes?.orientacion),
    distribucion_parantes:
      toText(dimensions?.distribucion_parantes) ||
      toText(measurementForm?.distribucion_parantes) ||
      toText(measurementForm?.parantes?.distribucion),
    observaciones_parantes:
      toText(dimensions?.observaciones_parantes) ||
      toText(measurementForm?.observaciones_parantes) ||
      toText(measurementForm?.parantes?.observaciones),

    tolerance_percent: Number(metrics?.tolerance_percent ?? 0) || 0,
    tolerance_amount: Number(metrics?.tolerance_amount ?? 0) || 0,
    difference_amount: Number(metrics?.difference_amount ?? 0) || 0,
    absorbed_by_company: metrics?.absorbed_by_company === true,
    final_amount_to_charge: Number(metrics?.final_amount_to_charge ?? 0) || 0,

    measurement_form: measurementForm,
    dimensions,
    lines,
    sections: sectionValues,

    original_quote_snapshot: {
      id: originalQuote?.id ?? null,
      odoo_sale_order_name: toText(originalQuote?.odoo_sale_order_name),
      final_sale_order_name: toText(originalQuote?.final_sale_order_name),
      status: toText(originalQuote?.status),
      final_status: toText(originalQuote?.final_status),
    },
    revision_quote_snapshot: {
      id: revisionQuote?.id ?? null,
      final_sale_order_id: Number(order?.id || 0) || null,
      final_sale_order_name: toText(order?.name),
      status: toText(revisionQuote?.status),
      final_status: toText(revisionQuote?.final_status),
    },
    ...sectionValues,
  };
}
async function upsertPreproduccionValoresForNv({ originalQuote, sourceQuote, revisionQuote, order, metrics, generatedLines, odoo }) {
  const basePayload = await buildPreproduccionPayload({
    originalQuote,
    sourceQuote,
    revisionQuote,
    order,
    metrics,
    generatedLines,
    odoo,
  });

  const nv = extractNvInteger(basePayload?.referencia_nv || basePayload?.nv);
  if (!nv) return { ok: false, skipped: true, reason: "missing_nv" };

  const assignmentsMap = await getProductionPropertyAssignmentsMap();
  const mappedFromPresupuestador = applyProductionPropertyAssignments(basePayload, assignmentsMap);

  const finalPayload = {
    ...basePayload,
    mapped_from_presupuestador: mappedFromPresupuestador,
    ...mappedFromPresupuestador,
  };

  const nvLines = (Array.isArray(generatedLines) ? generatedLines : [])
    .filter((l) => l && (l.name || l.raw_name))
    .map((l) => ({
      name: toText(l.name),
      raw_name: toText(l.raw_name),
      qty: Number(l.qty || 0) || 0,
    }));

  const nvTipo = extractNvTipo(basePayload?.referencia_nv);

  if (nvTipo === "INV") {
    // Aplicar asignaciones de propiedades para INV
    const ipanelAssignmentsMap = await getIpanelPropertyAssignmentsMap();
    const mappedFromPresupuestador = applyIpanelPropertyAssignments(finalPayload, ipanelAssignmentsMap);
    const ipanelPayload = { ...finalPayload, ...mappedFromPresupuestador };

    // INV va a preproduccion_valores_ipanels, no a preproduccion_valores
    const toDateOrNull = (v) => {
      const s = String(v || "").trim();
      if (!s) return null;
      const d = new Date(s);
      return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
    };
    const fechaNv = toDateOrNull(ipanelPayload?.fecha_nv);
    const fechaPlanEntrega = toDateOrNull(ipanelPayload?.fecha_plan_entrega);
    const descripcion = toText(ipanelPayload?.descripcion || ipanelPayload?.producto_descripcion) || null;

    // Resolve DescripcionSimple: from assignment mapping, else from product lines, else ALUMINIO default
    let descripcionSimple = toText(ipanelPayload?.DescripcionSimple ?? ipanelPayload?.descripcion_simple) || null;
    if (!descripcionSimple) {
      const ipanelLines = Array.isArray(ipanelPayload?.lines) ? ipanelPayload.lines : [];
      const PRODUCT_ID_MADERA = 4060;
      const PRODUCT_ID_ALUMINIO = 4059;
      const hasMaderaById = ipanelLines.some((l) => Number(l?.product_id) === PRODUCT_ID_MADERA);
      const hasAluminioById = ipanelLines.some((l) => Number(l?.product_id) === PRODUCT_ID_ALUMINIO);
      if (hasMaderaById) descripcionSimple = "MADERA";
      else if (hasAluminioById) descripcionSimple = "ALUMINIO";
      else {
        // Fallback: scan line names for keywords
        const lineNames = ipanelLines.map((l) => toText(l?.name || l?.raw_name).toUpperCase()).join(" ");
        if (lineNames.includes("MADERA")) descripcionSimple = "MADERA";
        else if (lineNames.includes("ALUMINIO")) descripcionSimple = "ALUMINIO";
        else descripcionSimple = "ALUMINIO"; // default for ipanel catalog_kind
      }
    }

    const q = await dbQuery(
      `insert into public.preproduccion_valores_ipanels
         (partida, nv, source, fecha_nv, fecha_plan_entrega, descripcion, descripcion_simple, data)
       values ($1, $2, 'Presupuestador', $3, $4, $5, $6, $7::jsonb)
       on conflict (partida)
       do update set
         nv                = excluded.nv,
         source            = excluded.source,
         descripcion       = excluded.descripcion,
         descripcion_simple = coalesce(excluded.descripcion_simple, preproduccion_valores_ipanels.descripcion_simple),
         data              = excluded.data,
         updated_at        = now()
       returning id, partida, updated_at`,
      [nv, nv, fechaNv, fechaPlanEntrega, descripcion, descripcionSimple, JSON.stringify(ipanelPayload)],
    );

    return {
      ok: true,
      id: q.rows?.[0]?.id ?? null,
      nv: q.rows?.[0]?.partida ?? nv,
      nv_tipo: "INV",
      updated_at: q.rows?.[0]?.updated_at || null,
      table: "preproduccion_valores_ipanels",
    };
  }

  const q = await dbQuery(
    `insert into public.preproduccion_valores (nv, nv_tipo, data, nv_lines)
     values ($1, $2, $3::jsonb, $4::jsonb)
     on conflict (nv, nv_tipo)
     do update set
       data = excluded.data,
       nv_lines = excluded.nv_lines,
       updated_at = now()
     returning id, nv, nv_tipo, updated_at`,
    [nv, nvTipo, JSON.stringify(finalPayload), JSON.stringify(nvLines)],
  );

  // El portón queda en preproduccion_valores esperando que alguien le asigne
  // Fecha Producción y lo mande a producción a mano desde "Autorizaciones ·
  // Preproducción Portones" (revert del auto-envío directo a Planta que
  // hacía esto solo al aceptar el cliente el link).
  return {
    ok: true,
    id: q.rows?.[0]?.id ?? null,
    nv: q.rows?.[0]?.nv ?? nv,
    nv_tipo: q.rows?.[0]?.nv_tipo ?? nvTipo,
    updated_at: q.rows?.[0]?.updated_at || null,
  };
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
function calcDetailedUnitWithIva(line, payload, quote = null) {
  // Nombre legacy: este precio unitario es el que se envía a Odoo.
  if (shouldZeroShippingForOdoo(quote, line)) return 0;
  // Envío: usa el precio de Odoo ya congelado (no el que cargó el distribuidor
  // para su propio presupuesto, que puede estar editado/marcado con margen).
  if (isDistributorQuote(quote) && isShippingLine(line)) {
    const snapshot = getEnvioOdooPriceSnapshot(quote);
    return round2((snapshot || 0) * getOdooConditionPriceFactor(payload || {}));
  }
  // Distribuidores: precio base/lista sin margen, sin ajuste.
  // Si es Condición 2 se incluye el IVA 10,5% en el neto enviado a Odoo.
  if (isDistributorQuote(quote)) {
    const base = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
    return round2(base * getOdooConditionPriceFactor(payload || {}));
  }
  if (typeof line?.price_unit === "number") return round2(line.price_unit);
  if (typeof line?.unit_price === "number") return round2(line.unit_price);
  const base = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
  const margin = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(base * (1 + margin / 100) * (1 + getPayloadQuoteAdjustmentPercent(payload || {}) / 100) * getOdooConditionPriceFactor(payload || {}));
}
function compareValues(currentRaw, operator, compareRaw) {
  const currentText = normalizeValue(currentRaw);
  const expectedText = normalizeValue(compareRaw);
  const currentNum = Number(String(currentRaw ?? "").replace(",", "."));
  const expectedNum = Number(String(compareRaw ?? "").replace(",", "."));
  switch (String(operator || "=").trim()) {
    case "=":
      return currentText === expectedText;
    case "!=":
      return currentText !== expectedText;
    case ">":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum > expectedNum;
    case ">=":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum >= expectedNum;
    case "<":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum < expectedNum;
    case "<=":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum <= expectedNum;
    case "contains":
      return currentText.includes(expectedText);
    default:
      return currentText === expectedText;
  }
}
function buildRuleContext(originalQuote, form) {
  const dims = originalQuote?.payload?.dimensions || {};
  const widthM = Number(String(dims?.width ?? "").replace(",", "."));
  const heightM = Number(String(dims?.height ?? "").replace(",", "."));
  const end = originalQuote?.end_customer || {};
  return {
    ...form,
    surface_m2:
      Number.isFinite(widthM) && Number.isFinite(heightM)
        ? round2(widthM * heightM)
        : 0,
    budget_width_m: Number.isFinite(widthM) ? widthM : 0,
    budget_height_m: Number.isFinite(heightM) ? heightM : 0,
    customer_city: toText(end.city),
    customer_name: toText(end.name),
    porton_type: toText(originalQuote?.payload?.porton_type),
    payment_method: toText(originalQuote?.payload?.payment_method),
  };
}
function buildMeasurementLineSeedsFromLegacyMappings(form, rules) {
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
        name: String(entry.product_label || entry.label || rule.field_label || rule.field_key || `Producto ${entry.product_id}`).trim(),
        raw_name: String(entry.product_label || entry.label || rule.field_label || rule.field_key || `Producto ${entry.product_id}`).trim(),
        code: null,
        basePrice: 0,
      });
    }
  }
  return out;
}
function buildMeasurementLineSeedsFromTechnicalRules(originalQuote, form, rules) {
  const context = buildRuleContext(originalQuote, form);
  const out = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule?.active || !rule?.apply_to_odoo || !rule?.product_id) continue;
    const current = getByPath(context, rule.source_key);
    if (!compareValues(current, rule.operator, rule.compare_value)) continue;
    out.push({
      product_id: Number(rule.product_id),
      qty: 1,
      name: String(rule.product_label || rule.name || `Producto ${rule.product_id}`).trim(),
      raw_name: String(rule.product_label || rule.name || `Producto ${rule.product_id}`).trim(),
      code: null,
      basePrice: 0,
    });
  }
  return out;
}
function hasMeaningfulFieldValue(value) {
  const normalized = normalizeValue(value);
  return !!normalized && normalized !== "no" && normalized !== "false" && normalized !== "0";
}
function normalizeStoredBindingProducts(value) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          product_id: Number(item?.product_id || 0) || null,
          display_name: String(item?.display_name || "").trim(),
          alias: String(item?.alias || "").trim(),
          raw_name: String(item?.raw_name || "").trim(),
          code: String(item?.code || "").trim(),
          qty: Number(item?.qty || 1) || 1,
          uses_surface_quantity: item?.uses_surface_quantity === true || item?.use_surface_qty === true,
          use_surface_qty: item?.use_surface_qty === true || item?.uses_surface_quantity === true,
        }))
        .filter((item) => item.product_id)
    : [];
}
function normalizeStoredSelectedBindingProduct(value) {
  if (!value || typeof value !== "object") return null;
  const product_id = Number(value?.product_id || 0) || null;
  if (!product_id) return null;
  return {
    product_id,
    display_name: String(value?.display_name || "").trim(),
    alias: String(value?.alias || "").trim(),
    raw_name: String(value?.raw_name || "").trim(),
    code: String(value?.code || "").trim(),
    qty: Number(value?.qty || 1) || 1,
    uses_surface_quantity: value?.uses_surface_quantity === true || value?.use_surface_qty === true,
    use_surface_qty: value?.use_surface_qty === true || value?.uses_surface_quantity === true,
  };
}
function replaceFallbackSectionProductsInBaseLines({ baseLines, measurementForm }) {
  const selectedBySection = measurementForm?.__fallback_selected_section_products || {};
  let nextBase = Array.isArray(baseLines) ? baseLines.slice() : [];
  for (const [sectionIdRaw, selectedRaw] of Object.entries(selectedBySection || {})) {
    const sectionId = Number(sectionIdRaw || 0);
    const selectedProduct = normalizeStoredSelectedBindingProduct(selectedRaw);
    if (!sectionId || !selectedProduct?.product_id) continue;
    const boundProducts = normalizeStoredBindingProducts(
      getByPath(measurementForm, `__fallback_budget_binding_products.${sectionId}`),
    );
    const removeIds = new Set(boundProducts.map((item) => Number(item.product_id)).filter(Boolean));
    nextBase = nextBase.filter((line) => !removeIds.has(Number(line?.product_id || 0)));
    nextBase.push({
      product_id: Number(selectedProduct.product_id),
      qty: Number(selectedProduct.qty || 1) || 1,
      name: String(selectedProduct.display_name || selectedProduct.alias || selectedProduct.raw_name || `Producto ${selectedProduct.product_id}`).trim(),
      raw_name: String(selectedProduct.raw_name || selectedProduct.display_name || `Producto ${selectedProduct.product_id}`).trim(),
      code: selectedProduct.code || null,
      basePrice: 0,
      uses_surface_quantity: selectedProduct.uses_surface_quantity === true,
      use_surface_qty: selectedProduct.use_surface_qty === true,
    });
  }
  return nextBase;
}
export function cloneBudgetLine(line = {}) {
  const productId = Number(line?.product_id || 0) || null;
  if (!productId) return null;
  return {
    product_id: productId,
    qty: Number(line?.qty || 1) || 1,
    name: String(line?.name || line?.raw_name || `Producto ${productId}`).trim(),
    raw_name: String(line?.raw_name || line?.name || `Producto ${productId}`).trim(),
    code: String(line?.code || "").trim() || null,
    basePrice: Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0,
    // El presupuesto (domain/quote/store.js) guarda el flag como "surface_quantity", no
    // "uses_surface_quantity"/"use_surface_qty" (esos nombres son de la metadata de catalogo).
    // Sin este fallback, isSurfaceQtyLine() nunca detecta las lineas por m2 y scaleSurfaceLinesByArea()
    // nunca reescala la cantidad final medida.
    uses_surface_quantity: line?.uses_surface_quantity === true || line?.use_surface_qty === true || line?.surface_quantity === true,
    use_surface_qty: line?.use_surface_qty === true || line?.uses_surface_quantity === true || line?.surface_quantity === true,
    ...(typeof line?.price_unit === "number" ? { price_unit: Number(line.price_unit) } : {}),
    ...(typeof line?.unit_price === "number" ? { unit_price: Number(line.unit_price) } : {}),
  };
}
function buildBasePositiveLinesFromQuote(sourceQuote) {
  const rawLines = Array.isArray(sourceQuote?.lines) ? sourceQuote.lines : [];
  // Mapa producto_id(clonado) -> flag force_include_in_finalization de la linea CRUDA
  // correspondiente (cloneBudgetLine no preserva flags custom, asi que hay que leerlo
  // antes de clonar y volver a consultarlo despues).
  const forceIncludeIds = new Set(
    rawLines
      .filter((line) => line?.force_include_in_finalization === true)
      .map((line) => Number(line?.product_id || 0))
      .filter((id) => id > 0)
  );
  return rawLines
    // "Facturado previamente" (product_id -900001, ver buildPreviouslyBilledLine en
    // measurements.routes.js) puede seguir presente en quote.lines mientras el presupuesto
    // esta en revision comercial post-medicion - tiene que quedar afuera ACA (antes de
    // cloneBudgetLine, que no preserva el flag previously_billed_line) porque el descuento
    // real que se manda a Odoo lo arma aparte buildDiscountPreviewLine a partir de
    // deposit_amount; si esta linea colara para aca tambien, se descontaria dos veces.
    .filter((line) => line?.previously_billed_line !== true && Number(line?.product_id) !== -900001)
    .map(cloneBudgetLine)
    .filter(Boolean)
    .filter((line) => {
      const productId = Number(line?.product_id || 0);
      if (!productId) return false;
      // force_include_in_finalization es un escape hatch puntual por presupuesto (no toca
      // el comportamiento general): permite que una linea con un product_id de la lista
      // MEASUREMENT_PRODUCT_IDS (ej. 2865, que en la practica tambien se usa como "Servicio
      // de Instalacion" pago y no solo como medicion) SI se incluya en el total final. Sin
      // el flag, el comportamiento es identico al de siempre para el resto de presupuestos.
      if (MEASUREMENT_PRODUCT_IDS.includes(productId) && !forceIncludeIds.has(productId)) return false;
      if (productId === PLACEHOLDER_PRODUCT_ID) return false;
      return true;
    });
}
function isSurfaceQtyLine(line) {
  return !!(line?.uses_surface_quantity === true || line?.use_surface_qty === true);
}
function scaleSurfaceLinesByArea(lines, { sourceAreaM2, finalAreaM2 }) {
  const sourceArea = Number(sourceAreaM2 || 0);
  const finalArea = Number(finalAreaM2 || 0);
  if (!(sourceArea > 0) || !(finalArea > 0)) return Array.isArray(lines) ? lines.map((line) => ({ ...line })) : [];
  const factor = finalArea / sourceArea;
  return (Array.isArray(lines) ? lines : []).map((line) => {
    if (!isSurfaceQtyLine(line)) return { ...line };
    return {
      ...line,
      qty: round4((Number(line?.qty || 0) || 0) * factor),
    };
  });
}

function dedupeLines(lines) {
  const seen = new Set();
  const out = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const productId = Number(line?.product_id || 0);
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    out.push({ ...line, qty: Number(line?.qty || 1) || 1 });
  }
  return out;
}

function mergeByProductId(lines) {
  const map = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const productId = Number(line?.product_id || 0);
    if (!productId) continue;
    if (!map.has(productId)) {
      map.set(productId, { ...line, qty: Number(line?.qty || 1) || 1 });
      continue;
    }
    const prev = map.get(productId);
    map.set(productId, {
      ...prev,
      qty: round4((Number(prev.qty || 1) || 1) + (Number(line?.qty || 1) || 1)),
      name: prev.name || line.name,
      raw_name: prev.raw_name || line.raw_name,
      code: prev.code || line.code || null,
      basePrice: Number(prev.basePrice || 0) || Number(line.basePrice || 0) || 0,
      uses_surface_quantity: prev.uses_surface_quantity === true || line.uses_surface_quantity === true,
      use_surface_qty: prev.use_surface_qty === true || line.use_surface_qty === true,
      ...(typeof prev.price_unit === "number" ? { price_unit: prev.price_unit } : (typeof line.price_unit === "number" ? { price_unit: line.price_unit } : {})),
    });
  }
  return [...map.values()];
}
function totalLinesAmount(lines, payload, quote = null) {
  return round2(
    (Array.isArray(lines) ? lines : []).reduce((acc, line) => {
      const qty = Number(line?.qty || 1) || 1;
      const price = typeof line?.price_unit === "number"
        ? round2(line.price_unit)
        : calcDetailedUnitWithIva(line, payload || {}, quote);
      return acc + qty * price;
    }, 0),
  );
}
export function computeQuoteSurfaceM2(quote) {
  const dims = quote?.payload?.dimensions || {};
  const widthM = toNumberLike(dims?.width);
  const heightM = toNumberLike(dims?.height);
  if (!(widthM > 0) || !(heightM > 0)) return 0;
  return round4(widthM * heightM);
}
function computeFinalSurfaceM2({ sourceQuote, originalQuote, measurementForm }) {
  const altoMm = toNumberLike(measurementForm?.alto_final_mm);
  const anchoMm = toNumberLike(measurementForm?.ancho_final_mm);
  if (altoMm > 0 && anchoMm > 0) return round4((altoMm * anchoMm) / 1000000);
  return computeQuoteSurfaceM2(sourceQuote || originalQuote);
}
function replaceBoundProductsInBaseLines({ baseLines, field, measurementForm }) {
  const bindingType = String(field?.odoo_binding_type || (String(field?.type || "") === "odoo_product" ? "selected_measurement_product" : "none")).trim().toLowerCase();
  if (bindingType !== "selected_measurement_product") return baseLines;
  const selectedProduct = normalizeStoredSelectedBindingProduct(
    getByPath(measurementForm, `__selected_binding_product.${field.key}`),
  );
  if (!selectedProduct?.product_id) return baseLines;
  const boundProducts = normalizeStoredBindingProducts(
    getByPath(measurementForm, `__budget_binding_products.${field.key}`),
  );
  const removeIds = new Set(boundProducts.map((item) => Number(item.product_id)).filter(Boolean));
  const nextBase = Array.isArray(baseLines) ? baseLines.filter((line) => !removeIds.has(Number(line?.product_id || 0))) : [];
  nextBase.push({
    product_id: Number(selectedProduct.product_id),
    qty: Number(selectedProduct.qty || 1) || 1,
    name: String(selectedProduct.display_name || selectedProduct.alias || selectedProduct.raw_name || `Producto ${selectedProduct.product_id}`).trim(),
    raw_name: String(selectedProduct.raw_name || selectedProduct.display_name || `Producto ${selectedProduct.product_id}`).trim(),
    code: selectedProduct.code || null,
    basePrice: 0,
    uses_surface_quantity: selectedProduct.uses_surface_quantity === true,
    use_surface_qty: selectedProduct.use_surface_qty === true,
  });
  return nextBase;
}
function buildAdditionalLineSeedsFromFieldBindings(form, fields) {
  const out = [];
  for (const field of Array.isArray(fields) ? fields : []) {
    if (field?.active === false) continue;
    let bindingType = String(field?.odoo_binding_type || "none").trim().toLowerCase();
    if (String(field?.type || "") === "odoo_product" && bindingType === "none") {
      bindingType = "selected_measurement_product";
    }
    if (!["custom_product"].includes(bindingType)) continue;
    const current = getByPath(form, field.key);
    if (!hasMeaningfulFieldValue(current)) continue;
    const productId = Number(field?.odoo_product_id || 0) || null;
    if (!productId) continue;
    out.push({
      product_id: productId,
      qty: 1,
      name: String(field?.odoo_product_label || field?.label || `Producto ${productId}`).trim(),
      raw_name: String(field?.odoo_product_label || field?.label || `Producto ${productId}`).trim(),
      code: null,
      basePrice: 0,
    });
  }
  return out;
}
async function hydrateMeasurementLinePrices(odoo, payload, seeds) {
  const list = Array.isArray(seeds) ? seeds : [];
  if (!list.length || !odoo) return list;
  const ids = [...new Set(list.map((l) => Number(l.product_id)).filter(Boolean))];
  if (!ids.length) return list;
  let products = [];
  try {
    products = await odoo.executeKw("product.product", "read", [ids], {
      fields: ["id", "name", "default_code", "uom_id", "lst_price", "list_price", "product_tmpl_id"],
    });
  } catch {}
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));
  return list.map((seed) => {
    const p = byId.get(Number(seed.product_id));
    return {
      ...seed,
      name: toText(seed?.name) || toText(p?.name) || `Producto ${seed.product_id}`,
      raw_name: toText(seed?.raw_name) || toText(p?.name) || `Producto ${seed.product_id}`,
      code: toText(p?.default_code) || seed?.code || null,
      basePrice: Number(p?.lst_price ?? p?.list_price ?? seed?.basePrice ?? 0) || 0,
    };
  });
}
async function resolveBaseSourceQuote(originalQuote) {
  if (!originalQuote?.id) return originalQuote;
  if (String(originalQuote?.quote_kind || "original") === "copy") return originalQuote;
  const finalCopyId = String(originalQuote?.final_copy_id || "").trim();
  if (!finalCopyId) return originalQuote;
  try {
    const r = await dbQuery(
      `select * from public.presupuestador_quotes where id=$1 limit 1`,
      [finalCopyId],
    );
    const copy = r.rows?.[0] || null;
    return copy || originalQuote;
  } catch {
    return originalQuote;
  }
}
export function computeSurfacePricingMetrics({ sourceLines, finalLines, pricingPayload, sourceAreaM2, finalAreaM2, toleranceAreaM2, quote = null }) {
  const safeSourceArea = round4(Math.max(0, Number(sourceAreaM2 || 0) || 0));
  const safeFinalArea = round4(Math.max(0, Number(finalAreaM2 || 0) || 0));
  const safeToleranceArea = round4(Math.max(0, Number(toleranceAreaM2 || 0) || 0));
  const surfaceSourceLines = (Array.isArray(sourceLines) ? sourceLines : []).filter(isSurfaceQtyLine);
  const surfaceFinalLines = (Array.isArray(finalLines) ? finalLines : []).filter(isSurfaceQtyLine);
  const sourceSurfaceAmount = totalLinesAmount(surfaceSourceLines, pricingPayload, quote);
  const finalSurfaceAmount = totalLinesAmount(surfaceFinalLines, pricingPayload, quote);
  const surfaceIncrementAmount = round2(Math.max(0, finalSurfaceAmount - sourceSurfaceAmount));
  const surfaceDiffM2 = round4(Math.max(0, safeFinalArea - safeSourceArea));
  const surfaceChargeableDiffM2 = round4(Math.max(0, surfaceDiffM2 - safeToleranceArea));
  const surfaceAbsorbedDiffM2 = round4(Math.max(0, surfaceDiffM2 - surfaceChargeableDiffM2));
  const absorbedSurfaceAmount = surfaceDiffM2 > 0
    ? round2(surfaceIncrementAmount * (surfaceAbsorbedDiffM2 / surfaceDiffM2))
    : 0;
  const chargeableSurfaceAmount = round2(Math.max(0, surfaceIncrementAmount - absorbedSurfaceAmount));
  return {
    tolerance_area_m2: safeToleranceArea,
    source_surface_m2: safeSourceArea,
    final_surface_m2: safeFinalArea,
    surface_diff_m2: surfaceDiffM2,
    surface_chargeable_diff_m2: surfaceChargeableDiffM2,
    surface_absorbed_diff_m2: surfaceAbsorbedDiffM2,
    source_surface_amount: sourceSurfaceAmount,
    final_surface_amount: finalSurfaceAmount,
    surface_increment_amount: surfaceIncrementAmount,
    surface_absorbed_amount: absorbedSurfaceAmount,
    surface_chargeable_amount: chargeableSurfaceAmount,
  };
}
function buildDiscountPreviewLine({ originalQuote, absorbedSurfaceAmount, positiveTotal }) {
  const originalBudgeted = round2(Number(originalQuote?.deposit_amount || 0) || 0);
  const absorbedSurface = round2(Math.max(0, Number(absorbedSurfaceAmount || 0) || 0));
  const discountAmount = round2(Math.min(
    Math.max(0, Number(positiveTotal || 0) || 0),
    Math.max(0, originalBudgeted + absorbedSurface),
  ));
  if (discountAmount <= 0) return null;
  const reference = referenceNumberFromQuote(originalQuote, null) || toText(originalQuote?.quote_number) || "ANTICIPO";
  return {
    product_id: PLACEHOLDER_PRODUCT_ID,
    qty: 1,
    name: `Descuento anticipo presupuesto ${reference}`,
    raw_name: `Descuento anticipo presupuesto ${reference}`,
    code: null,
    price_unit: round2(-discountAmount),
    basePrice: 0,
  };
}
async function getOrCreateRevisionQuote({ originalQuote, sourceQuote, finalLines }) {
  const explicitCopyId = String(originalQuote?.final_copy_id || "").trim();
  if (explicitCopyId) {
    const upd = await dbQuery(
      `update public.presupuestador_quotes
          set lines=$2::jsonb,
              end_customer=$3::jsonb,
              payload=$4::jsonb,
              note=$5,
              final_status='draft'
        where id=$1
        returning *`,
      [
        explicitCopyId,
        JSON.stringify(finalLines),
        JSON.stringify(sourceQuote?.end_customer || originalQuote?.end_customer || {}),
        JSON.stringify(sourceQuote?.payload || originalQuote?.payload || {}),
        sourceQuote?.note || originalQuote?.note || null,
      ],
    );
    if (upd.rows?.[0]) return upd.rows[0];
  }

  const existing = await dbQuery(
    `select * from public.presupuestador_quotes where quote_kind='copy' and parent_quote_id=$1 order by created_at desc nulls last, id desc limit 1`,
    [originalQuote.id],
  );
  const copy = existing.rows?.[0];
  if (copy) {
    const upd = await dbQuery(
      `update public.presupuestador_quotes
          set lines=$2::jsonb,
              end_customer=$3::jsonb,
              payload=$4::jsonb,
              note=$5,
              final_status='draft'
        where id=$1
        returning *`,
      [
        copy.id,
        JSON.stringify(finalLines),
        JSON.stringify(sourceQuote?.end_customer || originalQuote?.end_customer || {}),
        JSON.stringify(sourceQuote?.payload || originalQuote?.payload || {}),
        sourceQuote?.note || originalQuote?.note || null,
      ],
    );
    return upd.rows?.[0] || copy;
  }

  const ins = await dbQuery(
    `insert into public.presupuestador_quotes (
        quote_kind,
        parent_quote_id,
        created_by_user_id,
        created_by_role,
        fulfillment_mode,
        pricelist_id,
        bill_to_odoo_partner_id,
        end_customer,
        lines,
        payload,
        note,
        catalog_kind,
        status,
        commercial_decision,
        technical_decision,
        final_status
      ) values (
        'copy', $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, 'draft', 'pending', 'pending', 'draft'
      ) returning *`,
    [
      originalQuote.id,
      originalQuote.created_by_user_id,
      originalQuote.created_by_role,
      originalQuote.fulfillment_mode,
      toIntId(sourceQuote?.pricelist_id) || toIntId(originalQuote?.pricelist_id),
      toIntId(sourceQuote?.bill_to_odoo_partner_id) || toIntId(originalQuote?.bill_to_odoo_partner_id),
      JSON.stringify(sourceQuote?.end_customer || originalQuote?.end_customer || {}),
      JSON.stringify(finalLines),
      JSON.stringify(sourceQuote?.payload || originalQuote?.payload || {}),
      sourceQuote?.note || originalQuote?.note || null,
      sourceQuote?.catalog_kind || originalQuote?.catalog_kind || "porton",
    ],
  );
  return ins.rows?.[0] || null;
}

// Mismo mecanismo que quotes.routes.js (resolveSellerDisplayNameForOdoo /
// applySellerToSaleOrder): acá faltaba por completo, así que ninguna NV
// generada por este flujo (medición aprobada -> NV final) llevaba vendedor a
// Odoo, sin importar el rol de quien creó el presupuesto original.
function normalizeSellerDisplayNameLocal(value) {
  return String(value || "").trim();
}
async function getCreatorDisplayDataLocal(createdByUserId) {
  try {
    const r = await dbQuery(`select full_name, username from public.presupuestador_users where id=$1 limit 1`, [Number(createdByUserId)]);
    const row = r.rows?.[0] || {};
    return {
      full_name: normalizeSellerDisplayNameLocal(row.full_name),
      username: normalizeSellerDisplayNameLocal(row.username),
    };
  } catch {
    return { full_name: "", username: "" };
  }
}
async function resolveSellerDisplayNameForQuoteLocal(quote) {
  const directFullName = normalizeSellerDisplayNameLocal(quote?.created_by_full_name || quote?.seller_name || quote?.sellerName);
  if (directFullName) return directFullName;
  const directUsername = normalizeSellerDisplayNameLocal(quote?.created_by_username);
  if (directUsername) return directUsername;
  const created = await getCreatorDisplayDataLocal(quote?.created_by_user_id);
  if (created.full_name) return created.full_name;
  return created.username;
}
async function resolveSellerDisplayNameForOdooLocal(quote) {
  if (String(quote?.created_by_role || "").trim().toLowerCase() === "distribuidor") return "";
  return await resolveSellerDisplayNameForQuoteLocal(quote);
}
const ODOO_SALE_ORDER_VENDOR_FIELD_CANDIDATES_LOCAL = Object.freeze([
  "x_studio_vendedora",
  "x_studio_vendedor",
  "x_vendedor",
  "x_vendedor_presupuestador",
]);
let saleOrderVendorFieldCacheLocal = undefined;
async function resolveSaleOrderVendorFieldMetaLocal(odoo) {
  if (saleOrderVendorFieldCacheLocal !== undefined) return saleOrderVendorFieldCacheLocal;
  const preferred = normalizeSellerDisplayNameLocal(process.env.ODOO_SALE_ORDER_VENDOR_FIELD);
  const candidates = [preferred, ...ODOO_SALE_ORDER_VENDOR_FIELD_CANDIDATES_LOCAL].filter(Boolean);
  try {
    const fields = await odoo.executeKw("sale.order", "fields_get", [], { attributes: ["string", "type", "relation"] });
    for (const fieldName of candidates) {
      const meta = fields?.[fieldName];
      if (!meta) continue;
      saleOrderVendorFieldCacheLocal = {
        name: fieldName,
        type: String(meta.type || "").trim(),
        relation: String(meta.relation || "").trim(),
      };
      return saleOrderVendorFieldCacheLocal;
    }
  } catch {}
  saleOrderVendorFieldCacheLocal = null;
  return saleOrderVendorFieldCacheLocal;
}
async function resolveEmployeeIdByNameLocal(odoo, employeeName) {
  const name = normalizeSellerDisplayNameLocal(employeeName);
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
async function applySellerToSaleOrderLocal(odoo, orderId, sellerName) {
  const cleanName = normalizeSellerDisplayNameLocal(sellerName);
  if (!orderId || !cleanName) return;
  const fieldMeta = await resolveSaleOrderVendorFieldMetaLocal(odoo);
  if (!fieldMeta?.name) return;
  try {
    if (fieldMeta.type === "many2one" && ["hr.employee", "hr.employee.public"].includes(fieldMeta.relation)) {
      const employeeId = await resolveEmployeeIdByNameLocal(odoo, cleanName);
      if (!employeeId) return;
      await odoo.executeKw("sale.order", "write", [[Number(orderId)], { [fieldMeta.name]: employeeId }]);
      return;
    }
    await odoo.executeKw("sale.order", "write", [[Number(orderId)], { [fieldMeta.name]: cleanName }]);
  } catch (e) {
    console.error("[measurementFinalization] applySellerToSaleOrder fallo:", e?.message || e);
  }
}

async function syncFinalQuoteToOdoo({ odoo, revisionQuote, originalQuote, sourceQuote, precomputedMetrics }) {
  // Reutiliza el mismo partner que ya se uso para la NP inicial. Antes, si no habia
  // ninguno guardado (pasaba con presupuestos de vendedor, que resuelven el cliente
  // recien al crear la NP) caia en el partner_id=1 hardcodeado, que en este Odoo es la
  // propia empresa - por eso NP y NV terminaban con clientes distintos.
  const partnerId =
    toIntId(revisionQuote?.bill_to_odoo_partner_id) ||
    toIntId(sourceQuote?.bill_to_odoo_partner_id) ||
    toIntId(originalQuote?.bill_to_odoo_partner_id);
  if (!partnerId) throw new Error("No se encontro bill_to_odoo_partner_id para sincronizar la NV final (revisar la NP inicial)");
  const lines = Array.isArray(revisionQuote.lines) ? revisionQuote.lines : [];
  if (!lines.length) throw new Error("La cotización final no tiene items");
  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean))];
  const products = await odoo.executeKw("product.product", "read", [productIds], {
    fields: ["id", "name", "uom_id"],
  });
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));
  const orderLines = [];
  let totalToCharge = 0;
  for (const l of lines) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1) || 1;
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);
    const uomId = toIntId(p?.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);
    const priceUnit = typeof l?.price_unit === "number"
      ? round2(l.price_unit)
      : calcDetailedUnitWithIva(l, revisionQuote.payload || sourceQuote?.payload || originalQuote.payload || {}, sourceQuote || originalQuote);
    totalToCharge = round2(totalToCharge + qty * priceUnit);
    orderLines.push([
      0,
      0,
      {
        product_id: productId,
        product_uom_qty: qty,
        product_uom: uomId,
        name: toText(l?.raw_name || l?.name || p?.name),
        price_unit: priceUnit,
      },
    ]);
  }

  const refNo = referenceNumberFromQuote(originalQuote, revisionQuote);
  const familyPrefix = getReferenceFamilyPrefix(revisionQuote || sourceQuote || originalQuote || {});
  const referenceNv = refNo
    ? `${familyPrefix}NV${refNo}`
    : `${familyPrefix}NV${toText(revisionQuote?.quote_number || originalQuote?.quote_number)}`;

  const conditionPayload = revisionQuote?.payload?.condition_mode
    ? revisionQuote.payload
    : (sourceQuote?.payload?.condition_mode ? sourceQuote.payload : (originalQuote?.payload || {}));
  let note = `Condición vendida: ${getOdooConditionLabel(conditionPayload)}`;
  note = appendBudgetObservationToNote(note, revisionQuote || sourceQuote || originalQuote);
  note = appendPaymentMethodToNote(note, conditionPayload?.payment_method);
  note = appendCommercialCommentToNote(note, originalQuote?.measurement_commercial_review_notes);

  // Mismos campos de financiación (TacaTaca) que en quotes.routes.js: sin esto,
  // una NV de este flujo con pago financiado queda en Odoo como si no tuviera
  // plan/tasa asociada.
  const financingVals = await buildFinancingSaleOrderVals(odoo, conditionPayload?.payment_method);

  // Salvaguarda anti-duplicados: si esta funcion se llama dos veces para la misma
  // revisionQuote (ej. el create en Odoo salio bien pero el paso siguiente -escribir
  // final_sale_order_id en nuestra DB- se corto por timeout/error de red, asi que el
  // caller cree que fallo y deja reintentar), sin este chequeo se crea una SEGUNDA NV
  // real en Odoo con la misma referencia (visto en vivo: NV4262, NV4407 con 2-3
  // ordenes distintas). Se busca primero por "origin" (no client_order_ref: para
  // distribuidores queda pisado mas abajo con "... Cliente <nombre>", asi que no
  // sirve para matchear de forma estable) antes de crear.
  const existingByReference = await odoo.executeKw(
    "sale.order",
    "search_read",
    [[["origin", "=", referenceNv]]],
    { fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id", "origin", "client_order_ref"], order: "id asc", limit: 1 },
  );
  if (existingByReference?.length) {
    return {
      order: existingByReference[0],
      metrics: {
        ...(precomputedMetrics || {}),
        final_amount_to_charge: round2(Math.max(0, totalToCharge)),
        difference_amount: round2(Math.max(0, totalToCharge)),
        reference_nv: referenceNv,
      },
    };
  }

  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id:
      toIntId(revisionQuote?.pricelist_id) ||
      toIntId(sourceQuote?.pricelist_id) ||
      toIntId(originalQuote?.pricelist_id) ||
      1,
    order_line: orderLines,
    origin: referenceNv,
    client_order_ref: referenceNv,
    note,
    ...financingVals,
  }]);

  const orderId = Number(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order final en Odoo");

  const sellerName = await resolveSellerDisplayNameForOdooLocal(originalQuote);
  await applySellerToSaleOrderLocal(odoo, orderId, sellerName);

  let order = { id: orderId, name: referenceNv };
  try {
    await odoo.executeKw("sale.order", "write", [[orderId], {
      name: referenceNv,
      origin: referenceNv,
      client_order_ref: referenceNv,
    }]);
  } catch {
    try {
      await odoo.executeKw("sale.order", "write", [[orderId], {
        origin: referenceNv,
        client_order_ref: referenceNv,
      }]);
    } catch {}
  }

  if (isDistributorQuote(originalQuote)) {
    const externalCustomerName = revisionQuote?.end_customer?.name || sourceQuote?.end_customer?.name || originalQuote?.end_customer?.name;
    await applyExternalCustomerToSaleOrder(odoo, orderId, { reference: referenceNv, externalCustomerName });
  }

  try {
    const rows = await odoo.executeKw("sale.order", "read", [[orderId]], {
      fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id", "origin", "client_order_ref"],
    });
    if (rows?.[0]?.id) order = rows[0];
  } catch {}

  return {
    order,
    metrics: {
      ...(precomputedMetrics || {}),
      final_amount_to_charge: round2(Math.max(0, totalToCharge)),
      difference_amount: round2(Math.max(0, totalToCharge)),
      reference_nv: referenceNv,
    },
  };
}
function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
function resolveMeasurementPublicBaseUrl() {
  return (
    normalizeUrl(process.env.PUBLIC_BASE_URL) ||
    normalizeUrl(process.env.APP_PUBLIC_URL) ||
    normalizeUrl(process.env.FRONTEND_PUBLIC_URL) ||
    normalizeUrl(process.env.BACKEND_PUBLIC_URL) ||
    ""
  );
}
function buildMeasurementPublicUrl(quote) {
  const base = resolveMeasurementPublicBaseUrl();
  const token = String(quote?.measurement_share_token || "").trim();
  if (!base || !token) return "";
  return `${base}/api/pdf/medicion/public/${token}`;
}
function normalizePhoneForWhatsApp(phone) {
  const digits = onlyDigits(phone);
  if (!digits) return "";
  if (digits.startsWith("54")) return digits;
  return `54${digits}`;
}
function resolveClientAcceptanceBaseUrl() {
  return (
    normalizeUrl(process.env.CLIENT_ACCEPTANCE_BASE_URL) ||
    normalizeUrl(process.env.PUBLIC_BASE_URL) ||
    normalizeUrl(process.env.APP_PUBLIC_URL) ||
    normalizeUrl(process.env.FRONTEND_PUBLIC_URL) ||
    normalizeUrl(process.env.FRONTEND_URL) ||
    normalizeUrl(process.env.VERCEL_FRONTEND_URL) ||
    "https://presupuestador-degrandisportones.vercel.app"
  );
}
function buildClientAcceptanceUrl(quote) {
  const base = resolveClientAcceptanceBaseUrl();
  const token = String(quote?.measurement_share_token || "").trim();
  if (base && token) return `${base}/aceptacion-cliente/${token}`;
  return buildMeasurementPublicUrl(quote);
}
async function readPartnerNotificationData(odoo, partnerId) {
  const id = toIntId(partnerId);
  if (!id || !odoo) return null;
  try {
    const rows = await odoo.executeKw("res.partner", "read", [[id]], {
      fields: ["id", "name", "phone", "mobile"],
    });
    return rows?.[0] || null;
  } catch {
    return null;
  }
}
async function resolveAllMeasurementRecipients({ odoo, quote }) {
  const recipients = [];
  const seen = new Set();
  function addRecipient(label, name, phone) {
    const normalized = normalizePhoneForWhatsApp(phone);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    recipients.push({ label, name: String(name || label).trim(), to: normalized });
  }

  // 1. Cliente siempre
  addRecipient("Cliente", quote?.end_customer?.name, quote?.end_customer?.phone);

  // 2. Distribuidor si el quote fue creado por distribuidor y tiene teléfono
  const createdByRole = String(quote?.created_by_role || "").trim().toLowerCase();
  if (createdByRole === "distribuidor") {
    let distributorPhone = "";
    let distributorName = "Distribuidor";
    const createdByUserId = Number(quote?.created_by_user_id || 0) || null;
    if (createdByUserId) {
      try {
        const r = await dbQuery(`select phone from public.presupuestador_users where id=$1 limit 1`, [createdByUserId]);
        distributorPhone = r.rows?.[0]?.phone || "";
      } catch { /* fallback */ }
    }
    const partner = await readPartnerNotificationData(odoo, quote?.bill_to_odoo_partner_id);
    if (partner?.name) distributorName = partner.name;
    if (!distributorPhone) distributorPhone = partner?.phone || partner?.mobile || "";
    addRecipient("Distribuidor", distributorName, distributorPhone);
  }

  // 3. Contacto opcional
  const extraContact = quote?.payload?.extra_contact || {};
  addRecipient("Contacto opcional", extraContact.name || "Contacto opcional", extraContact.phone);

  return recipients;
}

// Mantener para compatibilidad con flujo de Cloud API
async function resolveMeasurementNotificationTarget({ odoo, quote }) {
  const recipients = await resolveAllMeasurementRecipients({ odoo, quote });
  const main = recipients[0];
  return {
    to: main?.to || "",
    recipient_name: main?.name || "cliente",
    recipient_type: main?.label?.toLowerCase() || "cliente",
  };
}
function buildMeasurementApprovedMessage({ quote, acceptanceUrl }) {
  const link = String(acceptanceUrl || buildClientAcceptanceUrl(quote) || "").trim();
  const lines = [
    "¡Hola! Somos De Grandis Portones, la empresa que fabricará el portón que adquiriste.",
    "",
    "Ya contamos con las medidas necesarias de tu obra para comenzar con la fabricación.",
    "",
    "Para avanzar, te pedimos que ingreses al siguiente enlace para revisar y aceptar la planilla de medición:",
    "",
    link,
    "",
    "En ese mismo enlace también vas a poder consultar los términos y condiciones.",
    "",
    "Ante cualquier consulta, estamos a tu disposición.",
    "",
    "¡Gracias por confiar en De Grandis Portones!",
  ];
  return lines.join("\n");
}
async function sendWhatsAppRaw({ to, message, acceptanceUrl, token, phoneNumberId, graphVersion }) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: !!acceptanceUrl, body: message },
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function maybeSendMeasurementApprovedWhatsApp({ odoo, quote }) {
  const recipients = await resolveAllMeasurementRecipients({ odoo, quote });
  const mainRecipient = recipients[0];
  const to = mainRecipient?.to || "";
  const publicUrl = buildMeasurementPublicUrl(quote);
  const acceptanceUrl = buildClientAcceptanceUrl(quote);
  const message = buildMeasurementApprovedMessage({
    quote,
    acceptanceUrl,
    recipientName: mainRecipient?.name,
    recipientType: mainRecipient?.label?.toLowerCase() || "cliente",
  });
  const base = {
    public_url: publicUrl,
    acceptance_url: acceptanceUrl,
    message,
    to,
    recipients,
    recipient_type: mainRecipient?.label?.toLowerCase() || "cliente",
    recipient_name: mainRecipient?.name || "",
  };
  if (!to) {
    return { ...base, sent: false, reason: "missing_phone" };
  }
  const token = String(process.env.WHATSAPP_CLOUD_API_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim();
  const graphVersion = String(process.env.WHATSAPP_GRAPH_VERSION || "v20.0").trim();
  if (!token || !phoneNumberId) {
    return { ...base, sent: false, reason: "whatsapp_not_configured" };
  }
  try {
    const ctx = { token, phoneNumberId, graphVersion };
    const result = await sendWhatsAppRaw({ to, message, acceptanceUrl, ...ctx });
    // Envío a todos los destinatarios adicionales (fire-and-forget)
    for (const r of recipients.slice(1)) {
      if (r.to) sendWhatsAppRaw({ to: r.to, message, acceptanceUrl, ...ctx }).catch(() => {});
    }
    if (!result.ok) {
      return { ...base, sent: false, reason: "whatsapp_api_error", status: result.status, error: result.data };
    }
    return { ...base, sent: true, provider: "meta_cloud_api", response: result.data };
  } catch (error) {
    return { ...base, sent: false, reason: "whatsapp_request_failed", error: error?.message || String(error || "Error enviando WhatsApp") };
  }
}

function isDirectNvAlreadyCreated(originalQuote) {
  const saleOrderId = Number(originalQuote?.odoo_sale_order_id || 0) || 0;
  const finalSaleOrderId = Number(originalQuote?.final_sale_order_id || 0) || 0;
  const finalStatus = String(originalQuote?.final_status || "").toLowerCase().trim();
  const initialName = toText(originalQuote?.odoo_sale_order_name);
  const finalName = toText(originalQuote?.final_sale_order_name);
  return !!(
    saleOrderId > 0
    && finalSaleOrderId > 0
    && saleOrderId === finalSaleOrderId
    && finalStatus === "synced_odoo"
    && (finalName || initialName).toUpperCase().includes("NV")
  );
}

async function buildMeasurementFinalizationBase({ odoo, originalQuote, measurementForm, allowLegsOverride = false }) {
  const sourceQuote = await resolveBaseSourceQuote(originalQuote);
  const quoteKind = String(originalQuote?.catalog_kind || sourceQuote?.catalog_kind || "").toLowerCase().trim();
  // Ipanel y Plegados nunca se miden en obra (siempre "tecnica_only"/sin_medicion):
  // el presupuesto final es el mismo que el original, sin escalar por superficie
  // medida ni aplicar reglas tecnicas de porton/puerta.
  if (quoteKind === "ipanel" || quoteKind === "plegados") {
    const pricingPayload = sourceQuote?.payload || originalQuote?.payload || {};
    const positiveLines = buildBasePositiveLinesFromQuote(sourceQuote || originalQuote);
    const positiveTotal = totalLinesAmount(positiveLines, pricingPayload, sourceQuote || originalQuote);
    const discountLine = buildDiscountPreviewLine({
      originalQuote,
      absorbedSurfaceAmount: 0,
      positiveTotal,
    });
    const finalLines = discountLine ? [...positiveLines, discountLine] : positiveLines;
    const finalAmountToCharge = totalLinesAmount(finalLines, pricingPayload, sourceQuote || originalQuote);
    return {
      source_quote_id: sourceQuote?.id || originalQuote?.id || null,
      source_quote: sourceQuote,
      generated_lines: finalLines,
      priced_positive_lines: positiveLines,
      metrics: {
        detailed_total: positiveTotal,
        tolerance_percent: 0,
        tolerance_amount: 0,
        tolerance_area_m2: 0,
        source_surface_m2: computeQuoteSurfaceM2(sourceQuote || originalQuote),
        final_surface_m2: computeQuoteSurfaceM2(sourceQuote || originalQuote),
        surface_diff_m2: 0,
        surface_chargeable_diff_m2: 0,
        surface_absorbed_diff_m2: 0,
        source_surface_amount: positiveTotal,
        final_surface_amount: positiveTotal,
        surface_increment_amount: 0,
        surface_absorbed_amount: 0,
        surface_chargeable_amount: 0,
        extra_amount: 0,
        difference_amount: finalAmountToCharge,
        absorbed_by_company: false,
        final_amount_to_charge: finalAmountToCharge,
        reference_nv: referenceNumberFromQuote(originalQuote, null),
      },
    };
  }
  const legacyMappings = await getMeasurementProductMappings();
  // Antes se llamaba sin argumento y siempre traia las reglas de "porton" (default
  // del parametro), asi que una puerta terminaba con productos de porton inyectados
  // en sus lineas -> Odoo rechazaba la NV al no encontrar/validar ese producto para
  // una puerta, y la finalizacion quedaba a mitad de camino (aprobado pero sin NV
  // final ni link). Pasando el kind real, puerta usa sus propias reglas configuradas
  // o un set vacio (default seguro) en vez de las de porton.
  const technicalRules = await getTechnicalMeasurementRules(quoteKind || "porton");
  const technicalFieldsPayload = await getTechnicalMeasurementFieldDefinitions();
  const technicalFields = Array.isArray(technicalFieldsPayload?.fields) ? technicalFieldsPayload.fields : [];

  const sourceBaseLines = buildBasePositiveLinesFromQuote(sourceQuote);
  const sourceAreaM2 = computeQuoteSurfaceM2(sourceQuote || originalQuote);
  const finalAreaM2 = computeFinalSurfaceM2({ sourceQuote, originalQuote, measurementForm });
  let baseLines = scaleSurfaceLinesByArea(sourceBaseLines, {
    sourceAreaM2,
    finalAreaM2,
  });

  // Medidas de paso/hoja recalculadas con la MISMA formula que usa el presupuesto
  // (PortonDimensions.jsx, portada en portonVanoMeasurements.js), alimentada con el vano
  // FINAL medido -no el presupuestado- para que "el editado mande" tambien en lo que se fabrica.
  let dimensionsPatch = null;
  const vanoWidthM = Number(measurementForm?.ancho_final_mm || 0) / 1000;
  const vanoHeightM = Number(measurementForm?.alto_final_mm || 0) / 1000;
  if (vanoWidthM > 0 && vanoHeightM > 0) {
    try {
      const officialMeasurements = await computeOfficialPortonMeasurements({
        vanoWidthM,
        vanoHeightM,
        lines: sourceBaseLines,
        portonType: sourceQuote?.payload?.porton_type || originalQuote?.payload?.porton_type || "",
        dimensions: sourceQuote?.payload?.dimensions || originalQuote?.payload?.dimensions || {},
        // El tipo de pierna SIEMPRE se calcula por peso con la formula oficial. Nadie
        // puede cambiarlo desde el presupuestador (ni medidor ni tecnica) - la unica
        // via de override es superusuario forzando el resync puntual de un portón.
        legsKeyOverride: allowLegsOverride ? (String(measurementForm?.piernas || "").trim() || undefined) : undefined,
      });
      dimensionsPatch = officialMeasurements.dimensionsPatch;
    } catch (e) {
      console.error("[measurementFinalization] computeOfficialPortonMeasurements fallo:", e?.message || e);
    }
  }

  for (const field of technicalFields) {
    baseLines = replaceBoundProductsInBaseLines({
      baseLines,
      field,
      measurementForm: measurementForm || {},
    });
  }

  baseLines = replaceFallbackSectionProductsInBaseLines({
    baseLines,
    measurementForm: measurementForm || {},
  });

  const legacySeeds = buildMeasurementLineSeedsFromLegacyMappings(
    measurementForm || {},
    legacyMappings.rules || [],
  );
  const technicalSeeds = buildMeasurementLineSeedsFromTechnicalRules(
    sourceQuote,
    measurementForm || {},
    technicalRules.rules || [],
  );
  const extraFieldSeeds = buildAdditionalLineSeedsFromFieldBindings(
    measurementForm || {},
    technicalFields,
  );

  const mergedExtraSeeds = dedupeLines([
    ...legacySeeds,
    ...technicalSeeds,
    ...extraFieldSeeds,
  ]);
  const pricedExtraLines = await hydrateMeasurementLinePrices(
    odoo,
    sourceQuote?.payload || originalQuote?.payload || {},
    mergedExtraSeeds,
  );

  const pricingPayload = sourceQuote?.payload || originalQuote?.payload || {};
  const positiveLines = mergeByProductId([...baseLines, ...pricedExtraLines]);
  const positiveTotal = totalLinesAmount(positiveLines, pricingPayload, sourceQuote || originalQuote);
  const toleranceAreaM2 = await getCommercialFinalToleranceAreaM2();
  const surfaceMetrics = computeSurfacePricingMetrics({
    sourceLines: sourceBaseLines,
    finalLines: positiveLines,
    pricingPayload,
    sourceAreaM2,
    finalAreaM2,
    toleranceAreaM2,
    quote: sourceQuote || originalQuote,
  });

  const discountLine = buildDiscountPreviewLine({
    originalQuote,
    absorbedSurfaceAmount: surfaceMetrics.surface_absorbed_amount,
    positiveTotal,
  });
  const finalLines = discountLine ? [...positiveLines, discountLine] : positiveLines;
  const finalAmountToCharge = totalLinesAmount(finalLines, pricingPayload, sourceQuote || originalQuote);
  const extraAmount = round2(Math.max(0, totalLinesAmount(pricedExtraLines, pricingPayload, sourceQuote || originalQuote)));

  return {
    source_quote_id: sourceQuote?.id || originalQuote?.id || null,
    source_quote: sourceQuote,
    generated_lines: finalLines,
    priced_positive_lines: positiveLines,
    metrics: {
      detailed_total: positiveTotal,
      tolerance_percent: 0,
      tolerance_amount: surfaceMetrics.surface_absorbed_amount,
      tolerance_area_m2: surfaceMetrics.tolerance_area_m2,
      source_surface_m2: surfaceMetrics.source_surface_m2,
      final_surface_m2: surfaceMetrics.final_surface_m2,
      surface_diff_m2: surfaceMetrics.surface_diff_m2,
      surface_chargeable_diff_m2: surfaceMetrics.surface_chargeable_diff_m2,
      surface_absorbed_diff_m2: surfaceMetrics.surface_absorbed_diff_m2,
      source_surface_amount: surfaceMetrics.source_surface_amount,
      final_surface_amount: surfaceMetrics.final_surface_amount,
      surface_increment_amount: surfaceMetrics.surface_increment_amount,
      surface_absorbed_amount: surfaceMetrics.surface_absorbed_amount,
      surface_chargeable_amount: surfaceMetrics.surface_chargeable_amount,
      extra_amount: extraAmount,
      difference_amount: finalAmountToCharge,
      absorbed_by_company: surfaceMetrics.surface_absorbed_amount > 0,
      final_amount_to_charge: finalAmountToCharge,
      reference_nv: referenceNumberFromQuote(originalQuote, null),
    },
    dimensions_patch: dimensionsPatch,
  };
}

export async function previewMeasurementRevisionQuote({ odoo, originalQuote, measurementForm }) {
  const base = await buildMeasurementFinalizationBase({ odoo, originalQuote, measurementForm });
  return {
    ...base,
    synced: false,
    revisionQuote: null,
    reason: base.generated_lines.length ? null : "Sin reglas aplicables",
  };
}

async function saveShareTokenToOriginalQuote(originalQuoteId, existingToken) {
  const token = existingToken || randomBytes(24).toString("hex");
  await dbQuery(
    `update public.presupuestador_quotes
        set measurement_share_token = coalesce(measurement_share_token, $2),
            measurement_share_enabled_at = coalesce(measurement_share_enabled_at, now())
      where id = $1`,
    [originalQuoteId, token],
  );
  return token;
}

// Genera/guarda el link de aceptacion y dispara el WhatsApp, sin dejar que un
// fallo puntual aca (ej. timeout de conexion a la base) tire abajo la
// aprobacion entera: la NV/copia final ya quedo confirmada en Odoo antes de
// llegar a este paso, asi que no tiene sentido que la respuesta sea un error
// si lo unico que fallo es la generacion del link. saveShareTokenToOriginalQuote
// es idempotente (coalesce), asi que un reintento posterior no duplica nada.
async function saveTokenAndNotify(odoo, originalQuote) {
  try {
    const savedToken = await saveShareTokenToOriginalQuote(originalQuote.id, originalQuote.measurement_share_token);
    const quoteWithToken = { ...originalQuote, measurement_share_token: savedToken };
    const whatsappNotification = await maybeSendMeasurementApprovedWhatsApp({ odoo, quote: quoteWithToken });
    return { whatsappNotification };
  } catch (e) {
    console.error(
      "[measurementFinalization] saveTokenAndNotify fallo (NV ya confirmada, no se reintenta la NV):",
      e?.message || e,
    );
    return { whatsappNotification: null };
  }
}

function mergeDimensionsPatch(payload, dimensionsPatch) {
  if (!dimensionsPatch || typeof dimensionsPatch !== "object" || !Object.keys(dimensionsPatch).length) return payload;
  const base = payload && typeof payload === "object" ? payload : {};
  return { ...base, dimensions: { ...(base.dimensions || {}), ...dimensionsPatch } };
}
// Una vez que el cliente acepto el link, los datos que ve (medidas incluidas) quedan congelados
// para siempre - no se vuelven a tocar aunque la finalizacion se re-dispare (retry, resync, un
// segundo "approve"). Solo se modifican si alguien lo pide explicitamente por otra via.
function isClientAlreadyAccepted(quote) {
  return !!(quote?.measurement_client_accepted_at || quote?.payload?.measurement_client_acceptance?.accepted_at);
}
// Actualiza payload.dimensions de la quote dada (original o copia) con las medidas de paso/hoja
// recalculadas, para que el link de aceptacion del cliente (que lee del original) y cualquier
// consulta tecnica vean la medida final, no la del presupuesto. jsonb merge para no pisar el resto.
async function persistDimensionsPatch(quoteId, dimensionsPatch) {
  if (!quoteId || !dimensionsPatch || typeof dimensionsPatch !== "object" || !Object.keys(dimensionsPatch).length) return;
  await dbQuery(
    `update public.presupuestador_quotes
        set payload = jsonb_set(
          coalesce(payload, '{}'::jsonb),
          '{dimensions}',
          coalesce(payload->'dimensions', '{}'::jsonb) || $2::jsonb,
          true
        )
      where id=$1`,
    [quoteId, JSON.stringify(dimensionsPatch)],
  );
}

export async function finalizeMeasurementToRevisionQuote({ odoo, originalQuote, measurementForm }) {
  const base = await buildMeasurementFinalizationBase({ odoo, originalQuote, measurementForm });
  const finalLines = base.generated_lines || [];
  // WhatsApp y generación de token se hacen DESPUÉS de crear la NV para garantizar que
  // el cliente no pueda aceptar el link antes de que exista la NV en Odoo.

  // Porton a produccion sin medicion: la NV ya fue creada al aprobar Comercial+Tecnica.
  // La aprobacion final del circuito tecnico solo debe disparar WhatsApp y no crear otra NV.
  if (isDirectNvAlreadyCreated(originalQuote)) {
    if (!isClientAlreadyAccepted(originalQuote)) {
      await persistDimensionsPatch(originalQuote?.id, base.dimensions_patch);
    }
    const existingOrder = {
      id: Number(originalQuote?.final_sale_order_id || originalQuote?.odoo_sale_order_id || 0) || null,
      name: toText(originalQuote?.final_sale_order_name || originalQuote?.odoo_sale_order_name),
    };
    const { whatsappNotification } = await saveTokenAndNotify(odoo, originalQuote);
    return {
      revisionQuote: null,
      generated_lines: finalLines,
      synced: false,
      skipped_odoo: true,
      reason: "NV ya generada previamente. Solo se envio/disparo WhatsApp de aprobacion final.",
      order: existingOrder,
      metrics: {
        ...(base.metrics || {}),
        reference_nv: existingOrder.name || base.metrics?.reference_nv || "",
      },
      whatsappNotification,
      source_quote_id: base.source_quote_id,
    };
  }

  if (!finalLines.length) {
    return {
      revisionQuote: null,
      generated_lines: [],
      synced: false,
      reason: "Sin reglas aplicables",
      metrics: base.metrics,
      whatsappNotification: null,
      source_quote_id: base.source_quote_id,
    };
  }

  const clientAlreadyAccepted = isClientAlreadyAccepted(originalQuote);
  if (!clientAlreadyAccepted) {
    await persistDimensionsPatch(originalQuote?.id, base.dimensions_patch);
  }
  const patchedSourceQuote = base.dimensions_patch && !clientAlreadyAccepted
    ? { ...base.source_quote, payload: mergeDimensionsPatch(base.source_quote?.payload, base.dimensions_patch) }
    : base.source_quote;

  const revisionQuote = await getOrCreateRevisionQuote({
    originalQuote,
    sourceQuote: patchedSourceQuote,
    finalLines,
  });

  if (!revisionQuote || !odoo) {
    return {
      revisionQuote,
      generated_lines: finalLines,
      synced: false,
      reason: !odoo ? "Odoo no disponible" : "No se pudo crear la copia",
      metrics: base.metrics,
      whatsappNotification: null,
      source_quote_id: base.source_quote_id,
    };
  }

  const updSync = await dbQuery(
    `update public.presupuestador_quotes
        set status='syncing_odoo',
            final_status='syncing_odoo',
            final_technical_decision='approved',
            final_technical_decision_at=now(),
            final_logistics_decision='approved',
            final_logistics_decision_at=now(),
            final_technical_notes=null,
            final_logistics_notes=null
      where id=$1
      returning *`,
    [revisionQuote.id],
  );
  const qSync = updSync.rows?.[0] || revisionQuote;
  let order;
  let metrics;
  try {
    ({ order, metrics } = await syncFinalQuoteToOdoo({
      odoo,
      revisionQuote: qSync,
      originalQuote,
      sourceQuote: base.source_quote,
      precomputedMetrics: base.metrics,
    }));
  } catch (e) {
    // Igual que en /:id/final/submit: si Odoo no llego a crear la NV, volver a
    // draft para que un reintento (re-aprobar la medicion) no quede trabado
    // para siempre en "syncing_odoo" sin poder reintentar. Tambien hay que
    // revertir final_technical_decision/final_logistics_decision a null: si
    // quedan en 'approved' (como se dejaron arriba, ANTES de intentar el sync)
    // la fila desaparece de la cola de pendientes de Tecnica -aunque la NV
    // final nunca se haya generado- y queda invisible/atascada para siempre
    // (caso real: NP4303/NP4309, ver conversacion 2026-08-20). El mensaje de
    // error se guarda en final_technical_notes para poder diagnosticarlo sin
    // acceso a logs del servidor.
    const errMsg = String(e?.message || e || "Error al sincronizar la cotización final a Odoo").slice(0, 2000);
    await dbQuery(
      `update public.presupuestador_quotes
          set status='draft',
              final_status='draft',
              final_technical_decision=null,
              final_technical_decision_at=null,
              final_logistics_decision=null,
              final_logistics_decision_at=null,
              final_technical_notes=$2
        where id=$1 and coalesce(final_sale_order_id, 0) = 0`,
      [qSync.id, `[Error de sincronización ${new Date().toISOString()}] ${errMsg}`],
    );
    throw e;
  }
  const updFinal = await dbQuery(
    `update public.presupuestador_quotes
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
      returning *`,
    [
      qSync.id,
      Number(order.id),
      order.name,
      metrics.tolerance_percent ?? 0,
      metrics.tolerance_amount ?? 0,
      metrics.difference_amount ?? 0,
      metrics.absorbed_by_company === true,
    ],
  );
  const finalRevisionQuote = updFinal.rows?.[0] || qSync;

  // Generar token DESPUÉS de confirmar la NV en Odoo: el cliente no puede aceptar antes de que exista la NV
  const { whatsappNotification } = await saveTokenAndNotify(odoo, originalQuote);

  return {
    revisionQuote: finalRevisionQuote,
    generated_lines: finalLines,
    synced: true,
    order,
    metrics,
    whatsappNotification,
    source_quote_id: base.source_quote_id,
  };
}

// Llama upsertPreproduccionValoresForNv usando la NV ya existente en la revision quote.
// Se invoca desde clientAcceptance cuando el cliente acepta, no al generar la NV.
export async function triggerPreproductionForClientAcceptance(odoo, originalQuote) {
  const r = await dbQuery(
    `select * from public.presupuestador_quotes
     where quote_kind = 'copy' and parent_quote_id = $1
       and final_sale_order_name is not null
     order by created_at desc nulls last, id desc
     limit 1`,
    [originalQuote.id],
  );
  // Fallback: NV generada directamente en el quote original (sin copy — camino isDirectNvAlreadyCreated)
  const revisionQuote = r.rows?.[0] || (originalQuote?.final_sale_order_name ? originalQuote : null);
  if (!revisionQuote) return { ok: false, skipped: true, reason: "no_revision_quote_with_nv" };

  const order = {
    id: Number(revisionQuote.final_sale_order_id || 0) || null,
    name: String(revisionQuote.final_sale_order_name || ""),
  };
  const metrics = {
    tolerance_percent: revisionQuote.final_tolerance_percent ?? 0,
    tolerance_amount: revisionQuote.final_tolerance_amount ?? 0,
    difference_amount: revisionQuote.final_difference_amount ?? 0,
    absorbed_by_company: revisionQuote.final_absorbed_by_company === true,
    final_amount_to_charge: revisionQuote.final_amount_to_charge ?? 0,
  };

  return upsertPreproduccionValoresForNv({
    originalQuote,
    sourceQuote: originalQuote,
    revisionQuote,
    order,
    metrics,
    generatedLines: Array.isArray(revisionQuote.lines) ? revisionQuote.lines : [],
    odoo,
  });
}

// Resync manual para superusuario ("tengo una queja puntual de este portón"): recalcula medidas
// de paso/hoja con la misma formula oficial (buildMeasurementFinalizationBase) y refresca
// preproduccion_valores. NO toca Odoo -la NV ya sincronizada no se modifica-, y respeta el freeze:
// si el cliente ya acepto el link, no cambia nada salvo que el superusuario lo fuerce explicitamente
// (force:true) - ese es el UNICO camino permitido para tocar datos post-aceptacion. Queda registrado
// en el payload quien y cuando lo forzo.
export async function resyncPortonMeasurements({ odoo, originalQuoteId, force = false, forcedBy = null }) {
  const r = await dbQuery(
    `select * from public.presupuestador_quotes where id=$1 and quote_kind='original' limit 1`,
    [originalQuoteId],
  );
  const originalQuote = r.rows?.[0];
  if (!originalQuote) return { ok: false, error: "Presupuesto original no encontrado" };
  if (String(originalQuote.catalog_kind || "porton").toLowerCase().trim() !== "porton") {
    return { ok: false, error: "El resync de medidas de paso solo aplica a portones" };
  }
  const clientAccepted = isClientAlreadyAccepted(originalQuote);
  if (clientAccepted && !force) {
    return {
      ok: false,
      blocked_reason: "client_already_accepted",
      error: "El cliente ya aceptó el link: las medidas quedan congeladas. Si igual querés forzar el cambio, confirmalo explícitamente.",
    };
  }
  const anchoFinalMm = Number(originalQuote.measurement_form?.ancho_final_mm || 0);
  const altoFinalMm = Number(originalQuote.measurement_form?.alto_final_mm || 0);
  if (!anchoFinalMm || !altoFinalMm) {
    return { ok: false, error: "El presupuesto no tiene medición final cargada (ancho/alto final)" };
  }

  const base = await buildMeasurementFinalizationBase({
    odoo,
    originalQuote,
    measurementForm: originalQuote.measurement_form,
    allowLegsOverride: true,
  });
  const dimensionsPatch = base.dimensions_patch;
  if (!dimensionsPatch || !Object.keys(dimensionsPatch).length) {
    return { ok: false, error: "No se pudieron recalcular las medidas (revisar tipo de portón/líneas del presupuesto)" };
  }

  const beforeDims = originalQuote.payload?.dimensions || {};
  await persistDimensionsPatch(originalQuote.id, dimensionsPatch);
  if (clientAccepted && force) {
    // Unico camino permitido para tocar datos post-aceptacion: queda registrado quien y cuando.
    await dbQuery(
      `update public.presupuestador_quotes
          set payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{paso_measurements_forced_resync}', $2::jsonb, true)
        where id=$1`,
      [originalQuote.id, JSON.stringify({
        at: new Date().toISOString(),
        by_user_id: forcedBy?.user_id ?? null,
        by_username: forcedBy?.username ?? null,
        reason: "client_already_accepted_override",
      })],
    );
  }

  const copyR = await dbQuery(
    `select id from public.presupuestador_quotes
      where quote_kind='copy' and parent_quote_id=$1
      order by created_at desc nulls last, id desc limit 1`,
    [originalQuote.id],
  );
  const copyId = copyR.rows?.[0]?.id || null;
  if (copyId) await persistDimensionsPatch(copyId, dimensionsPatch);

  const patchedOriginalForPreproduccion = { ...originalQuote, payload: mergeDimensionsPatch(originalQuote.payload, dimensionsPatch) };
  const preproduccion = await triggerPreproductionForClientAcceptance(odoo, patchedOriginalForPreproduccion);

  return {
    ok: true,
    forced_after_client_acceptance: clientAccepted && force,
    quote_id: originalQuote.id,
    quote_number: originalQuote.quote_number,
    odoo_sale_order_name: originalQuote.odoo_sale_order_name || null,
    final_sale_order_name: originalQuote.final_sale_order_name || null,
    copy_updated: !!copyId,
    before: {
      medidas_paso_text: beforeDims.medidas_paso_text || null,
      paso_ancho_mm: beforeDims.paso_ancho_mm || null,
      paso_alto_mm: beforeDims.paso_alto_mm || null,
    },
    after: {
      medidas_paso_text: dimensionsPatch.medidas_paso_text || null,
      paso_ancho_mm: dimensionsPatch.paso_ancho_mm || null,
      paso_alto_mm: dimensionsPatch.paso_alto_mm || null,
    },
    preproduccion_valores: preproduccion?.ok === false ? { updated: false, reason: preproduccion?.reason || "no_disponible" } : { updated: true },
  };
}

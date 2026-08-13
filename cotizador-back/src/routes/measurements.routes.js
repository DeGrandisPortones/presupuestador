import crypto from "crypto";
import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import {
  finalizeMeasurementToRevisionQuote,
  computeSurfacePricingMetrics,
  computeQuoteSurfaceM2,
  cloneBudgetLine,
} from "../measurementFinalization.js";
import {
  getCommercialFinalToleranceAreaM2,
  getTechnicalMeasurementFieldDefinitions,
} from "../settingsDb.js";

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
const PREVIOUSLY_BILLED_PRODUCT_ID = -900001;
// Mismo producto placeholder que usa measurementFinalization.js para lineas de
// descuento con precio manual (price_unit explicito, sin recalcular margen/IVA).
const PLACEHOLDER_PRODUCT_ID = Number(process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 3575);
const DEFAULT_RETURN_REASON = "El tamaño del portón es mayor al presupuestado originalmente";
const DEFAULT_ITEM18_REASON = "El cambio en el item 18 puede ocasionar costos adicionales y debe pasar al vendedor.";
const DEFAULT_OBSERVATION_REASON = "El medidor dejó observaciones y debe revisarlo el vendedor antes de seguir.";

function requireMeasurementEditor(req, res, next) {
  if (
    !req.user?.is_medidor &&
    !req.user?.is_rev_tecnica &&
    !req.user?.is_enc_comercial &&
    !req.user?.is_vendedor &&
    !req.user?.is_distribuidor
  ) {
    return res.status(403).json({ ok: false, error: "No autorizado" });
  }
  next();
}
function requireTechnicalReviewer(req, res, next) {
  if (!req.user?.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function requireCommercialReviewer(req, res, next) {
  if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function isUuid(v) {
  return /^[0-9a-fA-F-]{36}$/.test(String(v || "").trim());
}
function makeShareToken() {
  return crypto.randomBytes(24).toString("hex");
}
function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}
function normalizeStatus(s) {
  const v = String(s || "pending").toLowerCase().trim();
  return ["pending", "needs_fix", "submitted", "approved", "returned_to_seller", "commercial_review", "all"].includes(v)
    ? v
    : "pending";
}
function normalizeViewer(v) {
  const s = String(v || "medidor").toLowerCase().trim();
  return ["medidor", "tecnica", "comercial"].includes(s) ? s : "medidor";
}
function normalizeMeasurementMode(v) {
  return String(v || "medidor").toLowerCase().trim() === "tecnica_only" ? "tecnica_only" : "medidor";
}
function normalizeMeasurementSubtype(v) {
  return String(v || "normal").toLowerCase().trim() === "sin_medicion" ? "sin_medicion" : "normal";
}
function normalizeDateOnly(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
function mergeEndCustomer(current, patch) {
  if (!patch || typeof patch !== "object") return current || {};
  return {
    ...(current || {}),
    name: patch.name ?? current?.name ?? "",
    phone: patch.phone ?? current?.phone ?? "",
    email: patch.email ?? current?.email ?? "",
    address: patch.address ?? current?.address ?? "",
    city: patch.city ?? current?.city ?? "",
    maps_url: patch.maps_url ?? current?.maps_url ?? "",
  };
}
function validatePhone(phone, { required = false } = {}) {
  const raw = String(phone || "").trim();
  if (!raw) return required ? "Falta end_customer.phone" : null;
  const digits = onlyDigits(raw);
  if (!digits) return required ? "Falta end_customer.phone" : null;
  if (digits.startsWith("54")) return "El teléfono debe guardarse sin 54, sin 0 y sin 15";
  if (digits.startsWith("0")) return "El teléfono debe guardarse sin 0 en la característica";
  if (![10, 11].includes(digits.length)) return "El teléfono debe guardarse sin 0 y sin 15";
  return null;
}
function validateEmail(email) {
  const raw = String(email || "").trim();
  if (!raw) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? null : "Correo inválido";
}
function validateMaps(url, { required = false } = {}) {
  const raw = String(url || "").trim();
  if (!raw) return required ? "Falta end_customer.maps_url" : null;
  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    const path = String(parsed.pathname || "").toLowerCase();
    if (["maps.app.goo.gl", "www.google.com", "google.com", "maps.google.com", "g.page"].includes(host)) {
      return null;
    }
    if (host.endsWith(".google.com") && path.includes("maps")) return null;
  } catch {
    return "Google Maps inválido";
  }
  return "Google Maps inválido";
}
function validateEndCustomerForMeasurement(endCustomer, { requireWhatsapp = false } = {}) {
  const phoneErr = validatePhone(endCustomer?.phone, { required: requireWhatsapp });
  if (phoneErr) return phoneErr;
  const emailErr = validateEmail(endCustomer?.email);
  if (emailErr) return emailErr;
  const mapsErr = validateMaps(endCustomer?.maps_url, { required: false });
  if (mapsErr) return mapsErr;
  return null;
}
function hasMeasurementLine(lines) {
  return (Array.isArray(lines) ? lines : []).some((l) =>
    MEASUREMENT_PRODUCT_IDS.includes(Number(l?.product_id)),
  );
}
function normalizeMeasurementFieldKey(value) {
  return String(value || "").trim().toLowerCase();
}
function valuesDiffer(a, b) {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}
async function getTechnicalMeasurementFieldsSafe() {
  try {
    const payload = await getTechnicalMeasurementFieldDefinitions();
    return Array.isArray(payload?.fields) ? payload.fields : [];
  } catch {
    return [];
  }
}
function getConfiguredSensitiveItem18Keys(fields = []) {
  const envKeys = String(process.env.MEASUREMENT_ITEM_18_KEYS || "")
    .split(",")
    .map((item) => normalizeMeasurementFieldKey(item))
    .filter(Boolean);
  const inferredKeys = (Array.isArray(fields) ? fields : [])
    .filter((field) => Number(field?.budget_section_id || 0) === 18)
    .map((field) => normalizeMeasurementFieldKey(field?.key))
    .filter(Boolean);
  return [...new Set([...envKeys, ...inferredKeys])];
}
function pickByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}
function detectSensitiveItem18Change({ form, baselineForm, sensitiveKeys }) {
  const keys = Array.isArray(sensitiveKeys) ? sensitiveKeys : [];
  for (const key of keys) {
    if (valuesDiffer(pickByPath(form, key), pickByPath(baselineForm, key))) {
      return {
        changed: true,
        key,
        message: DEFAULT_ITEM18_REASON,
      };
    }
  }
  return { changed: false, key: null, message: "" };
}
function isTecnicaOnlyQuote(quote) {
  return (
    normalizeMeasurementMode(quote?.measurement_mode) === "tecnica_only" ||
    normalizeMeasurementSubtype(quote?.measurement_subtype) === "sin_medicion"
  );
}
function isMeasurementReadyQuote(quote) {
  const status = String(quote?.status || "").toLowerCase().trim();
  if (status === "synced_odoo" || status === "draft") return true;
  return (
    status === "pending_approvals" &&
    String(quote?.commercial_decision || "").toLowerCase().trim() === "approved" &&
    String(quote?.technical_decision || "").toLowerCase().trim() === "approved"
  );
}
function quoteRequiresMeasurementWorkflow(quote) {
  if (!quote) return false;
  if (hasMeasurementLine(quote?.lines)) return true;
  return (
    String(quote?.fulfillment_mode || "").toLowerCase().trim() === "produccion" && isTecnicaOnlyQuote(quote)
  );
}
function quoteAllowsMeasurementWorkflow(quote) {
  const kind = String(quote?.catalog_kind || "porton").toLowerCase().trim();
  const kindAllowsCircuit =
    ["porton", "puerta"].includes(kind) || (["ipanel", "plegados"].includes(kind) && isTecnicaOnlyQuote(quote));
  return (
    kindAllowsCircuit &&
    isMeasurementReadyQuote(quote) &&
    quoteRequiresMeasurementWorkflow(quote)
  );
}
function canReadMeasurement({ user, quote }) {
  if (!user || !quote) return false;
  const isOwner = String(quote.created_by_user_id) === String(user.user_id);
  if (isOwner) return true;
  if (user.is_enc_comercial || user.is_rev_tecnica) return true;
  if (user.is_medidor && !isTecnicaOnlyQuote(quote)) return true;
  return false;
}
function toNumberLike(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function extractBudgetDimensionMm(quote, key) {
  const dims = quote?.payload?.dimensions || {};
  const raw = key === "ancho" ? dims?.width : dims?.height;
  const n = toNumberLike(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}
function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}
function averageMm(values = []) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => Number(String(v || "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!list.length) return 0;
  return list.reduce((acc, n) => acc + n, 0) / list.length;
}
function maxMm(values = []) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => Number(String(v || "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return list.length ? Math.max(...list) : 0;
}
function minMm(values = []) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => Number(String(v || "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return list.length ? Math.min(...list) : 0;
}
function round4(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function sumLinesBaseAmount(lines) {
  return round2(
    (Array.isArray(lines) ? lines : []).reduce((acc, l) => {
      const qty = Number(l?.qty || 0) || 0;
      const basePrice = Number(l?.basePrice ?? l?.base_price ?? l?.price ?? 0) || 0;
      return acc + qty * basePrice;
    }, 0),
  );
}
// Snapshot de las lineas "originales" (antes de la edicion del vendedor) para
// que Comercial pueda comparar contra lo editado al momento de aprobar. Se
// captura acá (cuando se marca returned_to_seller), no en /return/confirm,
// porque para ese momento el vendedor ya guardo su edicion via PUT /api/quotes/:id
// y ese guardado no preserva measurement_return_context (solo preserva claves de
// linked_porton en preserveLinkedPortonPayload) - el original ya se perdio ahi.
//
// original_total (sumLinesBaseAmount) es solo informativo/legacy: es la suma cruda
// qty*basePrice, SIN margen ni condición de venta, así que no coincide con lo que
// realmente se sincroniza a Odoo. El frontend no debe usarlo para mostrar montos -
// recalcula con el margen/condición correctos a partir de original_payload.
function buildCommercialDiffSnapshot(ctx) {
  const originalLines = ctx?.original_lines || [];
  return {
    original_lines: originalLines,
    original_payload: ctx?.original_payload || null,
    original_total: sumLinesBaseAmount(originalLines),
    captured_at: new Date().toISOString(),
  };
}
function deriveMeasurementPrefill(quote) {
  const payload = quote?.payload || {};
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const portonType = normalizeText(payload.porton_type);
  const names = lines.map((l) => normalizeText(l.name || l.raw_name || "")).join(" ");
  const out = {};
  if (names.includes("motor") || names.includes("automat")) out.accionamiento = "automatico";
  if (portonType.includes("coplanar")) out.levadizo = "coplanar";
  else if (portonType) out.levadizo = "comun";
  const altoMm = extractBudgetDimensionMm(quote, "alto");
  const anchoMm = extractBudgetDimensionMm(quote, "ancho");
  if (altoMm) out.alto_mm = altoMm;
  if (anchoMm) out.ancho_mm = anchoMm;
  return out;
}
function validateFinalDimensions(form) {
  const altoFinal = String(form?.alto_final_mm || "").trim();
  const anchoFinal = String(form?.ancho_final_mm || "").trim();
  if (!altoFinal) return "Falta alto_final_mm";
  if (!anchoFinal) return "Falta ancho_final_mm";
  return null;
}
function isDoorQuote(quote) {
  return String(quote?.catalog_kind || "").toLowerCase().trim() === "puerta";
}
function normalizeMeasurementAxis(values = []) {
  return (Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean);
}
function validateDoorMeasurementPointCount(quote, form) {
  if (!isDoorQuote(quote)) return null;
  const altos = normalizeMeasurementAxis(form?.esquema?.alto || []);
  const anchos = normalizeMeasurementAxis(form?.esquema?.ancho || []);
  if (altos.length !== 2 || anchos.length !== 2) {
    return "Para puertas se deben cargar exactamente 2 medidas de alto y 2 medidas de ancho.";
  }
  return null;
}
function detectDoorBudgetSectionChangeByMedidor({ quote, form, baselineForm }) {
  if (!isDoorQuote(quote)) return false;
  const keys = [
    "__selected_binding_product",
    "__fallback_selected_section_products",
    "__budget_section_override",
  ];
  return keys.some((key) => valuesDiffer(form?.[key], baselineForm?.[key]));
}
async function buildMeasurementSurfaceGuard({ quote, form }) {
  const tolerance_area_m2 = Number(await getCommercialFinalToleranceAreaM2()) || 0;
  const dims = quote?.payload?.dimensions || {};
  const originalArea = round4((Number(dims?.width || 0) || 0) * (Number(dims?.height || 0) || 0));
  const altoFinal = Number(String(form?.alto_final_mm || 0).replace(",", ".")) || 0;
  const anchoFinal = Number(String(form?.ancho_final_mm || 0).replace(",", ".")) || 0;
  const finalArea = altoFinal > 0 && anchoFinal > 0 ? round4((altoFinal * anchoFinal) / 1000000) : originalArea;
  const difference_m2 = Math.max(0, Number((finalArea - originalArea).toFixed(4)));
  const forced_return_to_seller = difference_m2 > tolerance_area_m2 && finalArea > originalArea;
  return {
    surface_original_m2: originalArea,
    surface_final_m2: finalArea,
    difference_m2,
    tolerance_area_m2,
    surface_final_formula: "alto_final_mm * ancho_final_mm / 1000000",
    forced_return_to_seller,
    default_return_reason: forced_return_to_seller ? DEFAULT_RETURN_REASON : "",
    helper_values: {
      alto_final_mm: altoFinal,
      ancho_final_mm: anchoFinal,
      alto_prom_mm: averageMm(form?.esquema?.alto || []),
      ancho_prom_mm: averageMm(form?.esquema?.ancho || []),
      alto_max_mm: maxMm(form?.esquema?.alto || []),
      ancho_max_mm: maxMm(form?.esquema?.ancho || []),
      alto_min_mm: minMm(form?.esquema?.alto || []),
      ancho_min_mm: minMm(form?.esquema?.ancho || []),
    },
  };
}
// Cuando el vendedor corrige un presupuesto devuelto por medición (ver
// buildMeasurementSurfaceGuard / /return/confirm), la diferencia de superficie
// contra lo presupuestado ORIGINALMENTE (antes de la devolución) que caiga
// dentro de la tolerancia configurada (getCommercialFinalToleranceAreaM2) no se
// le tiene que cobrar al cliente: se absorbe agregando una línea de descuento,
// mismo criterio que ya usa measurementFinalization.js para la medición final
// post-producción (computeSurfacePricingMetrics + línea de descuento).
// Devuelve { lines, metrics }: lines ya incluye la línea de descuento si corresponde.
async function applyMeasurementToleranceAbsorption({ originalLines, originalPayload, finalLines, finalPayload, quote }) {
  const toleranceAreaM2 = Number(await getCommercialFinalToleranceAreaM2()) || 0;
  const sourceAreaM2 = computeQuoteSurfaceM2({ payload: originalPayload });
  const finalAreaM2 = computeQuoteSurfaceM2({ payload: finalPayload });
  const normalizedSourceLines = (Array.isArray(originalLines) ? originalLines : []).map(cloneBudgetLine).filter(Boolean);
  const normalizedFinalLines = (Array.isArray(finalLines) ? finalLines : []).map(cloneBudgetLine).filter(Boolean);
  const metrics = computeSurfacePricingMetrics({
    sourceLines: normalizedSourceLines,
    finalLines: normalizedFinalLines,
    pricingPayload: finalPayload,
    sourceAreaM2,
    finalAreaM2,
    toleranceAreaM2,
    quote,
  });
  if (!(metrics.surface_absorbed_amount > 0)) {
    return { lines: Array.isArray(finalLines) ? finalLines : [], metrics };
  }
  const discountLine = {
    product_id: PLACEHOLDER_PRODUCT_ID,
    qty: 1,
    name: `Diferencia de medición absorbida (${metrics.surface_absorbed_diff_m2} m² dentro de tolerancia de ${toleranceAreaM2} m²)`,
    raw_name: `Diferencia de medición absorbida (${metrics.surface_absorbed_diff_m2} m² dentro de tolerancia de ${toleranceAreaM2} m²)`,
    code: null,
    price_unit: round2(-metrics.surface_absorbed_amount),
    basePrice: 0,
    locked_line: true,
  };
  return { lines: [...(Array.isArray(finalLines) ? finalLines : []), discountLine], metrics };
}
function buildPreviouslyBilledLine(quote) {
  const amount = Number(quote?.deposit_amount || 0) || 0;
  return {
    product_id: PREVIOUSLY_BILLED_PRODUCT_ID,
    name: "Facturado previamente",
    raw_name: "Facturado previamente",
    code: null,
    qty: 1,
    basePrice: amount > 0 ? -amount : 0,
    previously_billed_line: true,
    locked_line: true,
    line_key: "previously_billed_line",
  };
}
function stripPreviouslyBilledLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter(
    (line) => line?.previously_billed_line !== true && Number(line?.product_id) !== PREVIOUSLY_BILLED_PRODUCT_ID,
  );
}
function buildReturnContext(quote) {
  const currentPayload = quote?.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
  const existing =
    currentPayload.measurement_return_context && typeof currentPayload.measurement_return_context === "object"
      ? currentPayload.measurement_return_context
      : {};
  return {
    ...existing,
    original_lines: existing.original_lines || stripPreviouslyBilledLines(quote?.lines),
    original_payload: existing.original_payload || { ...currentPayload, measurement_return_context: undefined },
    original_note: existing.original_note !== undefined ? existing.original_note : quote?.note || null,
    original_status: existing.original_status || quote?.status || "synced_odoo",
  };
}
function payloadWithReturnContext(basePayload, ctx) {
  const next = { ...(basePayload || {}) };
  next.measurement_return_context = ctx;
  return next;
}
function payloadWithoutReturnContext(basePayload) {
  const next = { ...(basePayload || {}) };
  delete next.measurement_return_context;
  return next;
}
function quoteLooksLikeReturnedToSeller(quote) {
  const status = String(quote?.measurement_status || "").toLowerCase().trim();
  if (status === "returned_to_seller") return true;
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  if (payload?.measurement_return_context) return true;
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  return lines.some(
    (line) => line?.previously_billed_line === true || Number(line?.product_id) === PREVIOUSLY_BILLED_PRODUCT_ID,
  );
}
function buildObservationReturnReason(form) {
  const note = String(form?.observaciones_medicion || "").trim();
  if (!note) return "";
  return `${DEFAULT_OBSERVATION_REASON}\n\nObservación del medidor: ${note}`;
}

export function buildMeasurementsRouter(odoo = null) {
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

  router.get("/", async (req, res, next) => {
    try {
      const u = req.user;
      const viewer = normalizeViewer(req.query.viewer || "medidor");
      const status = normalizeStatus(req.query.status || "pending");
      const customer = String(req.query.customer || req.query.q || "").trim();
      const locality = String(req.query.locality || "").trim();
      const dateFrom = normalizeDateOnly(req.query.date_from);
      const dateTo = normalizeDateOnly(req.query.date_to);
      if (viewer === "medidor" && !u?.is_medidor) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      if (viewer === "tecnica" && !u?.is_rev_tecnica) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      if (viewer === "comercial" && !u?.is_enc_comercial) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      const where = [
        "coalesce(q.catalog_kind, 'porton') in ('porton', 'puerta', 'ipanel', 'plegados')",
        "(q.status = 'synced_odoo' or (q.status = 'pending_approvals' and q.commercial_decision = 'approved' and q.technical_decision = 'approved') or (q.status = 'draft' and q.measurement_status = 'returned_to_seller'))",
        `(
          exists (select 1 from jsonb_array_elements(coalesce(q.lines, '[]'::jsonb)) elem where (elem->>'product_id') = any($1::text[]))
          or (q.fulfillment_mode = 'produccion' and (coalesce(q.measurement_mode, 'medidor') = 'tecnica_only' or coalesce(q.measurement_subtype, 'normal') = 'sin_medicion'))
          or q.requires_measurement = true
        )`,
      ];
      const params = [MEASUREMENT_PRODUCT_IDS.map(String)];

      if (viewer === "medidor") {
        params.push(Number(u.user_id));
        const medidorParam = params.length;
        where.push(`coalesce(q.measurement_mode, 'medidor') <> 'tecnica_only'`);
        if (status === "pending") {
          where.push(`q.measurement_at is null`);
          where.push(`(q.measurement_assigned_to_user_id is null or q.measurement_assigned_to_user_id = $${medidorParam})`);
        } else if (["returned_to_seller", "submitted", "approved", "needs_fix"].includes(status)) {
          where.push(`coalesce(q.measurement_by_user_id, q.measurement_assigned_to_user_id) = $${medidorParam}`);
        } else if (status === "all") {
          where.push(`(
            (q.measurement_status = 'pending' and q.measurement_at is null and (q.measurement_assigned_to_user_id is null or q.measurement_assigned_to_user_id = $${medidorParam}))
            or
            (q.measurement_status in ('returned_to_seller','submitted','approved','needs_fix') and coalesce(q.measurement_by_user_id, q.measurement_assigned_to_user_id) = $${medidorParam})
          )`);
        }
      }

      // Antes esto ocultaba a Tecnica los presupuestos con
      // measurement_commercial_review_status='pending' (cuando el vendedor arregla un
      // porton devuelto por medicion y lo reenvia, primero tiene que pasar por Comercial).
      // Ahora se los deja ver (en modo solo lectura desde el frontend) para que sepan que
      // existen y por que todavia no pueden actuar - la proteccion real sigue estando en
      // POST /:id/review (mas abajo), que sigue rechazando la accion mientras este 'pending'.

      if (status === "commercial_review") {
        where.push(`q.measurement_commercial_review_status = 'pending'`);
      } else if (status !== "all") {
        params.push(status);
        where.push(`q.measurement_status = $${params.length}`);
      } else {
        where.push(`q.measurement_status <> 'none'`);
      }
      if (customer) {
        params.push(`%${customer}%`);
        where.push(`(coalesce(q.end_customer->>'name', '')) ilike $${params.length}`);
      }
      if (locality) {
        params.push(`%${locality}%`);
        where.push(`(coalesce(q.end_customer->>'city', '') ilike $${params.length} or coalesce(q.end_customer->>'address', '') ilike $${params.length})`);
      }
      if (dateFrom) {
        params.push(dateFrom);
        where.push(`q.measurement_scheduled_for >= $${params.length}::date`);
      }
      if (dateTo) {
        params.push(dateTo);
        where.push(`q.measurement_scheduled_for <= $${params.length}::date`);
      }
      const sql = `select q.*, u.username as created_by_username, u.full_name as created_by_full_name from public.presupuestador_quotes q left join public.presupuestador_users u on u.id = q.created_by_user_id where ${where.join(
        " and ",
      )} order by case when q.measurement_scheduled_for is null then 1 else 0 end asc, q.measurement_scheduled_for asc, q.created_at desc nulls last, q.id desc limit 300`;
      const r = await dbQuery(sql, params);
      res.json({ ok: true, quotes: r.rows || [] });
    } catch (e) {
      next(e);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const r = await dbQuery(
        `select q.*, u.username as created_by_username, u.full_name as created_by_full_name from public.presupuestador_quotes q left join public.presupuestador_users u on u.id = q.created_by_user_id where q.id = $1 limit 1`,
        [id],
      );
      const quote = r.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!canReadMeasurement({ user: u, quote })) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      quote.measurement_prefill = deriveMeasurementPrefill(quote);
      quote.measurement_surface_guard = await buildMeasurementSurfaceGuard({ quote, form: quote.measurement_form || {} });
      res.json({ ok: true, quote });
    } catch (e) {
      next(e);
    }
  });

  router.put("/:id/schedule", requireTechnicalReviewer, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const scheduledFor = normalizeDateOnly(req.body?.scheduled_for);
      if (!scheduledFor) {
        return res.status(400).json({ ok: false, error: "Falta scheduled_for (YYYY-MM-DD)" });
      }
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!quoteAllowsMeasurementWorkflow(quote)) {
        return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
      }
      const upd = await dbQuery(
        `update public.presupuestador_quotes set requires_measurement = true, measurement_status = case when measurement_status = 'none' then 'pending' else measurement_status end, measurement_scheduled_for = $2::date, measurement_scheduled_by_user_id = $3, measurement_scheduled_at = now() where id = $1 returning *`,
        [id, scheduledFor, Number(u.user_id)],
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) {
      next(e);
    }
  });

  router.put("/:id", requireMeasurementEditor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const body = req.body || {};
      const form = body.form ?? null;
      if (!form || typeof form !== "object") {
        return res.status(400).json({ ok: false, error: "Falta form (objeto)" });
      }
      const submit = body.submit === true;
      const endCustomer = body.end_customer ?? null;
      const rawExtraContact = body.extra_contact && typeof body.extra_contact === "object" ? body.extra_contact : null;
      const extraContact = rawExtraContact
        ? { name: String(rawExtraContact.name || ""), role: String(rawExtraContact.role || ""), phone: String(rawExtraContact.phone || "") }
        : null;
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!quoteAllowsMeasurementWorkflow(quote)) {
        return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
      }
      const currentStatus = String(quote.measurement_status || "none").toLowerCase().trim();
      const baselineForm = body.baseline_form ?? quote?.measurement_original_form ?? quote?.measurement_form ?? {};
      const technicalFields = await getTechnicalMeasurementFieldsSafe();
      const sensitiveItem18Keys = getConfiguredSensitiveItem18Keys(technicalFields);
      const item18Change = detectSensitiveItem18Change({ form, baselineForm, sensitiveKeys: sensitiveItem18Keys });
      const nextCustomer = mergeEndCustomer(quote.end_customer || {}, endCustomer);
      const customerErr = validateEndCustomerForMeasurement(nextCustomer, {
        requireWhatsapp: submit && !!u?.is_rev_tecnica,
      });
      if (customerErr) return res.status(400).json({ ok: false, error: customerErr });
      if (!u?.is_rev_tecnica && !u?.is_medidor) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      if (u?.is_medidor && isTecnicaOnlyQuote(quote)) {
        return res.status(403).json({ ok: false, error: "Este portón sin medición solo puede completarlo Técnica" });
      }
      if (u?.is_medidor && quote?.measurement_at) {
        return res.status(409).json({
          ok: false,
          error: "La medición ya fue realizada y no puede volver a edición de medición.",
        });
      }
      if (["approved", "submitted"].includes(currentStatus) && !u?.is_rev_tecnica) {
        return res.status(409).json({ ok: false, error: "La medición ya fue enviada o aprobada" });
      }

      const areaGuard = await buildMeasurementSurfaceGuard({ quote, form });
      if (submit) {
        const doorMeasuresErr = validateDoorMeasurementPointCount(quote, form);
        if (doorMeasuresErr) return res.status(400).json({ ok: false, error: doorMeasuresErr });
      }
      if (submit && u?.is_medidor && detectDoorBudgetSectionChangeByMedidor({ quote, form, baselineForm })) {
        return res.status(400).json({
          ok: false,
          error: "En puertas el medidor no puede cambiar secciones/productos. Deja observaciones para devolverlo al vendedor o envia a aprobacion tecnica final.",
        });
      }
      // El medidor elige libremente a quién enviar (técnico o vendedor). Cambiar el
      // producto de la sección 18 ya no fuerza el retorno al vendedor por sí solo;
      // solo se fuerza por el guardia de superficie (portón terminó más grande que
      // lo presupuestado) o si el medidor lo pide explícitamente.
      const explicitReturnToSeller = body.return_to_seller === true;
      const forceSellerReturn =
        areaGuard.forced_return_to_seller === true ||
        explicitReturnToSeller;

      if (submit && forceSellerReturn) {
        const reason = areaGuard.forced_return_to_seller
          ? areaGuard.default_return_reason || DEFAULT_RETURN_REASON
          : String(body.return_reason || "El medidor devuelve al vendedor para revisión.");
        const ctx = buildReturnContext(quote);
        const cleanLines = stripPreviouslyBilledLines(ctx.original_lines || quote.lines);
        const nextLines = [...cleanLines, buildPreviouslyBilledLine(quote)];
        const payloadSource = quote.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
        const payloadWithExtra = extraContact ? { ...payloadSource, extra_contact: extraContact } : payloadSource;
        const nextPayload = payloadWithReturnContext(payloadWithoutReturnContext(payloadWithExtra), ctx);
        const commercialDiffSnapshot = buildCommercialDiffSnapshot(ctx);
        const upd = await dbQuery(
          `update public.presupuestador_quotes
              set status='draft',
                  end_customer=$2::jsonb,
                  lines=$3::jsonb,
                  payload=$4::jsonb,
                  measurement_form=$5::jsonb,
                  measurement_original_form=coalesce(measurement_original_form, $6::jsonb),
                  measurement_status='returned_to_seller',
                  measurement_review_notes=$7,
                  measurement_review_by_user_id=$8,
                  measurement_review_at=now(),
                  measurement_by_user_id=coalesce(measurement_by_user_id, $8),
                  measurement_assigned_to_user_id=coalesce(measurement_assigned_to_user_id, $8),
                  measurement_at=coalesce(measurement_at, now()),
                  measurement_commercial_review_required=false,
                  measurement_commercial_review_status=null,
                  measurement_commercial_diff_json=$9::jsonb
            where id=$1
            returning *`,
          [
            id,
            JSON.stringify(nextCustomer),
            JSON.stringify(nextLines),
            JSON.stringify(nextPayload),
            JSON.stringify(form),
            JSON.stringify(quote.measurement_original_form || quote.measurement_form || {}),
            reason,
            Number(u.user_id),
            JSON.stringify(commercialDiffSnapshot),
          ],
        );
        return res.json({
          ok: true,
          quote: upd.rows?.[0] || null,
          returned_to_seller: true,
          moved_to_seller: true,
          measurement_surface_guard: areaGuard,
          item18_change: item18Change,
        });
      }

      if (submit) {
        const finalDimsErr = validateFinalDimensions(form);
        if (finalDimsErr) return res.status(400).json({ ok: false, error: finalDimsErr });
        const submitPayloadSource = quote.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
        const submitPayload = extraContact ? { ...submitPayloadSource, extra_contact: extraContact } : submitPayloadSource;
        const upd = await dbQuery(
          `update public.presupuestador_quotes set end_customer=$2::jsonb, payload=$3::jsonb, measurement_form=$4::jsonb, measurement_original_form=coalesce(measurement_original_form, $5::jsonb), measurement_status='submitted', measurement_review_notes=null, measurement_review_by_user_id=null, measurement_review_at=null, measurement_assigned_to_user_id=coalesce(measurement_assigned_to_user_id, $6), measurement_by_user_id=$6, measurement_at=now() where id=$1 returning *`,
          [
            id,
            JSON.stringify(nextCustomer),
            JSON.stringify(submitPayload),
            JSON.stringify(form),
            JSON.stringify(quote.measurement_original_form || quote.measurement_form || {}),
            Number(u.user_id),
          ],
        );
        return res.json({ ok: true, quote: upd.rows?.[0] || null, moved_to_tecnica: true, measurement_surface_guard: areaGuard });
      }

      const statusToKeep = currentStatus === "none" ? "pending" : currentStatus;
      const draftPayloadSource = quote.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
      const draftPayload = extraContact ? { ...draftPayloadSource, extra_contact: extraContact } : draftPayloadSource;
      const upd = await dbQuery(
        `update public.presupuestador_quotes set end_customer=$2::jsonb, payload=$3::jsonb, measurement_form=$4::jsonb, measurement_status=$5 where id=$1 returning *`,
        [id, JSON.stringify(nextCustomer), JSON.stringify(draftPayload), JSON.stringify(form), statusToKeep],
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null, measurement_surface_guard: areaGuard });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/review", requireTechnicalReviewer, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const { action, notes } = req.body || {};
      const act = String(action || "").toLowerCase().trim();
      if (!["approve", "reject", "return_to_seller"].includes(act)) {
        return res.status(400).json({ ok: false, error: "action inválida" });
      }
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!quoteAllowsMeasurementWorkflow(quote)) {
        return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
      }
      const currentMeasurementStatus = String(quote.measurement_status || "").toLowerCase().trim();
      const isTechnicalOnlyFinalApproval =
        act === "approve" &&
        currentMeasurementStatus === "pending" &&
        isTecnicaOnlyQuote(quote);
      if (!["submitted", "approved"].includes(currentMeasurementStatus) && act !== "return_to_seller" && !isTechnicalOnlyFinalApproval) {
        return res.status(409).json({ ok: false, error: "La medición no está lista para revisar" });
      }
      // Si el vendedor reenvió esto tras un "devuelto al vendedor", primero tiene que
      // aprobarlo Comercial - Tecnica no puede actuar hasta que eso pase, aunque el
      // measurement_status ya diga 'submitted'.
      if (String(quote.measurement_commercial_review_status || "") === "pending") {
        return res.status(409).json({ ok: false, error: "Está pendiente de aprobación comercial, todavía no lo podés revisar." });
      }

      if (act === "return_to_seller") {
        const reason = String(notes || "").trim() || "Devuelto por Técnica";
        const ctx = buildReturnContext(quote);
        const cleanLines = stripPreviouslyBilledLines(ctx.original_lines || quote.lines);
        const nextLines = [...cleanLines, buildPreviouslyBilledLine(quote)];
        const payloadSource = quote.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
        const nextPayload = payloadWithReturnContext(payloadWithoutReturnContext(payloadSource), ctx);
        const commercialDiffSnapshot = buildCommercialDiffSnapshot(ctx);
        const upd = await dbQuery(
          `update public.presupuestador_quotes set status='draft', lines=$2::jsonb, payload=$3::jsonb, measurement_status='returned_to_seller', measurement_review_notes=$4, measurement_review_by_user_id=$5, measurement_review_at=now(), measurement_commercial_review_required=false, measurement_commercial_review_status=null, measurement_commercial_diff_json=$6::jsonb where id=$1 returning *`,
          [id, JSON.stringify(nextLines), JSON.stringify(nextPayload), reason, Number(u.user_id), JSON.stringify(commercialDiffSnapshot)],
        );
        return res.json({ ok: true, quote: upd.rows?.[0] || null, returned_to_seller: true });
      }

      if (act === "approve") {
        const form = quote?.measurement_form || {};
        const doorMeasuresErr = validateDoorMeasurementPointCount(quote, form);
        if (doorMeasuresErr) return res.status(400).json({ ok: false, error: doorMeasuresErr });
        const finalDimsErr = validateFinalDimensions(form);
        if (finalDimsErr) return res.status(400).json({ ok: false, error: finalDimsErr });
        const upd = await dbQuery(
          `update public.presupuestador_quotes set measurement_status='approved', measurement_review_by_user_id=$2, measurement_review_at=now(), measurement_review_notes=null, status='synced_odoo', measurement_commercial_review_required=false where id=$1 returning *`,
          [id, Number(u.user_id)],
        );
        const savedQuote = upd.rows?.[0] || null;
        let finalization = null;
        try {
          finalization = await finalizeMeasurementToRevisionQuote({
            odoo,
            originalQuote: savedQuote,
            measurementForm: savedQuote?.measurement_form || {},
          });
        } catch (e) {
          console.error("MEASUREMENT FINALIZATION ERROR:", e?.message || e);
          throw e;
        }
        return res.json({ ok: true, quote: savedQuote, finalization });
      }

      const msg = String(notes || "Corregir").trim();
      const upd = await dbQuery(
        `update public.presupuestador_quotes set measurement_status='needs_fix', measurement_review_by_user_id=$2, measurement_review_at=now(), measurement_review_notes=$3 where id=$1 returning *`,
        [id, Number(u.user_id), msg],
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/return/reset", async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      const isOwner = String(quote.created_by_user_id) === String(u.user_id);
      if (!isOwner || !(u?.is_vendedor || u?.is_distribuidor)) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      const payloadSource = quote.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
      const ctx = payloadSource.measurement_return_context || {};
      const restoredLines = [...stripPreviouslyBilledLines(ctx.original_lines || quote.lines), buildPreviouslyBilledLine(quote)];
      const restoredPayload = payloadWithReturnContext(payloadWithoutReturnContext(ctx.original_payload || payloadSource), ctx);
      const upd = await dbQuery(
        `update public.presupuestador_quotes set lines=$2::jsonb, payload=$3::jsonb, note=$4 where id=$1 returning *`,
        [id, JSON.stringify(restoredLines), JSON.stringify(restoredPayload), ctx.original_note !== undefined ? ctx.original_note : quote.note],
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/return/confirm", async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      const isOwner = String(quote.created_by_user_id) === String(u.user_id);
      if (!isOwner || !(u?.is_vendedor || u?.is_distribuidor)) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      if (!quoteLooksLikeReturnedToSeller(quote)) {
        return res.status(409).json({ ok: false, error: "El portón no está devuelto al vendedor" });
      }

      const quoteUpdate = req.body?.quote_update && typeof req.body.quote_update === "object" ? req.body.quote_update : null;
      const nextEndCustomer = quoteUpdate?.end_customer !== undefined ? quoteUpdate.end_customer : quote.end_customer;
      const nextLinesRaw = quoteUpdate?.lines !== undefined ? quoteUpdate.lines : quote.lines;
      // Re-agregar "Facturado previamente" (mismo patron que /return/reset, unas lineas
      // arriba): sin esto, la linea desaparecia justo al pasar a revision comercial y
      // nunca volvia - ni en el presupuesto/proforma que se descarga desde ahi, ni en el
      // "Actual/Facturado previamente/TOTAL" que necesita ver Comercial para saber cuanto
      // hay que cobrar de mas (caso #6412). buildBasePositiveLinesFromQuote (usado recien
      // en la aprobacion tecnica final) la vuelve a excluir explicitamente, asi que no se
      // descuenta dos veces: el descuento real que se manda a Odoo sigue siendo el que arma
      // buildDiscountPreviewLine a partir de deposit_amount.
      const cleanedLines = [...stripPreviouslyBilledLines(nextLinesRaw), buildPreviouslyBilledLine(quote)];
      const payloadSource = quoteUpdate?.payload !== undefined ? quoteUpdate.payload : quote.payload;
      const nextPayload = payloadWithoutReturnContext(payloadSource && typeof payloadSource === "object" ? payloadSource : {});
      const nextFulfillmentMode = quoteUpdate?.fulfillment_mode !== undefined ? quoteUpdate.fulfillment_mode : quote.fulfillment_mode;
      const nextPricelistId =
        quoteUpdate?.pricelist_id !== undefined ? Number(quoteUpdate.pricelist_id || 0) || null : quote.pricelist_id;
      const nextBillToPartnerId =
        quoteUpdate?.bill_to_odoo_partner_id !== undefined
          ? quoteUpdate.bill_to_odoo_partner_id
            ? Number(quoteUpdate.bill_to_odoo_partner_id)
            : null
          : quote.bill_to_odoo_partner_id;
      const nextNote = quoteUpdate?.note !== undefined ? quoteUpdate.note : quote.note;
      const nextCatalogKind = quoteUpdate?.catalog_kind !== undefined ? quoteUpdate.catalog_kind : quote.catalog_kind;

      // La diferencia de superficie contra lo presupuestado ANTES de la devolución
      // (ctx.original_*, capturado por buildReturnContext cuando se devolvió) que
      // caiga dentro de la tolerancia no se cobra: se agrega como línea de
      // descuento (ver applyMeasurementToleranceAbsorption).
      const ctx = buildReturnContext(quote);
      const { lines: linesWithAbsorption, metrics: toleranceMetrics } = await applyMeasurementToleranceAbsorption({
        originalLines: ctx.original_lines,
        originalPayload: ctx.original_payload,
        finalLines: cleanedLines,
        finalPayload: nextPayload,
        quote,
      });

      const upd = await dbQuery(
        `update public.presupuestador_quotes
            set status='synced_odoo',
                fulfillment_mode=$2,
                pricelist_id=$3,
                bill_to_odoo_partner_id=$4,
                end_customer=$5::jsonb,
                lines=$6::jsonb,
                payload=$7::jsonb,
                note=$8,
                catalog_kind=$9,
                measurement_status='submitted',
                measurement_review_notes=null,
                measurement_commercial_review_required=true,
                measurement_commercial_review_status='pending'
          where id=$1
          returning *`,
        [
          id,
          nextFulfillmentMode,
          nextPricelistId,
          nextBillToPartnerId,
          JSON.stringify(nextEndCustomer || {}),
          JSON.stringify(linesWithAbsorption),
          JSON.stringify(nextPayload),
          nextNote,
          nextCatalogKind,
        ],
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null, moved_to_comercial: true, tolerance_metrics: toleranceMetrics });
    } catch (e) {
      next(e);
    }
  });

  // Paso intermedio: cuando el vendedor reenvia un porton devuelto por medicion
  // (ver /:id/return/confirm), antes de que Tecnica lo pueda revisar tiene que
  // pasar por Comercial. Aprobar deja measurement_status tal cual ('submitted')
  // asi que ahora si entra en la cola de Tecnica; rechazar lo manda de nuevo al
  // vendedor con el mismo mecanismo que usa Tecnica (return_to_seller).
  router.post("/:id/commercial-review", requireCommercialReviewer, async (req, res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const { action, notes } = req.body || {};
      const act = String(action || "").toLowerCase().trim();
      if (!["approve", "reject"].includes(act)) {
        return res.status(400).json({ ok: false, error: "action inválida" });
      }
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (String(quote.measurement_commercial_review_status || "") !== "pending") {
        return res.status(409).json({ ok: false, error: "Esto no está pendiente de aprobación comercial" });
      }

      if (act === "approve") {
        // Comentario interno de Comercial al aprobar (distinto del motivo de devolución
        // al vendedor): viaja a la nota de la NV final en Odoo, ver
        // syncFinalQuoteToOdoo en measurementFinalization.js.
        const approveComment = String(notes || "").trim() || null;
        const upd = await dbQuery(
          `update public.presupuestador_quotes
              set measurement_commercial_review_status='approved',
                  measurement_commercial_review_by_user_id=$2,
                  measurement_commercial_review_at=now(),
                  measurement_commercial_review_notes=$3
            where id=$1
            returning *`,
          [id, Number(u.user_id), approveComment],
        );
        return res.json({ ok: true, quote: upd.rows?.[0] || null });
      }

      const reason = String(notes || "").trim() || "Devuelto por Comercial";
      const ctx = buildReturnContext(quote);
      const cleanLines = stripPreviouslyBilledLines(ctx.original_lines || quote.lines);
      const nextLines = [...cleanLines, buildPreviouslyBilledLine(quote)];
      const payloadSource = quote.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
      const nextPayload = payloadWithReturnContext(payloadWithoutReturnContext(payloadSource), ctx);
      const commercialDiffSnapshot = buildCommercialDiffSnapshot(ctx);
      const upd = await dbQuery(
        `update public.presupuestador_quotes
            set status='draft',
                lines=$2::jsonb,
                payload=$3::jsonb,
                measurement_status='returned_to_seller',
                measurement_review_notes=$4,
                measurement_review_by_user_id=$5,
                measurement_review_at=now(),
                measurement_commercial_review_required=false,
                measurement_commercial_review_status=null,
                measurement_commercial_diff_json=$6::jsonb
          where id=$1
          returning *`,
        [id, JSON.stringify(nextLines), JSON.stringify(nextPayload), reason, Number(u.user_id), JSON.stringify(commercialDiffSnapshot)],
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null, returned_to_seller: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

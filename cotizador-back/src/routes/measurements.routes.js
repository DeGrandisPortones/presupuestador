import crypto from "crypto";
import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import {
  finalizeMeasurementToRevisionQuote,
  previewMeasurementRevisionQuote,
} from "../measurementFinalization.js";
import { getTechnicalMeasurementFieldDefinitions } from "../settingsDb.js";

const MEASUREMENT_PRODUCT_ID = Number(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865);

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
function isCommercialMeasurementReviewer({ user, quote }) {
  if (!user || !quote) return false;
  const isOwner = String(quote.created_by_user_id) === String(user.user_id);
  const isSellerOwner = isOwner && (user.is_vendedor || user.is_distribuidor);
  return !!(user.is_enc_comercial || isSellerOwner);
}
function canReadMeasurement({ user, quote }) {
  if (!user || !quote) return false;
  const isOwner = String(quote.created_by_user_id) === String(user.user_id);
  if (isOwner) return true;
  if (user.is_enc_comercial) return true;
  if (user.is_rev_tecnica) return true;
  if (user.is_medidor && !isTecnicaOnlyQuote(quote)) return true;
  return false;
}
function normalizeStatus(s) {
  const v = String(s || "pending").toLowerCase().trim();
  if (!["pending", "needs_fix", "submitted", "approved", "commercial_review", "all"].includes(v)) return "pending";
  return v;
}
function normalizeViewer(v) {
  const s = String(v || "medidor").toLowerCase().trim();
  if (!["medidor", "tecnica", "comercial"].includes(s)) return "medidor";
  return s;
}
function normalizeMeasurementMode(v) {
  const s = String(v || "medidor").toLowerCase().trim();
  return s === "tecnica_only" ? "tecnica_only" : "medidor";
}
function normalizeMeasurementSubtype(v) {
  const s = String(v || "normal").toLowerCase().trim();
  return s === "sin_medicion" ? "sin_medicion" : "normal";
}
function normalizeDateOnly(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return s;
}
function isUuid(v) {
  const s = String(v || "").trim();
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}
function makeShareToken() {
  return crypto.randomBytes(24).toString("hex");
}
function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
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
    if (["maps.app.goo.gl", "www.google.com", "google.com", "maps.google.com", "g.page"].includes(host)) return null;
    if (host.endsWith(".google.com") && path.includes("maps")) return null;
  } catch {}
  return "Google Maps inválido";
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
function validateEndCustomerForMeasurement(endCustomer, { requireWhatsapp = false } = {}) {
  const phoneErr = validatePhone(endCustomer?.phone, { required: requireWhatsapp });
  if (phoneErr) return phoneErr;
  const emailErr = validateEmail(endCustomer?.email);
  if (emailErr) return emailErr;
  const mapsErr = validateMaps(endCustomer?.maps_url, { required: false });
  if (mapsErr) return mapsErr;
  return null;
}
function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}
function hasMeasurementLine(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  return arr.some((l) => Number(l?.product_id) === Number(MEASUREMENT_PRODUCT_ID));
}
function isTecnicaOnlyQuote(quote) {
  return normalizeMeasurementMode(quote?.measurement_mode) === "tecnica_only"
    || normalizeMeasurementSubtype(quote?.measurement_subtype) === "sin_medicion";
}
function isMeasurementReadyQuote(quote) {
  const status = String(quote?.status || "").toLowerCase().trim();
  if (status === "synced_odoo") return true;
  return status === "pending_approvals"
    && String(quote?.commercial_decision || "").toLowerCase().trim() === "approved"
    && String(quote?.technical_decision || "").toLowerCase().trim() === "approved";
}
function quoteAllowsMeasurementWorkflow(quote) {
  return String(quote?.catalog_kind || "").toLowerCase().trim() === "porton"
    && String(quote?.fulfillment_mode || "").toLowerCase().trim() === "produccion"
    && isMeasurementReadyQuote(quote)
    && (
      quote?.requires_measurement === true
      || hasMeasurementLine(quote?.lines)
      || isTecnicaOnlyQuote(quote)
    );
}
function toNumberLike(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function extractBudgetDimensionMm(quote, key) {
  const dims = quote?.payload?.dimensions || {};
  const raw = key === "ancho" ? dims?.width : dims?.height;
  const n = toNumberLike(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Math.round(n * 1000);
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
  if (portonType.includes("madera") || names.includes("madera")) out.revestimiento = "Simil madera Clásico Simil";
  if (portonType.includes("aluminio") || names.includes("aluminio")) out.revestimiento = "Simil Aluminio Clásico";
  if (names.includes("blanco")) out.color_sistema = "Blanco";
  if (names.includes("gris topo")) out.color_sistema = "Gris topo";
  if (names.includes("negro")) out.color_sistema = "Negro Semi Mate";
  if (names.includes("roble")) out.color_revestimiento = "Roble";
  if (names.includes("nogal")) out.color_revestimiento = "Nogal";
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
function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}
function isNumericSegment(value) {
  return /^\d+$/.test(String(value || ""));
}
function cloneContainer(value) {
  return Array.isArray(value) ? value.slice() : { ...(value || {}) };
}
function setByPath(obj, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return obj;
  const root = cloneContainer(obj || {});
  let cur = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = isNumericSegment(parts[i]) ? Number(parts[i]) : parts[i];
    const nextSegment = parts[i + 1];
    const existing = cur[key];
    if (existing && typeof existing === "object") cur[key] = cloneContainer(existing);
    else cur[key] = isNumericSegment(nextSegment) ? [] : {};
    cur = cur[key];
  }
  const lastKey = isNumericSegment(parts[parts.length - 1])
    ? Number(parts[parts.length - 1])
    : parts[parts.length - 1];
  cur[lastKey] = value;
  return root;
}
function normalizeComparableValue(value) {
  if (typeof value === "boolean") return value ? "si" : "no";
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "").trim().toLowerCase();
}
function diffValuesChanged(prevValue, nextValue) {
  return normalizeComparableValue(prevValue) !== normalizeComparableValue(nextValue);
}
function pickCommercialDiffProductLabel(field, form) {
  const bindingType = String(field?.odoo_binding_type || "none").trim().toLowerCase();
  if (bindingType === "custom_product") {
    return String(field?.odoo_product_label || "").trim();
  }
  if (bindingType === "selected_measurement_product") {
    const selected = getByPath(form, `__selected_binding_product.${field.key}`);
    return String(
      selected?.display_name ||
      selected?.alias ||
      selected?.raw_name ||
      field?.odoo_product_label ||
      "",
    ).trim();
  }
  if (bindingType === "repeat_budget_product") {
    const products = getByPath(form, `__budget_binding_products.${field.key}`);
    if (Array.isArray(products) && products.length) {
      return products
        .map((item) => item?.display_name || item?.alias || item?.raw_name || "")
        .filter(Boolean)
        .join(", ");
    }
  }
  return "";
}
async function buildCommercialMeasurementDiff({ baseForm, nextForm }) {
  const configured = await getTechnicalMeasurementFieldDefinitions();
  const fields = Array.isArray(configured?.fields) ? configured.fields : [];
  return fields
    .filter((field) => field?.active !== false && field?.send_modification_to_commercial === true)
    .map((field) => {
      const prevValue = getByPath(baseForm || {}, field.key);
      const nextValue = getByPath(nextForm || {}, field.key);
      if (!diffValuesChanged(prevValue, nextValue)) return null;
      return {
        key: field.key,
        label: field.label || field.key,
        previous_value: prevValue ?? null,
        next_value: nextValue ?? null,
        odoo_binding_type: String(field?.odoo_binding_type || "none"),
        odoo_product_id: Number(field?.odoo_product_id || 0) || null,
        odoo_product_label: String(field?.odoo_product_label || "").trim(),
        preview_product_label: pickCommercialDiffProductLabel(field, nextForm || {}),
      };
    })
    .filter(Boolean);
}
function sanitizeCommercialFormUpdate({ currentForm, requestedForm, diffItems }) {
  const allowedKeys = new Set((Array.isArray(diffItems) ? diffItems : []).map((item) => String(item.key || "").trim()).filter(Boolean));
  let next = cloneContainer(currentForm || {});
  for (const key of allowedKeys) {
    next = setByPath(next, key, getByPath(requestedForm || {}, key));
    const selectedBinding = getByPath(requestedForm || {}, `__selected_binding_product.${key}`);
    const budgetBinding = getByPath(requestedForm || {}, `__budget_binding_products.${key}`);
    if (selectedBinding !== undefined) {
      next = setByPath(next, `__selected_binding_product.${key}`, selectedBinding);
    }
    if (budgetBinding !== undefined) {
      next = setByPath(next, `__budget_binding_products.${key}`, budgetBinding);
    }
  }
  return next;
}
async function syncOriginalQuoteFromMeasurementFinalization(quoteId, finalization) {
  const orderId = Number(finalization?.order?.id || 0) || null;
  const orderName = String(finalization?.order?.name || "").trim();
  if (!quoteId || !orderId || !orderName) return null;
  const metrics = finalization?.metrics || {};
  const upd = await dbQuery(
    `update public.presupuestador_quotes
        set status='synced_odoo',
            odoo_sale_order_id=coalesce(odoo_sale_order_id, $2),
            odoo_sale_order_name=coalesce(odoo_sale_order_name, $3),
            deposit_amount=coalesce(deposit_amount, 0),
            final_status='synced_odoo',
            final_sale_order_id=coalesce(final_sale_order_id, $2),
            final_sale_order_name=coalesce(final_sale_order_name, $3),
            final_synced_at=coalesce(final_synced_at, now()),
            final_tolerance_percent=coalesce($4, final_tolerance_percent),
            final_tolerance_amount=coalesce($5, final_tolerance_amount),
            final_difference_amount=coalesce($6, final_difference_amount),
            final_absorbed_by_company=coalesce($7, final_absorbed_by_company)
      where id=$1
        and odoo_sale_order_id is null
      returning *`,
    [
      quoteId,
      orderId,
      orderName,
      metrics?.tolerance_percent ?? null,
      metrics?.tolerance_amount ?? null,
      metrics?.difference_amount ?? null,
      typeof metrics?.absorbed_by_company === "boolean" ? metrics.absorbed_by_company : null,
    ]
  );
  return upd.rows?.[0] || null;
}
function parseIntegradorNvFromOdooName(rawName) {
  const digits = onlyDigits(rawName);
  const nv = Number(digits);
  return Number.isFinite(nv) && nv > 0 ? nv : null;
}
async function upsertIntegradorPortonMinimo({ savedQuote, finalization, measurementForm }) {
  const orderName = String(
    savedQuote?.odoo_sale_order_name
    || finalization?.order?.name
    || savedQuote?.final_sale_order_name
    || ""
  ).trim();

  const nv = parseIntegradorNvFromOdooName(orderName);
  if (!nv) {
    return { ok: false, skipped: true, reason: "No se pudo resolver NV numérico desde Odoo" };
  }

  const alto = Number(String(measurementForm?.alto_final_mm || "").replace(",", "."));
  const ancho = Number(String(measurementForm?.ancho_final_mm || "").replace(",", "."));

  const payload = {
    NV: nv,
    Alto: Number.isFinite(alto) ? alto : null,
    Ancho: Number.isFinite(ancho) ? ancho : null,
    odoo_sale_order_name: orderName,
    source: "presupuestador",
    source_quote_id: savedQuote?.id || null,
    source_quote_number: savedQuote?.quote_number || null,
    measurement_status: "approved",
    measurement_mode: normalizeMeasurementMode(savedQuote?.measurement_mode),
    measurement_subtype: normalizeMeasurementSubtype(savedQuote?.measurement_subtype),
    measurement_form: measurementForm || {},
    updated_from_measurement_at: new Date().toISOString(),
  };

  const result = await dbQuery(
    `insert into public.preproduccion_valores (id, nv, data)
     values ($1, $2, $3::jsonb)
     on conflict (nv)
     do update set
       data = coalesce(preproduccion_valores.data, '{}'::jsonb) || excluded.data,
       updated_at = now()
     returning nv, data`,
    [nv, nv, JSON.stringify(payload)]
  );

  return {
    ok: true,
    nv,
    row: result.rows?.[0] || null,
  };
}

export function buildMeasurementsRouter(odoo = null) {
  const router = express.Router();

  router.use(async (_req, _res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      next();
    } catch (e) { next(e); }
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

      if (viewer === "medidor" && !u?.is_medidor) return res.status(403).json({ ok: false, error: "No autorizado" });
      if (viewer === "tecnica" && !u?.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
      if (viewer === "comercial" && !u?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });

      const where = [
        "q.catalog_kind = 'porton'",
        "q.fulfillment_mode = 'produccion'",
        "(q.status = 'synced_odoo' or (q.status = 'pending_approvals' and q.commercial_decision = 'approved' and q.technical_decision = 'approved'))",
        `(q.requires_measurement = true or coalesce(q.measurement_mode, 'medidor') = 'tecnica_only' or coalesce(q.measurement_subtype, 'normal') = 'sin_medicion' or exists (select 1 from jsonb_array_elements(coalesce(q.lines, '[]'::jsonb)) elem where (elem->>'product_id') = $1))`,
      ];
      const params = [String(MEASUREMENT_PRODUCT_ID)];

      if (viewer === "medidor") {
        where.push(`coalesce(q.measurement_mode, 'medidor') <> 'tecnica_only'`);
        params.push(Number(u.user_id));
        where.push(`(q.measurement_assigned_to_user_id is null or q.measurement_assigned_to_user_id = $${params.length})`);
      }
      if (viewer === "tecnica") {
        where.push(`coalesce(q.measurement_status, 'none') <> 'commercial_review'`);
      }
      if (viewer === "comercial") {
        where.push(`coalesce(q.measurement_status, 'none') = 'commercial_review'`);
      }

      if (status !== "all") {
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

      const sql = `
        select q.*, u.username as created_by_username, u.full_name as created_by_full_name
        from public.presupuestador_quotes q
        left join public.presupuestador_users u on u.id = q.created_by_user_id
        where ${where.join(" and ")}
        order by case when q.measurement_scheduled_for is null then 1 else 0 end asc,
                 q.measurement_scheduled_for asc,
                 q.created_at desc nulls last,
                 q.id desc
        limit 300
      `;
      const r = await dbQuery(sql, params);
      res.json({ ok: true, quotes: r.rows || [] });
    } catch (e) { next(e); }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const r = await dbQuery(`select q.*, u.username as created_by_username, u.full_name as created_by_full_name from public.presupuestador_quotes q left join public.presupuestador_users u on u.id = q.created_by_user_id where q.id = $1 limit 1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!canReadMeasurement({ user: u, quote })) return res.status(403).json({ ok: false, error: "No autorizado" });
      quote.measurement_prefill = deriveMeasurementPrefill(quote);
      if (String(quote.measurement_status || "") === "commercial_review") {
        try {
          quote.measurement_commercial_preview = await previewMeasurementRevisionQuote({
            odoo,
            originalQuote: quote,
            measurementForm: quote.measurement_form || {},
          });
        } catch (e) {
          quote.measurement_commercial_preview = {
            ok: false,
            error: e?.message || "No se pudo calcular el preview comercial",
          };
        }
      }
      res.json({ ok: true, quote });
    } catch (e) { next(e); }
  });

  router.put("/:id/schedule", requireTechnicalReviewer, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const scheduledFor = normalizeDateOnly(req.body?.scheduled_for);
      if (!scheduledFor) return res.status(400).json({ ok: false, error: "Falta scheduled_for (YYYY-MM-DD)" });
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!quoteAllowsMeasurementWorkflow(quote)) return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
      const upd = await dbQuery(`update public.presupuestador_quotes set requires_measurement = true, measurement_status = case when measurement_status = 'none' then 'pending' else measurement_status end, measurement_scheduled_for = $2::date, measurement_scheduled_by_user_id = $3, measurement_scheduled_at = now() where id = $1 returning *`, [id, scheduledFor, Number(u.user_id)]);
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) { next(e); }
  });

  router.put("/:id", requireMeasurementEditor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const body = req.body || {};
      const form = body.form ?? null;
      if (!form || typeof form !== "object") return res.status(400).json({ ok: false, error: "Falta form (objeto)" });
      const submit = body.submit === true;
      const endCustomer = body.end_customer ?? null;
      const baselineForm = body.baseline_form && typeof body.baseline_form === "object"
        ? body.baseline_form
        : null;

      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!quoteAllowsMeasurementWorkflow(quote)) return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });

      const currentStatus = String(quote.measurement_status || "none").toLowerCase().trim();
      const nextCustomer = mergeEndCustomer(quote.end_customer || {}, endCustomer);
      const customerErr = validateEndCustomerForMeasurement(nextCustomer, { requireWhatsapp: submit && !!u?.is_rev_tecnica });
      if (customerErr) return res.status(400).json({ ok: false, error: customerErr });

      const isCommercialReviewer = isCommercialMeasurementReviewer({ user: u, quote });

      if (u?.is_rev_tecnica) {
        if (submit) {
          const finalDimsErr = validateFinalDimensions(form);
          if (finalDimsErr) return res.status(400).json({ ok: false, error: finalDimsErr });
          const shareToken = String(quote.measurement_share_token || makeShareToken());
          const upd = await dbQuery(
            `update public.presupuestador_quotes set requires_measurement = true, end_customer = $2::jsonb, measurement_form = $3::jsonb, measurement_status = 'approved', measurement_review_notes = null, measurement_review_by_user_id = $4, measurement_review_at = now(), measurement_share_token = coalesce($5, measurement_share_token), measurement_share_enabled_at = coalesce(measurement_share_enabled_at, now()) where id = $1 returning *`,
            [id, JSON.stringify(nextCustomer), JSON.stringify(form), Number(u.user_id), shareToken]
          );
          let savedQuote = upd.rows?.[0] || null;
          let finalization = null;
          let integradorSync = null;
          try {
            finalization = await finalizeMeasurementToRevisionQuote({
              odoo,
              originalQuote: savedQuote,
              measurementForm: form,
              approverUser: u,
            });
            const syncedOriginal = await syncOriginalQuoteFromMeasurementFinalization(id, finalization);
            if (syncedOriginal) savedQuote = { ...savedQuote, ...syncedOriginal };
            integradorSync = await upsertIntegradorPortonMinimo({ savedQuote, finalization, measurementForm: form });
          } catch (e) {
            console.error("MEASUREMENT FINALIZATION ERROR:", e?.message || e);
          }
          return res.json({ ok: true, quote: savedQuote, finalization, integradorSync });
        }
        const statusToKeep = currentStatus === "none" ? "pending" : currentStatus;
        const upd = await dbQuery(`update public.presupuestador_quotes set requires_measurement = true, end_customer = $2::jsonb, measurement_form = $3::jsonb, measurement_status = $4 where id = $1 returning *`, [id, JSON.stringify(nextCustomer), JSON.stringify(form), statusToKeep]);
        return res.json({ ok: true, quote: upd.rows?.[0] || null });
      }

      if (isCommercialReviewer) {
        if (currentStatus !== "commercial_review") {
          return res.status(409).json({ ok: false, error: "La medición no está en revisión comercial" });
        }
        const sanitizedForm = sanitizeCommercialFormUpdate({
          currentForm: quote.measurement_form || {},
          requestedForm: form,
          diffItems: quote.measurement_commercial_diff_json || [],
        });
        const nextPreview = await previewMeasurementRevisionQuote({
          odoo,
          originalQuote: quote,
          measurementForm: sanitizedForm,
        });
        const commercialStatus = submit ? "approved" : "pending";
        const nextStatus = submit ? "submitted" : "commercial_review";
        const upd = await dbQuery(
          `update public.presupuestador_quotes
              set end_customer = $2::jsonb,
                  measurement_form = $3::jsonb,
                  measurement_status = $4,
                  measurement_commercial_review_required = case when $4 = 'commercial_review' then true else false end,
                  measurement_commercial_review_status = $5,
                  measurement_commercial_review_by_user_id = $6,
                  measurement_commercial_review_at = now(),
                  measurement_review_notes = null
            where id = $1
            returning *`,
          [
            id,
            JSON.stringify(nextCustomer),
            JSON.stringify(sanitizedForm),
            nextStatus,
            commercialStatus,
            Number(u.user_id),
          ],
        );
        return res.json({
          ok: true,
          quote: upd.rows?.[0] || null,
          commercialPreview: nextPreview,
          moved_to_tecnica: submit === true,
        });
      }

      if (!u?.is_medidor) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }
      if (isTecnicaOnlyQuote(quote)) {
        return res.status(403).json({ ok: false, error: "Este portón sin medición solo puede completarlo Técnica" });
      }
      if (currentStatus === "approved") return res.status(409).json({ ok: false, error: "La medición ya fue aprobada" });
      if (currentStatus === "submitted") return res.status(409).json({ ok: false, error: "La medición ya fue enviada. Esperá la revisión técnica." });
      if (currentStatus === "commercial_review") return res.status(409).json({ ok: false, error: "La medición quedó en revisión comercial." });

      const effectiveBaselineForm =
        quote.measurement_original_form ||
        baselineForm ||
        quote.measurement_form ||
        {};
      const commercialDiff = await buildCommercialMeasurementDiff({
        baseForm: effectiveBaselineForm,
        nextForm: form,
      });
      const requiresCommercialReview = submit && commercialDiff.length > 0;
      const nextStatus = submit
        ? (requiresCommercialReview ? "commercial_review" : "submitted")
        : (currentStatus === "needs_fix" ? "needs_fix" : "pending");

      const upd = await dbQuery(
        `update public.presupuestador_quotes
            set requires_measurement = true,
                end_customer = $2::jsonb,
                measurement_form = $3::jsonb,
                measurement_original_form = coalesce(measurement_original_form, $4::jsonb),
                measurement_status = $5,
                measurement_review_notes = null,
                measurement_review_by_user_id = null,
                measurement_review_at = null,
                measurement_assigned_to_user_id = coalesce(measurement_assigned_to_user_id, $6),
                measurement_by_user_id = $6,
                measurement_at = now(),
                measurement_commercial_review_required = $7,
                measurement_commercial_review_status = $8,
                measurement_commercial_review_by_user_id = null,
                measurement_commercial_review_at = case when $7 then now() else null end,
                measurement_commercial_diff_json = $9::jsonb
          where id = $1
          returning *`,
        [
          id,
          JSON.stringify(nextCustomer),
          JSON.stringify(form),
          JSON.stringify(effectiveBaselineForm || {}),
          nextStatus,
          Number(u.user_id),
          requiresCommercialReview,
          requiresCommercialReview ? "pending" : null,
          JSON.stringify(commercialDiff),
        ],
      );
      const updatedQuote = upd.rows?.[0] || null;
      let commercialPreview = null;
      if (requiresCommercialReview) {
        commercialPreview = await previewMeasurementRevisionQuote({
          odoo,
          originalQuote: { ...(quote || {}), measurement_form: form },
          measurementForm: form,
        });
      }
      return res.json({
        ok: true,
        quote: updatedQuote,
        requiresCommercialReview,
        commercialDiff,
        commercialPreview,
      });
    } catch (e) { next(e); }
  });

  router.post("/:id/review", requireTechnicalReviewer, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const { action, notes } = req.body || {};
      const act = String(action || "").toLowerCase().trim();
      if (!["approve", "reject"].includes(act)) return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!quoteAllowsMeasurementWorkflow(quote)) return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
      if (!isTecnicaOnlyQuote(quote) && !["submitted", "approved"].includes(String(quote.measurement_status || "").toLowerCase())) {
        return res.status(409).json({ ok: false, error: "La medición no está lista para revisar" });
      }
      if (isTecnicaOnlyQuote(quote) && act === "reject") {
        return res.status(409).json({ ok: false, error: "Los portones sin medición se corrigen directamente desde Técnica" });
      }

      if (act === "approve") {
        const form = quote?.measurement_form || {};
        const finalDimsErr = validateFinalDimensions(form);
        if (finalDimsErr) return res.status(400).json({ ok: false, error: finalDimsErr });
        const shareToken = String(quote.measurement_share_token || makeShareToken());
        const upd = await dbQuery(`update public.presupuestador_quotes set measurement_status = 'approved', measurement_review_by_user_id = $2, measurement_review_at = now(), measurement_review_notes = null, measurement_share_token = coalesce($3, measurement_share_token), measurement_share_enabled_at = coalesce(measurement_share_enabled_at, now()) where id = $1 returning *`, [id, Number(u.user_id), shareToken]);
        let savedQuote = upd.rows?.[0] || null;
        let finalization = null;
        let integradorSync = null;
        try {
          finalization = await finalizeMeasurementToRevisionQuote({
            odoo,
            originalQuote: savedQuote,
            measurementForm: savedQuote?.measurement_form || {},
            approverUser: u,
          });
          const syncedOriginal = await syncOriginalQuoteFromMeasurementFinalization(id, finalization);
          if (syncedOriginal) savedQuote = { ...savedQuote, ...syncedOriginal };
          integradorSync = await upsertIntegradorPortonMinimo({
            savedQuote,
            finalization,
            measurementForm: savedQuote?.measurement_form || {},
          });
        } catch (e) {
          console.error("MEASUREMENT FINALIZATION ERROR:", e?.message || e);
        }
        return res.json({ ok: true, quote: savedQuote, finalization, integradorSync });
      }

      const msg = String(notes || "Corregir").trim();
      const upd = await dbQuery(`update public.presupuestador_quotes set measurement_status = 'needs_fix', measurement_review_by_user_id = $2, measurement_review_at = now(), measurement_review_notes = $3 where id = $1 returning *`, [id, Number(u.user_id), msg]);
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) { next(e); }
  });

  return router;
}

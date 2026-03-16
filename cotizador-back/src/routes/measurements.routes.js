import crypto from "crypto";
import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import { finalizeMeasurementToRevisionQuote } from "../measurementFinalization.js";

const MEASUREMENT_PRODUCT_ID = Number(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865);

function requireMeasurementEditor(req, res, next) {
  if (!req.user?.is_medidor && !req.user?.is_rev_tecnica) {
    return res.status(403).json({ ok: false, error: "No autorizado" });
  }
  next();
}
function requireTechnicalReviewer(req, res, next) {
  if (!req.user?.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function canReadMeasurement({ user, quote }) {
  if (!user || !quote) return false;
  const isOwner = String(quote.created_by_user_id) === String(user.user_id);
  if (isOwner) return true;
  if (user.is_enc_comercial) return true;
  if (user.is_rev_tecnica) return true;
  if (user.is_medidor) return true;
  return false;
}
function normalizeStatus(s) {
  const v = String(s || "pending").toLowerCase().trim();
  if (!["pending", "needs_fix", "submitted", "approved", "all"].includes(v)) return "pending";
  return v;
}
function normalizeViewer(v) {
  const s = String(v || "medidor").toLowerCase().trim();
  if (!["medidor", "tecnica"].includes(s)) return "medidor";
  return s;
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
  return out;
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

      const where = [
        "q.catalog_kind = 'porton'",
        "q.status = 'synced_odoo'",
        "q.fulfillment_mode = 'produccion'",
        `(q.requires_measurement = true or exists (select 1 from jsonb_array_elements(coalesce(q.lines, '[]'::jsonb)) elem where (elem->>'product_id') = $1))`,
      ];
      const params = [String(MEASUREMENT_PRODUCT_ID)];

      if (viewer === "medidor") {
        params.push(Number(u.user_id));
        where.push(`(q.measurement_assigned_to_user_id is null or q.measurement_assigned_to_user_id = $${params.length})`);
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
      if (!(quote.catalog_kind === "porton" && quote.status === "synced_odoo" && quote.fulfillment_mode === "produccion")) return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
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
      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!(quote.catalog_kind === "porton" && quote.status === "synced_odoo" && quote.fulfillment_mode === "produccion")) return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
      const currentStatus = String(quote.measurement_status || "none").toLowerCase().trim();
      if (!u?.is_rev_tecnica) {
        if (currentStatus === "approved") return res.status(409).json({ ok: false, error: "La medición ya fue aprobada" });
        if (currentStatus === "submitted") return res.status(409).json({ ok: false, error: "La medición ya fue enviada. Esperá la revisión técnica." });
      }
      const nextCustomer = mergeEndCustomer(quote.end_customer || {}, endCustomer);
      const customerErr = validateEndCustomerForMeasurement(nextCustomer, { requireWhatsapp: submit && !!u?.is_rev_tecnica });
      if (customerErr) return res.status(400).json({ ok: false, error: customerErr });

      if (u?.is_rev_tecnica) {
        if (submit) {
          const shareToken = String(quote.measurement_share_token || makeShareToken());
          const upd = await dbQuery(
            `update public.presupuestador_quotes set requires_measurement = true, end_customer = $2::jsonb, measurement_form = $3::jsonb, measurement_status = 'approved', measurement_review_notes = null, measurement_review_by_user_id = $4, measurement_review_at = now(), measurement_share_token = coalesce($5, measurement_share_token), measurement_share_enabled_at = coalesce(measurement_share_enabled_at, now()) where id = $1 returning *`,
            [id, JSON.stringify(nextCustomer), JSON.stringify(form), Number(u.user_id), shareToken]
          );
          const savedQuote = upd.rows?.[0] || null;
          let finalization = null;
          try {
            finalization = await finalizeMeasurementToRevisionQuote({
              odoo,
              originalQuote: savedQuote,
              measurementForm: form,
              approverUser: u,
            });
          } catch (e) {
            console.error("MEASUREMENT FINALIZATION ERROR:", e?.message || e);
          }
          return res.json({ ok: true, quote: savedQuote, finalization });
        }
        const statusToKeep = currentStatus === "none" ? "submitted" : currentStatus;
        const upd = await dbQuery(`update public.presupuestador_quotes set requires_measurement = true, end_customer = $2::jsonb, measurement_form = $3::jsonb, measurement_status = $4 where id = $1 returning *`, [id, JSON.stringify(nextCustomer), JSON.stringify(form), statusToKeep]);
        return res.json({ ok: true, quote: upd.rows?.[0] || null });
      }

      const nextStatus = submit ? "submitted" : (currentStatus === "needs_fix" ? "needs_fix" : "pending");
      const upd = await dbQuery(`update public.presupuestador_quotes set requires_measurement = true, end_customer = $2::jsonb, measurement_form = $3::jsonb, measurement_status = $4, measurement_review_notes = null, measurement_review_by_user_id = null, measurement_review_at = null, measurement_assigned_to_user_id = coalesce(measurement_assigned_to_user_id, $5), measurement_by_user_id = $5, measurement_at = now() where id = $1 returning *`, [id, JSON.stringify(nextCustomer), JSON.stringify(form), nextStatus, Number(u.user_id)]);
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
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
      if (!["submitted", "approved"].includes(String(quote.measurement_status || "").toLowerCase())) return res.status(409).json({ ok: false, error: "La medición no está lista para revisar" });

      if (act === "approve") {
        const shareToken = String(quote.measurement_share_token || makeShareToken());
        const upd = await dbQuery(`update public.presupuestador_quotes set measurement_status = 'approved', measurement_review_by_user_id = $2, measurement_review_at = now(), measurement_review_notes = null, measurement_share_token = coalesce($3, measurement_share_token), measurement_share_enabled_at = coalesce(measurement_share_enabled_at, now()) where id = $1 returning *`, [id, Number(u.user_id), shareToken]);
        const savedQuote = upd.rows?.[0] || null;
        let finalization = null;
        try {
          finalization = await finalizeMeasurementToRevisionQuote({
            odoo,
            originalQuote: savedQuote,
            measurementForm: savedQuote?.measurement_form || {},
            approverUser: u,
          });
        } catch (e) {
          console.error("MEASUREMENT FINALIZATION ERROR:", e?.message || e);
        }
        return res.json({ ok: true, quote: savedQuote, finalization });
      }

      const msg = String(notes || "Corregir").trim();
      const upd = await dbQuery(`update public.presupuestador_quotes set measurement_status = 'needs_fix', measurement_review_by_user_id = $2, measurement_review_at = now(), measurement_review_notes = $3 where id = $1 returning *`, [id, Number(u.user_id), msg]);
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) { next(e); }
  });

  return router;
}

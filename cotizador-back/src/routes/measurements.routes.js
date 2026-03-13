import crypto from "crypto";
import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";

const MEASUREMENT_PRODUCT_ID = Number(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865);

function requireMedidor(req, res, next) {
  if (!req.user?.is_medidor) return res.status(403).json({ ok: false, error: "No autorizado" });
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

export function buildMeasurementsRouter() {
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

      const where = [
        "q.catalog_kind = 'porton'",
        "q.status = 'synced_odoo'",
        "q.fulfillment_mode = 'produccion'",
        `(
          q.requires_measurement = true
          or exists (
            select 1
            from jsonb_array_elements(coalesce(q.lines, '[]'::jsonb)) elem
            where (elem->>'product_id') = $1
          )
        )`,
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
        where.push(`(
          coalesce(q.end_customer->>'city', '') ilike $${params.length}
          or coalesce(q.end_customer->>'address', '') ilike $${params.length}
        )`);
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
        order by
          case when q.measurement_scheduled_for is null then 1 else 0 end asc,
          q.measurement_scheduled_for asc,
          q.created_at desc nulls last,
          q.id desc
        limit 300
      `;

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
        `
        select q.*, u.username as created_by_username, u.full_name as created_by_full_name
        from public.presupuestador_quotes q
        left join public.presupuestador_users u on u.id = q.created_by_user_id
        where q.id = $1
        limit 1
        `,
        [id]
      );
      const quote = r.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (!canReadMeasurement({ user: u, quote })) return res.status(403).json({ ok: false, error: "No autorizado" });

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

      if (!(quote.catalog_kind === "porton" && quote.status === "synced_odoo" && quote.fulfillment_mode === "produccion")) {
        return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
      }

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set requires_measurement = true,
            measurement_status = case when measurement_status = 'none' then 'pending' else measurement_status end,
            measurement_scheduled_for = $2::date,
            measurement_scheduled_by_user_id = $3,
            measurement_scheduled_at = now()
        where id = $1
        returning *
        `,
        [id, scheduledFor, Number(u.user_id)]
      );

      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) {
      next(e);
    }
  });

  router.put("/:id", requireMedidor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });

      const body = req.body || {};
      const form = body.form ?? null;
      if (!form || typeof form !== "object") return res.status(400).json({ ok: false, error: "Falta form (objeto)" });

      const submit = body.submit === true;

      const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });

      if (!(quote.catalog_kind === "porton" && quote.status === "synced_odoo" && quote.fulfillment_mode === "produccion")) {
        return res.status(400).json({ ok: false, error: "Este presupuesto no requiere medición" });
      }

      const st = quote.measurement_status || "none";
      if (st === "approved") return res.status(409).json({ ok: false, error: "La medición ya fue aprobada" });
      if (st === "submitted" && !quote.measurement_review_notes) {
        return res.status(409).json({ ok: false, error: "La medición ya fue enviada. Esperá la revisión." });
      }
      if (st === "submitted" && quote.measurement_status !== "needs_fix") {
        return res.status(409).json({ ok: false, error: "La medición ya fue enviada. Esperá la revisión." });
      }

      const nextStatus = submit ? "submitted" : "pending";
      const nextShareToken = submit ? String(quote.measurement_share_token || makeShareToken()) : null;

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set requires_measurement = true,
            measurement_form = $2::jsonb,
            measurement_status = $3,
            measurement_review_notes = null,
            measurement_review_by_user_id = null,
            measurement_review_at = null,
            measurement_assigned_to_user_id = coalesce(measurement_assigned_to_user_id, $4),
            measurement_by_user_id = $4,
            measurement_at = now(),
            measurement_share_token = coalesce($5, measurement_share_token),
            measurement_share_enabled_at = case
              when $6::boolean = true then coalesce(measurement_share_enabled_at, now())
              else measurement_share_enabled_at
            end
        where id = $1
        returning *
        `,
        [id, JSON.stringify(form), nextStatus, Number(u.user_id), nextShareToken, submit]
      );

      res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/review", async (req, res, next) => {
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

      const isOwner = String(quote.created_by_user_id) === String(u.user_id);
      const isSeller = !!(u.is_vendedor || u.is_distribuidor);
      if (!isOwner || !isSeller) return res.status(403).json({ ok: false, error: "No autorizado" });

      if (quote.measurement_status !== "submitted") {
        return res.status(409).json({ ok: false, error: "La medición no está lista para revisar" });
      }

      if (act === "approve") {
        const upd = await dbQuery(
          `
          update public.presupuestador_quotes
          set measurement_status = 'approved',
              measurement_review_by_user_id = $2,
              measurement_review_at = now(),
              measurement_review_notes = null
          where id = $1
          returning *
          `,
          [id, Number(u.user_id)]
        );
        return res.json({ ok: true, quote: upd.rows?.[0] || null });
      }

      const msg = String(notes || "Corregir").trim();
      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set measurement_status = 'needs_fix',
            measurement_review_by_user_id = $2,
            measurement_review_at = now(),
            measurement_review_notes = $3
        where id = $1
        returning *
        `,
        [id, Number(u.user_id), msg]
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

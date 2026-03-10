import crypto from "crypto";
import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";

function requireMedidor(req, res, next) {
  if (!req.user?.is_medidor) return res.status(403).json({ ok: false, error: "No autorizado" });
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

  router.get("/", requireMedidor, async (req, res, next) => {
    try {
      const u = req.user;
      const status = normalizeStatus(req.query.status || "pending");
      const q = String(req.query.q || "").trim();

      const where = [
        "q.catalog_kind = 'porton'",
        "q.status = 'synced_odoo'",
        "q.fulfillment_mode = 'produccion'",
        "q.requires_measurement = true",
        "(q.measurement_assigned_to_user_id is null or q.measurement_assigned_to_user_id = $1)",
      ];
      const params = [Number(u.user_id)];

      if (status !== "all") {
        params.push(status);
        where.push(`q.measurement_status = $${params.length}`);
      } else {
        where.push(`q.measurement_status <> 'none'`);
      }

      if (q) {
        params.push(`%${q}%`);
        where.push(`(q.end_customer->>'name') ilike $${params.length}`);
      }

      const sql = `
        select q.*, u.username as created_by_username, u.full_name as created_by_full_name
        from public.presupuestador_quotes q
        left join public.presupuestador_users u on u.id = q.created_by_user_id
        where ${where.join(" and ")}
        order by q.id desc
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

import express from "express";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import { getTechnicalMeasurementRules } from "../settingsDb.js";

function isShareToken(v) {
  const s = String(v || "").trim();
  return /^[a-zA-Z0-9_-]{24,128}$/.test(s);
}
function text(v) {
  return String(v ?? "").trim();
}
function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}
function payloadWithoutInternalKeys(payload = {}) {
  const next = { ...(payload || {}) };
  return next;
}
async function resolveMeasurementForm(quote) {
  let form = quote?.measurement_form || null;

  if (!form && quote?.measurement_source_quote_id) {
    const src = String(quote.measurement_source_quote_id || "").trim();
    if (src) {
      const r2 = await dbQuery(`select measurement_form from public.presupuestador_quotes where id=$1 limit 1`, [src]);
      form = r2.rows?.[0]?.measurement_form || null;
    }
  }

  if (!form && quote?.original_quote_id) {
    const src = String(quote.original_quote_id || "").trim();
    if (src) {
      const r3 = await dbQuery(`select measurement_form from public.presupuestador_quotes where id=$1 limit 1`, [src]);
      form = r3.rows?.[0]?.measurement_form || null;
    }
  }

  return form;
}
function buildAcceptanceFromPayload(payload = {}) {
  const acceptance = payload?.measurement_client_acceptance;
  if (!acceptance || typeof acceptance !== "object") return null;
  return {
    full_name: text(acceptance.full_name),
    dni: text(acceptance.dni),
    accepted_at: acceptance.accepted_at || null,
  };
}

export function buildClientAcceptanceRouter() {
  const router = express.Router();

  router.use(async (_req, _res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      next();
    } catch (e) {
      next(e);
    }
  });

  router.get("/:token", async (req, res, next) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!isShareToken(token)) return res.status(400).json({ ok: false, error: "token inválido" });

      const r = await dbQuery(
        `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
           from public.presupuestador_quotes q
           left join public.presupuestador_users u on u.id = q.created_by_user_id
          where q.measurement_share_token = $1
            and q.measurement_share_enabled_at is not null
          limit 1`,
        [token],
      );
      const quote = r.rows?.[0] || null;
      if (!quote) return res.status(404).json({ ok: false, error: "Aceptación no encontrada" });

      const measurementForm = await resolveMeasurementForm(quote);
      if (!measurementForm) return res.status(404).json({ ok: false, error: "Datos técnicos no disponibles" });

      const technicalRules = await getTechnicalMeasurementRules().catch(() => ({}));
      const acceptance = buildAcceptanceFromPayload(quote?.payload || {});
      return res.json({
        ok: true,
        quote: {
          ...quote,
          measurement_form: measurementForm,
          payload: payloadWithoutInternalKeys(quote?.payload || {}),
          technical_rules: technicalRules || {},
        },
        acceptance,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:token/accept", async (req, res, next) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!isShareToken(token)) return res.status(400).json({ ok: false, error: "token inválido" });

      const fullName = text(req.body?.full_name);
      const dni = digitsOnly(req.body?.dni);
      if (!fullName) return res.status(400).json({ ok: false, error: "Falta nombre completo" });
      if (!dni || dni.length < 7) return res.status(400).json({ ok: false, error: "Falta DNI válido" });

      const cur = await dbQuery(
        `select * from public.presupuestador_quotes
          where measurement_share_token = $1
            and measurement_share_enabled_at is not null
          limit 1`,
        [token],
      );
      const quote = cur.rows?.[0] || null;
      if (!quote) return res.status(404).json({ ok: false, error: "Aceptación no encontrada" });

      const currentPayload = quote?.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
      const existingAcceptance = buildAcceptanceFromPayload(currentPayload);
      if (existingAcceptance?.accepted_at) {
        return res.json({ ok: true, acceptance: existingAcceptance, already_accepted: true });
      }

      currentPayload.measurement_client_acceptance = {
        full_name: fullName,
        dni,
        accepted_at: new Date().toISOString(),
      };

      const upd = await dbQuery(
        `update public.presupuestador_quotes
            set payload = $2::jsonb
          where id = $1
          returning payload`,
        [quote.id, JSON.stringify(currentPayload)],
      );
      const acceptance = buildAcceptanceFromPayload(upd.rows?.[0]?.payload || currentPayload);
      return res.json({ ok: true, acceptance });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

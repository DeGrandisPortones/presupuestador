import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";

function requireSuperuser(req, res, next) {
  if (!req.user?.is_superuser) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function toText(value) {
  return String(value ?? "").trim();
}
function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function normalizeRef(value) {
  return toText(value).toUpperCase();
}
function stripReferencePrefix(value) {
  return normalizeRef(value).replace(/^(NP|NV|S)+/i, "");
}
function quoteReferenceLabel(quote) {
  const nv = toText(quote?.final_sale_order_name);
  if (nv) return nv;
  const np = toText(quote?.odoo_sale_order_name);
  if (np) return np;
  const number = quote?.quote_number === null || quote?.quote_number === undefined ? "" : String(quote.quote_number).trim();
  return number ? `NP${number}` : String(quote?.id || "").slice(0, 8);
}
function customerName(quote) {
  return toText(quote?.end_customer?.name);
}
function pushEvent(out, {
  at,
  type,
  title,
  description = "",
  quoteId = null,
  reference = "",
  customer = "",
}) {
  const when = toText(at);
  if (!when) return;
  out.push({
    key: `${type}-${quoteId || "noquote"}-${when}`,
    at: when,
    type,
    title,
    description,
    quote_id: quoteId,
    reference,
    customer,
  });
}
function formatMode(value) {
  return String(value || "").toLowerCase().trim() === "acopio" ? "Acopio" : "Producción";
}
function buildTechnicalSnapshot(quote, finalCopy = null) {
  const measurementForm = quote?.measurement_form && typeof quote.measurement_form === "object" ? quote.measurement_form : {};
  const dimensions = finalCopy?.payload?.dimensions || quote?.payload?.dimensions || {};
  return {
    measurement_form: measurementForm,
    budget_dimensions: dimensions,
    alto_final_mm: toText(measurementForm?.alto_final_mm),
    ancho_final_mm: toText(measurementForm?.ancho_final_mm),
    cantidad_parantes: toText(measurementForm?.cantidad_parantes || dimensions?.cantidad_parantes),
    orientacion_parantes: toText(measurementForm?.orientacion_parantes || dimensions?.orientacion_parantes),
    distribucion_parantes: toText(measurementForm?.distribucion_parantes || dimensions?.distribucion_parantes),
    observaciones_parantes: toText(measurementForm?.observaciones_parantes || dimensions?.observaciones_parantes),
    observaciones_medicion: toText(measurementForm?.observaciones_medicion),
  };
}
function buildTimeline({ originalQuote, finalCopies = [], linkedDoors = [] }) {
  const out = [];
  const originalRef = quoteReferenceLabel(originalQuote);
  const customer = customerName(originalQuote);

  pushEvent(out, {
    at: originalQuote?.created_at,
    type: "quote_saved",
    title: "Presupuesto guardado",
    description: `Cliente: ${customer || "—"} · Modo: ${formatMode(originalQuote?.fulfillment_mode)}`,
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });
  pushEvent(out, {
    at: originalQuote?.confirmed_at,
    type: "quote_confirmed",
    title: "Presupuesto confirmado",
    description: `Se envió a aprobación inicial.`,
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });
  pushEvent(out, {
    at: originalQuote?.commercial_at,
    type: "commercial_approved",
    title: "Aprobación comercial",
    description: toText(originalQuote?.commercial_notes) || "Aprobado comercialmente.",
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });
  pushEvent(out, {
    at: originalQuote?.technical_at,
    type: "technical_approved",
    title: "Aprobación técnica",
    description: toText(originalQuote?.technical_notes) || "Aprobado técnicamente.",
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });
  pushEvent(out, {
    at: originalQuote?.measurement_scheduled_at,
    type: "measurement_scheduled",
    title: "Medición asignada",
    description: toText(originalQuote?.measurement_scheduled_for)
      ? `Fecha asignada: ${originalQuote.measurement_scheduled_for}`
      : "Se asignó fecha de medición.",
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });
  pushEvent(out, {
    at: originalQuote?.measurement_at,
    type: "measurement_completed",
    title: "Medición realizada",
    description: toText(originalQuote?.measurement_status) || "Medición completada.",
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });
  pushEvent(out, {
    at: originalQuote?.measurement_review_at,
    type: "measurement_review",
    title: (
      String(originalQuote?.measurement_status || "").toLowerCase().trim() === "approved"
        ? "Revisión técnica final aprobada"
        : String(originalQuote?.measurement_status || "").toLowerCase().trim() === "returned_to_seller"
          ? "Medición devuelta al vendedor"
          : "Revisión de medición"
    ),
    description: toText(originalQuote?.measurement_review_notes) || "Se revisó la medición.",
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });
  pushEvent(out, {
    at: originalQuote?.acopio_to_produccion_requested_at,
    type: "acopio_requested",
    title: "Solicitud de salida de acopio",
    description: toText(originalQuote?.acopio_to_produccion_notes) || "Se solicitó pasar el portón a producción.",
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });

  for (const copy of (Array.isArray(finalCopies) ? finalCopies : [])) {
    const copyRef = toText(copy?.final_sale_order_name) || quoteReferenceLabel(originalQuote);
    pushEvent(out, {
      at: copy?.created_at,
      type: "revision_created",
      title: "Ajuste creado",
      description: "Se creó una revisión / presupuesto final.",
      quoteId: copy?.id,
      reference: copyRef,
      customer,
    });
    pushEvent(out, {
      at: copy?.final_synced_at,
      type: "final_nv_generated",
      title: "NV final generada",
      description: copy?.final_sale_order_name
        ? `Se generó ${copy.final_sale_order_name} en Odoo.`
        : "Se generó la NV final en Odoo.",
      quoteId: copy?.id,
      reference: copyRef,
      customer,
    });
  }

  for (const door of (Array.isArray(linkedDoors) ? linkedDoors : [])) {
    pushEvent(out, {
      at: door?.created_at,
      type: "linked_door_created",
      title: "Puerta vinculada creada",
      description: toText(door?.door_code) || "Puerta vinculada al portón.",
      quoteId: originalQuote?.id,
      reference: originalRef,
      customer,
    });
  }

  const acceptance = originalQuote?.payload?.measurement_client_acceptance || finalCopies?.[0]?.payload?.measurement_client_acceptance || null;
  pushEvent(out, {
    at: acceptance?.accepted_at,
    type: "client_acceptance",
    title: "Aceptación del cliente",
    description: [
      toText(acceptance?.full_name) ? `Nombre: ${acceptance.full_name}` : "",
      toText(acceptance?.dni) ? `DNI: ${acceptance.dni}` : "",
    ].filter(Boolean).join(" · "),
    quoteId: originalQuote?.id,
    reference: originalRef,
    customer,
  });

  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
function buildActionTimelineForUser({ userRow, originalQuotes = [], copyQuotes = [] }) {
  const actions = [];

  for (const quote of (Array.isArray(originalQuotes) ? originalQuotes : [])) {
    const reference = quoteReferenceLabel(quote);
    const customer = customerName(quote);
    pushEvent(actions, {
      at: quote?.created_at,
      type: "quote_saved",
      title: "Presupuesto guardado",
      description: `Cliente: ${customer || "—"} · ${formatMode(quote?.fulfillment_mode)} · ${String(quote?.catalog_kind || "porton")}`,
      quoteId: quote?.id,
      reference,
      customer,
    });
    pushEvent(actions, {
      at: quote?.confirmed_at,
      type: "quote_confirmed",
      title: "Presupuesto confirmado",
      description: `Se confirmó ${reference}.`,
      quoteId: quote?.id,
      reference,
      customer,
    });
    pushEvent(actions, {
      at: quote?.acopio_to_produccion_requested_at,
      type: "acopio_requested",
      title: "Portón solicitado para salir de acopio",
      description: toText(quote?.acopio_to_produccion_notes) || `Pedido ${reference}.`,
      quoteId: quote?.id,
      reference,
      customer,
    });
  }

  for (const quote of (Array.isArray(copyQuotes) ? copyQuotes : [])) {
    const parentReference = toText(quote?.parent_odoo_sale_order_name) || quoteReferenceLabel(quote);
    const customer = customerName(quote);
    pushEvent(actions, {
      at: quote?.created_at,
      type: "revision_created",
      title: "Ajuste creado",
      description: `Sobre ${parentReference}.`,
      quoteId: quote?.id,
      reference: parentReference,
      customer,
    });
  }

  return actions.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function buildQuoteViewerRouter() {
  const router = express.Router();

  router.use(requireAuth);
  router.use(requireSuperuser);

  router.get("/search", async (req, res, next) => {
    try {
      const ref = toText(req.query.ref);
      if (!ref) return res.status(400).json({ ok: false, error: "Falta ref" });

      const refLike = `%${normalizeRef(ref)}%`;
      const refCore = stripReferencePrefix(ref);
      const coreLike = refCore ? `%${refCore}%` : refLike;

      const q = await dbQuery(
        `
        select distinct on (orig.id)
               orig.id,
               orig.quote_number,
               orig.odoo_sale_order_name,
               orig.final_sale_order_name,
               orig.status,
               orig.final_status,
               orig.fulfillment_mode,
               orig.created_at,
               orig.confirmed_at,
               orig.end_customer,
               fc.final_copy_id,
               fc.final_copy_status,
               fc.final_copy_sale_order_name
          from public.presupuestador_quotes cand
          join public.presupuestador_quotes orig
            on orig.id = case
              when cand.quote_kind = 'copy' and cand.parent_quote_id is not null then cand.parent_quote_id
              else cand.id
            end
          left join lateral (
            select c.id as final_copy_id,
                   c.final_status as final_copy_status,
                   c.final_sale_order_name as final_copy_sale_order_name
              from public.presupuestador_quotes c
             where c.quote_kind = 'copy'
               and c.parent_quote_id = orig.id
             order by c.created_at desc nulls last, c.id desc
             limit 1
          ) fc on true
         where orig.quote_kind = 'original'
           and orig.catalog_kind = 'porton'
           and (
             upper(coalesce(orig.odoo_sale_order_name, '')) like $1
             or upper(coalesce(orig.final_sale_order_name, '')) like $1
             or upper(coalesce(fc.final_copy_sale_order_name, '')) like $1
             or upper(coalesce(cand.odoo_sale_order_name, '')) like $1
             or upper(coalesce(cand.final_sale_order_name, '')) like $1
             or cast(coalesce(orig.quote_number, 0) as text) like $2
             or cast(coalesce(cand.quote_number, 0) as text) like $2
           )
         order by orig.id, orig.created_at desc nulls last
         limit 100
        `,
        [refLike, coreLike],
      );

      const quotes = (q.rows || []).map((row) => ({
        ...row,
        customer_name: customerName(row),
        reference: quoteReferenceLabel(row),
      }));

      return res.json({ ok: true, quotes });
    } catch (e) {
      next(e);
    }
  });

  router.get("/history/:id", async (req, res, next) => {
    try {
      const quoteId = req.params.id;
      const q = await dbQuery(
        `
        select q.*,
               u.username as created_by_username,
               u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
         where q.id = $1
           and q.quote_kind = 'original'
         limit 1
        `,
        [quoteId],
      );
      const originalQuote = q.rows?.[0] || null;
      if (!originalQuote) return res.status(404).json({ ok: false, error: "Portón no encontrado" });

      const copiesQ = await dbQuery(
        `
        select c.*
          from public.presupuestador_quotes c
         where c.quote_kind = 'copy'
           and c.parent_quote_id = $1
         order by c.created_at asc nulls last, c.id asc
        `,
        [quoteId],
      );
      const finalCopies = copiesQ.rows || [];
      const latestFinalCopy = finalCopies.length ? finalCopies[finalCopies.length - 1] : null;

      const doorsQ = await dbQuery(
        `
        select d.id,
               d.door_code,
               d.status,
               d.odoo_sale_order_name,
               d.odoo_purchase_order_name,
               d.created_at,
               d.record
          from public.presupuestador_doors d
         where d.linked_quote_id = $1
         order by d.created_at asc nulls last, d.id asc
        `,
        [quoteId],
      );
      const linkedDoors = doorsQ.rows || [];

      const response = {
        original_quote: originalQuote,
        final_copy: latestFinalCopy,
        final_copies: finalCopies,
        linked_doors: linkedDoors,
        seller: {
          user_id: originalQuote.created_by_user_id,
          role: originalQuote.created_by_role,
          username: toText(originalQuote.created_by_username),
          full_name: toText(originalQuote.created_by_full_name),
        },
        customer: originalQuote.end_customer || {},
        technical: buildTechnicalSnapshot(originalQuote, latestFinalCopy),
        timeline: buildTimeline({ originalQuote, finalCopies, linkedDoors }),
      };

      return res.json({ ok: true, history: response });
    } catch (e) {
      next(e);
    }
  });

  router.get("/activity/users", async (_req, res, next) => {
    try {
      const q = await dbQuery(
        `
        select id,
               username,
               full_name,
               coalesce(is_active, true) as is_active,
               coalesce(is_vendedor, false) as is_vendedor,
               coalesce(is_distribuidor, false) as is_distribuidor
          from public.presupuestador_users
         where coalesce(is_vendedor, false) = true
            or coalesce(is_distribuidor, false) = true
         order by coalesce(full_name, username), username
        `,
        [],
      );
      return res.json({ ok: true, users: q.rows || [] });
    } catch (e) {
      next(e);
    }
  });

  router.get("/activity/:userId", async (req, res, next) => {
    try {
      const userId = toInt(req.params.userId);
      if (!userId) return res.status(400).json({ ok: false, error: "userId inválido" });

      const userQ = await dbQuery(
        `
        select id,
               username,
               full_name,
               coalesce(is_active, true) as is_active,
               coalesce(is_vendedor, false) as is_vendedor,
               coalesce(is_distribuidor, false) as is_distribuidor
          from public.presupuestador_users
         where id = $1
         limit 1
        `,
        [userId],
      );
      const userRow = userQ.rows?.[0] || null;
      if (!userRow) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

      const originalQ = await dbQuery(
        `
        select q.*
          from public.presupuestador_quotes q
         where q.quote_kind = 'original'
           and q.created_by_user_id = $1
           and q.catalog_kind = 'porton'
         order by q.created_at desc nulls last, q.id desc
         limit 1000
        `,
        [userId],
      );
      const originalQuotes = originalQ.rows || [];

      const copyQ = await dbQuery(
        `
        select c.*,
               p.odoo_sale_order_name as parent_odoo_sale_order_name,
               p.quote_number as parent_quote_number,
               p.end_customer as parent_end_customer
          from public.presupuestador_quotes c
          left join public.presupuestador_quotes p on p.id = c.parent_quote_id
         where c.quote_kind = 'copy'
           and c.created_by_user_id = $1
           and coalesce(c.catalog_kind, 'porton') = 'porton'
         order by c.created_at desc nulls last, c.id desc
         limit 1000
        `,
        [userId],
      );
      const copyQuotes = copyQ.rows || [];

      const summary = {
        saved_quotes: originalQuotes.length,
        confirmed_quotes: originalQuotes.filter((quote) => toText(quote.confirmed_at)).length,
        acopio_requests: originalQuotes.filter((quote) => toText(quote.acopio_to_produccion_requested_at)).length,
        created_revisions: copyQuotes.length,
        pending_measurements: originalQuotes.filter((quote) => String(quote.measurement_status || "").toLowerCase().trim() === "pending").length,
        returned_measurements: originalQuotes.filter((quote) => String(quote.measurement_status || "").toLowerCase().trim() === "returned_to_seller").length,
      };

      const actions = buildActionTimelineForUser({ userRow, originalQuotes, copyQuotes });

      return res.json({
        ok: true,
        activity: {
          user: userRow,
          summary,
          actions,
          original_quotes: originalQuotes.slice(0, 200).map((quote) => ({
            id: quote.id,
            quote_number: quote.quote_number,
            odoo_sale_order_name: quote.odoo_sale_order_name,
            final_sale_order_name: quote.final_sale_order_name,
            customer_name: customerName(quote),
            fulfillment_mode: quote.fulfillment_mode,
            status: quote.status,
            measurement_status: quote.measurement_status,
            created_at: quote.created_at,
            confirmed_at: quote.confirmed_at,
            acopio_to_produccion_requested_at: quote.acopio_to_produccion_requested_at,
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

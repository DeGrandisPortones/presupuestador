import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";

function requireSuperuser(req, res, next) {
  if (!req.user?.is_superuser) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function text(v) { return String(v ?? "").trim(); }
function upper(v) { return text(v).toUpperCase(); }
function digitsOnly(v) { return String(v || "").replace(/\D+/g, ""); }
function isUuid(v) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(v || "").trim());
}
function toDateIso(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
function safeJson(obj) {
  return obj && typeof obj === "object" ? obj : {};
}
function normalizeDecision(value) {
  const raw = String(value || "pending").toLowerCase().trim();
  if (raw === "approved") return "Aprobado";
  if (raw === "rejected") return "Rechazado";
  return "Pendiente";
}
function normalizeMeasurementStatus(value) {
  const raw = String(value || "none").toLowerCase().trim();
  const map = {
    none: "Sin medición",
    pending: "Pendiente",
    submitted: "En revisión técnica final",
    approved: "Aprobada",
    needs_fix: "A corregir",
    returned_to_seller: "Devuelta al vendedor",
  };
  return map[raw] || raw || "—";
}
function fulfillmentLabel(value) {
  return String(value || "").toLowerCase().trim() === "acopio" ? "Acopio" : "Producción";
}
function currentStateLabel(original, finalCopy) {
  if (text(finalCopy?.final_sale_order_name || original?.final_sale_order_name)) return "NV emitida";
  if (String(original?.measurement_status || "").toLowerCase() === "approved") return "Revisión técnica final aprobada";
  if (String(original?.measurement_status || "").toLowerCase() === "submitted") return "Pendiente de revisión técnica final";
  if (String(original?.measurement_status || "").toLowerCase() === "returned_to_seller") return "Pendiente por cambios postmedición";
  if (String(original?.status || "").toLowerCase() === "synced_odoo") return "NP emitida";
  if (String(original?.status || "").toLowerCase() === "pending_approvals") return "En aprobaciones";
  return text(original?.status) || "—";
}
function buildReferenceVariants(reference) {
  const clean = upper(reference).replace(/\s+/g, "");
  const digits = digitsOnly(clean);
  const variants = new Set();
  if (clean) variants.add(clean);
  if (digits) {
    variants.add(digits);
    variants.add(`NP${digits}`);
    variants.add(`NV${digits}`);
    variants.add(`S${digits}`);
  }
  return [...variants].filter(Boolean);
}
async function getOriginalQuoteById(id) {
  const r = await dbQuery(
    `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
       from public.presupuestador_quotes q
       left join public.presupuestador_users u on u.id = q.created_by_user_id
      where q.id=$1 and q.quote_kind='original'
      limit 1`,
    [id],
  );
  return r.rows?.[0] || null;
}
async function getFinalCopyForOriginal(originalId) {
  const r = await dbQuery(
    `select q.*, u.username as created_by_username, u.full_name as created_by_full_name
       from public.presupuestador_quotes q
       left join public.presupuestador_users u on u.id = q.created_by_user_id
      where q.quote_kind='copy' and q.parent_quote_id=$1
      order by q.created_at desc nulls last, q.id desc
      limit 1`,
    [originalId],
  );
  return r.rows?.[0] || null;
}
async function getLinkedDoors(originalId) {
  const r = await dbQuery(
    `select d.*, u.username as created_by_username, u.full_name as created_by_full_name
       from public.presupuestador_doors d
       left join public.presupuestador_users u on u.id = d.created_by_user_id
      where d.linked_quote_id=$1
      order by d.id desc`,
    [originalId],
  );
  return r.rows || [];
}
async function findMatchingOriginalIds(reference) {
  const variants = buildReferenceVariants(reference);
  if (!variants.length) return [];
  const likeNeedle = `%${variants[0]}%`;
  const digits = digitsOnly(reference);
  const params = [variants, digits || null, likeNeedle];
  const r = await dbQuery(
    `with original_hits as (
       select q.id as original_id,
              case
                when upper(coalesce(q.odoo_sale_order_name, '')) = any($1::text[]) then 'np'
                when upper(coalesce(q.final_sale_order_name, '')) = any($1::text[]) then 'nv_directa'
                when coalesce(q.quote_number::text, '') = any($1::text[]) then 'numero'
                else 'referencia'
              end as match_type
         from public.presupuestador_quotes q
        where q.quote_kind='original'
          and (
            upper(coalesce(q.odoo_sale_order_name, '')) = any($1::text[])
            or upper(coalesce(q.final_sale_order_name, '')) = any($1::text[])
            or coalesce(q.quote_number::text, '') = any($1::text[])
            or upper(coalesce(q.odoo_sale_order_name, '')) like $3
            or upper(coalesce(q.final_sale_order_name, '')) like $3
          )
       union all
       select q.parent_quote_id as original_id,
              case
                when upper(coalesce(q.final_sale_order_name, '')) = any($1::text[]) then 'nv'
                when coalesce(q.quote_number::text, '') = any($1::text[]) then 'numero_copia'
                else 'referencia_copia'
              end as match_type
         from public.presupuestador_quotes q
        where q.quote_kind='copy'
          and q.parent_quote_id is not null
          and (
            upper(coalesce(q.final_sale_order_name, '')) = any($1::text[])
            or coalesce(q.quote_number::text, '') = any($1::text[])
            or upper(coalesce(q.final_sale_order_name, '')) like $3
          )
      )
      select distinct on (original_id) original_id, match_type
        from original_hits
       where original_id is not null
       order by original_id,
         case match_type
           when 'np' then 1
           when 'nv' then 2
           when 'nv_directa' then 3
           when 'numero' then 4
           when 'numero_copia' then 5
           else 9
         end`,
    params,
  );
  return r.rows || [];
}
function buildDocuments(original, finalCopy) {
  return {
    presupuesto_original: text(original?.odoo_sale_order_name) || (original?.quote_number ? `NP${original.quote_number}` : ""),
    venta_final:
      text(finalCopy?.final_sale_order_name) ||
      text(original?.final_sale_order_name) ||
      "",
    numero_interno: text(original?.quote_number),
    presupuesto_id: text(original?.id),
    ajuste_final_id: text(finalCopy?.id),
  };
}
function buildTechnicalData(original, finalCopy) {
  const payload = safeJson(original?.payload);
  const dims = safeJson(payload?.dimensions);
  const form = safeJson(original?.measurement_form);
  const acceptance = safeJson(payload?.measurement_client_acceptance);
  return {
    ancho_presupuestado_m: dims?.width ?? "",
    alto_presupuestado_m: dims?.height ?? "",
    cantidad_parantes: form?.cantidad_parantes ?? dims?.cantidad_parantes ?? "",
    orientacion_parantes: form?.orientacion_parantes ?? dims?.orientacion_parantes ?? "",
    distribucion_parantes: form?.distribucion_parantes ?? dims?.distribucion_parantes ?? "",
    observaciones_parantes: form?.observaciones_parantes ?? dims?.observaciones_parantes ?? "",
    alto_final_mm: form?.alto_final_mm ?? "",
    ancho_final_mm: form?.ancho_final_mm ?? "",
    observaciones_medicion: form?.observaciones_medicion ?? "",
    fecha_medicion: form?.fecha ?? "",
    fecha_nota_pedido: form?.fecha_nota_pedido ?? "",
    acceptance_full_name: acceptance?.full_name ?? "",
    acceptance_dni: acceptance?.dni ?? "",
    acceptance_at: acceptance?.accepted_at ?? "",
    measurement_form: form,
    payload_dimensions: dims,
    final_copy_lines: Array.isArray(finalCopy?.lines) ? finalCopy.lines : [],
  };
}
function pushEvent(events, when, title, description, section = "general") {
  const iso = toDateIso(when);
  if (!iso) return;
  events.push({ when: iso, title, description: text(description), section });
}
function buildTimeline(original, finalCopy, doors) {
  const events = [];
  pushEvent(events, original?.created_at, "Presupuesto creado", `Creado por ${text(original?.created_by_full_name || original?.created_by_username || "—")}`, "comercial");
  pushEvent(events, original?.confirmed_at, "Presupuesto confirmado", `Destino: ${fulfillmentLabel(original?.fulfillment_mode)}`, "comercial");
  pushEvent(events, original?.commercial_at, `Aprobación comercial: ${normalizeDecision(original?.commercial_decision)}`, original?.commercial_notes, "aprobaciones");
  pushEvent(events, original?.technical_at, `Aprobación técnica: ${normalizeDecision(original?.technical_decision)}`, original?.technical_notes, "aprobaciones");
  pushEvent(events, original?.measurement_scheduled_at, "Fecha de medición asignada", original?.measurement_scheduled_for, "medicion");
  pushEvent(events, original?.measurement_at, "Medición realizada", text(original?.measurement_status), "medicion");
  pushEvent(events, original?.measurement_review_at, `Revisión de medición / técnica final`, original?.measurement_review_notes, "medicion");
  pushEvent(events, original?.final_synced_at, "NV final emitida", text(original?.final_sale_order_name), "odoo");
  pushEvent(events, finalCopy?.created_at, "Ajuste final creado", `Copia final ${text(finalCopy?.id)}`, "final");
  pushEvent(events, finalCopy?.final_synced_at, "NV final emitida", text(finalCopy?.final_sale_order_name), "odoo");
  pushEvent(events, original?.payload?.measurement_client_acceptance?.accepted_at, "Aceptación del cliente", text(original?.payload?.measurement_client_acceptance?.full_name), "cliente");
  for (const door of Array.isArray(doors) ? doors : []) {
    pushEvent(events, door?.synced_at || door?.updated_at, "Puerta vinculada", `${text(door?.door_code)} · ${text(door?.status)}`, "puertas");
  }
  return events.sort((a, b) => String(a.when).localeCompare(String(b.when)));
}
function buildCandidateSummary(original, finalCopy, matchType) {
  return {
    quote_id: original?.id,
    client_name: text(original?.end_customer?.name),
    seller_name: text(original?.created_by_full_name || original?.created_by_username),
    np: text(original?.odoo_sale_order_name) || (original?.quote_number ? `NP${original.quote_number}` : ""),
    nv: text(finalCopy?.final_sale_order_name || original?.final_sale_order_name),
    current_state: currentStateLabel(original, finalCopy),
    match_type: matchType,
  };
}
async function buildViewerPayloadForOriginal(original, matchType = "manual") {
  const finalCopy = await getFinalCopyForOriginal(original.id);
  const doors = await getLinkedDoors(original.id);
  return {
    match_type: matchType,
    current_state: currentStateLabel(original, finalCopy),
    documents: buildDocuments(original, finalCopy),
    customer: safeJson(original?.end_customer),
    seller: {
      created_by_role: text(original?.created_by_role),
      name: text(original?.created_by_full_name || original?.created_by_username),
      username: text(original?.created_by_username),
      user_id: text(original?.created_by_user_id),
      bill_to_odoo_partner_id: text(original?.bill_to_odoo_partner_id),
    },
    status: {
      quote_status: text(original?.status),
      fulfillment_mode: fulfillmentLabel(original?.fulfillment_mode),
      commercial_decision: normalizeDecision(original?.commercial_decision),
      technical_decision: normalizeDecision(original?.technical_decision),
      measurement_status: normalizeMeasurementStatus(original?.measurement_status),
      acopio_to_produccion_status: text(original?.acopio_to_produccion_status),
      rejection_notes: text(original?.rejection_notes),
      commercial_notes: text(original?.commercial_notes),
      technical_notes: text(original?.technical_notes),
    },
    technical: buildTechnicalData(original, finalCopy),
    original_quote: original,
    final_copy: finalCopy,
    linked_doors: doors,
    timeline: buildTimeline(original, finalCopy, doors),
  };
}

export function buildQuoteViewerRouter() {
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
  router.use(requireSuperuser);

  router.get("/", async (req, res, next) => {
    try {
      const quoteId = text(req.query.quote_id);
      const reference = text(req.query.reference);
      let original = null;
      let matches = [];

      if (quoteId) {
        if (!isUuid(quoteId)) return res.status(400).json({ ok: false, error: "quote_id inválido" });
        original = await getOriginalQuoteById(quoteId);
        if (!original) {
          const copyRow = await dbQuery(`select parent_quote_id from public.presupuestador_quotes where id=$1 and quote_kind='copy' limit 1`, [quoteId]);
          const parentId = copyRow.rows?.[0]?.parent_quote_id || null;
          if (parentId) original = await getOriginalQuoteById(parentId);
        }
        if (!original) return res.status(404).json({ ok: false, error: "Portón no encontrado" });
        const viewer = await buildViewerPayloadForOriginal(original, "quote_id");
        return res.json({ ok: true, viewer, matches: [buildCandidateSummary(original, viewer.final_copy, "quote_id")] });
      }

      if (!reference) return res.status(400).json({ ok: false, error: "Ingresá número de pedido o número de venta" });

      const hitRows = await findMatchingOriginalIds(reference);
      if (!hitRows.length) return res.status(404).json({ ok: false, error: "No se encontró ningún portón con esa referencia" });

      const hydrated = [];
      for (const row of hitRows.slice(0, 10)) {
        const candidateOriginal = await getOriginalQuoteById(row.original_id);
        if (!candidateOriginal) continue;
        const finalCopy = await getFinalCopyForOriginal(candidateOriginal.id);
        hydrated.push({ original: candidateOriginal, finalCopy, matchType: row.match_type });
      }
      matches = hydrated.map((item) => buildCandidateSummary(item.original, item.finalCopy, item.matchType));

      if (hydrated.length === 1) {
        const viewer = await buildViewerPayloadForOriginal(hydrated[0].original, hydrated[0].matchType);
        return res.json({ ok: true, viewer, matches });
      }

      return res.json({ ok: true, viewer: null, matches, ambiguous: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";

// =========================
// Config
// =========================
const MEASUREMENT_PRODUCT_ID = Number(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865); // SERVICIO DE MEDICION Y RELEVAMIENTO
const PLACEHOLDER_PRODUCT_ID = Number(process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 2880); // Producto genérico (1 sola línea en Odoo)
const IVA_RATE = 0.21;

/** RBAC */
function requireRole(flag) {
  return (req, res, next) => {
    if (!req.user?.[flag]) return res.status(403).json({ ok: false, error: "No autorizado" });
    next();
  };
}
function requireSellerOrDistributor(req, res, next) {
  const u = req.user || {};
  if (!u.is_vendedor && !u.is_distribuidor) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}

function normCatalogKind(kind) {
  const k = String(kind || "porton").toLowerCase().trim();
  if (!["porton","ipanel"].includes(k)) throw new Error('catalog_kind inválido (usar "porton" o "ipanel")');
  return k;
}

/**
 * Helpers de normalización para evitar mandar listas a Odoo (ej: many2one [id, name])
 * que después terminan en errores tipo "unhashable type: 'list'".
 */
function toScalar(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}
function toIntId(v) {
  const x = toScalar(v);
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function toText(v) {
  const x = toScalar(v);
  const s = (x === null || x === undefined) ? "" : String(x);
  return s.trim();
}

/** Odoo helpers */
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function buildDistributorNote({ quote }) {
  const parts = [];
  parts.push(`PRESUPUESTADOR QUOTE: ${quote.id}`);
  parts.push(`Destino: ${quote.fulfillment_mode === "acopio" ? "ACOPIO" : "PRODUCCIÓN"}`);
  parts.push("VENTA A DISTRIBUIDOR (cliente final NO cargado en Odoo).");

  const c = quote.end_customer || {};
  if (c?.name) parts.push(`Cliente final: ${c.name}`);
  if (c?.phone) parts.push(`Tel: ${c.phone}`);
  if (c?.email) parts.push(`Email: ${c.email}`);
  if (c?.address) parts.push(`Dirección: ${c.address}`);
  if (c?.maps_url) parts.push(`Maps: ${c.maps_url}`);

  if (quote.note) parts.push(`Obs: ${quote.note}`);
  return parts.join("\n");
}

async function getCreatorOdooPartnerId(createdByUserId) {
  try {
    const r = await dbQuery(`select odoo_partner_id from public.presupuestador_users where id=$1`, [Number(createdByUserId)]);
    const v = r.rows?.[0]?.odoo_partner_id;
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

async function findOrCreateCustomerPartner(odoo, customer) {
  const email = toText(customer?.email);
  if (email) {
    const ids = await odoo.executeKw(
      "res.partner",
      "search",
      [[["email", "=", email]]],
      { limit: 1 }
    );
    if (ids?.[0]) return toIntId(ids[0]);
  }

  const name = toText(customer?.name);
  if (!name) throw new Error("Falta end_customer.name (vendedor)");

  const ids2 = await odoo.executeKw(
    "res.partner",
    "search",
    [[["name", "=", name]]],
    { limit: 1 }
  );
  if (ids2?.[0]) return toIntId(ids2[0]);

  const created = await odoo.executeKw("res.partner", "create", [{
    name,
    email: email || false,
    phone: toText(customer?.phone) || false,
    street: (toText(customer?.street) || toText(customer?.address) || false),
    city: (toText(customer?.city) || false),
    customer_rank: 1,
  }]);

  const id = toIntId(created);
  if (!id) throw new Error("No se pudo crear partner en Odoo");
  return id;
}

async function syncQuoteToOdoo({ odoo, quote, approverUser }) {
  const pricelistId = toIntId(quote?.pricelist_id) || 1;

  // partner destino
  let partnerId = null;

  if (quote.created_by_role === "distribuidor") {
    partnerId = toIntId(quote?.bill_to_odoo_partner_id) || await getCreatorOdooPartnerId(quote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
    if (!partnerId) throw new Error("Distribuidor sin bill_to_odoo_partner_id (quote) y sin odoo_partner_id (JWT/DB)");
  } else {
    partnerId = await findOrCreateCustomerPartner(odoo, quote.end_customer || {});
  }

  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id inválido para Odoo");


  // ✅ NUEVO: la venta inicial a Odoo NO manda detalle.
  // Mandamos 1 línea placeholder con el TOTAL (IVA incluido) como seña/a-cuenta.
  const total = calcQuoteTotalWithIva({ lines: quote.lines, payload: quote.payload });

  const [ph] = await odoo.executeKw(
    "product.product",
    "read",
    [[Number(PLACEHOLDER_PRODUCT_ID)]],
    { fields: ["id", "name", "uom_id"] }
  );
  if (!ph?.id) throw new Error(`Producto placeholder no encontrado en Odoo: ${PLACEHOLDER_PRODUCT_ID}`);
  const uomId = toIntId(ph?.uom_id);
  if (!uomId) throw new Error(`Producto placeholder sin uom_id: ${PLACEHOLDER_PRODUCT_ID}`);

  const orderLines = [
    [0, 0, {
      product_id: Number(PLACEHOLDER_PRODUCT_ID),
      product_uom_qty: 1,
      product_uom: uomId,
      name: ph.name,
      price_unit: round2(total),
    }],
  ];

  const note = quote.created_by_role === "distribuidor"
    ? buildDistributorNote({ quote })
    : `PRESUPUESTADOR QUOTE: ${quote.id}\nDestino: ${quote.fulfillment_mode === "acopio" ? "ACOPIO" : "PRODUCCIÓN"}`
      + (quote?.end_customer?.maps_url ? `\nMaps: ${quote.end_customer.maps_url}` : "")
      + (quote.note ? `\n${quote.note}` : "");

  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    note,
  }]);
  const orderId = toIntId(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order en Odoo");

  const [order] = await odoo.executeKw("sale.order", "read", [[orderId]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id"],
  });

  return { order, deposit_amount: round2(total) };
}

/**
 * Transición atómica a syncing_odoo si ya están ambas aprobaciones.
 */
async function markSyncingIfReady(id) {
  const r = await dbQuery(
    `
    update public.presupuestador_quotes
    set status='syncing_odoo'
    where id=$1
      and status='pending_approvals'
      and commercial_decision='approved'
      and technical_decision='approved'
      and odoo_sale_order_id is null
    returning *
    `,
    [id]
  );
  return r.rows?.[0] || null;
}

/** Normaliza si quedó syncing_odoo pero ya tiene SO creada */
async function normalizeIfSyncingButHasOrder(id) {
  const r = await dbQuery(
    `
    update public.presupuestador_quotes
    set status='synced_odoo'
    where id=$1
      and status='syncing_odoo'
      and odoo_sale_order_id is not null
    returning *
    `,
    [id]
  );
  return r.rows?.[0] || null;
}

function vendedorNeedsEndCustomerName(quote) {
  return quote?.created_by_role === "vendedor";
}
function getEndCustomerName(quote) {
  return String(quote?.end_customer?.name || "").trim();
}

/**
 * Draft (guardado): SOLO requiere nombre de cliente (y permite guardar sin teléfono/dirección/maps).
 */
function validateEndCustomerDraft(end_customer) {
  const c = end_customer || {};
  const name = String(c.name || "").trim();
  if (!name) return "Falta end_customer.name";
  return null;
}

/**
 * Confirmación (submit): requiere todos los datos.
 */
function validateEndCustomerRequired(end_customer) {
  const c = end_customer || {};
  const name = String(c.name || "").trim();
  const phone = String(c.phone || "").trim();
  const address = String(c.address || "").trim();
  const mapsUrl = String(c.maps_url || "").trim();

  if (!name) return "Falta end_customer.name";
  if (!phone) return "Falta end_customer.phone";
  if (!address) return "Falta end_customer.address";
  if (!mapsUrl) return "Falta end_customer.maps_url";
  return null;
}

function validateBusinessRequired(payload, catalog_kind) {
  const p = payload || {};
  const cond = String(p.condition_mode || "").trim();
  const condText = String(p.condition_text || "").trim();
  const payment = String(p.payment_method || "").trim();
  const portonType = String(p.porton_type || "").trim();

  if (!payment) return "Falta payload.payment_method";
  if (cond === "special" && !condText) return "Falta payload.condition_text (condición especial)";

  const kind = String(catalog_kind || "porton").toLowerCase().trim();
  if (kind === "porton" && !portonType) return "Falta payload.porton_type";
  return null;
}

function hasMeasurementLine(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  return arr.some((l) => toIntId(l?.product_id) === MEASUREMENT_PRODUCT_ID);
}

function calcQuoteTotalWithIva({ lines, payload }) {
  const arr = Array.isArray(lines) ? lines : [];
  const m = Number(payload?.margin_percent_ui || 0) || 0;
  const subtotal = round2(
    arr.reduce((acc, l) => {
      const qty = Number(l?.qty || 0) || 0;
      const base = Number(l?.basePrice ?? l?.base_price ?? l?.price ?? 0) || 0;
      const unit = base * (1 + m / 100);
      return acc + qty * unit;
    }, 0)
  );
  const iva = round2(subtotal * IVA_RATE);
  return round2(subtotal + iva);
}

async function createEditCopyFromQuote(parentId) {
  // Copia “instancia editable” para el futuro flujo de acopio/producción/medición.
  // Queda como quote_kind='copy' y NO se lista en "mine" por defecto.
  const ins = await dbQuery(
    `
    insert into public.presupuestador_quotes
      (quote_kind, parent_quote_id,
       created_by_user_id, created_by_role,
       fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
       end_customer, lines, payload, note,
       catalog_kind,
       status, commercial_decision, technical_decision)
    select
      'copy', id,
      created_by_user_id, created_by_role,
      fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
      end_customer, lines, payload, note,
      catalog_kind,
      'draft', 'pending', 'pending'
    from public.presupuestador_quotes
    where id=$1
    returning *
    `,
    [parentId]
  );
  return ins.rows?.[0] || null;
}

export function buildQuotesRouter(odoo) {
  const router = express.Router();

  // Asegura columnas nuevas antes de atender requests
  router.use(async (_req, _res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      next();
    } catch (e) {
      next(e);
    }
  });

  router.use(requireAuth);

  // =========================
  // Crear draft (GUARDAR)
  // =========================
  router.post("/", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const body = req.body || {};

      const created_by_role =
        (body.created_by_role === "distribuidor" || body.created_by_role === "vendedor") ? body.created_by_role :
        (u.is_distribuidor ? "distribuidor" : "vendedor");

      // Draft: si no viene, default acopio
      const fulfillment_mode = String(body.fulfillment_mode || "acopio").trim();
      if (!["produccion", "acopio"].includes(fulfillment_mode)) throw new Error("fulfillment_mode debe ser 'produccion' o 'acopio'");

      const catalog_kind = normCatalogKind(body.catalog_kind || "porton");

      const end_customer = body.end_customer || {};
      const custErr = validateEndCustomerDraft(end_customer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });

      const lines = Array.isArray(body.lines) ? body.lines : [];
      // Permitimos draft sin business payload completo (se exige en submit)
      const payload = body.payload || {};
      const note = body.note || null;

      const pricelist_id = Number(body.pricelist_id || 1);
      let bill_to_odoo_partner_id = body.bill_to_odoo_partner_id ? Number(body.bill_to_odoo_partner_id) : null;
      if (created_by_role === "distribuidor" && !bill_to_odoo_partner_id) {
        bill_to_odoo_partner_id = u.odoo_partner_id ? Number(u.odoo_partner_id) : null;
      }

      const q = await dbQuery(
        `
        insert into public.presupuestador_quotes
          (quote_kind, parent_quote_id,
           created_by_user_id, created_by_role, fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
           end_customer, lines, payload, note,
           catalog_kind, status, commercial_decision, technical_decision,
           requires_measurement)
        values
          ('original', null,
           $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9,
           $10, 'draft', 'pending', 'pending',
           $11)
        returning *
        `,
        [
          Number(u.user_id),
          created_by_role,
          fulfillment_mode,
          pricelist_id,
          bill_to_odoo_partner_id,
          JSON.stringify(end_customer),
          JSON.stringify(lines),
          JSON.stringify(payload),
          note,
          catalog_kind,
          hasMeasurementLine(lines),
        ]
      );

      res.json({ ok: true, quote: q.rows[0] });
    } catch (e) { next(e); }
  });

  // =========================
  // Listados
  // =========================
  router.get("/", async (req, res, next) => {
    try {
      const u = req.user || {};
      const scope = String(req.query.scope || "mine");

      let sql = "";
      let params = [];

      // ✅ Por defecto SOLO listamos originales. Las copias quedan “ocultas”.
      const onlyOriginal = "q.quote_kind = 'original'";

      if (scope === "mine") {
        if (!u.is_vendedor && !u.is_distribuidor) {
          return res.status(403).json({ ok: false, error: "No autorizado" });
        }
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and q.created_by_user_id = $1
          order by q.id desc
          limit 200
        `;
        params = [Number(u.user_id)];
      } else if (scope === "commercial_inbox") {
        if (!u.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and q.created_by_role = 'vendedor'
            and (
              (status = 'pending_approvals' and commercial_decision in ('pending','approved'))
              or (status = 'draft' and technical_decision = 'rejected')
            )
          order by q.id desc
          limit 200
        `;
      } else if (scope === "technical_inbox") {
        if (!u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and (
              (status = 'pending_approvals' and technical_decision in ('pending','approved'))
              or (status = 'draft' and commercial_decision = 'rejected')
            )
          order by q.id desc
          limit 200
        `;
      } else if (scope === "commercial_acopio") {
        if (!u.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and q.fulfillment_mode = 'acopio'
            and acopio_to_produccion_status = 'pending'
          order by acopio_to_produccion_requested_at desc nulls last, id desc
          limit 200
        `;
      } else if (scope === "technical_acopio") {
        if (!u.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select q.*, u.username as created_by_username, u.full_name as created_by_full_name
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          where ${onlyOriginal}
            and q.fulfillment_mode = 'acopio'
            and acopio_to_produccion_status = 'pending'
          order by acopio_to_produccion_requested_at desc nulls last, id desc
          limit 200
        `;
      } else {
        return res.status(400).json({ ok: false, error: "scope inválido" });
      }

      const r = await dbQuery(sql, params);
      res.json({ ok: true, quotes: r.rows || [] });
    } catch (e) { next(e); }
  });

  // =========================
  // Detalle (incluye copias)
  // =========================
  router.get("/:id", async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");

      const isOwner = String(quote.created_by_user_id) === String(u.user_id);
      const canCommercial = u.is_enc_comercial && quote.created_by_role === "vendedor";
      const canTech = u.is_rev_tecnica;

      if (!isOwner && !canCommercial && !canTech) throw new Error("No autorizado");

      res.json({ ok: true, quote });
    } catch (e) { next(e); }
  });

  // Crear una COPIA manual (ajuste) del presupuesto.
  // Devuelve una quote_kind='copy' referenciada al original (parent_quote_id).
  router.post("/:id/revision", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) throw new Error("No sos dueño");

      // Solo desde originales (evitamos copiar copias)
      if ((quote.quote_kind || "original") !== "original") {
        return res.status(400).json({ ok: false, error: "Solo se puede crear ajuste desde un presupuesto original" });
      }

      const copy = await createEditCopyFromQuote(Number(id));
      if (!copy) throw new Error("No se pudo crear la copia");

      res.json({ ok: true, quote: copy });
    } catch (e) { next(e); }
  });

  // =========================
  // Editar draft (solo owner)
  // =========================
  router.put("/:id", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const body = req.body || {};

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) throw new Error("No sos dueño");

      const catalog_kind_locked = quote.catalog_kind || "porton";
      if (body.catalog_kind && normCatalogKind(body.catalog_kind) !== normCatalogKind(catalog_kind_locked)) {
        return res.status(400).json({ ok: false, error: "No podés cambiar el tipo de cotizador (portón/ipanel)" });
      }
      const catalog_kind = normCatalogKind(body.catalog_kind || catalog_kind_locked);

      if (!["draft","rejected_commercial","rejected_technical"].includes(quote.status)) {
        throw new Error("Solo se edita en borrador");
      }

      const nextEndCustomer = body.end_customer !== undefined ? body.end_customer : quote.end_customer;
      const custErr = validateEndCustomerDraft(nextEndCustomer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });

      const fulfillment_mode = body.fulfillment_mode ? String(body.fulfillment_mode) : quote.fulfillment_mode;
      if (!["produccion","acopio"].includes(fulfillment_mode)) throw new Error("fulfillment_mode inválido");

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set fulfillment_mode=$2,
            pricelist_id=$3,
            bill_to_odoo_partner_id=$4,
            end_customer=$5::jsonb,
            lines=$6::jsonb,
            payload=$7::jsonb,
            note=$8,
            catalog_kind=$9,
            requires_measurement=$10
        where id=$1
        returning *
        `,
        [
          id,
          fulfillment_mode,
          body.pricelist_id ? Number(body.pricelist_id) : quote.pricelist_id,
          body.bill_to_odoo_partner_id !== undefined ? (body.bill_to_odoo_partner_id ? Number(body.bill_to_odoo_partner_id) : null) : quote.bill_to_odoo_partner_id,
          JSON.stringify(body.end_customer !== undefined ? body.end_customer : quote.end_customer),
          JSON.stringify(body.lines !== undefined ? body.lines : quote.lines),
          JSON.stringify(body.payload !== undefined ? body.payload : quote.payload),
          body.note !== undefined ? body.note : quote.note,
          catalog_kind,
          hasMeasurementLine(body.lines !== undefined ? body.lines : quote.lines),
        ]
      );

      res.json({ ok: true, quote: upd.rows[0] });
    } catch (e) { next(e); }
  });

  // =========================
  // Confirmar presupuesto (antes "submit")
  // =========================
  router.post("/:id/submit", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { fulfillment_mode } = req.body || {};

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) throw new Error("No sos dueño");

      // Confirmación exige todos los campos
      const custErr = validateEndCustomerRequired(quote.end_customer);
      if (custErr) return res.status(400).json({ ok: false, error: custErr });

      const bizErr = validateBusinessRequired(quote.payload || {}, quote.catalog_kind || "porton");
      if (bizErr) return res.status(400).json({ ok: false, error: bizErr });

      if (vendedorNeedsEndCustomerName(quote) && !getEndCustomerName(quote)) {
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }

      if (!["draft", "rejected_commercial", "rejected_technical"].includes(quote.status)) {
        throw new Error("Solo confirmar desde borrador");
      }

      const fm = String(fulfillment_mode || quote.fulfillment_mode || "acopio").trim();
      if (!["produccion","acopio"].includes(fm)) {
        return res.status(400).json({ ok: false, error: "fulfillment_mode inválido (usar 'acopio' o 'produccion')" });
      }

      const isDistributor = quote.created_by_role === "distribuidor";

      // Vendedor: entra a Comercial y Técnica al mismo tiempo.
      // Distribuidor: Comercial queda auto-aprobado; Técnica decide.
      const status = "pending_approvals";
      const commercial_decision = isDistributor ? "approved" : "pending";
      const technical_decision = "pending";

      const reqMeas = hasMeasurementLine(quote.lines);
      const nextMeasStatus = (fm === "produccion" && reqMeas) ? "pending" : "none";

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set status=$2,
            fulfillment_mode=$3,
            confirmed_at = now(),
            requires_measurement=$6,
            measurement_status=$7,
            commercial_decision=$4,
            technical_decision=$5,
            commercial_by_user_id=null,
            commercial_at=null,
            technical_by_user_id=null,
            technical_at=null,
            commercial_notes = case when $4='approved' and created_by_role='distribuidor' then 'AUTO: distribuidor' else null end,
            technical_notes = null,
            rejection_notes=null
        where id=$1
        returning *
        `,
        [id, status, fm, commercial_decision, technical_decision, reqMeas, nextMeasStatus]
      );

      const confirmed = upd.rows?.[0] || quote;

      // ✅ Crear copia editable (una sola vez por presupuesto)
      try {
        const exists = await dbQuery(
          `select id from public.presupuestador_quotes where quote_kind='copy' and parent_quote_id=$1 limit 1`,
          [Number(id)]
        );
        if (!exists.rows?.[0]) {
          await createEditCopyFromQuote(Number(id));
        }
      } catch {
        // no bloqueamos la confirmación por falla de la copia
      }

      res.json({ ok: true, quote: confirmed });
    } catch (e) {
      next(e);
    }
  });

  // =========================
  // Revisión Comercial (sin cambios)
  // =========================
  router.post("/:id/review/commercial", requireRole("is_enc_comercial"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes } = req.body || {};

      await normalizeIfSyncingButHasOrder(id);

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (quote.created_by_role !== "vendedor") throw new Error("Comercial solo revisa vendedores");

      if (quote.status === "synced_odoo" || quote.status === "syncing_odoo") return res.json({ ok: true, quote });
      if (quote.status !== "pending_approvals") return res.status(400).json({ ok: false, error: "No está en revisión (pending_approvals)" });
      if (quote.commercial_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(
          `
          update public.presupuestador_quotes
          set status='draft',
              commercial_decision='rejected',
              commercial_by_user_id=$2,
              commercial_at=now(),
              commercial_notes=$3,
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'COMERCIAL: ' || $3)
          where id=$1
          returning *
          `,
          [id, Number(u.user_id), msg]
        );
        return res.json({ ok: true, quote: upd.rows[0] });
      }

      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const upd1 = await dbQuery(
        `
        update public.presupuestador_quotes
        set commercial_decision='approved',
            commercial_by_user_id=$2,
            commercial_at=now(),
            commercial_notes=$3
        where id=$1
          and status='pending_approvals'
          and commercial_decision='pending'
        returning *
        `,
        [id, Number(u.user_id), (notes || null)]
      );

      const q1 = upd1.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];

      const qSync = await markSyncingIfReady(id);
      if (!qSync) return res.json({ ok: true, quote: q1 });

      if (vendedorNeedsEndCustomerName(qSync) && !getEndCustomerName(qSync)) {
        await dbQuery(
          `
          update public.presupuestador_quotes
          set status='draft',
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'VALIDACION: Falta end_customer.name (vendedor)')
          where id=$1 and status='syncing_odoo'
          `,
          [id]
        );
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }

      try {
        const { order, deposit_amount } = await syncQuoteToOdoo({ odoo, quote: qSync, approverUser: u });

        const upd2 = await dbQuery(
          `
          update public.presupuestador_quotes
          set status='synced_odoo',
              odoo_sale_order_id=$2,
              odoo_sale_order_name=$3,
              deposit_amount=$4,
              measurement_status = case
                when fulfillment_mode='produccion' and requires_measurement = true and (measurement_status is null or measurement_status='none') then 'pending'
                else measurement_status
              end
          where id=$1 and status='syncing_odoo'
          returning *
          `,
          [id, Number(order.id), order.name, deposit_amount]
        );

        const finalQuote = upd2.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
        return res.json({ ok: true, quote: finalQuote, order });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar a Odoo");
        console.error("SYNC ODOO ERROR:", msg);
        if (e?.odoo) console.error("ODOO:", e.odoo);
        if (e?.debug) console.error("ODOO DEBUG:", e.debug);
        await dbQuery(
          `
          update public.presupuestador_quotes
          set status='pending_approvals',
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2)
          where id=$1 and status='syncing_odoo'
          `,
          [id, msg]
        );
        return res.status(502).json({ ok: false, error: process.env.NODE_ENV === "development" ? `Error al sincronizar a Odoo: ${msg}` : "Error al sincronizar a Odoo. Reintentá." });
      }
    } catch (e) { next(e); }
  });

  // =========================
  // Revisión Técnica (sin cambios)
  // =========================
  router.post("/:id/review/technical", requireRole("is_rev_tecnica"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes } = req.body || {};

      await normalizeIfSyncingButHasOrder(id);

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");

      if (quote.status === "synced_odoo" || quote.status === "syncing_odoo") return res.json({ ok: true, quote });
      if (quote.status !== "pending_approvals") return res.status(400).json({ ok: false, error: "No está en revisión (pending_approvals)" });
      if (quote.technical_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(
          `
          update public.presupuestador_quotes
          set status='draft',
              technical_decision='rejected',
              technical_by_user_id=$2,
              technical_at=now(),
              technical_notes=$3,
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'TECNICA: ' || $3)
          where id=$1
          returning *
          `,
          [id, Number(u.user_id), msg]
        );
        return res.json({ ok: true, quote: upd.rows[0] });
      }

      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const upd1 = await dbQuery(
        `
        update public.presupuestador_quotes
        set technical_decision='approved',
            technical_by_user_id=$2,
            technical_at=now(),
            technical_notes=$3
        where id=$1
          and status='pending_approvals'
          and technical_decision='pending'
        returning *
        `,
        [id, Number(u.user_id), (notes || null)]
      );

      const q1 = upd1.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];

      const qSync = await markSyncingIfReady(id);
      if (!qSync) return res.json({ ok: true, quote: q1 });

      if (vendedorNeedsEndCustomerName(qSync) && !getEndCustomerName(qSync)) {
        await dbQuery(
          `
          update public.presupuestador_quotes
          set status='draft',
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'VALIDACION: Falta end_customer.name (vendedor)')
          where id=$1 and status='syncing_odoo'
          `,
          [id]
        );
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }

      try {
        const { order, deposit_amount } = await syncQuoteToOdoo({ odoo, quote: qSync, approverUser: u });

        const upd2 = await dbQuery(
          `
          update public.presupuestador_quotes
          set status='synced_odoo',
              odoo_sale_order_id=$2,
              odoo_sale_order_name=$3,
              deposit_amount=$4,
              measurement_status = case
                when fulfillment_mode='produccion' and requires_measurement = true and (measurement_status is null or measurement_status='none') then 'pending'
                else measurement_status
              end
          where id=$1 and status='syncing_odoo'
          returning *
          `,
          [id, Number(order.id), order.name, deposit_amount]
        );

        const finalQuote = upd2.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
        return res.json({ ok: true, quote: finalQuote, order });
      } catch (e) {
        const msg = String(e?.message || "Error al sincronizar a Odoo");
        console.error("SYNC ODOO ERROR:", msg);
        if (e?.odoo) console.error("ODOO:", e.odoo);
        if (e?.debug) console.error("ODOO DEBUG:", e.debug);
        await dbQuery(
          `
          update public.presupuestador_quotes
          set status='pending_approvals',
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2)
          where id=$1 and status='syncing_odoo'
          `,
          [id, msg]
        );
        return res.status(502).json({ ok: false, error: process.env.NODE_ENV === "development" ? `Error al sincronizar a Odoo: ${msg}` : "Error al sincronizar a Odoo. Reintentá." });
      }
    } catch (e) { next(e); }
  });

  // =========================
  // ACOPIO -> PRODUCCIÓN (sin cambios; pegado del repo)
  // =========================
  router.post("/:id/acopio/request_production", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { notes } = req.body || {};

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");

      if (String(quote.created_by_user_id) !== String(u.user_id)) return res.status(403).json({ ok: false, error: "No sos dueño" });
      if (quote.fulfillment_mode !== "acopio") return res.status(400).json({ ok: false, error: "Solo aplica a portones en acopio" });

      if (quote.acopio_to_produccion_status === "pending") return res.json({ ok: true, quote });

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set acopio_to_produccion_status='pending',
            acopio_to_produccion_requested_by_user_id=$2,
            acopio_to_produccion_requested_at=now(),
            acopio_to_produccion_notes=$3,
            acopio_to_produccion_commercial_decision='pending',
            acopio_to_produccion_commercial_by_user_id=null,
            acopio_to_produccion_commercial_at=null,
            acopio_to_produccion_commercial_notes=null,
            acopio_to_produccion_technical_decision='pending',
            acopio_to_produccion_technical_by_user_id=null,
            acopio_to_produccion_technical_at=null,
            acopio_to_produccion_technical_notes=null
        where id=$1
          and fulfillment_mode='acopio'
        returning *
        `,
        [id, Number(u.user_id), (notes ? String(notes) : null)]
      );

      res.json({ ok: true, quote: upd.rows?.[0] || quote });
    } catch (e) { next(e); }
  });

  async function finalizeAcopioToProduccionIfReady(id) {
    const r = await dbQuery(
      `
      update public.presupuestador_quotes
      set fulfillment_mode='produccion',
          acopio_to_produccion_status='approved',
          requires_measurement = case
            when catalog_kind='porton' and status='synced_odoo' then true
            else requires_measurement
          end,
          measurement_status = case
            when catalog_kind='porton' and status='synced_odoo' and (measurement_status is null or measurement_status='none') then 'pending'
            else measurement_status
          end
      where id=$1
        and fulfillment_mode='acopio'
        and acopio_to_produccion_status='pending'
        and acopio_to_produccion_commercial_decision='approved'
        and acopio_to_produccion_technical_decision='approved'
      returning *
      `,
      [id]
    );
    return r.rows?.[0] || null;
  }

  router.post("/:id/acopio/review/commercial", requireRole("is_enc_comercial"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes } = req.body || {};

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");

      if (quote.fulfillment_mode !== "acopio") return res.json({ ok: true, quote });
      if (quote.acopio_to_produccion_status !== "pending") return res.json({ ok: true, quote });
      if (quote.acopio_to_produccion_commercial_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(
          `
          update public.presupuestador_quotes
          set acopio_to_produccion_status='rejected',
              acopio_to_produccion_commercial_decision='rejected',
              acopio_to_produccion_commercial_by_user_id=$2,
              acopio_to_produccion_commercial_at=now(),
              acopio_to_produccion_commercial_notes=$3
          where id=$1
          returning *
          `,
          [id, Number(u.user_id), msg]
        );
        return res.json({ ok: true, quote: upd.rows[0] });
      }

      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const upd1 = await dbQuery(
        `
        update public.presupuestador_quotes
        set acopio_to_produccion_commercial_decision='approved',
            acopio_to_produccion_commercial_by_user_id=$2,
            acopio_to_produccion_commercial_at=now(),
            acopio_to_produccion_commercial_notes=$3
        where id=$1
          and fulfillment_mode='acopio'
          and acopio_to_produccion_status='pending'
          and acopio_to_produccion_commercial_decision='pending'
        returning *
        `,
        [id, Number(u.user_id), (notes ? String(notes) : null)]
      );

      const q1 = upd1.rows?.[0] || quote;

      const qFinal = await finalizeAcopioToProduccionIfReady(id);
      return res.json({ ok: true, quote: qFinal || q1 });
    } catch (e) { next(e); }
  });

  router.post("/:id/acopio/review/technical", requireRole("is_rev_tecnica"), async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const { action, notes } = req.body || {};

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");

      if (quote.fulfillment_mode !== "acopio") return res.json({ ok: true, quote });
      if (quote.acopio_to_produccion_status !== "pending") return res.json({ ok: true, quote });
      if (quote.acopio_to_produccion_technical_decision !== "pending") return res.json({ ok: true, quote });

      if (action === "reject") {
        const msg = String(notes || "Rechazado").trim();
        const upd = await dbQuery(
          `
          update public.presupuestador_quotes
          set acopio_to_produccion_status='rejected',
              acopio_to_produccion_technical_decision='rejected',
              acopio_to_produccion_technical_by_user_id=$2,
              acopio_to_produccion_technical_at=now(),
              acopio_to_produccion_technical_notes=$3
          where id=$1
          returning *
          `,
          [id, Number(u.user_id), msg]
        );
        return res.json({ ok: true, quote: upd.rows[0] });
      }

      if (action !== "approve") return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });

      const upd1 = await dbQuery(
        `
        update public.presupuestador_quotes
        set acopio_to_produccion_technical_decision='approved',
            acopio_to_produccion_technical_by_user_id=$2,
            acopio_to_produccion_technical_at=now(),
            acopio_to_produccion_technical_notes=$3
        where id=$1
          and fulfillment_mode='acopio'
          and acopio_to_produccion_status='pending'
          and acopio_to_produccion_technical_decision='pending'
        returning *
        `,
        [id, Number(u.user_id), (notes ? String(notes) : null)]
      );

      const q1 = upd1.rows?.[0] || quote;

      const qFinal = await finalizeAcopioToProduccionIfReady(id);
      return res.json({ ok: true, quote: qFinal || q1 });
    } catch (e) { next(e); }
  });

// ============================================================
// NUEVO: ACOPIO -> PRODUCCIÓN (SIN aprobaciones intermedias)
// (para el flujo nuevo: al confirmar en Producción se considera "ya pasado")
// ============================================================
router.post("/:id/move_to_produccion", requireSellerOrDistributor, async (req, res, next) => {
  try {
    const u = req.user;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "id inválido" });

    const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
    const quote = cur.rows?.[0];
    if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
    if (String(quote.created_by_user_id) !== String(u.user_id)) return res.status(403).json({ ok: false, error: "No sos dueño" });
    if (quote.fulfillment_mode !== "acopio") return res.status(400).json({ ok: false, error: "Solo aplica a portones en acopio" });

    const nextMeas = quote.requires_measurement === true;
    const nextMeasStatus = nextMeas ? "pending" : "none";

    const upd = await dbQuery(
      `
      update public.presupuestador_quotes
      set fulfillment_mode='produccion',
          measurement_status=$2
      where id=$1
      returning *
      `,
      [id, nextMeasStatus]
    );

    return res.json({ ok: true, quote: upd.rows?.[0] || null });
  } catch (e) { next(e); }
});

// ============================================================
// NUEVO: Aprobaciones finales + envío FINAL a Odoo
// Se ejecuta sobre la COPIA (quote_kind='copy')
// ============================================================

async function syncFinalQuoteToOdoo({ odoo, revisionQuote, originalQuote, approverUser }) {
  const pricelistId = toIntId(revisionQuote?.pricelist_id) || toIntId(originalQuote?.pricelist_id) || 1;

  // partner destino (mismas reglas que depósito)
  let partnerId = null;
  if (originalQuote.created_by_role === "distribuidor") {
    partnerId = toIntId(originalQuote?.bill_to_odoo_partner_id) || await getCreatorOdooPartnerId(originalQuote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
    if (!partnerId) throw new Error("Distribuidor sin partner en Odoo");
  } else {
    partnerId = await findOrCreateCustomerPartner(odoo, originalQuote.end_customer || {});
  }
  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id inválido para Odoo");

  const lines = Array.isArray(revisionQuote.lines) ? revisionQuote.lines : [];
  if (!lines.length) throw new Error("La copia no tiene items");

  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).concat([Number(PLACEHOLDER_PRODUCT_ID)]))];
  const products = await odoo.executeKw("product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
  const byId = new Map(products.map((p) => [p.id, p]));

  const orderLines = [];
  for (const l of lines) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1);
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);
    const uomId = toIntId(p?.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);

    const maybePrice =
      (typeof l.price_unit === "number" ? l.price_unit :
      (typeof l.unit_price === "number" ? l.unit_price :
      (typeof l.price === "number" ? l.price :
      (typeof l.basePrice === "number" ? l.basePrice :
      (typeof l.base_price === "number" ? l.base_price : null)))));

    const lineVals = {
      product_id: productId,
      product_uom_qty: qty,
      product_uom: uomId,
      name: p.name,
    };
    if (maybePrice !== null && Number.isFinite(maybePrice)) {
      lineVals.price_unit = round2(maybePrice);
    }
    orderLines.push([0, 0, lineVals]);
  }

  const dep = Number(originalQuote.deposit_amount || 0) || 0;
  if (dep > 0) {
    const ph = byId.get(Number(PLACEHOLDER_PRODUCT_ID));
    const uomId = toIntId(ph?.uom_id);
    orderLines.push([0, 0, {
      product_id: Number(PLACEHOLDER_PRODUCT_ID),
      product_uom_qty: 1,
      product_uom: uomId,
      name: `Descuento seña (Quote ${originalQuote.id})`,
      price_unit: round2(-dep),
    }]);
  }

  const note = `PRESUPUESTADOR FINAL: COPY ${revisionQuote.id} (ORIG ${originalQuote.id})`
    + `
Referencia seña: ${originalQuote.odoo_sale_order_name || originalQuote.odoo_sale_order_id || "—"}`;

  const orderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    note,
  }]);

  const [order] = await odoo.executeKw("sale.order", "read", [[orderId]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id"],
  });

  return order;
}

router.post("/:id/final/submit", requireSellerOrDistributor, async (req, res, next) => {
  try {
    const u = req.user;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "id inválido" });

    const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
    const q = cur.rows?.[0];
    if (!q) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
    if (q.quote_kind !== 'copy') return res.status(400).json({ ok: false, error: "final/submit solo aplica a la COPIA" });
    if (String(q.created_by_user_id) !== String(u.user_id)) return res.status(403).json({ ok: false, error: "No sos dueño" });

    const parentId = Number(q.parent_quote_id);
    if (!parentId) return res.status(400).json({ ok: false, error: "La copia no tiene parent_quote_id" });
    const pr = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [parentId]);
    const orig = pr.rows?.[0];
    if (!orig) return res.status(400).json({ ok: false, error: "No se encontró el original" });
    if (!orig.odoo_sale_order_id) return res.status(409).json({ ok: false, error: "El original todavía no fue enviado a Odoo" });

    if (orig.requires_measurement === true && orig.measurement_status !== 'approved') {
      return res.status(409).json({ ok: false, error: "Primero debe estar aprobada la medición" });
    }

    const logDecision = (orig.requires_measurement === true) ? 'pending' : 'approved';

    const upd = await dbQuery(
      `
      update public.presupuestador_quotes
      set final_status='pending_approvals',
          final_technical_decision='pending',
          final_logistics_decision=$2,
          final_technical_notes=null,
          final_logistics_notes=null
      where id=$1
      returning *
      `,
      [id, logDecision]
    );
    return res.json({ ok: true, quote: upd.rows?.[0] || null });
  } catch (e) { next(e); }
});

router.post("/:id/final/review/technical", requireRole('is_rev_tecnica'), async (req, res, next) => {
  try {
    const u = req.user;
    const id = Number(req.params.id);
    const { action, notes } = req.body || {};
    const act = String(action || '').toLowerCase().trim();
    if (!['approve','reject'].includes(act)) return res.status(400).json({ ok: false, error: "action inválida" });

    const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
    const q = cur.rows?.[0];
    if (!q) return res.status(404).json({ ok: false, error: "No encontrado" });
    if (q.final_status !== 'pending_approvals') return res.status(409).json({ ok: false, error: "No está en aprobación final" });
    if (q.final_technical_decision !== 'pending') return res.json({ ok: true, quote: q });

    if (act === 'reject') {
      const msg = String(notes || 'Rechazado').trim();
      const upd = await dbQuery(
        `update public.presupuestador_quotes set final_status='draft', final_technical_decision='rejected', final_technical_notes=$2 where id=$1 returning *`,
        [id, msg]
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    }

    const upd1 = await dbQuery(
      `update public.presupuestador_quotes set final_technical_decision='approved', final_technical_notes=$2 where id=$1 returning *`,
      [id, (notes ? String(notes) : null)]
    );
    const q1 = upd1.rows?.[0] || q;

    // si logística ya está ok (o no aplica), sincronizamos
    if (q1.final_logistics_decision === 'approved') {
      const parentId = Number(q1.parent_quote_id);
      const pr = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [parentId]);
      const orig = pr.rows?.[0];
      if (!orig) return res.json({ ok: true, quote: q1 });

      const updSync = await dbQuery(`update public.presupuestador_quotes set final_status='syncing_odoo' where id=$1 and final_status='pending_approvals' returning *`, [id]);
      const qSync = updSync.rows?.[0];
      if (qSync) {
        const order = await syncFinalQuoteToOdoo({ odoo, revisionQuote: qSync, originalQuote: orig, approverUser: u });
        const upd2 = await dbQuery(
          `update public.presupuestador_quotes set final_status='synced_odoo', final_sale_order_id=$2, final_sale_order_name=$3 where id=$1 returning *`,
          [id, Number(order.id), order.name]
        );
        return res.json({ ok: true, quote: upd2.rows?.[0] || qSync, order });
      }
    }

    return res.json({ ok: true, quote: q1 });
  } catch (e) { next(e); }
});

router.post("/:id/final/review/logistics", requireRole('is_logistica'), async (req, res, next) => {
  try {
    const u = req.user;
    const id = Number(req.params.id);
    const { action, notes } = req.body || {};
    const act = String(action || '').toLowerCase().trim();
    if (!['approve','reject'].includes(act)) return res.status(400).json({ ok: false, error: "action inválida" });

    const cur = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
    const q = cur.rows?.[0];
    if (!q) return res.status(404).json({ ok: false, error: "No encontrado" });
    if (q.final_status !== 'pending_approvals') return res.status(409).json({ ok: false, error: "No está en aprobación final" });
    if (q.final_logistics_decision !== 'pending') return res.json({ ok: true, quote: q });

    // Solo aplica si el original requería medición
    const parentId = Number(q.parent_quote_id);
    const pr = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [parentId]);
    const orig = pr.rows?.[0];
    if (!orig) return res.status(400).json({ ok: false, error: "No se encontró el original" });
    if (orig.requires_measurement !== true) return res.status(400).json({ ok: false, error: "Logística solo aplica cuando requiere medición" });

    if (act === 'reject') {
      const msg = String(notes || 'Rechazado').trim();
      const upd = await dbQuery(
        `update public.presupuestador_quotes set final_status='draft', final_logistics_decision='rejected', final_logistics_notes=$2 where id=$1 returning *`,
        [id, msg]
      );
      return res.json({ ok: true, quote: upd.rows?.[0] || null });
    }

    const upd1 = await dbQuery(
      `update public.presupuestador_quotes set final_logistics_decision='approved', final_logistics_notes=$2 where id=$1 returning *`,
      [id, (notes ? String(notes) : null)]
    );
    const q1 = upd1.rows?.[0] || q;

    if (q1.final_technical_decision === 'approved') {
      const updSync = await dbQuery(`update public.presupuestador_quotes set final_status='syncing_odoo' where id=$1 and final_status='pending_approvals' returning *`, [id]);
      const qSync = updSync.rows?.[0];
      if (qSync) {
        const order = await syncFinalQuoteToOdoo({ odoo, revisionQuote: qSync, originalQuote: orig, approverUser: u });
        const upd2 = await dbQuery(
          `update public.presupuestador_quotes set final_status='synced_odoo', final_sale_order_id=$2, final_sale_order_name=$3 where id=$1 returning *`,
          [id, Number(order.id), order.name]
        );
        return res.json({ ok: true, quote: upd2.rows?.[0] || qSync, order });
      }
    }

    return res.json({ ok: true, quote: q1 });
  } catch (e) { next(e); }
});

  return router;
}

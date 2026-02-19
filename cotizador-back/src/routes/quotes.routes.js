import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";

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

/** Odoo helpers (copiados del odoo.routes para no renombrarte todo) */
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

  if (quote.note) parts.push(`Obs: ${quote.note}`);
  return parts.join("\n");
}

async function findOrCreateCustomerPartner(odoo, customer) {
  if (customer?.email) {
    const ids = await odoo.executeKw("res.partner", "search", [[[["email", "=", customer.email]]]], { limit: 1 });
    if (ids?.[0]) return ids[0];
  }
  if (!customer?.name) throw new Error("Falta end_customer.name (vendedor)");

  const ids2 = await odoo.executeKw("res.partner", "search", [[[["name", "=", customer.name]]]], { limit: 1 });
  if (ids2?.[0]) return ids2[0];

  const id = await odoo.executeKw("res.partner", "create", [[{
    name: customer.name,
    email: customer.email || false,
    phone: customer.phone || false,
    street: customer.street || false,
    city: customer.city || false,
    customer_rank: 1,
  }]]);
  return id;
}


async function syncQuoteToOdoo({ odoo, quote, approverUser }) {
  const pricelistId = Number(quote.pricelist_id || 1);

  // partner destino
  let partnerId = null;

  if (quote.created_by_role === "distribuidor") {
    partnerId = quote.bill_to_odoo_partner_id || approverUser.odoo_partner_id;
    if (!partnerId) throw new Error("Distribuidor sin bill_to_odoo_partner_id (quote) y sin odoo_partner_id (JWT)");
  } else {
    partnerId = await findOrCreateCustomerPartner(odoo, quote.end_customer || {});
  }

  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  if (!lines.length) throw new Error("Faltan lines[]");

  const productIds = [...new Set(lines.map((l) => Number(l.product_id)))];
  const products = await odoo.executeKw("product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
  const byId = new Map(products.map((p) => [p.id, p]));

  const orderLines = [];
  for (const l of lines) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1);
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);
    const uomId = Array.isArray(p?.uom_id) ? p.uom_id[0] : null;
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);

    // Precio: si viene en la línea (calculado en el Front usando pricelist de Odoo), lo mandamos para asegurar consistencia.
    // Si no viene, dejamos que Odoo lo compute.
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

  const note = quote.created_by_role === "distribuidor"
    ? buildDistributorNote({ quote })
    : `PRESUPUESTADOR QUOTE: ${quote.id}\nDestino: ${quote.fulfillment_mode === "acopio" ? "ACOPIO" : "PRODUCCIÓN"}\n${quote.note || ""}`.trim();

  const orderId = await odoo.executeKw("sale.order", "create", [[{
    partner_id: Number(partnerId),
    pricelist_id: pricelistId,
    order_line: orderLines,
    note,
  }]]);

  const [order] = await odoo.executeKw("sale.order", "read", [[orderId]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id"],
  });

  return order;
}

/**
 * Transición atómica a syncing_odoo si ya están ambas aprobaciones.
 * Sirve para evitar dobles clicks / retries.
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

export function buildQuotesRouter(odoo) {
  const router = express.Router();
  router.use(requireAuth);

  // Crear draft
  router.post("/", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const body = req.body || {};

      const created_by_role =
        u.is_distribuidor && !u.is_vendedor ? "distribuidor" :
        u.is_vendedor && !u.is_distribuidor ? "vendedor" :
        (body.created_by_role === "distribuidor" || body.created_by_role === "vendedor") ? body.created_by_role :
        (() => { throw new Error('Usuario "ambos": mandá created_by_role="vendedor" o "distribuidor".'); })();

      const fulfillment_mode = String(body.fulfillment_mode || "").trim();
      if (!["produccion", "acopio"].includes(fulfillment_mode)) throw new Error("fulfillment_mode debe ser 'produccion' o 'acopio'");

      const end_customer = body.end_customer || {};
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const payload = body.payload || {};
      const note = body.note || null;

      const pricelist_id = Number(body.pricelist_id || 1);
      const bill_to_odoo_partner_id = body.bill_to_odoo_partner_id ? Number(body.bill_to_odoo_partner_id) : null;

      const q = await dbQuery(
        `
        insert into public.presupuestador_quotes
          (created_by_user_id, created_by_role, fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
           end_customer, lines, payload, note,
           status, commercial_decision, technical_decision)
        values
          ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9,
           'draft', 'pending', 'pending')
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
        ]
      );

      res.json({ ok: true, quote: q.rows[0] });
    } catch (e) { next(e); }
  });


  // Listados
  // GET /api/quotes?scope=mine|commercial_inbox|technical_inbox
  router.get("/", async (req, res, next) => {
    try {
      const u = req.user || {};
      const scope = String(req.query.scope || "mine");

      let sql = "";
      let params = [];

      if (scope === "mine") {
        if (!u.is_vendedor && !u.is_distribuidor) {
          return res.status(403).json({ ok: false, error: "No autorizado" });
        }
        sql = `
          select *
          from public.presupuestador_quotes
          where created_by_user_id = $1
          order by id desc
          limit 200
        `;
        params = [Number(u.user_id)];
      } else if (scope === "commercial_inbox") {
        if (!u.is_enc_comercial) {
          return res.status(403).json({ ok: false, error: "No autorizado" });
        }
        // Comercial solo ve vendedores. "En bandeja" si:
        // - está pendiente su decisión (pending_approvals o returned_to_seller + commercial_decision=pending)
        // - o ya rechazó y volvió al vendedor (returned_to_seller + commercial_decision=rejected)
        // - o ya aprobó pero aún no se sincronizó (pending_approvals + commercial_decision=approved)
        sql = `
          select *
          from public.presupuestador_quotes
          where created_by_role = 'vendedor'
            and (
              -- Pendientes o ya aprobados por Comercial (pero falta Técnica)
              (status = 'pending_approvals' and commercial_decision in ('pending','approved'))
              -- Aviso: Técnica rechazó (volvió a draft), para que Comercial lo vea como "rechazado por técnica"
              or (status = 'draft' and technical_decision = 'rejected')
            )
          order by id desc
          limit 200
        `;
      } else if (scope === "technical_inbox") {
        if (!u.is_rev_tecnica) {
          return res.status(403).json({ ok: false, error: "No autorizado" });
        }
        // Técnica ve vendedores + distribuidores.
        sql = `
          select *
          from public.presupuestador_quotes
          where
            (
              -- Pendientes o ya aprobados por Técnica (pero falta Comercial)
              (status = 'pending_approvals' and technical_decision in ('pending','approved'))
              -- Aviso: Comercial rechazó (volvió a draft), para que Técnica lo vea como "rechazado por comercial"
              or (status = 'draft' and commercial_decision = 'rejected')
            )
          order by id desc
          limit 200
        `;
      }
      else if (scope === "commercial_acopio") {
        if (!u.is_enc_comercial) {
          return res.status(403).json({ ok: false, error: "No autorizado" });
        }
        // Pestaña "Acopio" (Comercial): solicitudes de pasar a Producción (todas)
        sql = `
          select *
          from public.presupuestador_quotes
          where fulfillment_mode = 'acopio'
            and acopio_to_produccion_status = 'pending'
          order by acopio_to_produccion_requested_at desc nulls last, id desc
          limit 200
        `;
      } else if (scope === "technical_acopio") {
        if (!u.is_rev_tecnica) {
          return res.status(403).json({ ok: false, error: "No autorizado" });
        }
        // Pestaña "Acopio" (Técnica): solicitudes de pasar a Producción (todas)
        sql = `
          select *
          from public.presupuestador_quotes
          where fulfillment_mode = 'acopio'
            and acopio_to_produccion_status = 'pending'
          order by acopio_to_produccion_requested_at desc nulls last, id desc
          limit 200
        `;
      } else {
        return res.status(400).json({ ok: false, error: "scope inválido" });
      }

      const r = await dbQuery(sql, params);
      res.json({ ok: true, quotes: r.rows || [] });
    } catch (e) {
      next(e);
    }
  });

  // Detalle
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

  // Editar (solo owner en draft o rechazados)
  router.put("/:id", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;
      const body = req.body || {};

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) throw new Error("No sos dueño");

      // Validación: para vendedor, end_customer.name es obligatorio (se usa para crear/ubicar partner en Odoo)
      if (vendedorNeedsEndCustomerName(quote) && !getEndCustomerName(quote)) {
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }

      // Rechazo vuelve a draft (con commercial_decision/technical_decision en 'rejected')
      if (!["draft","rejected_commercial","rejected_technical"].includes(quote.status)) {
        throw new Error("Solo se edita en borrador");
      }

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
            note=$8
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
        ]
      );

      res.json({ ok: true, quote: upd.rows[0] });
    } catch (e) { next(e); }
  });

  
  // Submit a aprobación (Comercial + Técnica en paralelo)
  router.post("/:id/submit", requireSellerOrDistributor, async (req, res, next) => {
    try {
      const u = req.user;
      const id = req.params.id;

      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) throw new Error("Quote no encontrado");
      if (String(quote.created_by_user_id) !== String(u.user_id)) throw new Error("No sos dueño");

      // Validación: para vendedor, end_customer.name es obligatorio (se usa para crear/ubicar partner en Odoo)
      if (vendedorNeedsEndCustomerName(quote) && !getEndCustomerName(quote)) {
        return res.status(400).json({ ok: false, error: "Falta end_customer.name (vendedor)" });
      }

      if (!["draft", "rejected_commercial", "rejected_technical"].includes(quote.status)) {
        throw new Error("Solo submit desde borrador");
      }

      const isDistributor = quote.created_by_role === "distribuidor";

      // Vendedor: entra a Comercial y Técnica al mismo tiempo.
      // Distribuidor: Comercial queda auto-aprobado; Técnica decide.
      const status = "pending_approvals";
      const commercial_decision = isDistributor ? "approved" : "pending";
      const technical_decision = "pending";

      const upd = await dbQuery(
        `
        update public.presupuestador_quotes
        set status=$2,
            commercial_decision=$3,
            technical_decision=$4,
            commercial_by_user_id=null,
            commercial_at=null,
            technical_by_user_id=null,
            technical_at=null,
            commercial_notes = case when $3='approved' and created_by_role='distribuidor' then 'AUTO: distribuidor' else null end,
            technical_notes = null,
            rejection_notes=null
        where id=$1
        returning *
        `,
        [id, status, commercial_decision, technical_decision]
      );

      res.json({ ok: true, quote: upd.rows[0] });
    } catch (e) {
      next(e);
    }
  });


  
  // Revisión Comercial (en paralelo con Técnica)
router.post("/:id/review/commercial", requireRole("is_enc_comercial"), async (req, res, next) => {
  try {
    const u = req.user;
    const id = req.params.id;
    const { action, notes } = req.body || {};

    // Normalizamos caso "syncing_odoo" pero ya con SO creada (por retry/doble click)
    await normalizeIfSyncingButHasOrder(id);

    const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
    const quote = r.rows?.[0];
    if (!quote) throw new Error("Quote no encontrado");
    if (quote.created_by_role !== "vendedor") throw new Error("Comercial solo revisa vendedores");

    // Si ya está synced (o syncing), respondemos idempotente
    if (quote.status === "synced_odoo" || quote.status === "syncing_odoo") {
      return res.json({ ok: true, quote });
    }

    if (quote.status !== "pending_approvals") {
      return res.status(400).json({ ok: false, error: "No está en revisión (pending_approvals)" });
    }

    // Idempotencia: si ya decidió, devolvemos el estado actual
    if (quote.commercial_decision !== "pending") {
      return res.json({ ok: true, quote });
    }

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

    if (action !== "approve") {
      return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
    }

    // Marcamos aprobación comercial
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

    // Si ya están ambas aprobaciones, pasamos a syncing_odoo de forma atómica
    const qSync = await markSyncingIfReady(id);
    if (!qSync) {
      return res.json({ ok: true, quote: q1 });
    }

    // Validación extra (defensiva): vendedor requiere end_customer.name
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

    // Sincronizamos a Odoo (solo una vez)
    try {
      const order = await syncQuoteToOdoo({ odoo, quote: qSync, approverUser: u });

      const upd2 = await dbQuery(
        `
        update public.presupuestador_quotes
        set status='synced_odoo',
            odoo_sale_order_id=$2,
            odoo_sale_order_name=$3
        where id=$1 and status='syncing_odoo'
        returning *
        `,
        [id, Number(order.id), order.name]
      );

      const finalQuote = upd2.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
      return res.json({ ok: true, quote: finalQuote, order });
    } catch (e) {
      const msg = String(e?.message || "Error al sincronizar a Odoo");
      await dbQuery(
        `
        update public.presupuestador_quotes
        set status='pending_approvals',
            rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2)
        where id=$1 and status='syncing_odoo'
        `,
        [id, msg]
      );
      return res.status(502).json({ ok: false, error: "Error al sincronizar a Odoo. Reintentá." });
    }
  } catch (e) { next(e); }
});

// Revisión Técnica (en paralelo con Comercial). Si con esta aprobación quedan ambas => sync a Odoo.
router.post("/:id/review/technical", requireRole("is_rev_tecnica"), async (req, res, next) => {
  try {
    const u = req.user;
    const id = req.params.id;
    const { action, notes } = req.body || {};

    // Normalizamos caso "syncing_odoo" pero ya con SO creada (por retry/doble click)
    await normalizeIfSyncingButHasOrder(id);

    const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
    const quote = r.rows?.[0];
    if (!quote) throw new Error("Quote no encontrado");

    // Si ya está synced (o syncing), respondemos idempotente
    if (quote.status === "synced_odoo" || quote.status === "syncing_odoo") {
      return res.json({ ok: true, quote });
    }

    if (quote.status !== "pending_approvals") {
      return res.status(400).json({ ok: false, error: "No está en revisión (pending_approvals)" });
    }

    // Idempotencia: si ya decidió, devolvemos el estado actual
    if (quote.technical_decision !== "pending") {
      return res.json({ ok: true, quote });
    }

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

    if (action !== "approve") {
      return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
    }

    // Marcamos aprobación técnica
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

    // Si ya están ambas aprobaciones, pasamos a syncing_odoo de forma atómica
    const qSync = await markSyncingIfReady(id);
    if (!qSync) {
      return res.json({ ok: true, quote: q1 });
    }

    // Validación extra (defensiva): vendedor requiere end_customer.name
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

    // Sincronizamos a Odoo (solo una vez)
    try {
      const order = await syncQuoteToOdoo({ odoo, quote: qSync, approverUser: u });

      const upd2 = await dbQuery(
        `
        update public.presupuestador_quotes
        set status='synced_odoo',
            odoo_sale_order_id=$2,
            odoo_sale_order_name=$3
        where id=$1 and status='syncing_odoo'
        returning *
        `,
        [id, Number(order.id), order.name]
      );

      const finalQuote = upd2.rows?.[0] || (await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id])).rows?.[0];
      return res.json({ ok: true, quote: finalQuote, order });
    } catch (e) {
      const msg = String(e?.message || "Error al sincronizar a Odoo");
      await dbQuery(
        `
        update public.presupuestador_quotes
        set status='pending_approvals',
            rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2)
        where id=$1 and status='syncing_odoo'
        `,
        [id, msg]
      );
      return res.status(502).json({ ok: false, error: "Error al sincronizar a Odoo. Reintentá." });
    }
  } catch (e) { next(e); }
});

// ============================================================
// ACOPIO -> PRODUCCIÓN (NUEVO)
// No altera el flujo normal de aprobación Comercial/Técnica.
// Solo agrega una solicitud paralela para cambiar fulfillment_mode
// cuando el portón está en ACOPIO.
// ============================================================

// Seller/Distribuidor: solicita pasar un portón en acopio a producción.
router.post("/:id/acopio/request_production", requireSellerOrDistributor, async (req, res, next) => {
  try {
    const u = req.user;
    const id = req.params.id;
    const { notes } = req.body || {};

    const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
    const quote = r.rows?.[0];
    if (!quote) throw new Error("Quote no encontrado");

    if (String(quote.created_by_user_id) !== String(u.user_id)) {
      return res.status(403).json({ ok: false, error: "No sos dueño" });
    }
    if (quote.fulfillment_mode !== "acopio") {
      return res.status(400).json({ ok: false, error: "Solo aplica a portones en acopio" });
    }

    // Idempotente: si ya está pending, devolvemos tal cual
    if (quote.acopio_to_produccion_status === "pending") {
      return res.json({ ok: true, quote });
    }

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
        acopio_to_produccion_status='approved'
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

// Comercial: aprueba/rechaza solicitud de pasar a producción (desde Acopio)
router.post("/:id/acopio/review/commercial", requireRole("is_enc_comercial"), async (req, res, next) => {
  try {
    const u = req.user;
    const id = req.params.id;
    const { action, notes } = req.body || {};

    const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
    const quote = r.rows?.[0];
    if (!quote) throw new Error("Quote no encontrado");

    // Idempotencia / ya no aplica
    if (quote.fulfillment_mode !== "acopio") {
      return res.json({ ok: true, quote });
    }
    if (quote.acopio_to_produccion_status !== "pending") {
      return res.json({ ok: true, quote });
    }
    if (quote.acopio_to_produccion_commercial_decision !== "pending") {
      return res.json({ ok: true, quote });
    }

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

    if (action !== "approve") {
      return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
    }

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

// Técnica: aprueba/rechaza solicitud de pasar a producción (desde Acopio)
router.post("/:id/acopio/review/technical", requireRole("is_rev_tecnica"), async (req, res, next) => {
  try {
    const u = req.user;
    const id = req.params.id;
    const { action, notes } = req.body || {};

    const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1`, [id]);
    const quote = r.rows?.[0];
    if (!quote) throw new Error("Quote no encontrado");

    // Idempotencia / ya no aplica
    if (quote.fulfillment_mode !== "acopio") {
      return res.json({ ok: true, quote });
    }
    if (quote.acopio_to_produccion_status !== "pending") {
      return res.json({ ok: true, quote });
    }
    if (quote.acopio_to_produccion_technical_decision !== "pending") {
      return res.json({ ok: true, quote });
    }

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

    if (action !== "approve") {
      return res.status(400).json({ ok: false, error: "action debe ser 'approve' o 'reject'" });
    }

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

  return router;
}

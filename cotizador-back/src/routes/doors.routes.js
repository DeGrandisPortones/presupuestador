import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureDoorsSchema } from "../doorsSchema.js";
import { createOdooClient } from "../odoo.js";

const ODOO_DOOR_PRODUCT_ID = Number(process.env.ODOO_DOOR_PRODUCT_ID || 3226);
const ODOO_DOOR_SUPPLIER_TAG_NAME = String(process.env.ODOO_DOOR_SUPPLIER_TAG_NAME || "Puerta").trim();

function requireSeller(req, res, next) {
  if (!req.user?.is_vendedor) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function requireCommercial(req, res, next) {
  if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}
function requireTech(req, res, next) {
  if (!req.user?.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}

function isUuid(v) {
  const s = String(v || "").trim();
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}
function safeText(v) {
  return String(v ?? "").trim();
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function toInt(v) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : null;
}
function normalizeDoorBaseCode(value) {
  const raw = safeText(value).toUpperCase();
  if (!raw) return "";
  return raw.startsWith("P") ? raw : `P${raw}`;
}
function buildFallbackDoorCode(seed) {
  const raw = safeText(seed).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `P${raw || "PUERTA"}`;
}
function buildDoorCodeFromQuote(quote) {
  if (!quote) return "";
  const odooName = safeText(quote.odoo_sale_order_name);
  if (odooName) return normalizeDoorBaseCode(odooName);
  return buildFallbackDoorCode(String(quote.id || "").slice(0, 8));
}
function buildStandaloneDoorCode(id) {
  const n = Number(id || 0);
  return `P${String(n).padStart(5, "0")}`;
}
function nowDate() {
  return new Date().toISOString().slice(0, 10);
}
function nowDateTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function parseAmount(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? round2(n) : 0;
}
function canReadDoor(user, door) {
  if (!user || !door) return false;
  const isOwner = String(door.created_by_user_id) === String(user.user_id);
  return isOwner || !!user.is_enc_comercial || !!user.is_rev_tecnica;
}
function customerFromQuote(quote) {
  return {
    name: safeText(quote?.end_customer?.name),
    phone: safeText(quote?.end_customer?.phone),
    email: safeText(quote?.end_customer?.email),
    address: safeText(quote?.end_customer?.address),
    maps_url: safeText(quote?.end_customer?.maps_url),
  };
}
function buildChecklist(responsible = "") {
  const date = nowDate();
  const mk = (section, item) => ({ section, item, status: "Pendiente", notes: "", responsible, date, ok: false });
  return [
    mk("A", "Confirmar que es puerta principal de acceso."),
    mk("A", "Confirmar lado de vista: EXTERIOR (parado afuera mirando la puerta)."),
    mk("B", "Definir sentido de giro: ABRE HACIA ADENTRO o ABRE HACIA AFUERA."),
    mk("B", "Si no es estándar, registrar motivo (seguridad, evacuación, viento, interferencias, etc.)."),
    mk("C", "Definir mano desde exterior: bisagras a IZQUIERDA = MI; bisagras a DERECHA = MD."),
    mk("C", "Confirmar picaporte/cerradura del lado opuesto a bisagras."),
    mk("D", "Definir ángulo requerido (90° default / 120° / 180° / otro)."),
    mk("D", "Verificar interferencias (pared, mueble, escalón, baranda, artefactos, etc.)."),
    mk("D", "Definir accesorios (tope, retenedor, cierrapuertas) según condiciones."),
    mk("E", "Tipo de marco definido (madera/chapa/aluminio/u otro)."),
    mk("E", "Tipo de hoja definido (ciega/vidriada/seguridad/u otro)."),
    mk("E", "Lado de cerradura visto desde exterior definido (izquierda/derecha)."),
    mk("E", "Compatibilidad de cerradura/manija con mano (MI/MD) y sentido (adentro/afuera)."),
    mk("F", "Generar texto estándar final y revisar consistencia contra lo observado."),
    mk("F", "Validar definición con obra/cliente antes de fabricación/compra."),
  ];
}
function buildInitialDoorRecord({ quote = null, user }) {
  const responsible = safeText(user?.full_name || user?.username);
  const endCustomer = quote ? customerFromQuote(quote) : { name: "", phone: "", email: "", address: "", maps_url: "" };
  return {
    end_customer: endCustomer,
    obra_cliente: endCustomer.name || "",
    nv: "",
    tipo: "Puerta principal",
    vista: "Exterior",
    responsable: responsible,
    proveedor: "",
    proveedor_condiciones: "",
    fecha: nowDate(),
    nv_proveedor: "",
    asociado_porton: safeText(quote?.odoo_sale_order_name),
    sentido_apertura: "ADENTRO",
    mano_bisagras: "IZQUIERDA",
    angulo_apertura: "90",
    angulo_otro: "",
    motivo_no_estandar: "",
    interferencias: "Ninguna",
    accesorios: "Ninguno",
    tipo_marco: "",
    tipo_hoja: "",
    lado_cerradura: "",
    observaciones: "",
    sale_amount: "",
    purchase_amount: "",
    supplier_odoo_partner_id: "",
    checklist: buildChecklist(responsible),
  };
}

async function getQuoteOwnedBySeller(quoteId, userId) {
  const r = await dbQuery(
    `
    select *
    from public.presupuestador_quotes
    where id = $1
      and created_by_user_id = $2
      and created_by_role = 'vendedor'
    limit 1
    `,
    [quoteId, Number(userId)]
  );
  return r.rows?.[0] || null;
}
async function getQuoteReadable(quoteId, user) {
  const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [quoteId]);
  const quote = r.rows?.[0] || null;
  if (!quote) return null;
  const isOwner = String(quote.created_by_user_id) === String(user.user_id);
  const canCommercial = !!user.is_enc_comercial && quote.created_by_role === "vendedor";
  const canTech = !!user.is_rev_tecnica;
  return (isOwner || canCommercial || canTech) ? quote : null;
}
async function getDoorHydratedById(id) {
  const r = await dbQuery(
    `
    select
      d.*,
      u.username as created_by_username,
      u.full_name as created_by_full_name,
      q.odoo_sale_order_name as linked_quote_odoo_name,
      q.status as linked_quote_status,
      q.end_customer as linked_quote_end_customer
    from public.presupuestador_doors d
    left join public.presupuestador_users u on u.id = d.created_by_user_id
    left join public.presupuestador_quotes q on q.id = d.linked_quote_id
    where d.id = $1
    limit 1
    `,
    [Number(id)]
  );
  const row = r.rows?.[0] || null;
  if (!row) return null;
  const resolvedDoorCode = row.linked_quote_odoo_name
    ? buildDoorCodeFromQuote({ id: row.linked_quote_id, odoo_sale_order_name: row.linked_quote_odoo_name })
    : (row.door_code || buildStandaloneDoorCode(row.id));
  return { ...row, door_code: resolvedDoorCode };
}
async function resolveProductInfo(odoo, rawId) {
  const id = Number(rawId);
  const [prod] = await odoo.executeKw("product.product", "read", [[id]], { fields: ["id", "name", "uom_id"] });
  if (prod?.id) {
    const uomId = toInt(prod.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${id}`);
    return { productId: Number(prod.id), name: prod.name, uomId };
  }

  const [tmpl] = await odoo.executeKw("product.template", "read", [[id]], { fields: ["id", "name", "uom_id"] });
  if (!tmpl?.id) throw new Error(`Producto no encontrado en Odoo: ${id}`);
  const variantIds = await odoo.executeKw("product.product", "search", [[["product_tmpl_id", "=", Number(tmpl.id)]]], { limit: 1 });
  const variantId = Number(Array.isArray(variantIds) ? variantIds[0] : 0);
  if (!variantId) throw new Error(`No se encontró variante de producto para template: ${id}`);
  const [variant] = await odoo.executeKw("product.product", "read", [[variantId]], { fields: ["id", "name", "uom_id"] });
  const uomId = toInt(variant?.uom_id || tmpl.uom_id);
  if (!uomId) throw new Error(`Producto sin uom_id: ${id}`);
  return { productId: Number(variant.id), name: variant.name || tmpl.name, uomId };
}
async function findOrCreateCustomerPartner(odoo, customer) {
  const email = safeText(customer?.email);
  if (email) {
    const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", email]]], { limit: 1 });
    if (ids?.[0]) return Number(ids[0]);
  }
  const name = safeText(customer?.name);
  if (!name) throw new Error("Falta nombre del cliente");
  const ids2 = await odoo.executeKw("res.partner", "search", [[["name", "=", name]]], { limit: 1 });
  if (ids2?.[0]) return Number(ids2[0]);

  const created = await odoo.executeKw("res.partner", "create", [[{
    name,
    email: email || false,
    phone: safeText(customer?.phone) || false,
    street: safeText(customer?.address) || false,
    customer_rank: 1,
  }]]);
  const id = Number(created);
  if (!id) throw new Error("No se pudo crear partner del cliente");
  return id;
}
async function listSuppliersByTag(odoo, query = "") {
  const tagIds = await odoo.executeKw(
    "res.partner.category",
    "search",
    [[["name", "ilike", ODOO_DOOR_SUPPLIER_TAG_NAME]]],
    { limit: 20 }
  );
  const ids = Array.isArray(tagIds) ? tagIds.map(Number).filter(Boolean) : [];
  const domain = [["supplier_rank", ">", 0]];
  if (ids.length) domain.push(["category_id", "in", ids]);
  if (safeText(query)) domain.push(["name", "ilike", safeText(query)]);
  const rows = await odoo.executeKw("res.partner", "search_read", [domain], {
    fields: ["id", "name", "phone", "email", "category_id", "supplier_rank"],
    limit: 80,
    order: "name asc",
  });
  return (rows || []).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone || "",
    email: r.email || "",
    category_ids: Array.isArray(r.category_id) ? r.category_id.filter((x) => Number.isFinite(Number(x))) : [],
  }));
}
function extractDoorCore(record) {
  const endCustomer = record?.end_customer && typeof record.end_customer === "object" ? record.end_customer : {};
  return {
    supplierId: toInt(record?.supplier_odoo_partner_id),
    saleAmount: parseAmount(record?.sale_amount),
    purchaseAmount: parseAmount(record?.purchase_amount),
    customer: {
      name: safeText(endCustomer?.name || record?.obra_cliente),
      phone: safeText(endCustomer?.phone),
      email: safeText(endCustomer?.email),
      address: safeText(endCustomer?.address),
      maps_url: safeText(endCustomer?.maps_url),
    },
    proveedorCondiciones: safeText(record?.proveedor_condiciones),
  };
}
function validateDoorForSubmit(door, record) {
  const core = extractDoorCore(record);
  if (!core.customer.name) throw new Error("Completá el nombre del cliente.");
  if (!core.customer.phone) throw new Error("Completá el teléfono del cliente.");
  if (!core.customer.address) throw new Error("Completá la dirección del cliente.");
  if (!core.supplierId) throw new Error("Seleccioná un proveedor.");
  if (core.saleAmount <= 0) throw new Error("Completá el importe de venta de la puerta.");
  if (core.purchaseAmount <= 0) throw new Error("Completá el importe de compra de la puerta.");
  return core;
}
async function syncDoorToOdoo({ odoo, door }) {
  const record = door.record || {};
  const core = validateDoorForSubmit(door, record);
  const { productId, name, uomId } = await resolveProductInfo(odoo, ODOO_DOOR_PRODUCT_ID);
  const customerPartnerId = await findOrCreateCustomerPartner(odoo, core.customer);

  const saleOrderId = await odoo.executeKw("sale.order", "create", [[{
    partner_id: customerPartnerId,
    order_line: [[0, 0, {
      product_id: productId,
      product_uom_qty: 1,
      product_uom: uomId,
      name: `${name} · ${door.door_code}`,
      price_unit: core.saleAmount,
    }]],
    note:
      `PUERTA PRESUPUESTADOR: ${door.door_code}`
      + (door.linked_quote_id ? `\nPortón vinculado: ${door.linked_quote_id}` : "")
      + (safeText(record?.asociado_porton) ? `\nNV portón: ${safeText(record.asociado_porton)}` : "")
      + (core.proveedorCondiciones ? `\nCondiciones proveedor: ${core.proveedorCondiciones}` : ""),
  }]]);
  const [saleOrder] = await odoo.executeKw("sale.order", "read", [[saleOrderId]], {
    fields: ["id", "name", "amount_total", "state", "partner_id"],
  });

  const purchaseOrderId = await odoo.executeKw("purchase.order", "create", [[{
    partner_id: core.supplierId,
    order_line: [[0, 0, {
      product_id: productId,
      product_qty: 1,
      product_uom: uomId,
      name: `${name} · ${door.door_code}`,
      price_unit: core.purchaseAmount,
      date_planned: nowDateTime(),
    }]],
    notes:
      `PUERTA TERCERIZADA: ${door.door_code}`
      + (door.linked_quote_id ? `\nPortón vinculado: ${door.linked_quote_id}` : "")
      + (core.proveedorCondiciones ? `\nCondiciones: ${core.proveedorCondiciones}` : ""),
  }]]);
  const [purchaseOrder] = await odoo.executeKw("purchase.order", "read", [[purchaseOrderId]], {
    fields: ["id", "name", "state", "partner_id"],
  });

  return { saleOrder, purchaseOrder };
}
async function trySyncIfReady({ odoo, id }) {
  const door = await getDoorHydratedById(id);
  if (!door) throw new Error("Puerta no encontrada");
  if (door.status === "synced_odoo" || door.status === "syncing_odoo") return door;
  if (door.status !== "pending_approvals") return door;
  if (door.commercial_decision !== "approved" || door.technical_decision !== "approved") return door;

  const r = await dbQuery(
    `update public.presupuestador_doors set status='syncing_odoo', updated_at=now() where id=$1 and status='pending_approvals' returning id`,
    [Number(id)]
  );
  if (!r.rows?.[0]) return await getDoorHydratedById(id);

  try {
    const { saleOrder, purchaseOrder } = await syncDoorToOdoo({ odoo, door: await getDoorHydratedById(id) });
    await dbQuery(
      `
      update public.presupuestador_doors
      set status='synced_odoo',
          odoo_sale_order_id=$2,
          odoo_sale_order_name=$3,
          odoo_purchase_order_id=$4,
          odoo_purchase_order_name=$5,
          synced_at=now(),
          updated_at=now()
      where id=$1
      `,
      [Number(id), Number(saleOrder.id), saleOrder.name, Number(purchaseOrder.id), purchaseOrder.name]
    );
    return await getDoorHydratedById(id);
  } catch (e) {
    await dbQuery(`update public.presupuestador_doors set status='pending_approvals', updated_at=now() where id=$1`, [Number(id)]);
    throw e;
  }
}

export function buildDoorsRouter(odooArg) {
  const router = express.Router();
  const odoo = odooArg || createOdooClient({
    url: process.env.ODOO_URL,
    db: process.env.ODOO_DB,
    username: process.env.ODOO_USERNAME,
    password: process.env.ODOO_PASSWORD,
    companyId: process.env.ODOO_COMPANY_ID || null,
  });

  router.use(async (_req, _res, next) => {
    try {
      await ensureDoorsSchema();
      next();
    } catch (e) {
      next(e);
    }
  });

  router.use(requireAuth);

  router.get("/suppliers", requireSeller, async (req, res, next) => {
    try {
      const suppliers = await listSuppliersByTag(odoo, req.query.query || "");
      res.json({ ok: true, suppliers });
    } catch (e) {
      next(e);
    }
  });

  router.get("/by-quote/:quoteId", async (req, res, next) => {
    try {
      const quoteId = safeText(req.params.quoteId);
      if (!isUuid(quoteId)) return res.status(400).json({ ok: false, error: "quoteId inválido" });
      const quote = await getQuoteReadable(quoteId, req.user);
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no autorizado" });

      const r = await dbQuery(
        `
        select d.id
        from public.presupuestador_doors d
        where d.linked_quote_id = $1
        order by d.id desc
        `,
        [quoteId]
      );
      const doors = [];
      for (const row of (r.rows || [])) {
        const door = await getDoorHydratedById(row.id);
        if (door) doors.push(door);
      }
      res.json({ ok: true, doors });
    } catch (e) {
      next(e);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const scope = safeText(req.query.scope || "mine");
      let sql = "";
      let params = [];

      if (scope === "mine") {
        if (!req.user?.is_vendedor) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select id
          from public.presupuestador_doors
          where created_by_user_id = $1
          order by id desc
          limit 300
        `;
        params = [Number(req.user.user_id)];
      } else if (scope === "commercial_inbox") {
        if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select id
          from public.presupuestador_doors
          where status = 'pending_approvals'
            and commercial_decision = 'pending'
          order by id desc
          limit 300
        `;
      } else if (scope === "technical_inbox") {
        if (!req.user?.is_rev_tecnica) return res.status(403).json({ ok: false, error: "No autorizado" });
        sql = `
          select id
          from public.presupuestador_doors
          where status = 'pending_approvals'
            and technical_decision = 'pending'
          order by id desc
          limit 300
        `;
      } else {
        return res.status(400).json({ ok: false, error: "scope inválido" });
      }

      const r = await dbQuery(sql, params);
      const doors = [];
      for (const row of (r.rows || [])) {
        const door = await getDoorHydratedById(row.id);
        if (door) doors.push(door);
      }
      res.json({ ok: true, doors });
    } catch (e) {
      next(e);
    }
  });

  router.post("/", requireSeller, async (req, res, next) => {
    try {
      const linkedQuoteId = safeText(req.body?.linked_quote_id);
      if (linkedQuoteId) {
        if (!isUuid(linkedQuoteId)) return res.status(400).json({ ok: false, error: "linked_quote_id inválido" });
        const quote = await getQuoteOwnedBySeller(linkedQuoteId, req.user.user_id);
        if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no sos dueño" });

        const existing = await dbQuery(`select id from public.presupuestador_doors where linked_quote_id=$1 limit 1`, [linkedQuoteId]);
        if (existing.rows?.[0]?.id) {
          const door = await getDoorHydratedById(existing.rows[0].id);
          return res.json({ ok: true, door });
        }

        const record = buildInitialDoorRecord({ quote, user: req.user });
        const doorCode = buildDoorCodeFromQuote(quote) || buildFallbackDoorCode(linkedQuoteId);
        const ins = await dbQuery(
          `
          insert into public.presupuestador_doors
            (created_by_user_id, linked_quote_id, door_code, status, commercial_decision, technical_decision, record, updated_at)
          values
            ($1, $2, $3, 'draft', 'pending', 'pending', $4::jsonb, now())
          returning id
          `,
          [Number(req.user.user_id), linkedQuoteId, doorCode, JSON.stringify(record)]
        );
        const door = await getDoorHydratedById(ins.rows?.[0]?.id);
        return res.json({ ok: true, door });
      }

      const ins = await dbQuery(
        `
        insert into public.presupuestador_doors
          (created_by_user_id, linked_quote_id, door_code, status, commercial_decision, technical_decision, record, updated_at)
        values
          ($1, null, 'PENDIENTE', 'draft', 'pending', 'pending', $2::jsonb, now())
        returning id
        `,
        [Number(req.user.user_id), JSON.stringify(buildInitialDoorRecord({ quote: null, user: req.user }))]
      );
      const id = Number(ins.rows?.[0]?.id);
      const doorCode = buildStandaloneDoorCode(id);
      await dbQuery(`update public.presupuestador_doors set door_code=$2 where id=$1`, [id, doorCode]);
      const door = await getDoorHydratedById(id);
      return res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  router.post("/from-quote/:quoteId", requireSeller, async (req, res, next) => {
    try {
      req.body = { ...(req.body || {}), linked_quote_id: req.params.quoteId };
      const linkedQuoteId = safeText(req.body.linked_quote_id);
      if (!isUuid(linkedQuoteId)) return res.status(400).json({ ok: false, error: "linked_quote_id inválido" });
      const quote = await getQuoteOwnedBySeller(linkedQuoteId, req.user.user_id);
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no sos dueño" });
      const existing = await dbQuery(`select id from public.presupuestador_doors where linked_quote_id=$1 limit 1`, [linkedQuoteId]);
      if (existing.rows?.[0]?.id) {
        const door = await getDoorHydratedById(existing.rows[0].id);
        return res.json({ ok: true, door });
      }
      const record = buildInitialDoorRecord({ quote, user: req.user });
      const doorCode = buildDoorCodeFromQuote(quote) || buildFallbackDoorCode(linkedQuoteId);
      const ins = await dbQuery(
        `
        insert into public.presupuestador_doors
          (created_by_user_id, linked_quote_id, door_code, status, commercial_decision, technical_decision, record, updated_at)
        values
          ($1, $2, $3, 'draft', 'pending', 'pending', $4::jsonb, now())
        returning id
        `,
        [Number(req.user.user_id), linkedQuoteId, doorCode, JSON.stringify(record)]
      );
      const door = await getDoorHydratedById(ins.rows?.[0]?.id);
      return res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const door = await getDoorHydratedById(id);
      if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (!canReadDoor(req.user, door)) return res.status(403).json({ ok: false, error: "No autorizado" });
      return res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  router.put("/:id", requireSeller, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });

      const cur = await getDoorHydratedById(id);
      if (!cur) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (String(cur.created_by_user_id) !== String(req.user.user_id)) return res.status(403).json({ ok: false, error: "No autorizado" });

      const record = req.body?.record;
      if (!record || typeof record !== "object") return res.status(400).json({ ok: false, error: "Falta record (objeto)" });

      let linkedQuote = null;
      if (cur.linked_quote_id) linkedQuote = await getQuoteOwnedBySeller(cur.linked_quote_id, req.user.user_id);
      const nextDoorCode = linkedQuote ? (buildDoorCodeFromQuote(linkedQuote) || cur.door_code) : (cur.door_code || buildStandaloneDoorCode(id));
      const core = extractDoorCore(record);

      await dbQuery(
        `
        update public.presupuestador_doors
        set record = $2::jsonb,
            door_code = $3,
            supplier_odoo_partner_id = $4,
            sale_amount = $5,
            purchase_amount = $6,
            updated_at = now()
        where id = $1
        `,
        [id, JSON.stringify(record), nextDoorCode, core.supplierId, core.saleAmount || null, core.purchaseAmount || null]
      );

      const door = await getDoorHydratedById(id);
      return res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/submit", requireSeller, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const door = await getDoorHydratedById(id);
      if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (String(door.created_by_user_id) !== String(req.user.user_id)) return res.status(403).json({ ok: false, error: "No autorizado" });

      validateDoorForSubmit(door, door.record);
      await dbQuery(
        `
        update public.presupuestador_doors
        set status='pending_approvals',
            commercial_decision='pending',
            technical_decision='pending',
            commercial_notes=null,
            technical_notes=null,
            updated_at=now()
        where id=$1
        `,
        [id]
      );
      const saved = await getDoorHydratedById(id);
      return res.json({ ok: true, door: saved });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/review/commercial", requireCommercial, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const action = safeText(req.body?.action).toLowerCase();
      const notes = safeText(req.body?.notes);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ ok: false, error: "action inválida" });

      const door = await getDoorHydratedById(id);
      if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (door.status !== "pending_approvals") return res.status(409).json({ ok: false, error: "La puerta no está en aprobación" });

      if (action === "reject") {
        await dbQuery(
          `
          update public.presupuestador_doors
          set status='draft',
              commercial_decision='rejected',
              commercial_notes=$2,
              updated_at=now()
          where id=$1
          `,
          [id, notes || "Rechazado"]
        );
        return res.json({ ok: true, door: await getDoorHydratedById(id) });
      }

      await dbQuery(
        `
        update public.presupuestador_doors
        set commercial_decision='approved',
            commercial_notes=$2,
            updated_at=now()
        where id=$1
        `,
        [id, notes || null]
      );
      const finalDoor = await trySyncIfReady({ odoo, id });
      return res.json({ ok: true, door: finalDoor });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/review/technical", requireTech, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const action = safeText(req.body?.action).toLowerCase();
      const notes = safeText(req.body?.notes);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ ok: false, error: "action inválida" });

      const door = await getDoorHydratedById(id);
      if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (door.status !== "pending_approvals") return res.status(409).json({ ok: false, error: "La puerta no está en aprobación" });

      if (action === "reject") {
        await dbQuery(
          `
          update public.presupuestador_doors
          set status='draft',
              technical_decision='rejected',
              technical_notes=$2,
              updated_at=now()
          where id=$1
          `,
          [id, notes || "Rechazado"]
        );
        return res.json({ ok: true, door: await getDoorHydratedById(id) });
      }

      await dbQuery(
        `
        update public.presupuestador_doors
        set technical_decision='approved',
            technical_notes=$2,
            updated_at=now()
        where id=$1
        `,
        [id, notes || null]
      );
      const finalDoor = await trySyncIfReady({ odoo, id });
      return res.json({ ok: true, door: finalDoor });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

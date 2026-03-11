import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureDoorsSchema } from "../doorsSchema.js";

const DOOR_PRODUCT_ID = Number(process.env.ODOO_DOOR_PRODUCT_ID || 3225);
const DOOR_SUPPLIER_TAG_NAME = String(process.env.ODOO_DOOR_SUPPLIER_TAG_NAME || "Puerta").trim();

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

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function text(v) {
  return String(v ?? "").trim();
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeDoorBaseCode(value) {
  const raw = text(value).toUpperCase();
  if (!raw) return "";
  return raw.startsWith("P") ? raw : `P${raw}`;
}

function buildStandaloneDoorCode(id) {
  const n = Number(id || 0) || 0;
  return `P${String(n).padStart(5, "0")}`;
}

function buildDoorCodeFromQuote(quote, fallbackId = null) {
  if (!quote) return buildStandaloneDoorCode(fallbackId);
  const odooName = text(quote.odoo_sale_order_name);
  if (odooName) return normalizeDoorBaseCode(odooName);
  return buildStandaloneDoorCode(fallbackId || quote.id);
}

function safeEndCustomer(obj) {
  const c = obj && typeof obj === "object" ? obj : {};
  return {
    name: text(c.name),
    phone: text(c.phone),
    email: text(c.email),
    address: text(c.address),
    maps_url: text(c.maps_url),
  };
}

function buildChecklistItems(responsible = "") {
  const today = new Date().toISOString().slice(0, 10);
  const items = [
    ["A", "Confirmar que es puerta principal de acceso."],
    ["A", "Confirmar lado de vista: EXTERIOR (parado afuera mirando la puerta)."],
    ["B", "Definir sentido de giro: ABRE HACIA ADENTRO o ABRE HACIA AFUERA."],
    ["B", "Si no es estándar, registrar motivo (seguridad, evacuación, viento, interferencias, etc.)."],
    ["C", "Definir mano desde exterior: bisagras a IZQUIERDA = MI; bisagras a DERECHA = MD."],
    ["C", "Confirmar picaporte/cerradura del lado opuesto a bisagras."],
    ["D", "Confirmar ángulo requerido (90° default / 120° / 180° / otro)."],
    ["D", "Verificar interferencias (pared, mueble, escalón, baranda, artefactos, etc.)."],
    ["D", "Definir accesorios (tope, retenedor, cierrapuertas) según condiciones."],
    ["E", "Tipo de marco definido (madera/chapa/aluminio/u otro)."],
    ["E", "Tipo de hoja definido (ciega/vidriada/seguridad/u otro)."],
    ["E", "Lado de cerradura visto desde exterior definido (izquierda/derecha)."],
    ["E", "Compatibilidad de cerradura/manija con mano (MI/MD) y sentido (adentro/afuera)."],
    ["F", "Generar texto estándar final y revisar consistencia contra lo observado."],
    ["F", "Validar definición con obra/cliente antes de fabricación/compra."],
  ];
  return items.map(([section, item]) => ({
    section,
    item,
    status: "Pendiente",
    notes: "",
    responsible,
    date: today,
    ok: false,
  }));
}

function buildInitialDoorRecord({ quote = null, user, endCustomer = null }) {
  const responsible = text(user?.full_name || user?.username);
  const customer = safeEndCustomer(endCustomer || quote?.end_customer || {});
  return {
    obra_cliente: customer.name,
    nv: "",
    tipo: "Puerta principal",
    vista: "Exterior",
    responsable,
    proveedor: "",
    fecha: new Date().toISOString().slice(0, 10),
    nv_proveedor: "",
    asociado_porton: text(quote?.odoo_sale_order_name),
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
    conditions_text: "",
    supplier_partner_id: null,
    supplier_name: "",
    linked_quote_id: quote?.id || null,
    end_customer: customer,
    checklist: buildChecklistItems(responsible),
  };
}

function normalizeDoorRecord(record, hydratedDoor, user) {
  const responsible = text(user?.full_name || user?.username);
  const customer = safeEndCustomer(hydratedDoor?.end_customer || record?.end_customer || hydratedDoor?.linked_quote_end_customer || {});
  const base = buildInitialDoorRecord({ quote: hydratedDoor?.linked_quote_id ? { id: hydratedDoor.linked_quote_id, odoo_sale_order_name: hydratedDoor.linked_quote_odoo_name, end_customer: hydratedDoor.linked_quote_end_customer } : null, user, endCustomer: customer });
  const merged = record && typeof record === "object" ? { ...base, ...record } : base;
  merged.end_customer = customer;
  merged.sale_amount = merged.sale_amount ?? hydratedDoor?.sale_amount ?? "";
  merged.purchase_amount = merged.purchase_amount ?? hydratedDoor?.purchase_amount ?? "";
  merged.conditions_text = merged.conditions_text ?? hydratedDoor?.conditions_text ?? "";
  merged.supplier_partner_id = merged.supplier_partner_id ?? hydratedDoor?.supplier_partner_id ?? null;
  merged.supplier_name = merged.supplier_name ?? hydratedDoor?.supplier_name ?? "";
  merged.linked_quote_id = merged.linked_quote_id ?? hydratedDoor?.linked_quote_id ?? null;
  merged.asociado_porton = merged.asociado_porton || hydratedDoor?.linked_quote_odoo_name || "";
  merged.checklist = Array.isArray(merged.checklist) && merged.checklist.length ? merged.checklist : buildChecklistItems(merged.responsable || responsible);
  return merged;
}

function validateDoorDraft(record) {
  const customer = safeEndCustomer(record?.end_customer);
  if (!customer.name) throw new Error("Completá el nombre del cliente para la puerta.");
}

function validateDoorSubmit(record) {
  validateDoorDraft(record);
  const customer = safeEndCustomer(record?.end_customer);
  if (!customer.phone) throw new Error("Completá el teléfono del cliente.");
  if (!customer.address) throw new Error("Completá la dirección del cliente.");
  if (!text(record?.supplier_name) || !toInt(record?.supplier_partner_id)) throw new Error("Seleccioná el proveedor de la puerta.");
  if (toInt(record?.sale_amount) === null || Number(record?.sale_amount) <= 0) throw new Error("Completá el monto de venta de la puerta.");
  if (toInt(record?.purchase_amount) === null || Number(record?.purchase_amount) <= 0) throw new Error("Completá el costo de compra/proveedor.");
  if (!text(record?.conditions_text)) throw new Error("Completá las condiciones de la puerta.");
}

async function getQuoteOwnedBySeller(quoteId, userId) {
  const r = await dbQuery(
    `
    select q.*, u.username as created_by_username, u.full_name as created_by_full_name
    from public.presupuestador_quotes q
    left join public.presupuestador_users u on u.id = q.created_by_user_id
    where q.id = $1
      and q.created_by_user_id = $2
      and q.created_by_role = 'vendedor'
    limit 1
    `,
    [quoteId, Number(userId)]
  );
  return r.rows?.[0] || null;
}

async function getQuoteById(quoteId) {
  const r = await dbQuery(
    `
    select q.*, u.username as created_by_username, u.full_name as created_by_full_name
    from public.presupuestador_quotes q
    left join public.presupuestador_users u on u.id = q.created_by_user_id
    where q.id = $1
    limit 1
    `,
    [quoteId]
  );
  return r.rows?.[0] || null;
}

async function ensureQuoteLinkAvailable(linkedQuoteId, ownerUserId, currentDoorId = null) {
  if (!linkedQuoteId) return null;
  const quote = await getQuoteOwnedBySeller(linkedQuoteId, ownerUserId);
  if (!quote) throw new Error("El presupuesto de portón no existe o no te pertenece.");

  const dup = await dbQuery(
    `
    select id
    from public.presupuestador_doors
    where linked_quote_id = $1
      and ($2::bigint is null or id <> $2::bigint)
    limit 1
    `,
    [linkedQuoteId, currentDoorId ? Number(currentDoorId) : null]
  );
  if (dup.rows?.[0]?.id) throw new Error("Ese presupuesto de portón ya tiene una puerta vinculada.");
  return quote;
}

function canReadDoor(user, door) {
  if (!user || !door) return false;
  if (String(door.created_by_user_id) === String(user.user_id)) return true;
  if (user.is_enc_comercial) return true;
  if (user.is_rev_tecnica) return true;
  return false;
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

  const resolvedDoorCode = row.linked_quote_id
    ? buildDoorCodeFromQuote({ id: row.linked_quote_id, odoo_sale_order_name: row.linked_quote_odoo_name }, row.id)
    : (row.door_code || buildStandaloneDoorCode(row.id));

  return {
    ...row,
    door_code: resolvedDoorCode,
  };
}

async function listDoorsHydrated({ scope, user, quoteId = null }) {
  const params = [];
  let where = "1=1";

  if (scope === "mine") {
    params.push(Number(user.user_id));
    where = `d.created_by_user_id = $${params.length}`;
  } else if (scope === "commercial_inbox") {
    where = `(
      (d.status = 'pending_approvals' and d.commercial_decision in ('pending','approved'))
      or (d.status = 'draft' and d.technical_decision = 'rejected')
    )`;
  } else if (scope === "technical_inbox") {
    where = `(
      (d.status = 'pending_approvals' and d.technical_decision in ('pending','approved'))
      or (d.status = 'draft' and d.commercial_decision = 'rejected')
    )`;
  } else if (scope === "by_quote") {
    params.push(String(quoteId || ""));
    where = `d.linked_quote_id = $${params.length}`;
  } else {
    throw new Error("scope inválido");
  }

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
    where ${where}
    order by d.id desc
    limit 300
    `,
    params
  );

  return (r.rows || []).map((row) => ({
    ...row,
    door_code: row.linked_quote_id
      ? buildDoorCodeFromQuote({ id: row.linked_quote_id, odoo_sale_order_name: row.linked_quote_odoo_name }, row.id)
      : (row.door_code || buildStandaloneDoorCode(row.id)),
  }));
}

async function resolveOdooProduct(odoo, rawId) {
  const productId = Number(rawId || DOOR_PRODUCT_ID);

  try {
    const rows = await odoo.executeKw("product.product", "read", [[productId]], { fields: ["id", "name", "uom_id"] });
    const p = rows?.[0];
    if (p?.id) {
      return {
        productId: Number(p.id),
        name: p.name,
        uomId: Array.isArray(p.uom_id) ? Number(p.uom_id[0]) : Number(p.uom_id),
      };
    }
  } catch {}

  try {
    const rows = await odoo.executeKw("product.template", "read", [[productId]], { fields: ["id", "name"] });
    const t = rows?.[0];
    if (t?.id) {
      const ids = await odoo.executeKw("product.product", "search", [[["product_tmpl_id", "=", Number(t.id)]]], { limit: 1 });
      const variantId = Number(ids?.[0] || 0) || null;
      if (variantId) {
        const variants = await odoo.executeKw("product.product", "read", [[variantId]], { fields: ["id", "name", "uom_id"] });
        const v = variants?.[0];
        if (v?.id) {
          return {
            productId: Number(v.id),
            name: v.name,
            uomId: Array.isArray(v.uom_id) ? Number(v.uom_id[0]) : Number(v.uom_id),
          };
        }
      }
    }
  } catch {}

  throw new Error(`Producto puerta no encontrado en Odoo: ${productId}`);
}

async function findOrCreateCustomerPartner(odoo, customer) {
  if (text(customer?.email)) {
    const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", text(customer.email)]]], { limit: 1 });
    if (ids?.[0]) return Number(ids[0]);
  }

  if (text(customer?.name)) {
    const ids = await odoo.executeKw("res.partner", "search", [[["name", "=", text(customer.name)]]], { limit: 1 });
    if (ids?.[0]) return Number(ids[0]);
  }

  const created = await odoo.executeKw("res.partner", "create", [{
    name: text(customer?.name),
    email: text(customer?.email) || false,
    phone: text(customer?.phone) || false,
    street: text(customer?.address) || false,
    customer_rank: 1,
  }]);

  const id = Number(created || 0) || null;
  if (!id) throw new Error("No se pudo crear el cliente en Odoo");
  return id;
}

function buildDoorSaleNote(door, record, supplierName) {
  const parts = [];
  parts.push(`PUERTA PRESUPUESTADOR: ${door.door_code}`);
  if (door.linked_quote_id) parts.push(`Vinculada a portón: ${text(door.linked_quote_odoo_name || door.linked_quote_id)}`);
  parts.push(`Proveedor: ${supplierName || text(record?.supplier_name)}`);
  if (text(record?.conditions_text)) parts.push(`Condiciones: ${text(record.conditions_text)}`);
  if (text(record?.observaciones)) parts.push(`Obs: ${text(record.observaciones)}`);
  return parts.join("\n");
}

function buildDoorPurchaseNotes(door, record, supplierName) {
  const parts = [];
  parts.push(`COMPRA PUERTA PRESUPUESTADOR: ${door.door_code}`);
  if (door.linked_quote_id) parts.push(`Coordinar junto al portón: ${text(door.linked_quote_odoo_name || door.linked_quote_id)}`);
  if (text(record?.obra_cliente)) parts.push(`Cliente/obra: ${text(record.obra_cliente)}`);
  if (supplierName) parts.push(`Proveedor: ${supplierName}`);
  if (text(record?.conditions_text)) parts.push(`Condiciones: ${text(record.conditions_text)}`);
  if (text(record?.observaciones)) parts.push(`Obs: ${text(record.observaciones)}`);
  return parts.join("\n");
}

async function syncDoorToOdoo({ odoo, door }) {
  const record = normalizeDoorRecord(door.record, door, { full_name: door.created_by_full_name, username: door.created_by_username });
  const customer = safeEndCustomer(door.end_customer || record.end_customer);
  const supplierPartnerId = Number(door.supplier_partner_id || record.supplier_partner_id || 0) || null;
  if (!supplierPartnerId) throw new Error("Falta proveedor para la puerta");

  const product = await resolveOdooProduct(odoo, DOOR_PRODUCT_ID);
  if (!product.uomId) throw new Error(`Producto puerta sin uom_id: ${product.productId}`);

  const customerPartnerId = await findOrCreateCustomerPartner(odoo, customer);

  const saleOrderIdRaw = await odoo.executeKw("sale.order", "create", [{
    partner_id: customerPartnerId,
    order_line: [[0, 0, {
      product_id: product.productId,
      product_uom_qty: 1,
      product_uom: product.uomId,
      name: `${product.name} · ${door.door_code}`,
      price_unit: round2(record.sale_amount),
    }]],
    note: buildDoorSaleNote(door, record, door.supplier_name),
  }]);

  const saleOrderId = Number(saleOrderIdRaw || 0) || null;
  if (!saleOrderId) throw new Error("No se pudo crear la venta en Odoo para la puerta");

  const saleOrderRows = await odoo.executeKw("sale.order", "read", [[saleOrderId]], { fields: ["id", "name"] });
  const saleOrder = saleOrderRows?.[0] || null;

  const purchaseOrderIdRaw = await odoo.executeKw("purchase.order", "create", [{
    partner_id: supplierPartnerId,
    origin: door.door_code,
    notes: buildDoorPurchaseNotes(door, record, door.supplier_name),
    order_line: [[0, 0, {
      product_id: product.productId,
      product_qty: 1,
      product_uom: product.uomId,
      name: `${product.name} · ${door.door_code}`,
      price_unit: round2(record.purchase_amount),
      date_planned: new Date().toISOString().slice(0, 19).replace("T", " "),
    }]],
  }]);

  const purchaseOrderId = Number(purchaseOrderIdRaw || 0) || null;
  if (!purchaseOrderId) throw new Error("No se pudo crear la orden de compra en Odoo para la puerta");

  const purchaseOrderRows = await odoo.executeKw("purchase.order", "read", [[purchaseOrderId]], { fields: ["id", "name"] });
  const purchaseOrder = purchaseOrderRows?.[0] || null;

  return { saleOrder, purchaseOrder };
}

async function getDoorSupplierPartners(odoo, query = "") {
  let tagIds = [];
  try {
    tagIds = await odoo.executeKw("res.partner.category", "search", [[["name", "ilike", DOOR_SUPPLIER_TAG_NAME]]], { limit: 50 });
  } catch {
    tagIds = [];
  }

  const domain = [["active", "=", true], ["supplier_rank", ">", 0]];
  if (Array.isArray(tagIds) && tagIds.length) domain.push(["category_id", "in", tagIds]);
  const q = text(query);
  if (q) domain.push("|", "|", ["name", "ilike", q], ["email", "ilike", q], ["phone", "ilike", q]);

  const rows = await odoo.executeKw("res.partner", "search_read", [domain], {
    fields: ["id", "name", "email", "phone"],
    limit: 100,
    order: "name asc",
  });

  return (rows || []).map((p) => ({
    id: Number(p.id),
    name: p.name,
    email: p.email || "",
    phone: p.phone || "",
  }));
}

export function buildDoorsRouter(odoo) {
  const router = express.Router();

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
      const suppliers = await getDoorSupplierPartners(odoo, req.query.query || "");
      res.json({ ok: true, suppliers });
    } catch (e) {
      next(e);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const scope = text(req.query.scope || "mine");
      const quoteId = text(req.query.quote_id || "");
      const rows = await listDoorsHydrated({ scope, user: req.user, quoteId });
      res.json({ ok: true, doors: rows });
    } catch (e) {
      next(e);
    }
  });

  router.post("/", requireSeller, async (req, res, next) => {
    try {
      const body = req.body || {};
      const linkedQuoteId = text(body.linked_quote_id || "") || null;
      const endCustomer = safeEndCustomer(body.end_customer || {});
      const linkedQuote = linkedQuoteId ? await ensureQuoteLinkAvailable(linkedQuoteId, req.user.user_id) : null;

      const record = buildInitialDoorRecord({ quote: linkedQuote, user: req.user, endCustomer });

      const ins = await dbQuery(
        `
        insert into public.presupuestador_doors
          (created_by_user_id, linked_quote_id, door_code, status, record, end_customer, sale_product_id, purchase_product_id)
        values
          ($1, $2, $3, 'draft', $4::jsonb, $5::jsonb, $6, $7)
        returning id
        `,
        [
          Number(req.user.user_id),
          linkedQuoteId,
          linkedQuote ? buildDoorCodeFromQuote(linkedQuote) : "PTEMP",
          JSON.stringify(record),
          JSON.stringify(record.end_customer),
          DOOR_PRODUCT_ID,
          DOOR_PRODUCT_ID,
        ]
      );

      const doorId = ins.rows?.[0]?.id;
      if (!linkedQuoteId) {
        await dbQuery(`update public.presupuestador_doors set door_code=$2 where id=$1`, [doorId, buildStandaloneDoorCode(doorId)]);
      }
      const door = await getDoorHydratedById(doorId);
      res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  router.post("/from-quote/:quoteId", requireSeller, async (req, res, next) => {
    try {
      const quoteId = text(req.params.quoteId);
      if (!isUuid(quoteId)) return res.status(400).json({ ok: false, error: "quoteId inválido" });

      const existing = await dbQuery(`select id from public.presupuestador_doors where linked_quote_id = $1 limit 1`, [quoteId]);
      if (existing.rows?.[0]?.id) {
        const door = await getDoorHydratedById(existing.rows[0].id);
        return res.json({ ok: true, door });
      }

      const quote = await ensureQuoteLinkAvailable(quoteId, req.user.user_id);
      const record = buildInitialDoorRecord({ quote, user: req.user });
      const ins = await dbQuery(
        `
        insert into public.presupuestador_doors
          (created_by_user_id, linked_quote_id, door_code, status, record, end_customer, sale_product_id, purchase_product_id)
        values
          ($1, $2, $3, 'draft', $4::jsonb, $5::jsonb, $6, $7)
        returning id
        `,
        [Number(req.user.user_id), quoteId, buildDoorCodeFromQuote(quote), JSON.stringify(record), JSON.stringify(record.end_customer), DOOR_PRODUCT_ID, DOOR_PRODUCT_ID]
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
      if (!["draft", "pending_approvals"].includes(text(cur.status))) return res.status(409).json({ ok: false, error: "La puerta ya no se puede editar" });

      const record = req.body?.record;
      if (!record || typeof record !== "object") return res.status(400).json({ ok: false, error: "Falta record (objeto)" });

      const normalized = normalizeDoorRecord(record, cur, req.user);
      validateDoorDraft(normalized);

      const nextLinkedQuoteId = text(normalized.linked_quote_id || "") || null;
      const linkedQuote = nextLinkedQuoteId ? await ensureQuoteLinkAvailable(nextLinkedQuoteId, req.user.user_id, id) : null;
      const nextDoorCode = linkedQuote ? buildDoorCodeFromQuote(linkedQuote, id) : buildStandaloneDoorCode(id);

      await dbQuery(
        `
        update public.presupuestador_doors
        set linked_quote_id = $2,
            door_code = $3,
            record = $4::jsonb,
            end_customer = $5::jsonb,
            supplier_partner_id = $6,
            supplier_name = $7,
            sale_amount = $8,
            purchase_amount = $9,
            conditions_text = $10,
            updated_at = now()
        where id = $1
        `,
        [
          id,
          nextLinkedQuoteId,
          nextDoorCode,
          JSON.stringify(normalized),
          JSON.stringify(safeEndCustomer(normalized.end_customer)),
          toInt(normalized.supplier_partner_id),
          text(normalized.supplier_name) || null,
          round2(normalized.sale_amount || 0) || null,
          round2(normalized.purchase_amount || 0) || null,
          text(normalized.conditions_text) || null,
        ]
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
      const cur = await getDoorHydratedById(id);
      if (!cur) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (String(cur.created_by_user_id) !== String(req.user.user_id)) return res.status(403).json({ ok: false, error: "No autorizado" });
      if (text(cur.status) !== "draft") return res.status(409).json({ ok: false, error: "Solo se puede confirmar una puerta en borrador" });

      const record = normalizeDoorRecord(cur.record, cur, req.user);
      validateDoorSubmit(record);

      await dbQuery(
        `
        update public.presupuestador_doors
        set status = 'pending_approvals',
            confirmed_at = now(),
            record = $2::jsonb,
            end_customer = $3::jsonb,
            supplier_partner_id = $4,
            supplier_name = $5,
            sale_amount = $6,
            purchase_amount = $7,
            conditions_text = $8,
            commercial_decision = 'pending',
            technical_decision = 'pending',
            commercial_notes = null,
            technical_notes = null,
            rejection_notes = null,
            updated_at = now()
        where id = $1
        `,
        [
          id,
          JSON.stringify(record),
          JSON.stringify(safeEndCustomer(record.end_customer)),
          toInt(record.supplier_partner_id),
          text(record.supplier_name) || null,
          round2(record.sale_amount || 0),
          round2(record.purchase_amount || 0),
          text(record.conditions_text),
        ]
      );

      const door = await getDoorHydratedById(id);
      return res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/review/commercial", requireCommercial, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const { action, notes } = req.body || {};
      const act = text(action).toLowerCase();
      if (!["approve", "reject"].includes(act)) return res.status(400).json({ ok: false, error: "action debe ser approve o reject" });

      const cur = await getDoorHydratedById(id);
      if (!cur) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (cur.status !== "pending_approvals") return res.status(409).json({ ok: false, error: "La puerta no está en aprobación" });
      if (cur.commercial_decision !== "pending") return res.json({ ok: true, door: cur });

      if (act === "reject") {
        await dbQuery(
          `
          update public.presupuestador_doors
          set status = 'draft',
              commercial_decision = 'rejected',
              commercial_by_user_id = $2,
              commercial_at = now(),
              commercial_notes = $3,
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'COMERCIAL: ' || $3),
              updated_at = now()
          where id = $1
          `,
          [id, Number(req.user.user_id), text(notes || "Rechazado")]
        );
        return res.json({ ok: true, door: await getDoorHydratedById(id) });
      }

      await dbQuery(
        `
        update public.presupuestador_doors
        set commercial_decision = 'approved',
            commercial_by_user_id = $2,
            commercial_at = now(),
            commercial_notes = $3,
            updated_at = now()
        where id = $1
        `,
        [id, Number(req.user.user_id), text(notes) || null]
      );

      const afterApprove = await getDoorHydratedById(id);
      if (afterApprove.technical_decision !== "approved") {
        return res.json({ ok: true, door: afterApprove });
      }

      await dbQuery(`update public.presupuestador_doors set status='syncing_odoo', updated_at=now() where id=$1`, [id]);
      const syncing = await getDoorHydratedById(id);
      try {
        const { saleOrder, purchaseOrder } = await syncDoorToOdoo({ odoo, door: syncing });
        await dbQuery(
          `
          update public.presupuestador_doors
          set status = 'synced_odoo',
              odoo_sale_order_id = $2,
              odoo_sale_order_name = $3,
              odoo_purchase_order_id = $4,
              odoo_purchase_order_name = $5,
              synced_at = now(),
              updated_at = now()
          where id = $1
          `,
          [id, Number(saleOrder?.id || 0) || null, saleOrder?.name || null, Number(purchaseOrder?.id || 0) || null, purchaseOrder?.name || null]
        );
      } catch (e) {
        await dbQuery(`update public.presupuestador_doors set status='pending_approvals', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2), updated_at=now() where id=$1`, [id, text(e?.message || "Error al sincronizar a Odoo")]);
        throw e;
      }

      const door = await getDoorHydratedById(id);
      return res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  router.post("/:id/review/technical", requireTech, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const { action, notes } = req.body || {};
      const act = text(action).toLowerCase();
      if (!["approve", "reject"].includes(act)) return res.status(400).json({ ok: false, error: "action debe ser approve o reject" });

      const cur = await getDoorHydratedById(id);
      if (!cur) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (cur.status !== "pending_approvals") return res.status(409).json({ ok: false, error: "La puerta no está en aprobación" });
      if (cur.technical_decision !== "pending") return res.json({ ok: true, door: cur });

      if (act === "reject") {
        await dbQuery(
          `
          update public.presupuestador_doors
          set status = 'draft',
              technical_decision = 'rejected',
              technical_by_user_id = $2,
              technical_at = now(),
              technical_notes = $3,
              rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'TECNICA: ' || $3),
              updated_at = now()
          where id = $1
          `,
          [id, Number(req.user.user_id), text(notes || "Rechazado")]
        );
        return res.json({ ok: true, door: await getDoorHydratedById(id) });
      }

      await dbQuery(
        `
        update public.presupuestador_doors
        set technical_decision = 'approved',
            technical_by_user_id = $2,
            technical_at = now(),
            technical_notes = $3,
            updated_at = now()
        where id = $1
        `,
        [id, Number(req.user.user_id), text(notes) || null]
      );

      const afterApprove = await getDoorHydratedById(id);
      if (afterApprove.commercial_decision !== "approved") {
        return res.json({ ok: true, door: afterApprove });
      }

      await dbQuery(`update public.presupuestador_doors set status='syncing_odoo', updated_at=now() where id=$1`, [id]);
      const syncing = await getDoorHydratedById(id);

      try {
        const { saleOrder, purchaseOrder } = await syncDoorToOdoo({ odoo, door: syncing });
        await dbQuery(
          `
          update public.presupuestador_doors
          set status = 'synced_odoo',
              odoo_sale_order_id = $2,
              odoo_sale_order_name = $3,
              odoo_purchase_order_id = $4,
              odoo_purchase_order_name = $5,
              synced_at = now(),
              updated_at = now()
          where id = $1
          `,
          [id, Number(saleOrder?.id || 0) || null, saleOrder?.name || null, Number(purchaseOrder?.id || 0) || null, purchaseOrder?.name || null]
        );
      } catch (e) {
        await dbQuery(`update public.presupuestador_doors set status='pending_approvals', rejection_notes = concat_ws(E'\n', nullif(rejection_notes,''), 'SYNC ERROR: ' || $2), updated_at=now() where id=$1`, [id, text(e?.message || "Error al sincronizar a Odoo")]);
        throw e;
      }

      return res.json({ ok: true, door: await getDoorHydratedById(id) });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

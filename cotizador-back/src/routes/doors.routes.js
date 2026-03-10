import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureDoorsSchema } from "../doorsSchema.js";

function requireSeller(req, res, next) {
  if (!req.user?.is_vendedor) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}

function isUuid(v) {
  const s = String(v || "").trim();
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}

function normalizeDoorBaseCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("P") ? raw : `P${raw}`;
}

function buildFallbackDoorCode(quoteId) {
  const raw = String(quoteId || "").trim().replace(/-/g, "").toUpperCase();
  return `P${raw.slice(0, 8) || "PUERTA"}`;
}

function buildDoorCodeFromQuote(quote) {
  if (!quote) return "PPUERTA";
  const odooName = String(quote.odoo_sale_order_name || "").trim();
  if (odooName) return normalizeDoorBaseCode(odooName);
  return buildFallbackDoorCode(quote.id);
}

function buildInitialDoorRecord({ quote, user }) {
  const responsible = user?.full_name || user?.username || "";
  return {
    obra_cliente: quote?.end_customer?.name || "",
    nv: "",
    tipo: "Puerta principal",
    vista: "Exterior",
    responsable,
    proveedor: "GRIVEL",
    fecha: new Date().toISOString().slice(0, 10),
    nv_proveedor: "",
    asociado_porton: String(quote?.odoo_sale_order_name || "").trim(),
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
    checklist: [
      { section: "A", item: "Confirmar que es puerta principal de acceso.", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "A", item: "Confirmar lado de vista: EXTERIOR (parado afuera mirando la puerta).", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "B", item: "Definir sentido de giro: ABRE HACIA ADENTRO o ABRE HACIA AFUERA.", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "B", item: "Si no es estándar, registrar motivo (seguridad, evacuación, viento, interferencias, etc.).", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "C", item: "Definir mano desde exterior: bisagras a IZQUIERDA = MI; bisagras a DERECHA = MD.", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "C", item: "Confirmar picaporte/cerradura del lado opuesto a bisagras.", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "D", item: "Confirmar ángulo requerido (90° default / 120° / 180° / otro).", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "D", item: "Verificar interferencias (pared, mueble, escalón, baranda, artefactos, etc.).", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "D", item: "Definir accesorios (tope, retenedor, cierrapuertas) según condiciones.", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "E", item: "Tipo de marco definido (madera/chapa/aluminio/u otro).", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "E", item: "Tipo de hoja definido (ciega/vidriada/seguridad/u otro).", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "E", item: "Lado de cerradura visto desde exterior definido (izquierda/derecha).", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "E", item: "Compatibilidad de cerradura/manija con mano (MI/MD) y sentido (adentro/afuera).", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "F", item: "Generar texto estándar final y revisar consistencia contra lo observado.", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
      { section: "F", item: "Validar definición con obra/cliente antes de fabricación/compra.", status: "Pendiente", notes: "", responsible, date: new Date().toISOString().slice(0, 10), ok: false },
    ],
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

async function getDoorHydratedById(id) {
  const r = await dbQuery(
    `
    select
      d.*,
      q.odoo_sale_order_name as linked_quote_odoo_name,
      q.status as linked_quote_status,
      q.end_customer as linked_quote_end_customer
    from public.presupuestador_doors d
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
    : row.door_code;

  return {
    ...row,
    door_code: resolvedDoorCode || row.door_code,
  };
}

export function buildDoorsRouter() {
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

  router.post("/from-quote/:quoteId", requireSeller, async (req, res, next) => {
    try {
      const quoteId = String(req.params.quoteId || "").trim();
      if (!isUuid(quoteId)) return res.status(400).json({ ok: false, error: "quoteId inválido" });

      const quote = await getQuoteOwnedBySeller(quoteId, req.user.user_id);
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado o no sos dueño" });

      const existing = await dbQuery(
        `
        select id
        from public.presupuestador_doors
        where linked_quote_id = $1
        limit 1
        `,
        [quoteId]
      );
      const existingId = existing.rows?.[0]?.id;
      if (existingId) {
        const door = await getDoorHydratedById(existingId);
        return res.json({ ok: true, door });
      }

      const record = buildInitialDoorRecord({ quote, user: req.user });
      const doorCode = buildDoorCodeFromQuote(quote);

      const ins = await dbQuery(
        `
        insert into public.presupuestador_doors
          (created_by_user_id, linked_quote_id, door_code, status, record)
        values
          ($1, $2, $3, 'draft', $4::jsonb)
        returning id
        `,
        [Number(req.user.user_id), quoteId, doorCode, JSON.stringify(record)]
      );

      const door = await getDoorHydratedById(ins.rows?.[0]?.id);
      return res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  router.get("/:id", requireSeller, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "id inválido" });

      const door = await getDoorHydratedById(id);
      if (!door) return res.status(404).json({ ok: false, error: "Puerta no encontrada" });
      if (String(door.created_by_user_id) !== String(req.user.user_id)) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }

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
      if (String(cur.created_by_user_id) !== String(req.user.user_id)) {
        return res.status(403).json({ ok: false, error: "No autorizado" });
      }

      const record = req.body?.record;
      if (!record || typeof record !== "object") {
        return res.status(400).json({ ok: false, error: "Falta record (objeto)" });
      }

      const linkedQuote = cur.linked_quote_id
        ? await getQuoteOwnedBySeller(cur.linked_quote_id, req.user.user_id)
        : null;

      const nextDoorCode = linkedQuote ? buildDoorCodeFromQuote(linkedQuote) : cur.door_code;

      await dbQuery(
        `
        update public.presupuestador_doors
        set record = $2::jsonb,
            door_code = $3,
            updated_at = now()
        where id = $1
        `,
        [id, JSON.stringify(record), nextDoorCode]
      );

      const door = await getDoorHydratedById(id);
      return res.json({ ok: true, door });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

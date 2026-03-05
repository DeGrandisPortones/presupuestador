import express from "express";
import { requireAuth } from "../auth.js";

export function buildOdooRouter(odoo) {
  const router = express.Router();

  router.get("/health", (_req, res) => res.json({ ok: true }));

  router.get("/debug-auth", async (_req, res, next) => {
    try {
      const uid = await odoo._debugAuth();
      res.json({ ok: true, uid });
    } catch (e) {
      next(e);
    }
  });

  // -------------------------
  // Pricelists
  // -------------------------
  router.get("/pricelists", async (_req, res, next) => {
    try {
      const pls = await odoo.executeKw(
        "product.pricelist",
        "search_read",
        [[]],
        { fields: ["id", "name", "currency_id", "active"], limit: 200, order: "name asc" }
      );

      res.json({
        ok: true,
        pricelists: pls.map((p) => ({
          id: p.id,
          name: p.name,
          active: p.active,
          currency_id: Array.isArray(p.currency_id) ? p.currency_id[0] : p.currency_id,
          currency_name: Array.isArray(p.currency_id) ? p.currency_id[1] : null,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  // -------------------------
  // Products (búsqueda)
  // -------------------------
  router.get("/products", async (req, res, next) => {
    try {
      const query = (req.query.query || "").toString().trim();
      const limit = Number(req.query.limit || 30);

      const domain = [["sale_ok", "=", true]];
      if (query) domain.push("|", ["name", "ilike", query], ["default_code", "ilike", query]);

      const products = await odoo.executeKw("product.product", "search_read", [domain], {
        fields: ["id", "name", "default_code", "uom_id"],
        limit,
        order: "name asc",
      });

      res.json({
        ok: true,
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.default_code || null,
          uom_id: Array.isArray(p.uom_id) ? p.uom_id[0] : p.uom_id,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  // -------------------------
  // Customers (solo vendedor)
  // -------------------------
  router.get("/customers", async (req, res, next) => {
    try {
      const query = (req.query.query || "").toString().trim();
      const limit = Number(req.query.limit || 20);

      const domain = [["active", "=", true]];
      if (query) domain.push("|", "|", ["name", "ilike", query], ["email", "ilike", query], ["phone", "ilike", query]);

      const customers = await odoo.executeKw("res.partner", "search_read", [domain], {
        fields: ["id", "name", "email", "phone", "street", "city"],
        limit,
        order: "name asc",
      });

      res.json({ ok: true, customers });
    } catch (e) {
      next(e);
    }
  });

  router.get("/customers/:id/quotes", async (req, res, next) => {
    try {
      const customerId = Number(req.params.id);
      const limit = Number(req.query.limit || 20);
      if (!customerId) throw new Error("customerId inválido");

      const domain = [
        ["partner_id", "=", customerId],
        ["state", "in", ["draft", "sent"]],
      ];

      const orders = await odoo.executeKw("sale.order", "search_read", [domain], {
        fields: ["id", "name", "date_order", "amount_total", "state", "validity_date"],
        limit,
        order: "date_order desc",
      });

      res.json({ ok: true, quotes: orders });
    } catch (e) {
      next(e);
    }
  });

  // -------------------------
  // Prices (para el front)
  // -------------------------
  router.post("/prices", async (req, res, next) => {
    try {
      const body = req.body || {};
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length) throw new Error("Faltan lines[]");

      const partnerId = body.partner_id ? Number(body.partner_id) : false;

      // el front puede mandar pricelist_id
      let pricelistId = body.pricelist_id ? Number(body.pricelist_id) : null;

      if (!pricelistId) {
        const name = (process.env.ODOO_BASE_PRICELIST_NAME || process.env.ODOO_CUSTOMER_PRICELIST_NAME || "Predeterminado").trim();
        pricelistId = await findPricelistIdByName(odoo, name);
        if (!pricelistId) throw new Error(`No existe la lista de precios "${name}"`);
      }

      const productIds = [...new Set(lines.map((l) => Number(l.product_id)))];
      const products = await odoo.executeKw("product.product", "read", [productIds], {
        fields: ["id", "name", "default_code"],
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      const out = [];
      for (const l of lines) {
        const productId = Number(l.product_id);
        const qty = Number(l.qty || 1);
        const p = byId.get(productId);
        if (!p) throw new Error(`Producto no encontrado: ${productId}`);

        const price = await getPriceFromPricelist({ odoo, pricelistId, productId, qty, partnerId });

        out.push({
          product_id: productId,
          qty,
          price: round2(price),
          name: p.name,
          code: p.default_code || null,
        });
      }

      res.json({ ok: true, pricelist_id: pricelistId, partner_id: partnerId || null, prices: out });
    } catch (e) {
      next(e);
    }
  });

  // -------------------------
  // SYNC ORDER (usa precio BASE)
  // -------------------------
  router.post("/orders/sync", requireAuth, async (req, res, next) => {
    try {
      const body = req.body || {};
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length) throw new Error("Faltan lines[]");

      // Si el usuario tiene ambos roles, forzamos que elija mode
      const user = req.user;
      const mode = (body.mode || "").toString().trim(); // "distributor" | "seller" | ""

      const isBoth = user.is_distribuidor && user.is_vendedor;
      const isDistributorFlow =
        (!isBoth && user.is_distribuidor && !user.is_vendedor) || mode === "distributor";
      const isSellerFlow =
        (!isBoth && user.is_vendedor && !user.is_distribuidor) || mode === "seller";

      if (!isDistributorFlow && !isSellerFlow) {
        throw new Error('No puedo inferir el flujo. Si el usuario es "ambos", mandá body.mode = "distributor" o "seller".');
      }

      // pricelist base
      const pricelistId = body.pricelist_id
        ? Number(body.pricelist_id)
        : await findPricelistIdByName(
            odoo,
            (process.env.ODOO_BASE_PRICELIST_NAME || process.env.ODOO_CUSTOMER_PRICELIST_NAME || "Predeterminado").trim()
          );

      if (!pricelistId) throw new Error("No pude resolver pricelistId");

      // partner destino de la venta en Odoo
      let partnerId = null;

      // datos cliente final (solo nota si distribuidor)
      const endCustomer = body.end_customer || {};

      if (isDistributorFlow) {
        partnerId = user.odoo_partner_id ? Number(user.odoo_partner_id) : Number(body.distributor_partner_id);
        if (!partnerId) throw new Error("Distribuidor sin odoo_partner_id (JWT) y sin distributor_partner_id (body)");
      }

      if (isSellerFlow) {
        // acá sí va a Odoo como res.partner
        if (body.customer_partner_id) {
          partnerId = Number(body.customer_partner_id);
        } else {
          const c = body.customer || {};
          if (!c.name) throw new Error("Falta customer.name (vendedor) o customer_partner_id");
          partnerId = await findOrCreateCustomerPartner(odoo, c);
        }
      }

      // calcular precio base por línea
      const productIds = [...new Set(lines.map((l) => Number(l.product_id)))];
      const products = await odoo.executeKw("product.product", "read", [productIds], {
        fields: ["id", "name", "uom_id"],
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      const orderLines = [];
      for (const l of lines) {
        const productId = Number(l.product_id);
        const qty = Number(l.qty || 1);
        const p = byId.get(productId);
        if (!p) throw new Error(`Producto no encontrado: ${productId}`);

        const uomId = Array.isArray(p?.uom_id) ? p.uom_id[0] : null;
        if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);

        // No calculamos precio acá: dejamos que Odoo lo compute con la pricelist del sale.order
        orderLines.push([0, 0, {
          product_id: productId,
          product_uom_qty: qty,
          product_uom: uomId,
          name: p.name,
        }]);
      }

      const note = isDistributorFlow
        ? buildDistributorNote({ endCustomer, extra_note: body.note || "" })
        : (body.note || false);

      // create con dict (vals) para que Odoo retorne un id (int)
      const orderId = await odoo.executeKw("sale.order", "create", [{
        partner_id: partnerId,
        pricelist_id: pricelistId,
        order_line: orderLines,
        note,
      }]);

      const [order] = await odoo.executeKw("sale.order", "read", [[orderId]], {
        fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id"],
      });

      res.json({ ok: true, flow: isDistributorFlow ? "distributor" : "seller", order });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

// -------------------------
// Helpers
// -------------------------
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function findPricelistIdByName(odoo, name) {
  const ids = await odoo.executeKw("product.pricelist", "search", [[[["name", "=", name]]]], { limit: 1 });
  return ids?.[0] || null;
}

function buildDistributorNote({ endCustomer, extra_note }) {
  const parts = [];
  parts.push("VENTA A DISTRIBUIDOR (cliente final NO cargado en Odoo).");
  if (endCustomer?.name) parts.push(`Cliente final: ${endCustomer.name}`);
  if (endCustomer?.phone) parts.push(`Tel: ${endCustomer.phone}`);
  if (endCustomer?.email) parts.push(`Email: ${endCustomer.email}`);
  if (endCustomer?.address) parts.push(`Dirección: ${endCustomer.address}`);
  if (extra_note) parts.push(`Obs: ${extra_note}`);
  return parts.join("\n");
}

async function findOrCreateCustomerPartner(odoo, customer) {
  // 1) por email
  if (customer.email) {
    const ids = await odoo.executeKw("res.partner", "search", [[[["email", "=", customer.email]]]], { limit: 1 });
    if (ids?.[0]) return ids[0];
  }
  // 2) por nombre exacto
  const ids2 = await odoo.executeKw("res.partner", "search", [[[["name", "=", customer.name]]]], { limit: 1 });
  if (ids2?.[0]) return ids2[0];

  // 3) crear
  const id = await odoo.executeKw("res.partner", "create", [{
    name: customer.name,
    email: customer.email || false,
    phone: customer.phone || false,
    street: customer.street || false,
    city: customer.city || false,
    customer_rank: 1,
  }]);
  return id;
}

async function getPriceFromPricelist({ odoo, pricelistId, productId, qty, partnerId }) {
  // En este Odoo no existen get_product_price / price_get (según logs).
  // Para evitar errores, usamos un fallback robusto: list_price desde product.product o product.template.
  try {
    const [p] = await odoo.executeKw("product.product", "read", [[productId]], { fields: ["list_price"] });
    if (typeof p?.list_price === "number") return p.list_price;
  } catch (_) {}

  try {
    const [p2] = await odoo.executeKw("product.product", "read", [[productId]], { fields: ["product_tmpl_id"] });
    const tmplId = Array.isArray(p2?.product_tmpl_id) ? p2.product_tmpl_id[0] : null;
    if (tmplId) {
      const [t] = await odoo.executeKw("product.template", "read", [[tmplId]], { fields: ["list_price"] });
      if (typeof t?.list_price === "number") return t.list_price;
    }
  } catch (_) {}

  return 0;
}

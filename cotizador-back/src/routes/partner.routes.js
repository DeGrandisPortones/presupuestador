// API de partner: pensada para que el sistema de un distribuidor externo pida
// precios "iguales a lo que hace un distribuidor acá" sin loguearse como
// usuario y sin tener que reimplementar nuestras reglas de catálogo/precio.
//
// A propósito NO expone el mismo shape que /api/catalog o /api/quotes (esos son
// internos, para nuestro propio frontend): esta es una superficie chica y
// versionada aparte (/api/partner/v1) para que un cambio interno de catálogo no
// le rompa la integración a un tercero. Todo el cálculo de precio (lista de
// Odoo del distribuidor, margen, forma de pago, condición de IVA) se resuelve
// acá - el cliente externo solo manda qué productos y cantidades eligió.
import express from "express";
import { partnerRateLimit, requirePartnerApiKey } from "../partnerAuth.js";
import { loadCatalogBootstrap } from "../catalogBootstrap.js";
import { normKind } from "../catalogDb.js";
import { getPriceFromPricelist, resolveProductInfoForPricing } from "./odoo.routes.js";
import { IVA_RATE, round2 } from "./quotes.routes.js";
import { dbQuery } from "../db.js";

const MAX_ITEMS_PER_REQUEST = 50;
const CONDITION_2_IVA_RATE = 0.105;

function publicCatalogProduct(p) {
  return {
    id: Number(p.id),
    name: p.display_name || p.original_name || null,
    sections: Array.isArray(p.sections) ? p.sections : [],
  };
}

// Mismo cálculo que ve un distribuidor logueado en el cotizador propio (ver
// calcFinalUnitPrice/calcTotals en cotizador-front/src/domain/quote/pricing.js):
// precio base de Odoo, con margen y recargo/descuento por forma de pago
// aplicados como coeficientes, y el IVA aparte según la condición.
function calcPartnerUnitPrice(basePrice, marginPercent, adjustmentPercent) {
  const base = Number(basePrice || 0);
  const marginFactor = 1 + Number(marginPercent || 0) / 100;
  const adjustmentFactor = 1 + Number(adjustmentPercent || 0) / 100;
  return round2(base * marginFactor * adjustmentFactor);
}

export function buildPartnerRouter(odoo) {
  const router = express.Router();
  router.use(partnerRateLimit, requirePartnerApiKey);

  router.get("/catalog", async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      const data = await loadCatalogBootstrap(odoo, kind);
      const products = (Array.isArray(data.products) ? data.products : [])
        .filter((p) => !p.disable_for_distribuidor)
        .map(publicCatalogProduct);
      res.json({
        ok: true,
        kind,
        sections: (data.sections || []).map((s) => ({ id: s.id, name: s.name })),
        products,
      });
    } catch (e) { next(e); }
  });

  router.post("/price", async (req, res, next) => {
    try {
      const distributor = req.partnerDistributor;
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return res.status(400).json({ ok: false, error: "items vacío" });
      if (items.length > MAX_ITEMS_PER_REQUEST) {
        return res.status(400).json({ ok: false, error: `No se pueden cotizar más de ${MAX_ITEMS_PER_REQUEST} ítems por request` });
      }

      const marginPercent = Number(body.margin_percent || 0) || 0;
      const adjustmentPercent = Number(body.adjustment_percent || 0) || 0;
      const conditionMode = String(body.condition_mode || "cond1").trim().toLowerCase() === "cond2" ? "cond2" : "cond1";

      // Se valida todo antes de pedir ningun precio: un item invalido no debe dejar
      // a mitad de camino llamadas a Odoo ya disparadas para los items anteriores.
      const parsedItems = items.map((item) => ({
        productId: Number(item?.product_id || 0),
        qty: Number(item?.qty || 1) || 0,
        raw: item,
      }));
      const invalid = parsedItems.find((it) => !it.productId || it.qty <= 0);
      if (invalid) {
        return res.status(400).json({ ok: false, error: `item inválido (falta product_id o qty): ${JSON.stringify(invalid.raw)}` });
      }

      // Mismo camino que /api/odoo/prices (cotizador interno): resuelve por las
      // reglas de product.pricelist.item de Odoo, y todos los items en paralelo -
      // antes esto pedia el precio uno por uno, en serie, con hasta 8 intentos de
      // metodos de Odoo por producto (el motivo real de la demora reportada antes
      // con este mismo patron en el cotizador interno, ver getPrices en
      // odoo.routes.js).
      const lines = await Promise.all(parsedItems.map(async ({ productId, qty }) => {
        const productInfo = await resolveProductInfoForPricing(odoo, { product_id: productId });
        const price = await getPriceFromPricelist({
          odoo,
          pricelistId: distributor.odoo_pricelist_id,
          productId,
          qty,
          partnerId: distributor.odoo_partner_id || false,
          templateId: productInfo.odoo_template_id || null,
        });
        const basePrice = price > 0 ? price : productInfo.list_price;
        const unitPrice = calcPartnerUnitPrice(basePrice, marginPercent, adjustmentPercent);
        return {
          product_id: productId,
          qty,
          base_price: round2(basePrice),
          unit_price: unitPrice,
          line_total: round2(unitPrice * qty),
        };
      }));

      const subtotal = round2(lines.reduce((acc, l) => acc + l.line_total, 0));
      const ivaRate = conditionMode === "cond2" ? CONDITION_2_IVA_RATE : IVA_RATE;
      const iva = round2(subtotal * ivaRate);
      const total = round2(subtotal + iva);

      res.json({
        ok: true,
        distributor: { id: distributor.id, name: distributor.full_name },
        condition_mode: conditionMode,
        margin_percent: marginPercent,
        adjustment_percent: adjustmentPercent,
        lines,
        subtotal,
        iva_rate: ivaRate,
        iva,
        total,
      });
    } catch (e) { next(e); }
  });

  // Fechas de producción/instalación de un NV puntual. Estas fechas viven en la
  // tabla de Planta (public.portones - misma base compartida, ver
  // project_planta_sync_silencioso_portones), no en presupuestador_quotes.
  //
  // A propósito NO se verifica que el NV pertenezca al distribuidor de esta API
  // key: NVs viejos ya no tienen fila viva en presupuestador_quotes (de donde
  // sale el dueño) pero sí siguen en Planta, y confirmado con De Grandis que
  // para esta info (solo fechas, sin precios ni datos del cliente) el riesgo de
  // exponer el NV de otro distribuidor es aceptable. Si esto cambia, hay que
  // volver a cruzar contra presupuestador_quotes.bill_to_odoo_partner_id.
  router.get("/orders/:nv", async (req, res, next) => {
    try {
      const nv = Number(req.params.nv);
      if (!Number.isFinite(nv) || nv <= 0) return res.status(400).json({ ok: false, error: "nv inválido" });

      const r = await dbQuery(
        `select to_char(fecha_plan_entrega, 'YYYY-MM-DD') as fecha_llegada_instalacion,
                to_char(fecha_med, 'YYYY-MM-DD') as fecha_medicion
           from public.portones
          where nv = $1
          order by created_at desc
          limit 1`,
        [nv]
      );
      const row = r.rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: `NV ${nv} no encontrado` });

      res.json({
        ok: true,
        nv,
        fecha_llegada_instalacion: row.fecha_llegada_instalacion || null,
        fecha_medicion: row.fecha_medicion || null,
      });
    } catch (e) { next(e); }
  });

  return router;
}

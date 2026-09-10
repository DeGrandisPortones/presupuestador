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

// Fecha de llegada/instalación de un NV puntual: vive en la tabla de Planta
// (public.portones - misma base compartida), no en presupuestador_quotes.
//
// A propósito NO se verifica que el NV pertenezca al distribuidor de esta API
// key: NVs viejos ya no tienen fila viva en presupuestador_quotes (de donde
// sale el dueño) pero sí siguen en Planta, y confirmado con De Grandis que
// para esta info (solo fechas, sin precio ni datos de cliente) el riesgo de
// exponer el NV de otro distribuidor es aceptable. Si esto cambia, hay que
// cruzar contra presupuestador_quotes.bill_to_odoo_partner_id.
async function fetchInstallationDate(nv) {
  const r = await dbQuery(
    `select to_char(fecha_plan_entrega, 'YYYY-MM-DD') as fecha_llegada_instalacion
       from public.portones
      where nv = $1
      order by created_at desc
      limit 1`,
    [nv]
  );
  return r.rows?.[0]?.fecha_llegada_instalacion || null;
}

// Fecha de medición: NO viene de Planta (portones.fecha_med) - probado contra
// datos reales, esa columna queda en null en filas de Planta que todavía no
// sincronizaron el dato aunque la medición ya esté hecha (caso real: NV 4270,
// medido 20/07/2026 según presupuestador_quotes, portones.fecha_med en null).
// La fuente confiable es presupuestador_quotes: measurement_at si ya se
// realizó, si no measurement_scheduled_for (programada pero pendiente). Estos
// campos viven en la fila 'original' del quote, no en la 'copy' que lleva el
// NV final, así que se matchea por el número de NV/NP contra cualquiera de
// los dos nombres de esa fila original.
async function fetchMeasurementDate(nv) {
  const r = await dbQuery(
    `select to_char(measurement_at, 'YYYY-MM-DD') as fecha_realizada,
            to_char(measurement_scheduled_for, 'YYYY-MM-DD') as fecha_programada
       from public.presupuestador_quotes
      where quote_kind = 'original'
        and (
          regexp_replace(coalesce(odoo_sale_order_name, ''), '\\D', '', 'g') = $1
          or regexp_replace(coalesce(final_sale_order_name, ''), '\\D', '', 'g') = $1
        )
      order by updated_at desc nulls last, id desc
      limit 1`,
    [String(nv)]
  );
  const row = r.rows?.[0];
  return row?.fecha_realizada || row?.fecha_programada || null;
}

async function fetchOrderDates(nv) {
  const [fecha_llegada_instalacion, fecha_medicion] = await Promise.all([
    fetchInstallationDate(nv),
    fetchMeasurementDate(nv),
  ]);
  return { fecha_llegada_instalacion, fecha_medicion };
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

      // nv es opcional: si el pedido ya tiene un NV asignado (orden ya en
      // producción), se informan sus fechas junto con el precio en la misma
      // respuesta - ver fetchOrderDates.
      const nv = Number(body.nv || 0);
      const orderDates = nv > 0 ? await fetchOrderDates(nv) : { fecha_llegada_instalacion: null, fecha_medicion: null };

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
        nv: nv > 0 ? nv : null,
        fecha_llegada_instalacion: orderDates.fecha_llegada_instalacion,
        fecha_medicion: orderDates.fecha_medicion,
      });
    } catch (e) { next(e); }
  });

  return router;
}

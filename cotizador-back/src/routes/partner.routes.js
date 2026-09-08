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
import { getPriceFromOdooPricelist } from "./odooPriceCache.routes.js";
import { IVA_RATE, round2 } from "./quotes.routes.js";

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

      const lines = [];
      for (const item of items) {
        const productId = Number(item?.product_id || 0);
        const qty = Number(item?.qty || 1) || 0;
        if (!productId || qty <= 0) {
          return res.status(400).json({ ok: false, error: `item inválido (falta product_id o qty): ${JSON.stringify(item)}` });
        }

        const basePrice = await getPriceFromOdooPricelist({
          odoo,
          pricelistId: distributor.odoo_pricelist_id,
          productId,
          qty,
          partnerId: distributor.odoo_partner_id || false,
        });
        const unitPrice = calcPartnerUnitPrice(basePrice, marginPercent, adjustmentPercent);
        lines.push({
          product_id: productId,
          qty,
          base_price: round2(basePrice),
          unit_price: unitPrice,
          line_total: round2(unitPrice * qty),
        });
      }

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

  return router;
}

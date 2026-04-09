import express from "express";
import { requireAuth } from "../auth.js";
import { getProductionPlanningEstimate, getQuoteForProductionPlanning } from "../productionPlanning.js";

export function buildProductionPlanningRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/estimate", async (req, res, next) => {
    try {
      const quoteId = String(req.query.quote_id || "").trim() || null;
      const fromDate = String(req.query.from_date || "").trim() || null;
      if (quoteId) {
        const quote = await getQuoteForProductionPlanning(quoteId, req.user);
        if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      }
      const estimate = await getProductionPlanningEstimate({ quoteId, fromDate });
      res.json({ ok: true, estimate });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

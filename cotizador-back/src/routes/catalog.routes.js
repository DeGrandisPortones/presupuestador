import express from "express";
import { requireAuth } from "../auth.js";
import { loadCatalogBootstrap, clearCatalogBootstrapCache } from "../catalogBootstrap.js";

export function buildCatalogRouter(odoo) {
  const router = express.Router();

  // /api/catalog/bootstrap?kind=porton|ipanel
  router.get("/bootstrap", requireAuth, async (req, res, next) => {
    try {
      const kind = req.query.kind || "porton";
      const data = await loadCatalogBootstrap(odoo, kind);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  router.post("/refresh", requireAuth, async (req, res, next) => {
    try {
      const kind = req.query.kind || req.body?.kind || "porton";
      clearCatalogBootstrapCache();
      const data = await loadCatalogBootstrap(odoo, kind);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

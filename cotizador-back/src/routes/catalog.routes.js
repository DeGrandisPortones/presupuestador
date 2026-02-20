import express from "express";
import { requireAuth } from "../auth.js";
import { loadCatalogBootstrap } from "../catalogBootstrap.js";

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

  return router;
}

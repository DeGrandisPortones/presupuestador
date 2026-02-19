import express from "express";
import { requireAuth } from "../auth.js";
import { loadCatalogBootstrap } from "../catalogBootstrap.js";

export function buildCatalogRouter(odoo) {
  const router = express.Router();
  router.use(requireAuth);

  // Catálogo enriquecido (secciones/tags/alias)
  router.get("/bootstrap", async (req, res, next) => {
    try {
      const limit = req.query.products_limit ? Number(req.query.products_limit) : undefined;
      const data = await loadCatalogBootstrap(odoo, { productsLimit: limit });
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

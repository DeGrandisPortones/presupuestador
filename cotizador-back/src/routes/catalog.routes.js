import express from "express";
import { requireAuth } from "../auth.js";
import { loadCatalogBootstrap, clearCatalogBootstrapCache } from "../catalogBootstrap.js";
import { inspectOdooProductTags, inspectOdooTagAndProducts } from "../odooBootstrap.js";

export function buildCatalogRouter(odoo) {
  const router = express.Router();

  // /api/catalog/bootstrap?kind=porton|ipanel|otros|puerta
  router.get("/bootstrap", requireAuth, async (req, res, next) => {
    try {
      const kind = req.query.kind || "porton";
      const data = await loadCatalogBootstrap(odoo, kind);
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  // GET real a Odoo para inspeccionar como vienen las etiquetas.
  // Ejemplos:
  // /api/catalog/odoo-product-debug?product_id=2894
  // /api/catalog/odoo-product-debug?template_id=3006
  // /api/catalog/odoo-product-debug?q=Estructura%20aluminio
  router.get("/odoo-product-debug", requireAuth, async (req, res, next) => {
    try {
      const data = await inspectOdooProductTags(odoo, {
        productId: req.query.product_id || req.query.productId || req.query.id || null,
        templateId: req.query.template_id || req.query.templateId || null,
        query: req.query.q || req.query.query || "",
      });
      res.json(data);
    } catch (e) {
      next(e);
    }
  });

  router.get("/odoo-tag-debug", requireAuth, async (req, res, next) => {
    try {
      const data = await inspectOdooTagAndProducts(odoo, {
        tagName: req.query.tag_name || req.query.tagName || req.query.tag || "Puerta",
        productId: req.query.product_id || req.query.productId || null,
        templateId: req.query.template_id || req.query.templateId || null,
        query: req.query.q || req.query.query || "SIN PUERTA",
      });
      console.log("[ODOO TAG DEBUG]", JSON.stringify({
        requested: data.requested,
        matching_tags: data.bootstrap_summary?.matching_tags,
        products_with_tag_by_id_count: data.bootstrap_summary?.products_with_tag_by_id_count,
        products_with_tag_by_name_count: data.bootstrap_summary?.products_with_tag_by_name_count,
      }, null, 2));
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

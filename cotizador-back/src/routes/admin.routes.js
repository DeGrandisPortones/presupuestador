import express from "express";
import { requireAuth } from "../auth.js";
import { clearOdooBootstrapCache } from "../odooBootstrap.js";
import { loadCatalogBootstrap } from "../catalogBootstrap.js";
import {
  upsertSection,
  deleteSection,
  setTagSection,
  setProductAlias,
  listSections,
  listTagSections,
  listProductAliases,
} from "../catalogDb.js";
import { dbQuery } from "../db.js";

function requireEncComercial(req, res, next) {
  if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}

export function buildAdminRouter(odoo) {
  const router = express.Router();
  router.use(requireAuth);
  router.use(requireEncComercial);

  // Vista unificada para dashboard
  router.get("/catalog", async (req, res, next) => {
    try {
      const data = await loadCatalogBootstrap(odoo);
      res.json({ ok: true, ...data });
    } catch (e) {
      next(e);
    }
  });

  // Secciones
  router.get("/sections", async (_req, res, next) => {
    try {
      const sections = await listSections();
      res.json({ ok: true, sections });
    } catch (e) { next(e); }
  });

  router.post("/sections", async (req, res, next) => {
    try {
      const s = await upsertSection(req.body || {});
      res.json({ ok: true, section: s });
    } catch (e) { next(e); }
  });

  router.delete("/sections/:id", async (req, res, next) => {
    try {
      await deleteSection(req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Mapeo tag -> section
  router.put("/tags/:tagId/section", async (req, res, next) => {
    try {
      const tagId = Number(req.params.tagId);
      const sectionId = req.body?.section_id ?? null;
      const r = await setTagSection({ tagId, sectionId });
      res.json({ ok: true, mapping: r });
    } catch (e) { next(e); }
  });

  // Alias por producto
  router.put("/products/:productId/alias", async (req, res, next) => {
    try {
      const productId = Number(req.params.productId);
      const alias = req.body?.alias ?? "";
      const r = await setProductAlias({ productId, alias });
      res.json({ ok: true, alias: r });
    } catch (e) { next(e); }
  });

  // Refrescar cache (por si cambiaste tags/productos en Odoo)
  router.post("/refresh", async (_req, res, next) => {
    try {
      clearOdooBootstrapCache();
      const data = await loadCatalogBootstrap(odoo);
      res.json({ ok: true, refreshed_at: new Date().toISOString(), catalog: data });
    } catch (e) { next(e); }
  });

  // Data: últimas cotizaciones (para dashboard)
  router.get("/quotes", async (req, res, next) => {
    try {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
      const r = await dbQuery(
        `select id, created_at, created_by_user_id, created_by_role, status, fulfillment_mode, pricelist_id,
                end_customer, lines, note, commercial_decision, technical_decision
         from public.presupuestador_quotes
         order by id desc
         limit $1`,
        [limit]
      );

      const catalog = await loadCatalogBootstrap(odoo);
      const prodById = new Map((catalog.products || []).map((p) => [Number(p.id), p]));
      const secById = new Map((catalog.sections || []).map((s) => [Number(s.id), s]));

      const quotes = (r.rows || []).map((q) => {
        const lines = Array.isArray(q.lines) ? q.lines : [];
        const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean))];
        const sectionIds = [...new Set(productIds.flatMap((pid) => (prodById.get(pid)?.section_ids || [])))];
        const sectionNames = sectionIds.map((sid) => secById.get(sid)?.name).filter(Boolean);
        return {
          ...q,
          section_ids: sectionIds,
          sections: sectionNames,
        };
      });

      res.json({ ok: true, quotes });
    } catch (e) { next(e); }
  });

  // Para debug rápido: ver config DB sin pegarle a Odoo
  router.get("/config", async (_req, res, next) => {
    try {
      const [sections, tag_sections, aliases] = await Promise.all([
        listSections(),
        listTagSections(),
        listProductAliases(),
      ]);
      res.json({ ok: true, sections, tag_sections, aliases });
    } catch (e) { next(e); }
  });

  return router;
}

import express from "express";
import { requireAuth } from "../auth.js";
import { loadCatalogBootstrap, clearCatalogBootstrapCache } from "../catalogBootstrap.js";
import { normKind, createSection, updateSection, deleteSection, setTagSection, setProductAlias, setProductVisibility, getTypeSectionsMap, setTypeSections, setTypeVisibility } from "../catalogDb.js";
import { dbQuery } from "../db.js";
import { listUsers, createUser, updateUser } from "../usersDb.js";
import {
  getCommercialFinalQuoteSettings,
  setCommercialFinalQuoteSettings,
  getDoorQuoteSettings,
  setDoorQuoteSettings,
  getTechnicalMeasurementRules,
  setTechnicalMeasurementRules,
  getTechnicalMeasurementFieldDefinitions,
  setTechnicalMeasurementFieldDefinitions,
  setProductionPlanningYear,
} from "../settingsDb.js";
import { getProductionPlanningWithUsage } from "../productionPlanning.js";

function requireEncComercial(req, res, next) { if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" }); next(); }
function requireSuperuser(req, res, next) { if (!req.user?.is_superuser) return res.status(403).json({ ok: false, error: "No autorizado" }); next(); }
function requireEncComercialOrSuperuser(req, res, next) { if (!req.user?.is_enc_comercial && !req.user?.is_superuser) return res.status(403).json({ ok: false, error: "No autorizado" }); next(); }

export function buildAdminRouter(odoo) {
  const router = express.Router();

  router.get("/catalog", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      const data = await loadCatalogBootstrap(odoo, kind);
      const q = await dbQuery(`select tag_id, section_id from public.presupuestador_tag_sections where catalog_kind=$1`, [kind]);
      const map = new Map((q.rows || []).map((r) => [Number(r.tag_id), Number(r.section_id)]));
      const tags = (data.tags || []).map((t) => ({ ...t, section_id: map.get(Number(t.id)) || null }));
      const type_sections = await getTypeSectionsMap(kind);
      res.json({ ...data, tags, type_sections });
    } catch (e) { next(e); }
  });

  router.get("/final-settings", requireAuth, requireEncComercialOrSuperuser, async (_req, res, next) => {
    try { res.json({ ok: true, settings: await getCommercialFinalQuoteSettings() }); } catch (e) { next(e); }
  });
  router.put("/final-settings", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try { res.json({ ok: true, settings: await setCommercialFinalQuoteSettings(req.body || {}) }); } catch (e) { next(e); }
  });
  router.get("/door-quote-settings", requireAuth, requireEncComercialOrSuperuser, async (_req, res, next) => {
    try { res.json({ ok: true, settings: await getDoorQuoteSettings() }); } catch (e) { next(e); }
  });
  router.put("/door-quote-settings", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try { res.json({ ok: true, settings: await setDoorQuoteSettings(req.body || {}) }); } catch (e) { next(e); }
  });

  router.get("/technical-measurement-rules", requireAuth, requireEncComercialOrSuperuser, async (_req, res, next) => {
    try { res.json({ ok: true, rules: await getTechnicalMeasurementRules() }); } catch (e) { next(e); }
  });
  router.put("/technical-measurement-rules", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try { res.json({ ok: true, rules: await setTechnicalMeasurementRules(req.body || {}) }); } catch (e) { next(e); }
  });
  router.get("/technical-measurement-fields", requireAuth, async (_req, res, next) => {
    try { res.json({ ok: true, fields: await getTechnicalMeasurementFieldDefinitions() }); } catch (e) { next(e); }
  });
  router.put("/technical-measurement-fields", requireAuth, requireSuperuser, async (req, res, next) => {
    try { res.json({ ok: true, fields: await setTechnicalMeasurementFieldDefinitions(req.body || {}) }); } catch (e) { next(e); }
  });

  router.get("/production-planning", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const now = new Date();
      const year = Number(req.query.year || now.getUTCFullYear());
      res.json({ ok: true, planning: await getProductionPlanningWithUsage(year) });
    } catch (e) { next(e); }
  });
  router.put("/production-planning", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const body = req.body || {};
      await setProductionPlanningYear({ year: body.year, weeks: body.weeks || [] });
      res.json({ ok: true, planning: await getProductionPlanningWithUsage(body.year) });
    } catch (e) { next(e); }
  });

  router.post("/sections", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const { name, position, use_surface_qty } = req.body || {};
      const section = await createSection(kind, { name, position, use_surface_qty });
      clearCatalogBootstrapCache();
      res.json({ ok: true, section });
    } catch (e) { next(e); }
  });
  router.put("/sections/:id", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const section = await updateSection(kind, req.params.id, req.body || {});
      clearCatalogBootstrapCache();
      res.json({ ok: true, section });
    } catch (e) { next(e); }
  });
  router.delete("/sections/:id", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      await deleteSection(kind, req.params.id);
      clearCatalogBootstrapCache();
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  router.put("/tags/:tagId/section", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const mapping = await setTagSection(kind, req.params.tagId, req.body?.section_id ?? null);
      clearCatalogBootstrapCache();
      res.json({ ok: true, mapping });
    } catch (e) { next(e); }
  });
  router.put("/products/:productId/alias", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const alias = req.body?.alias ?? "";
      const saved = await setProductAlias(kind, req.params.productId, alias);
      clearCatalogBootstrapCache();
      res.json({ ok: true, alias: saved.alias });
    } catch (e) { next(e); }
  });
  router.put("/products/:productId/visibility", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const saved = await setProductVisibility(kind, req.params.productId, req.body || {});
      clearCatalogBootstrapCache();
      res.json({ ok: true, visibility: saved });
    } catch (e) { next(e); }
  });
  router.put("/types/:typeKey/visibility", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      const saved = await setTypeVisibility(kind, req.params.typeKey, req.body || {});
      clearCatalogBootstrapCache();
      res.json({ ok: true, visibility: saved });
    } catch (e) { next(e); }
  });
  router.post("/refresh", requireAuth, requireEncComercialOrSuperuser, async (_req, res, next) => {
    try {
      clearCatalogBootstrapCache();
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  router.get("/quotes", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 500);
      const kind = req.query.kind ? normKind(req.query.kind) : null;
      const q = await dbQuery(`select id, created_at, created_by_role, status, final_status, fulfillment_mode, end_customer, lines, payload, commercial_decision, technical_decision, rejection_notes, catalog_kind, odoo_sale_order_name, final_sale_order_name, final_difference_amount, final_absorbed_by_company from public.presupuestador_quotes ${kind ? "where catalog_kind = $1" : ""} order by created_at desc limit ${kind ? "$2" : "$1"}`, kind ? [kind, limit] : [limit]);
      res.json({ ok: true, quotes: q.rows || [] });
    } catch (e) { next(e); }
  });
  router.get("/users", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const users = await listUsers({ role: req.query.role || "all", q: req.query.q || "", active: req.query.active || "all" });
      res.json({ ok: true, users });
    } catch (e) { next(e); }
  });
  router.post("/users", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try { res.json({ ok: true, user: await createUser(req.body || {}) }); } catch (e) { next(e); }
  });
  router.put("/users/:id", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try { res.json({ ok: true, user: await updateUser(req.params.id, req.body || {}) }); } catch (e) { next(e); }
  });
  router.put("/types/:typeKey/sections", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      const mapping = await setTypeSections(kind, req.params.typeKey, Array.isArray(req.body?.section_ids) ? req.body.section_ids : []);
      clearCatalogBootstrapCache();
      res.json({ ok: true, mapping });
    } catch (e) { next(e); }
  });

  return router;
}

import express from "express";
import { requireAuth } from "../auth.js";
import { loadCatalogBootstrap, clearCatalogBootstrapCache } from "../catalogBootstrap.js";
import { normKind, normBrand, createSection, updateSection, deleteSection, setTagSection, setProductAlias, setProductVisibility, setTypeVisibility, getProductPdfNameMap, setProductPdfName } from "../catalogDb.js";
import { dbQuery } from "../db.js";
import { listUsers, createUser, updateUser } from "../usersDb.js";
import { triggerPreproductionForClientAcceptance, formatPortonTypeLabel, resyncPortonMeasurements } from "../measurementFinalization.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
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
import { getDoorTechnicalRules, setDoorTechnicalRules } from "../doorTechnicalRulesDb.js";
import {
  listProductionSourceCatalog,
  listIntegratorTargetProperties,
  listProductionPropertyAssignments,
  setProductionPropertyAssignment,
} from "../productionPropertyAssignments.js";
import { calcOdooUnitPrice, calcQuoteSubtotal, round2, IVA_RATE, getPayloadConditionMode } from "./quotes.routes.js";

function requireEncComercial(req, res, next) { if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" }); next(); }
function requireSuperuser(req, res, next) { if (!req.user?.is_superuser) return res.status(403).json({ ok: false, error: "No autorizado" }); next(); }
function requireEncComercialOrSuperuser(req, res, next) { if (!req.user?.is_enc_comercial && !req.user?.is_superuser) return res.status(403).json({ ok: false, error: "No autorizado" }); next(); }
// Mismas rutas que requireEncComercialOrSuperuser, pero además deja pasar a
// vendedores con see_all_distributors=true (acceso al Dashboard de catálogo).
// No reemplaza a requireEncComercialOrSuperuser en rutas ajenas al Dashboard (ej. /users).
function requireEncComercialOrSuperuserOrDashboardViewer(req, res, next) { if (!req.user?.is_enc_comercial && !req.user?.is_superuser && !req.user?.see_all_distributors) return res.status(403).json({ ok: false, error: "No autorizado" }); next(); }

function getOdooName(product = {}) {
  return String(product?.client_display_name || product?.raw_name || product?.original_name || product?.name || "").trim();
}
function getPresupuestadorName(product = {}) {
  return String(product?.display_name || product?.alias || product?.internal_alias || product?.name || "").trim();
}
function cleanAdminText(value) {
  return String(value || "").trim();
}
function normalizeAdminQuoteBucket(value) {
  const bucket = cleanAdminText(value || "all").toLowerCase();
  return ["all", "budgets", "portones", "ipanels", "puertas", "plegados", "otros"].includes(bucket) ? bucket : "all";
}
function safeAdminQuoteLimit(value) {
  const n = Number(value || 200);
  return Math.min(Math.max(Number.isFinite(n) ? Math.trunc(n) : 200, 1), 1000);
}
function adminQuoteHasGeneratedOdoo(row = {}) {
  return !!(
    row.odoo_sale_order_id ||
    cleanAdminText(row.odoo_sale_order_name) ||
    row.final_sale_order_id ||
    cleanAdminText(row.final_sale_order_name) ||
    cleanAdminText(row.final_copy_sale_order_name) ||
    row.final_copy_sale_order_id ||
    ["syncing_odoo", "synced_odoo"].includes(cleanAdminText(row.status)) ||
    ["syncing_odoo", "synced_odoo"].includes(cleanAdminText(row.final_status)) ||
    ["syncing_odoo", "synced_odoo"].includes(cleanAdminText(row.final_copy_status))
  );
}
function decorateAdminQuote(row = {}) {
  const hasGeneratedOdoo = adminQuoteHasGeneratedOdoo(row);
  return {
    ...row,
    // final_copy_sale_order_name antes que final_sale_order_name: en Ipanel la fila
    // original queda con un final_sale_order_name "provisorio" (el mismo NP inicial)
    // que nunca se actualiza cuando Tecnica genera la copia con el NV real.
    production_sale_order_name: row.production_sale_order_name || row.final_copy_sale_order_name || row.final_sale_order_name || row.odoo_sale_order_name || null,
    can_delete: !hasGeneratedOdoo,
    has_generated_odoo: hasGeneratedOdoo,
  };
}
function adminQuoteBucketWhere(bucket) {
  if (bucket === "budgets") return `and not (
    coalesce(q.odoo_sale_order_id, 0) <> 0
    or nullif(q.odoo_sale_order_name, '') is not null
    or coalesce(q.final_sale_order_id, 0) <> 0
    or nullif(q.final_sale_order_name, '') is not null
    or coalesce(fc.final_copy_sale_order_id, 0) <> 0
    or nullif(fc.final_copy_sale_order_name, '') is not null
    or coalesce(q.status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(q.final_status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(fc.final_copy_status, '') in ('syncing_odoo', 'synced_odoo')
  )`;
  if (bucket === "portones") return `and coalesce(q.catalog_kind, 'porton') = 'porton' and (
    coalesce(q.odoo_sale_order_id, 0) <> 0
    or nullif(q.odoo_sale_order_name, '') is not null
    or coalesce(q.final_sale_order_id, 0) <> 0
    or nullif(q.final_sale_order_name, '') is not null
    or coalesce(fc.final_copy_sale_order_id, 0) <> 0
    or nullif(fc.final_copy_sale_order_name, '') is not null
    or coalesce(q.status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(q.final_status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(fc.final_copy_status, '') in ('syncing_odoo', 'synced_odoo')
  )`;
  if (bucket === "ipanels") return `and coalesce(q.catalog_kind, 'porton') = 'ipanel' and (
    coalesce(q.odoo_sale_order_id, 0) <> 0
    or nullif(q.odoo_sale_order_name, '') is not null
    or coalesce(q.final_sale_order_id, 0) <> 0
    or nullif(q.final_sale_order_name, '') is not null
    or coalesce(fc.final_copy_sale_order_id, 0) <> 0
    or nullif(fc.final_copy_sale_order_name, '') is not null
    or coalesce(q.status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(q.final_status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(fc.final_copy_status, '') in ('syncing_odoo', 'synced_odoo')
  )`;
  if (bucket === "puertas") return `and coalesce(q.catalog_kind, 'porton') = 'puerta' and (
    coalesce(q.odoo_sale_order_id, 0) <> 0
    or nullif(q.odoo_sale_order_name, '') is not null
    or coalesce(q.final_sale_order_id, 0) <> 0
    or nullif(q.final_sale_order_name, '') is not null
    or coalesce(fc.final_copy_sale_order_id, 0) <> 0
    or nullif(fc.final_copy_sale_order_name, '') is not null
    or coalesce(q.status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(q.final_status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(fc.final_copy_status, '') in ('syncing_odoo', 'synced_odoo')
  )`;
  if (bucket === "plegados") return `and coalesce(q.catalog_kind, 'porton') = 'plegados' and (
    coalesce(q.odoo_sale_order_id, 0) <> 0
    or nullif(q.odoo_sale_order_name, '') is not null
    or coalesce(q.final_sale_order_id, 0) <> 0
    or nullif(q.final_sale_order_name, '') is not null
    or coalesce(fc.final_copy_sale_order_id, 0) <> 0
    or nullif(fc.final_copy_sale_order_name, '') is not null
    or coalesce(q.status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(q.final_status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(fc.final_copy_status, '') in ('syncing_odoo', 'synced_odoo')
  )`;
  if (bucket === "otros") return `and coalesce(q.catalog_kind, 'porton') = 'otros' and (
    coalesce(q.odoo_sale_order_id, 0) <> 0
    or nullif(q.odoo_sale_order_name, '') is not null
    or coalesce(q.final_sale_order_id, 0) <> 0
    or nullif(q.final_sale_order_name, '') is not null
    or coalesce(fc.final_copy_sale_order_id, 0) <> 0
    or nullif(fc.final_copy_sale_order_name, '') is not null
    or coalesce(q.status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(q.final_status, '') in ('syncing_odoo', 'synced_odoo')
    or coalesce(fc.final_copy_status, '') in ('syncing_odoo', 'synced_odoo')
  )`;
  return "";
}

export function buildAdminRouter(odoo) {
  const router = express.Router();

  router.get("/catalog", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      const data = await loadCatalogBootstrap(odoo, kind);
      const q = await dbQuery(`select tag_id, section_id from public.presupuestador_tag_sections where catalog_kind=$1`, [kind]);
      const map = new Map((q.rows || []).map((r) => [Number(r.tag_id), Number(r.section_id)]));
      const tags = (data.tags || []).map((t) => ({ ...t, section_id: map.get(Number(t.id)) || null }));
      res.json({ ...data, tags, type_sections: {} });
    } catch (e) { next(e); }
  });

  router.get("/product-pdf-names", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      const brand = normBrand(req.query.brand);
      const data = await loadCatalogBootstrap(odoo, kind);
      const pdfNameMap = await getProductPdfNameMap(kind, null, brand);

      const items = (Array.isArray(data?.products) ? data.products : [])
        .map((product) => ({
          product_id: Number(product?.id || 0) || 0,
          odoo_id: Number(product?.odoo_id || product?.odoo_template_id || 0) || 0,
          odoo_template_id: Number(product?.odoo_template_id || product?.odoo_id || 0) || 0,
          odoo_variant_id: Number(product?.odoo_variant_id || product?.id || 0) || 0,
          odoo_name: getOdooName(product),
          presupuestador_name: getPresupuestadorName(product),
          alias: String(product?.alias || product?.internal_alias || "").trim(),
          pdf_name: String(pdfNameMap.get(Number(product?.id || 0)) || "").trim(),
        }))
        .sort((a, b) =>
          String(a.presupuestador_name || a.odoo_name || "").localeCompare(
            String(b.presupuestador_name || b.odoo_name || ""),
            "es",
          ) || Number(a.product_id || 0) - Number(b.product_id || 0)
        );

      res.json({ ok: true, kind, brand, items });
    } catch (e) { next(e); }
  });

  router.put("/products/:productId/pdf-name", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const brand = normBrand(req.query.brand || req.body?.brand);
      const pdfName = req.body?.pdf_name ?? "";
      const saved = await setProductPdfName(kind, req.params.productId, pdfName, brand);
      res.json({ ok: true, pdf_name: saved.pdf_name || null });
    } catch (e) { next(e); }
  });

  router.get("/production-property-assignments", requireAuth, requireSuperuser, async (_req, res, next) => {
    try {
      const [source_properties, target_properties, assignments] = await Promise.all([
        listProductionSourceCatalog(),
        listIntegratorTargetProperties(),
        listProductionPropertyAssignments(),
      ]);
      res.json({ ok: true, source_properties, target_properties, assignments });
    } catch (e) { next(e); }
  });

  router.put("/production-property-assignments/:sourceKey", requireAuth, requireSuperuser, async (req, res, next) => {
    try {
      const saved = await setProductionPropertyAssignment(req.params.sourceKey, req.body || {});
      res.json({ ok: true, assignment: saved });
    } catch (e) { next(e); }
  });

  router.get("/final-settings", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (_req, res, next) => {
    try { res.json({ ok: true, settings: await getCommercialFinalQuoteSettings() }); } catch (e) { next(e); }
  });
  router.put("/final-settings", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try { res.json({ ok: true, settings: await setCommercialFinalQuoteSettings(req.body || {}) }); } catch (e) { next(e); }
  });
  router.get("/door-quote-settings", requireAuth, requireEncComercialOrSuperuser, async (_req, res, next) => {
    try { res.json({ ok: true, settings: await getDoorQuoteSettings() }); } catch (e) { next(e); }
  });
  router.put("/door-quote-settings", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try { res.json({ ok: true, settings: await setDoorQuoteSettings(req.body || {}) }); } catch (e) { next(e); }
  });

  router.get("/door-technical-rules", requireAuth, requireSuperuser, async (_req, res, next) => {
    try { res.json({ ok: true, rules: await getDoorTechnicalRules() }); } catch (e) { next(e); }
  });
  router.put("/door-technical-rules", requireAuth, requireSuperuser, async (req, res, next) => {
    try { res.json({ ok: true, rules: await setDoorTechnicalRules(req.body || {}) }); } catch (e) { next(e); }
  });

  router.get("/technical-measurement-rules", requireAuth, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      res.json({ ok: true, rules: await getTechnicalMeasurementRules(kind) });
    } catch (e) { next(e); }
  });
  router.put("/technical-measurement-rules", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      res.json({ ok: true, rules: await setTechnicalMeasurementRules(req.body || {}, kind) });
    } catch (e) { next(e); }
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

  router.post("/sections", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const { name, position, use_surface_qty, budget_sector, budget_show_detail } = req.body || {};
      const section = await createSection(kind, { name, position, use_surface_qty, budget_sector, budget_show_detail });
      clearCatalogBootstrapCache();
      res.json({ ok: true, section });
    } catch (e) { next(e); }
  });
  router.put("/sections/:id", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const section = await updateSection(kind, req.params.id, req.body || {});
      clearCatalogBootstrapCache();
      res.json({ ok: true, section });
    } catch (e) { next(e); }
  });
  router.delete("/sections/:id", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      await deleteSection(kind, req.params.id);
      clearCatalogBootstrapCache();
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  router.put("/tags/:tagId/section", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const mapping = await setTagSection(kind, req.params.tagId, req.body?.section_id ?? null);
      clearCatalogBootstrapCache();
      res.json({ ok: true, mapping });
    } catch (e) { next(e); }
  });
  router.put("/products/:productId/alias", requireAuth, requireEncComercialOrSuperuserOrDashboardViewer, async (req, res, next) => {
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
  router.post("/refresh", requireAuth, async (req, res, next) => {
    try {
      clearCatalogBootstrapCache();
      const kind = req.body?.kind ? normKind(req.body.kind) : null;
      if (kind) {
        const catalog = await loadCatalogBootstrap(odoo, kind);
        return res.json({ ok: true, catalog });
      }
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  router.get("/quotes", requireAuth, requireSuperuser, async (req, res, next) => {
    try {
      const limit = safeAdminQuoteLimit(req.query.limit);
      const bucket = normalizeAdminQuoteBucket(req.query.bucket);
      const kind = req.query.kind ? normKind(req.query.kind) : null;
      const search = cleanAdminText(req.query.q || req.query.search || "");
      const params = [];
      const where = [`coalesce(q.quote_kind, 'original') = 'original'`];
      if (kind) {
        params.push(kind);
        where.push(`coalesce(q.catalog_kind, 'porton') = $${params.length}`);
      }
      const bucketWhere = adminQuoteBucketWhere(bucket);
      if (bucketWhere) where.push(bucketWhere.replace(/^and\s+/i, ""));
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        const idx = params.length;
        where.push(`(
          lower(coalesce(q.quote_number::text, '')) like $${idx}
          or lower(coalesce(q.odoo_sale_order_name, '')) like $${idx}
          or lower(coalesce(q.final_sale_order_name, '')) like $${idx}
          or lower(coalesce(fc.final_copy_sale_order_name, '')) like $${idx}
          or lower(coalesce(q.end_customer->>'name', '')) like $${idx}
          or lower(coalesce(q.end_customer->>'first_name', '')) like $${idx}
          or lower(coalesce(q.end_customer->>'last_name', '')) like $${idx}
          or lower(coalesce(q.end_customer->>'phone', '')) like $${idx}
          or lower(coalesce(q.end_customer->>'email', '')) like $${idx}
          or lower(coalesce(q.end_customer->>'address', '')) like $${idx}
          or lower(coalesce(q.end_customer->>'city', '')) like $${idx}
          or lower(coalesce(u.username, '')) like $${idx}
          or lower(coalesce(u.full_name, '')) like $${idx}
        )`);
      }
      params.push(limit);
      const limitIdx = params.length;
      const sql = `select q.id,
                          q.quote_number,
                          q.created_at,
                          q.confirmed_at,
                          q.created_by_role,
                          q.status,
                          q.final_status,
                          q.fulfillment_mode,
                          q.end_customer,
                          q.payload,
                          q.commercial_decision,
                          q.technical_decision,
                          q.rejection_notes,
                          q.catalog_kind,
                          q.odoo_sale_order_id,
                          q.odoo_sale_order_name,
                          q.final_sale_order_id,
                          q.final_sale_order_name,
                          q.final_difference_amount,
                          q.final_absorbed_by_company,
                          q.deposit_amount,
                          u.username as created_by_username,
                          u.full_name as created_by_full_name,
                          fc.final_copy_id,
                          fc.final_copy_status,
                          fc.final_copy_sale_order_id,
                          fc.final_copy_sale_order_name,
                          -- La copia final (quote_kind='copy') es la mas autoritativa cuando existe: en
                          -- Ipanel, final_sale_order_name de la fila original queda "provisorio" (el
                          -- mismo NP inicial) y nunca se actualiza cuando Tecnica genera la copia con
                          -- el NV real, asi que no puede ir primero en este coalesce.
                          coalesce(fc.final_copy_sale_order_name, q.final_sale_order_name, q.odoo_sale_order_name) as production_sale_order_name
                     from public.presupuestador_quotes q
                     left join public.presupuestador_users u on u.id = q.created_by_user_id
                     left join lateral (
                       select c.id as final_copy_id,
                              c.final_status as final_copy_status,
                              c.final_sale_order_id as final_copy_sale_order_id,
                              c.final_sale_order_name as final_copy_sale_order_name
                         from public.presupuestador_quotes c
                        where c.quote_kind = 'copy'
                          and c.parent_quote_id = q.id
                        order by c.final_synced_at desc nulls last, c.created_at desc nulls last, c.id desc
                        limit 1
                     ) fc on true
                    where ${where.join(" and ")}
                    order by q.created_at desc nulls last, q.id desc
                    limit $${limitIdx}`;
      const q = await dbQuery(sql, params);
      res.json({ ok: true, quotes: (q.rows || []).map(decorateAdminQuote) });
    } catch (e) { next(e); }
  });

  router.delete("/quotes/:id", requireAuth, requireSuperuser, async (req, res, next) => {
    try {
      const id = cleanAdminText(req.params.id);
      const r = await dbQuery(
        `select q.*,
                fc.final_copy_id,
                fc.final_copy_status,
                fc.final_copy_sale_order_id,
                fc.final_copy_sale_order_name
           from public.presupuestador_quotes q
           left join lateral (
             select c.id as final_copy_id,
                    c.final_status as final_copy_status,
                    c.final_sale_order_id as final_copy_sale_order_id,
                    c.final_sale_order_name as final_copy_sale_order_name
               from public.presupuestador_quotes c
              where c.quote_kind = 'copy'
                and c.parent_quote_id = q.id
              order by c.final_synced_at desc nulls last, c.created_at desc nulls last, c.id desc
              limit 1
           ) fc on true
          where q.id=$1
          limit 1`,
        [id]
      );
      const quote = r.rows?.[0] || null;
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      if (adminQuoteHasGeneratedOdoo(quote)) {
        return res.status(409).json({ ok: false, error: "No se puede eliminar: ya tiene NP/NV o equivalente generado en Odoo." });
      }
      const linked = await dbQuery(
        `select count(*)::int as count
           from public.presupuestador_quotes child
          where coalesce(child.quote_kind, 'original') = 'original'
            and child.id <> $1::uuid
            and (
              child.payload->>'linked_porton_quote_id' = $1::text
              or child.payload->>'porton_quote_id' = $1::text
            )`,
        [id]
      );
      if (Number(linked.rows?.[0]?.count || 0) > 0) {
        return res.status(409).json({ ok: false, error: "No se puede eliminar: tiene presupuestos vinculados. Eliminá primero los vinculados." });
      }
      await dbQuery(`delete from public.presupuestador_quotes where quote_kind='copy' and parent_quote_id=$1`, [id]);
      const del = await dbQuery(
        `delete from public.presupuestador_quotes
          where id=$1
            and not (
              coalesce(odoo_sale_order_id, 0) <> 0
              or nullif(odoo_sale_order_name, '') is not null
              or coalesce(final_sale_order_id, 0) <> 0
              or nullif(final_sale_order_name, '') is not null
              or coalesce(status, '') in ('syncing_odoo', 'synced_odoo')
              or coalesce(final_status, '') in ('syncing_odoo', 'synced_odoo')
            )
          returning id`,
        [id]
      );
      if (!del.rows?.[0]?.id) return res.status(409).json({ ok: false, error: "No se pudo eliminar: el presupuesto cambió de estado." });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // Prende/apaga a mano, para un presupuesto puntual, el uso de la formula oficial de
  // medidas de paso/hoja (en vez del calculo local obsoleto) en las vistas de
  // medicion/aceptacion/detalle. Los presupuestos nuevos (posteriores al corte de fecha)
  // ya la usan solos; esto es para poder migrar presupuestos viejos de a uno, sin arriesgar
  // el resto.
  router.post("/quotes/:id/technical-formula", requireAuth, requireSuperuser, async (req, res, next) => {
    try {
      const id = cleanAdminText(req.params.id);
      const enabled = req.body?.enabled === true;
      const cur = await dbQuery(`select payload from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = cur.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      const payload = quote.payload && typeof quote.payload === "object" ? { ...quote.payload } : {};
      if (enabled) payload.use_new_technical_formula = true;
      else delete payload.use_new_technical_formula;
      await dbQuery(`update public.presupuestador_quotes set payload=$2::jsonb where id=$1`, [id, JSON.stringify(payload)]);
      res.json({ ok: true, id, use_new_technical_formula: enabled });
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

  // ---- Historial para rol Administración ----

  function requireAdministracion(req, res, next) {
    if (!req.user?.is_administracion && !req.user?.is_superuser) return res.status(403).json({ ok: false, error: "No autorizado" });
    next();
  }

  const historyLateral = `left join lateral (
    select c.id as final_copy_id,
           c.final_status as final_copy_status,
           c.final_sale_order_id as final_copy_sale_order_id,
           c.final_sale_order_name as final_copy_sale_order_name,
           c.final_synced_at as final_copy_synced_at
      from public.presupuestador_quotes c
     where c.quote_kind = 'copy' and c.parent_quote_id = q.id
     order by c.final_synced_at desc nulls last, c.created_at desc nulls last, c.id desc
     limit 1
  ) fc on true`;

  router.get("/history", requireAuth, requireAdministracion, async (req, res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      const search = cleanAdminText(req.query.q || req.query.search || "");
      const kind = req.query.kind ? normKind(req.query.kind) : null;
      const fulfillment = cleanAdminText(req.query.fulfillment || "all").toLowerCase();
      const fromDate = cleanAdminText(req.query.from_date || "");
      const toDate = cleanAdminText(req.query.to_date || "");

      const params = [];
      const where = [
        `coalesce(q.quote_kind, 'original') = 'original'`,
        `(q.status in ('syncing_odoo', 'synced_odoo')
          or coalesce(q.odoo_sale_order_id, 0) <> 0
          or nullif(q.odoo_sale_order_name, '') is not null)`,
      ];

      if (kind) { params.push(kind); where.push(`coalesce(q.catalog_kind, 'porton') = $${params.length}`); }
      if (fulfillment === "acopio" || fulfillment === "produccion") { params.push(fulfillment); where.push(`q.fulfillment_mode = $${params.length}`); }
      if (fromDate) { params.push(fromDate); where.push(`q.confirmed_at >= $${params.length}::date`); }
      if (toDate) { params.push(toDate); where.push(`q.confirmed_at < ($${params.length}::date + interval '1 day')`); }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        const idx = params.length;
        where.push(`(
          lower(coalesce(q.quote_number::text,'')) like $${idx}
          or lower(coalesce(q.odoo_sale_order_name,'')) like $${idx}
          or lower(coalesce(q.final_sale_order_name,'')) like $${idx}
          or lower(coalesce(fc.final_copy_sale_order_name,'')) like $${idx}
          or lower(coalesce(q.end_customer->>'name','')) like $${idx}
          or lower(coalesce(q.end_customer->>'phone','')) like $${idx}
          or lower(coalesce(q.end_customer->>'address','')) like $${idx}
          or lower(coalesce(u.username,'')) like $${idx}
          or lower(coalesce(u.full_name,'')) like $${idx}
        )`);
      }

      const sql = `
        select q.id, q.quote_number, q.catalog_kind, q.fulfillment_mode,
               q.status, q.final_status,
               q.created_at, q.confirmed_at, q.updated_at,
               q.commercial_decision, q.commercial_at,
               q.technical_decision, q.technical_at,
               q.final_technical_decision, q.final_technical_decision_at,
               q.final_logistics_decision, q.final_logistics_decision_at,
               q.final_synced_at,
               q.odoo_sale_order_name, q.final_sale_order_name,
               q.end_customer,
               q.requires_measurement, q.measurement_status,
               q.measurement_at, q.measurement_review_at,
               q.created_by_role,
               u.id as seller_id, u.username as seller_username, u.full_name as seller_full_name,
               cu.username as commercial_by_username, cu.full_name as commercial_by_full_name,
               tu.username as technical_by_username, tu.full_name as technical_by_full_name,
               fc.final_copy_id, fc.final_copy_status, fc.final_copy_sale_order_name, fc.final_copy_synced_at
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          left join public.presupuestador_users cu on cu.id = q.commercial_by_user_id
          left join public.presupuestador_users tu on tu.id = q.technical_by_user_id
          ${historyLateral}
         where ${where.join(" and ")}
         order by coalesce(q.confirmed_at, q.created_at) desc nulls last, q.id desc
         limit 500`;

      const r = await dbQuery(sql, params);
      res.json({ ok: true, quotes: r.rows || [] });
    } catch (e) { next(e); }
  });

  router.get("/history/:id", requireAuth, requireAdministracion, async (req, res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      const id = cleanAdminText(req.params.id);
      const sql = `
        select q.*,
               u.username as seller_username, u.full_name as seller_full_name,
               cu.username as commercial_by_username, cu.full_name as commercial_by_full_name,
               tu.username as technical_by_username, tu.full_name as technical_by_full_name,
               mu.username as measurement_by_username, mu.full_name as measurement_by_full_name,
               mru.username as measurement_review_by_username, mru.full_name as measurement_review_by_full_name,
               ftu.username as final_technical_by_username, ftu.full_name as final_technical_by_full_name,
               fc.final_copy_id, fc.final_copy_status, fc.final_copy_sale_order_name, fc.final_copy_synced_at
          from public.presupuestador_quotes q
          left join public.presupuestador_users u on u.id = q.created_by_user_id
          left join public.presupuestador_users cu on cu.id = q.commercial_by_user_id
          left join public.presupuestador_users tu on tu.id = q.technical_by_user_id
          left join public.presupuestador_users mu on mu.id = q.measurement_by_user_id
          left join public.presupuestador_users mru on mru.id = q.measurement_review_by_user_id
          left join public.presupuestador_users ftu on ftu.id = q.final_technical_decision_by_user_id
          ${historyLateral}
         where q.id = $1
         limit 1`;
      const r = await dbQuery(sql, [id]);
      const quote = r.rows?.[0] || null;
      if (!quote) return res.status(404).json({ ok: false, error: "No encontrado" });

      // Total "oficial" = misma formula que arma la proforma y el pedido real en Odoo
      // (calcOdooUnitPrice/calcQuoteSubtotal de quotes.routes.js), en vez de sumar a lo
      // bruto basePrice*qty de cada linea. Para distribuidor esto respeta el snapshot
      // congelado de envio (envio_odoo_price_snapshot) en vez del precio editable de la
      // linea, y para vendedor aplica el margen/condicion igual que al vender. Se agrega
      // como campos nuevos sin tocar los existentes, y con fallback si algo falla, para
      // no romper el detalle si una quote vieja tiene datos con forma inesperada.
      let officialSubtotalNet = null;
      let officialTotalWithIva = null;
      let officialLines = null;
      try {
        officialSubtotalNet = calcQuoteSubtotal({ lines: quote.lines, payload: quote.payload, quote });
        // Condicion 2 ya manda a Odoo el neto con el recargo de 10,5% adentro (via
        // getOdooConditionPriceFactor en calcOdooUnitPrice) en vez de IVA formal - no hay
        // que sumarle un 21% mas arriba de eso. Solo Condicion 1 lleva el +21% acá.
        const isCond2 = getPayloadConditionMode(quote.payload) === "cond2";
        officialTotalWithIva = isCond2 ? officialSubtotalNet : round2(officialSubtotalNet * (1 + IVA_RATE));
        officialLines = (Array.isArray(quote.lines) ? quote.lines : []).map((l) => {
          const qty = Number(l?.qty || 0) || 0;
          const unit = calcOdooUnitPrice(l, quote.payload || {}, quote);
          return { ...l, official_unit_price: unit, official_subtotal: round2(unit * qty) };
        });
      } catch (e) {
        console.error("[admin/history/:id] calculo de total oficial fallo:", e?.message || e);
      }

      res.json({
        ok: true,
        quote: {
          ...quote,
          official_subtotal_net: officialSubtotalNet,
          official_total_with_iva: officialTotalWithIva,
          lines: officialLines || quote.lines,
        },
      });
    } catch (e) { next(e); }
  });

  // Agrega una línea de ajuste a la proforma de un quote específico para forzar un total determinado
  router.post("/quote/set-proforma-adjustment", requireAuth, requireSuperuser, async (req, res, next) => {
    try {
      const { quote_id, target_total_iva, description = "Ajuste de cambio de sistema", tax_rate = 0.105 } = req.body;
      if (!quote_id) return res.status(400).json({ ok: false, error: "quote_id requerido" });
      const targetTotal = Number(target_total_iva);
      if (!Number.isFinite(targetTotal) || targetTotal <= 0) return res.status(400).json({ ok: false, error: "target_total_iva inválido" });

      const r = await dbQuery(`SELECT * FROM public.presupuestador_quotes WHERE id = $1`, [quote_id]);
      const quote = r.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Quote no encontrado" });

      const taxRateN = Number(tax_rate) || 0.105;
      const targetSubtotalNet = targetTotal / (1 + taxRateN);

      const lines = Array.isArray(quote.lines) ? quote.lines : [];
      const currentSubtotalNet = lines.reduce((sum, l) => {
        const qty = Number(l?.qty || 0);
        const basePrice = Number(l?.base_price ?? l?.basePrice ?? l?.base_price_unit ?? l?.price_unit ?? l?.priceUnit ?? l?.price ?? 0);
        return sum + basePrice * qty;
      }, 0);

      const adjustmentNet = Math.round((targetSubtotalNet - currentSubtotalNet) * 100) / 100;
      const currentPayload = (quote.payload && typeof quote.payload === "object") ? quote.payload : {};
      const newPayload = { ...currentPayload, proforma_extra_lines: [{ name: String(description), base_price: adjustmentNet, qty: 1 }] };

      await dbQuery(`UPDATE public.presupuestador_quotes SET payload = $1::jsonb WHERE id = $2`, [JSON.stringify(newPayload), quote_id]);

      res.json({
        ok: true,
        quote_id,
        currentSubtotalNet: Math.round(currentSubtotalNet * 100) / 100,
        targetSubtotalNet: Math.round(targetSubtotalNet * 100) / 100,
        adjustmentNet,
        expectedTotalWithIva: Math.round((currentSubtotalNet + adjustmentNet) * (1 + taxRateN) * 100) / 100,
      });
    } catch (e) { next(e); }
  });

  // Re-dispara el upsert de preproduccion_valores para una NV que no se generó en su momento.
  // Acepta body: { nv: number, tipo?: 'NV'|'ONV'|'INV'|'PLNV'|'PNV' }
  // tipo por defecto es 'NV'. El prefijo se usa para construir el nombre de referencia (ej: ONV4121).
  router.post("/resync/preproduccion-valores", requireAuth, requireSuperuser, async (req, res, next) => {
    try {
      const nv = Number(req.body?.nv || 0);
      if (!Number.isInteger(nv) || nv <= 0) return res.status(400).json({ ok: false, error: "nv inválido" });

      const VALID_TIPOS = ["NV", "ONV", "INV", "PLNV", "PNV"];
      const rawTipo = String(req.body?.tipo || "NV").toUpperCase();
      const nvTipo = VALID_TIPOS.includes(rawTipo) ? rawTipo : "NV";
      const nvStr = `${nvTipo}${nv}`;

      // Buscar el quote original (puede tener la NV en final_sale_order_name u odoo_sale_order_name)
      const origR = await dbQuery(
        `SELECT q.* FROM public.presupuestador_quotes q
         WHERE q.quote_kind = 'original'
           AND (q.final_sale_order_name = $1 OR q.odoo_sale_order_name = $1)
         ORDER BY q.created_at DESC NULLS LAST LIMIT 1`,
        [nvStr],
      );
      const originalQuote = origR.rows?.[0];
      if (!originalQuote) return res.status(404).json({ ok: false, error: `No se encontró quote original para ${nvStr}` });

      // Intentar primero por la función normal (requiere copy quote con NV)
      const normalResult = await triggerPreproductionForClientAcceptance(null, originalQuote);
      if (normalResult?.ok) return res.json({ ok: true, nv, nv_tipo: nvTipo, method: "normal", result: normalResult });

      // Fallback: upsert directo usando los datos del original + copy si existe
      const copyR = await dbQuery(
        `SELECT q.* FROM public.presupuestador_quotes q
         WHERE q.quote_kind = 'copy' AND q.parent_quote_id = $1
         ORDER BY q.created_at DESC NULLS LAST LIMIT 1`,
        [originalQuote.id],
      );
      const copyQuote = copyR.rows?.[0];

      const sourcePayload = (originalQuote.payload && typeof originalQuote.payload === "object") ? originalQuote.payload : {};
      const copyPayload = (copyQuote?.payload && typeof copyQuote.payload === "object") ? copyQuote.payload : {};
      const data = { ...sourcePayload, ...copyPayload, NV: nv, nv, nv_tipo: nvTipo, referencia_nv: nvStr };

      // El path normal (triggerPreproductionForClientAcceptance) formatea porton_type
      // ("acero_simil_aluminio_doble_iny" -> "ACERO SIMIL ALUMINIO DOBLE INY") antes de guardarlo.
      // Este fallback copiaba el payload crudo del presupuesto, así que había que aplicar el mismo formateo acá.
      if (data.porton_type) {
        const rawPortonType = data.porton_type;
        data.porton_type = formatPortonTypeLabel(rawPortonType) || rawPortonType;
        if (!data.porton_type_key) data.porton_type_key = rawPortonType;
      }

      const rawLines = Array.isArray(copyQuote?.lines) ? copyQuote.lines : (Array.isArray(originalQuote?.lines) ? originalQuote.lines : []);
      const nvLines = rawLines
        .filter((l) => l && (l.name || l.raw_name))
        .map((l) => ({ name: String(l.name || ""), raw_name: String(l.raw_name || ""), qty: Number(l.qty || 0) || 0 }));

      let upsertRow;
      if (nvTipo === "INV") {
        const toDateOrNull = (v) => { const s = String(v || "").trim(); if (!s) return null; const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null; };
        const _adminDescripcion = String(data?.descripcion || data?.producto_descripcion || "") || null;
        let _adminDescripcionSimple = String(data?.DescripcionSimple || data?.descripcion_simple || "").toUpperCase() || null;
        if (!_adminDescripcionSimple) {
          const _lines = Array.isArray(data?.lines) ? data.lines : [];
          const _hasMadera = _lines.some((l) => Number(l?.product_id) === 4060);
          const _hasAluminio = _lines.some((l) => Number(l?.product_id) === 4059);
          if (_hasMadera) _adminDescripcionSimple = "MADERA";
          else if (_hasAluminio) _adminDescripcionSimple = "ALUMINIO";
          else {
            const _lineNames = _lines.map((l) => String(l?.name || l?.raw_name || "").toUpperCase()).join(" ");
            if (_lineNames.includes("MADERA")) _adminDescripcionSimple = "MADERA";
            else if (_lineNames.includes("ALUMINIO")) _adminDescripcionSimple = "ALUMINIO";
            else _adminDescripcionSimple = "ALUMINIO";
          }
        }
        const r = await dbQuery(
          `INSERT INTO public.preproduccion_valores_ipanels
             (partida, nv, source, fecha_nv, fecha_plan_entrega, descripcion, descripcion_simple, data)
           VALUES ($1, $2, 'Presupuestador', $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (partida)
           DO UPDATE SET nv = excluded.nv, source = excluded.source, descripcion = excluded.descripcion,
             descripcion_simple = coalesce(excluded.descripcion_simple, preproduccion_valores_ipanels.descripcion_simple),
             data = excluded.data, updated_at = now()
           RETURNING id, partida, updated_at`,
          [nv, nv, toDateOrNull(data?.fecha_nv), toDateOrNull(data?.fecha_plan_entrega), _adminDescripcion, _adminDescripcionSimple, JSON.stringify(data)],
        );
        upsertRow = r.rows?.[0];
      } else {
        const r = await dbQuery(
          `INSERT INTO public.preproduccion_valores (nv, nv_tipo, data, nv_lines)
           VALUES ($1, $2, $3::jsonb, $4::jsonb)
           ON CONFLICT (nv, nv_tipo) DO UPDATE SET data = EXCLUDED.data, nv_lines = EXCLUDED.nv_lines, updated_at = now()
           RETURNING id, nv, nv_tipo, updated_at`,
          [nv, nvTipo, JSON.stringify(data), JSON.stringify(nvLines)],
        );
        upsertRow = r.rows?.[0];
      }

      res.json({ ok: true, nv, nv_tipo: nvTipo, method: "fallback_direct", row: upsertRow });
    } catch (e) { next(e); }
  });

  // Resync manual de medidas de paso/hoja para un portón puntual (queja de un vendedor/cliente).
  // Busca el presupuesto por número de NP o NV, recalcula con la fórmula oficial y refresca
  // preproducción_valores. No toca Odoo. Si el cliente ya aceptó el link, no modifica nada.
  router.post("/resync/porton-measurements", requireAuth, requireSuperuser, async (req, res, next) => {
    try {
      const identifier = String(req.body?.identifier || "").trim();
      if (!identifier) return res.status(400).json({ ok: false, error: "Falta identifier (número de NP o NV)" });

      const directR = await dbQuery(
        `SELECT * FROM public.presupuestador_quotes
          WHERE quote_kind = 'original'
            AND (upper(odoo_sale_order_name) = upper($1) OR upper(final_sale_order_name) = upper($1))
          ORDER BY created_at DESC NULLS LAST LIMIT 1`,
        [identifier],
      );
      let originalQuote = directR.rows?.[0] || null;

      if (!originalQuote) {
        const copyR = await dbQuery(
          `SELECT parent_quote_id FROM public.presupuestador_quotes
            WHERE quote_kind = 'copy' AND upper(final_sale_order_name) = upper($1)
            ORDER BY created_at DESC NULLS LAST LIMIT 1`,
          [identifier],
        );
        const parentId = copyR.rows?.[0]?.parent_quote_id;
        if (parentId) {
          const origR = await dbQuery(
            `SELECT * FROM public.presupuestador_quotes WHERE id = $1 AND quote_kind = 'original' LIMIT 1`,
            [parentId],
          );
          originalQuote = origR.rows?.[0] || null;
        }
      }

      if (!originalQuote) {
        return res.status(404).json({ ok: false, error: `No se encontró un presupuesto de portón para "${identifier}"` });
      }

      const force = req.body?.force === true;
      const result = await resyncPortonMeasurements({
        odoo,
        originalQuoteId: originalQuote.id,
        force,
        forcedBy: force ? { user_id: req.user?.user_id ?? null, username: req.user?.username ?? null } : null,
      });
      if (!result.ok) return res.status(409).json(result);
      res.json(result);
    } catch (e) { next(e); }
  });

  return router;
}

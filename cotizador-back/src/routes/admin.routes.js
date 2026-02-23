import express from "express";
import { requireAuth } from "../auth.js";
import { loadCatalogBootstrap, clearCatalogBootstrapCache } from "../catalogBootstrap.js";
import { normKind, createSection, deleteSection, setTagSection, setProductAlias } from "../catalogDb.js";
import { dbQuery } from "../db.js";
import { listUsers, createUser, updateUser } from "../usersDb.js";

function requireEncComercial(req, res, next) {
  if (!req.user?.is_enc_comercial) return res.status(403).json({ ok: false, error: "No autorizado" });
  next();
}

export function buildAdminRouter(odoo) {
  const router = express.Router();

  // =========================
  // CATÁLOGO / DASHBOARD
  // =========================

  // GET /api/admin/catalog?kind=
  router.get("/catalog", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      const data = await loadCatalogBootstrap(odoo, kind);

      // incluir mapping tag->section_id para que el front muestre el select
      const q = await dbQuery(
        `select tag_id, section_id from public.presupuestador_tag_sections where catalog_kind=$1`,
        [kind]
      );
      const map = new Map((q.rows || []).map((r) => [Number(r.tag_id), Number(r.section_id)]));
      const tags = (data.tags || []).map((t) => ({ ...t, section_id: map.get(Number(t.id)) || null }));

      res.json({ ...data, tags });
    } catch (e) {
      next(e);
    }
  });

  router.post("/sections", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const { name, position } = req.body || {};
      const section = await createSection(kind, { name, position });
      res.json({ ok: true, section });
    } catch (e) {
      next(e);
    }
  });

  router.delete("/sections/:id", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || "porton");
      await deleteSection(kind, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.put("/tags/:tagId/section", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const mapping = await setTagSection(kind, req.params.tagId, req.body?.section_id ?? null);
      res.json({ ok: true, mapping });
    } catch (e) {
      next(e);
    }
  });

  router.put("/products/:productId/alias", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const kind = normKind(req.query.kind || req.body?.kind || "porton");
      const alias = req.body?.alias ?? "";
      const saved = await setProductAlias(kind, req.params.productId, alias);
      res.json({ ok: true, alias: saved.alias });
    } catch (e) {
      next(e);
    }
  });

  router.post("/refresh", requireAuth, requireEncComercial, async (_req, res, next) => {
    try {
      clearCatalogBootstrapCache();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/quotes?limit=200&kind=porton|ipanel
  router.get("/quotes", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit || 200), 500);
      const kind = req.query.kind ? normKind(req.query.kind) : null;

      const q = await dbQuery(
        `select id, created_at, created_by_role, status, fulfillment_mode, end_customer, lines, payload,
                commercial_decision, technical_decision, rejection_notes, catalog_kind
           from public.presupuestador_quotes
          ${kind ? "where catalog_kind = $1" : ""}
          order by created_at desc
          limit ${kind ? "$2" : "$1"}`,
        kind ? [kind, limit] : [limit]
      );

      res.json({ ok: true, quotes: q.rows || [] });
    } catch (e) {
      next(e);
    }
  });

  // =========================
  // GESTOR DE USUARIOS
  // =========================

  // GET /api/admin/users?role=vendedor|distribuidor|all&q=...&active=all|true|false
  router.get("/users", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const role = req.query.role || "all";
      const q = req.query.q || "";
      const active = req.query.active || "all";
      const users = await listUsers({ role, q, active });
      res.json({ ok: true, users });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/admin/users
  router.post("/users", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const u = await createUser(req.body || {});
      res.json({ ok: true, user: u });
    } catch (e) {
      next(e);
    }
  });

  // PUT /api/admin/users/:id
  router.put("/users/:id", requireAuth, requireEncComercial, async (req, res, next) => {
    try {
      const u = await updateUser(req.params.id, req.body || {});
      res.json({ ok: true, user: u });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

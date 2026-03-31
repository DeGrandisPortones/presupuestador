import express from "express";
import { requireAuth } from "../auth.js";
import {
  addTechnicalConsultMessage,
  closeTechnicalConsult,
  createTechnicalConsult,
  getTechnicalConsultDetail,
  getTechnicalConsultUnreadSummary,
  listTechnicalConsults,
  markTechnicalConsultRead,
} from "../technicalConsultsDb.js";

function normalizeScope(user, value) {
  const requested = String(value || "").trim().toLowerCase();
  if (requested === "technical" && (user?.is_superuser || user?.is_rev_tecnica)) return "technical";
  return "mine";
}

function normalizeStatus(scope, value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["all", "open", "pending", "in_progress", "closed"].includes(raw)) return raw;
  return scope === "technical" ? "pending" : "open";
}

export function buildTechnicalConsultsRouter() {
  const router = express.Router();

  router.use(requireAuth);

  router.get("/unread-summary", async (req, res, next) => {
    try {
      const summary = await getTechnicalConsultUnreadSummary(req.user);
      res.json({ ok: true, summary });
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const scope = normalizeScope(req.user, req.query?.scope);
      const status = normalizeStatus(scope, req.query?.status);
      const tickets = await listTechnicalConsults(req.user, { scope, status });
      res.json({ ok: true, tickets });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const ticket = await createTechnicalConsult(req.user, req.body || {});
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const ticket = await getTechnicalConsultDetail(req.user, req.params.id);
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/messages", async (req, res, next) => {
    try {
      const ticket = await addTechnicalConsultMessage(req.user, req.params.id, req.body || {});
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/read", async (req, res, next) => {
    try {
      await markTechnicalConsultRead(req.user, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/close", async (req, res, next) => {
    try {
      const ticket = await closeTechnicalConsult(req.user, req.params.id, req.body || {});
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

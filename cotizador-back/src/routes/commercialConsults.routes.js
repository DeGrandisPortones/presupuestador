import express from "express";
import { requireAuth } from "../auth.js";
import {
  addCommercialConsultMessage,
  closeCommercialConsult,
  createCommercialConsult,
  getCommercialConsultDetail,
  getCommercialConsultUnreadSummary,
  listCommercialConsults,
  markCommercialConsultRead,
} from "../commercialConsultsDb.js";
import { searchActiveRequesters } from "../usersDb.js";

function isCommercialUser(user) {
  return !!(user?.is_superuser || user?.is_enc_comercial);
}

function normalizeScope(user, value) {
  const requested = String(value || "").trim().toLowerCase();
  if (requested === "commercial" && (user?.is_superuser || user?.is_enc_comercial)) return "commercial";
  return "mine";
}

function normalizeStatus(scope, value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["all", "open", "pending", "in_progress", "closed"].includes(raw)) return raw;
  return scope === "commercial" ? "pending" : "open";
}

export function buildCommercialConsultsRouter() {
  const router = express.Router();

  router.use(requireAuth);

  router.get("/unread-summary", async (req, res, next) => {
    try {
      const summary = await getCommercialConsultUnreadSummary(req.user);
      res.json({ ok: true, summary });
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const scope = normalizeScope(req.user, req.query?.scope);
      const status = normalizeStatus(scope, req.query?.status);
      const tickets = await listCommercialConsults(req.user, { scope, status });
      res.json({ ok: true, tickets });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const ticket = await createCommercialConsult(req.user, req.body || {});
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  router.get("/requesters/search", async (req, res, next) => {
    try {
      if (!isCommercialUser(req.user)) return res.status(403).json({ ok: false, error: "No autorizado" });
      const requesters = await searchActiveRequesters({ q: req.query?.q || "" });
      res.json({ ok: true, requesters });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const ticket = await getCommercialConsultDetail(req.user, req.params.id);
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/messages", async (req, res, next) => {
    try {
      const ticket = await addCommercialConsultMessage(req.user, req.params.id, req.body || {});
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/read", async (req, res, next) => {
    try {
      await markCommercialConsultRead(req.user, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/close", async (req, res, next) => {
    try {
      const ticket = await closeCommercialConsult(req.user, req.params.id, req.body || {});
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

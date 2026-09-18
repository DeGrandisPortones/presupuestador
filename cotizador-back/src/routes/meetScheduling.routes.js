import express from "express";
import { requireAuth } from "../auth.js";
import {
  cancelMeetBooking,
  countMeetBookingsSince,
  createMeetRecurringRule,
  createMeetSlot,
  deleteMeetRecurringRule,
  deleteMeetSlot,
  getMeetSchedulingSettings,
  listMeetRecurringRules,
  listMeetSlotsForStaff,
  updateMeetRecurringRule,
  updateMeetSchedulingSettings,
} from "../meetSchedulingDb.js";

export function buildMeetSchedulingRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get("/settings", async (req, res, next) => {
    try {
      const settings = await getMeetSchedulingSettings();
      res.json({ ok: true, settings });
    } catch (err) {
      next(err);
    }
  });

  router.put("/settings", async (req, res, next) => {
    try {
      const settings = await updateMeetSchedulingSettings(req.user, req.body || {});
      res.json({ ok: true, settings });
    } catch (err) {
      next(err);
    }
  });

  router.get("/slots", async (req, res, next) => {
    try {
      const includePast = String(req.query?.include_past || "") === "true";
      const slots = await listMeetSlotsForStaff(req.user, { includePast });
      res.json({ ok: true, slots });
    } catch (err) {
      next(err);
    }
  });

  router.post("/slots", async (req, res, next) => {
    try {
      const slot = await createMeetSlot(req.user, req.body || {});
      res.json({ ok: true, slot });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/slots/:id", async (req, res, next) => {
    try {
      await deleteMeetSlot(req.user, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/bookings/:id/cancel", async (req, res, next) => {
    try {
      await cancelMeetBooking(req.user, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/bookings/count-since", async (req, res, next) => {
    try {
      const result = await countMeetBookingsSince(req.user, req.query?.since);
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  router.get("/recurring-rules", async (req, res, next) => {
    try {
      const rules = await listMeetRecurringRules(req.user);
      res.json({ ok: true, rules });
    } catch (err) {
      next(err);
    }
  });

  router.post("/recurring-rules", async (req, res, next) => {
    try {
      const rule = await createMeetRecurringRule(req.user, req.body || {});
      res.json({ ok: true, rule });
    } catch (err) {
      next(err);
    }
  });

  router.put("/recurring-rules/:id", async (req, res, next) => {
    try {
      const rule = await updateMeetRecurringRule(req.user, req.params.id, req.body || {});
      res.json({ ok: true, rule });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/recurring-rules/:id", async (req, res, next) => {
    try {
      await deleteMeetRecurringRule(req.user, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

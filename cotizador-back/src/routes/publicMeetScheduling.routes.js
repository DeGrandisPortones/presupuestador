import express from "express";
import rateLimit from "express-rate-limit";
import { createPublicMeetBooking, listPublicAvailableSlots } from "../meetSchedulingDb.js";

// Sin auth (pagina publica para que un cliente agende) - rate limit para evitar abuso,
// mismo criterio que ya se uso para el POST /tickets sin auth de remitos/informe-ventas.
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Demasiados intentos, esperá unos minutos e intentá de nuevo." },
});

export function buildPublicMeetSchedulingRouter() {
  const router = express.Router();

  router.get("/", async (_req, res, next) => {
    try {
      const data = await listPublicAvailableSlots();
      res.json({ ok: true, ...data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/bookings", bookingLimiter, async (req, res, next) => {
    try {
      const booking = await createPublicMeetBooking(req.body || {});
      res.json({ ok: true, booking });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

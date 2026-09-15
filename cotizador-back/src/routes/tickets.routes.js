import express from "express";
import { requireAuth } from "../auth.js";
import { createTicket, listMyTickets, getTicketForOwner, addOwnMessage } from "../ticketsDb.js";

const MAX_TICKET_ADJUNTOS = 5;
function normalizeTicketAdjuntos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_TICKET_ADJUNTOS).map((a) => ({
    name: String(a?.name || "adjunto").slice(0, 200),
    type: String(a?.type || "application/octet-stream").slice(0, 100),
    size: Number(a?.size || 0) || 0,
    data_url: String(a?.data_url || ""),
    uploaded_at: a?.uploaded_at || new Date().toISOString(),
  })).filter((a) => a.data_url);
}

export function buildTicketsRouter() {
  const router = express.Router();

  router.use(requireAuth);

  router.post("/", async (req, res, next) => {
    try {
      const categoria = String(req.body?.categoria || "").trim();
      const mensaje = String(req.body?.mensaje || "").trim();
      const rutaOrigen = req.body?.rutaOrigen ? String(req.body.rutaOrigen) : null;
      if (!categoria) return res.status(400).json({ ok: false, error: "Falta la categoría" });
      if (!mensaje) return res.status(400).json({ ok: false, error: "Falta el mensaje" });

      const ticket = await createTicket({
        categoria,
        mensaje,
        rutaOrigen,
        creadoPorId: String(req.user.id),
        creadoPorUsername: req.user.username,
        adjuntos: normalizeTicketAdjuntos(req.body?.adjuntos),
      });
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  router.get("/mine", async (req, res, next) => {
    try {
      const tickets = await listMyTickets(String(req.user.id));
      res.json({ ok: true, tickets });
    } catch (err) {
      next(err);
    }
  });

  router.get("/mine/:id", async (req, res, next) => {
    try {
      const ticket = await getTicketForOwner(Number(req.params.id), String(req.user.id));
      if (!ticket) return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
      res.json({ ok: true, ticket });
    } catch (err) {
      next(err);
    }
  });

  router.post("/mine/:id/messages", async (req, res, next) => {
    try {
      const mensaje = String(req.body?.mensaje || "").trim();
      if (!mensaje) return res.status(400).json({ ok: false, error: "Falta el mensaje" });

      const ticket = await getTicketForOwner(Number(req.params.id), String(req.user.id));
      if (!ticket) return res.status(404).json({ ok: false, error: "Ticket no encontrado" });

      const nuevo = await addOwnMessage(ticket.id, {
        autorId: String(req.user.id),
        autorUsername: req.user.username,
        mensaje,
      });
      res.json({ ok: true, mensaje: nuevo });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

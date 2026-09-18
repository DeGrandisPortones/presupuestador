import express from "express";
import { requireAuth } from "../auth.js";
import { createTicket, listMyTickets, getTicketForOwner, addOwnMessage, deleteOwnTicket } from "../ticketsDb.js";

const MAX_TICKET_ADJUNTOS = 5;
// ~15MB de bytes crudos de adjuntos (igual al límite combinado del cliente,
// ver ticketAttachment.js) codificado en base64 (~x1.34). El cliente ya
// valida esto antes de enviar, pero acá no hay que confiar ciegamente en
// eso: es la segunda línea de defensa server-side.
const MAX_TICKET_ADJUNTOS_DATA_URL_CHARS = 21 * 1024 * 1024;
// El cliente SIEMPRE genera data_url con FileReader.readAsDataURL(), así que
// nunca debería ser otra cosa. Sin este chequeo, alguien podía mandar
// data_url = "https://atacante.com/pixel.gif" (o un data: URI con un mime no
// permitido, ej. text/html) y que se renderizara solo (<img src>) o se
// abriera (openTicketAttachment) al primer admin que mirara el ticket —
// tracking pixel o, peor, un blob text/html ejecutando JS en el origen del
// panel admin (robo de token vía localStorage). Se valida el mime REAL
// embebido en el data: URI, no el campo `type` (que también lo controla
// quien manda el ticket y no tiene por qué coincidir).
const ALLOWED_ADJUNTO_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf|video\/(?:mp4|quicktime|webm));base64,/i;

function normalizeTicketAdjuntos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_TICKET_ADJUNTOS).map((a) => ({
    name: String(a?.name || "adjunto").slice(0, 200),
    type: String(a?.type || "application/octet-stream").slice(0, 100),
    size: Number(a?.size || 0) || 0,
    data_url: String(a?.data_url || ""),
    uploaded_at: a?.uploaded_at || new Date().toISOString(),
  })).filter((a) => ALLOWED_ADJUNTO_DATA_URL_RE.test(a.data_url));
}

function ticketAdjuntosExceedTotal(adjuntos) {
  return adjuntos.reduce((sum, a) => sum + a.data_url.length, 0) > MAX_TICKET_ADJUNTOS_DATA_URL_CHARS;
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
      const adjuntos = normalizeTicketAdjuntos(req.body?.adjuntos);
      if (ticketAdjuntosExceedTotal(adjuntos)) {
        return res.status(400).json({ ok: false, error: "Los adjuntos superan el tamaño total permitido." });
      }

      const ticket = await createTicket({
        categoria,
        mensaje,
        rutaOrigen,
        creadoPorId: String(req.user.id),
        creadoPorUsername: req.user.username,
        adjuntos,
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

  // DELETE /api/tickets/mine/:id — anular (= borrar) un ticket propio,
  // autoservicio, no hace falta que intervenga soporte. Solo si todavía no
  // está "closed" (ya resuelto por soporte, eso queda como historial).
  router.delete("/mine/:id", async (req, res, next) => {
    try {
      const borrado = await deleteOwnTicket(Number(req.params.id), String(req.user.id));
      if (!borrado) {
        return res.status(404).json({ ok: false, error: "Ticket no encontrado o ya no se puede anular" });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

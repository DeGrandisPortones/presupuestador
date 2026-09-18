import { http } from "./http.js";

export async function createTicket(payload = {}) {
  const { data } = await http.post("/api/tickets", payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear el ticket");
  return data.ticket;
}

export async function listMyTickets() {
  const { data } = await http.get("/api/tickets/mine");
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar tus tickets");
  return data.tickets || [];
}

export async function getMyTicket(id) {
  const { data } = await http.get(`/api/tickets/mine/${encodeURIComponent(String(id))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el ticket");
  return data.ticket;
}

export async function addMyTicketMessage(id, payload = {}) {
  const { data } = await http.post(`/api/tickets/mine/${encodeURIComponent(String(id))}/messages`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo enviar el mensaje");
  return data.mensaje;
}

export async function cancelMyTicket(id) {
  const { data } = await http.delete(`/api/tickets/mine/${encodeURIComponent(String(id))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo anular el ticket");
}

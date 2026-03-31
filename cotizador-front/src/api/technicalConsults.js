import { http } from "./http.js";

export async function getTechnicalConsultUnreadSummary() {
  const { data } = await http.get("/api/technical-consults/unread-summary");
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el resumen de consultas técnicas");
  return data.summary || {
    mine_unread_count: 0,
    mine_open_count: 0,
    technical_pending_count: 0,
    technical_unread_count: 0,
    technical_open_count: 0,
  };
}

export async function listTechnicalConsults({ scope = "mine", status = "open" } = {}) {
  const { data } = await http.get("/api/technical-consults", {
    params: { scope, status },
  });
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las consultas técnicas");
  return data.tickets || [];
}

export async function getTechnicalConsult(id) {
  const { data } = await http.get(`/api/technical-consults/${encodeURIComponent(String(id))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la consulta técnica");
  return data.ticket;
}

export async function createTechnicalConsult(payload = {}) {
  const { data } = await http.post("/api/technical-consults", payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear la consulta técnica");
  return data.ticket;
}

export async function addTechnicalConsultMessage(id, payload = {}) {
  const { data } = await http.post(`/api/technical-consults/${encodeURIComponent(String(id))}/messages`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo enviar el mensaje");
  return data.ticket;
}

export async function markTechnicalConsultRead(id) {
  const { data } = await http.post(`/api/technical-consults/${encodeURIComponent(String(id))}/read`, {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo marcar como leída");
  return true;
}

export async function closeTechnicalConsult(id, payload = {}) {
  const { data } = await http.post(`/api/technical-consults/${encodeURIComponent(String(id))}/close`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo cerrar la consulta técnica");
  return data.ticket;
}

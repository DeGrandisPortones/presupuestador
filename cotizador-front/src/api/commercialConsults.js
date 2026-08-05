import { http } from "./http.js";

export async function getCommercialConsultUnreadSummary() {
  const { data } = await http.get("/api/commercial-consults/unread-summary");
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el resumen de consultas comerciales");
  return data.summary || {
    mine_unread_count: 0,
    mine_open_count: 0,
    commercial_pending_count: 0,
    commercial_unread_count: 0,
    commercial_open_count: 0,
  };
}

export async function listCommercialConsults({ scope = "mine", status = "open" } = {}) {
  const { data } = await http.get("/api/commercial-consults", {
    params: { scope, status },
  });
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las consultas comerciales");
  return data.tickets || [];
}

export async function getCommercialConsult(id) {
  const { data } = await http.get(`/api/commercial-consults/${encodeURIComponent(String(id))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la consulta comercial");
  return data.ticket;
}

export async function createCommercialConsult(payload = {}) {
  const { data } = await http.post("/api/commercial-consults", payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear la consulta comercial");
  if (data.bulk) return { bulk: true, audience: data.audience, count: data.count, tickets: data.tickets || [] };
  return data.ticket;
}

export async function searchCommercialConsultRequesters(q) {
  const { data } = await http.get("/api/commercial-consults/requesters/search", {
    params: { q: q || "" },
  });
  if (!data?.ok) throw new Error(data?.error || "No se pudo buscar vendedores/distribuidores");
  return data.requesters || [];
}

export async function listCommercialConsultRequesters(audience = "todos") {
  const { data } = await http.get("/api/commercial-consults/requesters/list", {
    params: { audience },
  });
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la lista de vendedores/distribuidores");
  return data.requesters || [];
}

export async function addCommercialConsultMessage(id, payload = {}) {
  const { data } = await http.post(`/api/commercial-consults/${encodeURIComponent(String(id))}/messages`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo enviar el mensaje");
  return data.ticket;
}

export async function markCommercialConsultRead(id) {
  const { data } = await http.post(`/api/commercial-consults/${encodeURIComponent(String(id))}/read`, {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo marcar como leída");
  return true;
}

export async function closeCommercialConsult(id, payload = {}) {
  const { data } = await http.post(`/api/commercial-consults/${encodeURIComponent(String(id))}/close`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo cerrar la consulta comercial");
  return data.ticket;
}

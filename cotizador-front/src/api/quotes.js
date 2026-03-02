import { http } from "./http.js";

export async function listQuotes({ scope = "mine" } = {}) {
  const params = new URLSearchParams();
  params.set("scope", scope);

  const { data } = await http.get(`/api/quotes?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar presupuestos");
  return data.quotes || [];
}

export async function getQuote(id) {
  const { data } = await http.get(`/api/quotes/${id}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el presupuesto");
  return data.quote;
}

export async function createQuote(payload) {
  const { data } = await http.post(`/api/quotes`, payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear el presupuesto");
  return data.quote;
}

export async function updateQuote(id, payload) {
  const { data } = await http.put(`/api/quotes/${id}`, payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo actualizar el presupuesto");
  return data.quote;
}

export async function submitQuote(id) {
  const { data } = await http.post(`/api/quotes/${id}/submit`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo enviar a aprobación");
  return data.quote;
}

export async function reviewCommercial(id, { action, notes }) {
  const { data } = await http.post(`/api/quotes/${id}/review/commercial`, { action, notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo registrar revisión comercial");
  return data; // { ok, quote }
}

export async function reviewTechnical(id, { action, notes }) {
  const { data } = await http.post(`/api/quotes/${id}/review/technical`, { action, notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo registrar revisión técnica");
  return data; // { ok, quote, order? }
}

export async function requestProductionFromAcopio(id, { notes } = {}) {
  const { data } = await http.post(`/api/quotes/${id}/acopio/request_production`, { notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo solicitar cambio a Producción");
  return data.quote;
}

export async function reviewAcopioCommercial(id, { action, notes } = {}) {
  const { data } = await http.post(`/api/quotes/${id}/acopio/review/commercial`, { action, notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo revisar solicitud Acopio→Producción (Comercial)");
  return data.quote;
}

export async function reviewAcopioTechnical(id, { action, notes } = {}) {
  const { data } = await http.post(`/api/quotes/${id}/acopio/review/technical`, { action, notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo revisar solicitud Acopio→Producción (Técnica)");
  return data.quote;
}

/**
 * Crea una copia/revisión del presupuesto (para ajustes o para el flujo Acopio→Producción).
 * Si el backend todavía no implementa el endpoint, este llamado fallará solo si el usuario lo ejecuta.
 */
export async function createRevisionQuote(id) {
  const { data } = await http.post(`/api/quotes/${id}/revision`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear el ajuste");
  return data.quote;
}

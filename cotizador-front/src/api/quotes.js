import { http } from "./http.js";

export async function listQuotes({ scope = "mine" } = {}) {
  const params = new URLSearchParams();
  params.set("scope", scope);
  const { data } = await http.get(`/api/quotes?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar presupuestos");
  return data.quotes || [];
}
export async function getQuote(id) { const { data } = await http.get(`/api/quotes/${id}`); if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el presupuesto"); return data.quote; }
export async function createQuote(payload) { const { data } = await http.post(`/api/quotes`, payload); if (!data?.ok) throw new Error(data?.error || "No se pudo crear el presupuesto"); return data.quote; }
export async function updateQuote(id, payload) { const { data } = await http.put(`/api/quotes/${id}`, payload); if (!data?.ok) throw new Error(data?.error || "No se pudo actualizar el presupuesto"); return data.quote; }
export async function submitQuote(id, payload = {}) { const body = payload && typeof payload === "object" ? payload : {}; const { data } = await http.post(`/api/quotes/${id}/submit`, body); if (!data?.ok) throw new Error(data?.error || "No se pudo enviar a aprobación"); return data.quote; }
export async function confirmQuote(id, payload = {}) { const body = payload && typeof payload === "object" ? payload : {}; try { const { data } = await http.post(`/api/quotes/${id}/confirm`, body); if (!data?.ok) throw new Error(data?.error || "No se pudo confirmar el presupuesto"); return data.quote; } catch (e) { const msg = String(e?.message || "").toLowerCase(); if (msg.includes("not found") || msg.includes("404") || msg.includes("cannot post")) return await submitQuote(id, body); throw e; } }
export async function submitFinalQuote(id) { const { data } = await http.post(`/api/quotes/${id}/final/submit`, {}); if (!data?.ok) throw new Error(data?.error || "No se pudo enviar la cotización final a Odoo"); return data.quote; }
export async function reviewCommercial(id, { action, notes, billingCustomer } = {}) { const body = { action, notes, billing_customer: billingCustomer || null }; const { data } = await http.post(`/api/quotes/${id}/review/commercial`, body); if (!data?.ok) throw new Error(data?.error || "No se pudo registrar revisión comercial"); return data; }
export async function reviewTechnical(id, { action, notes }) { const { data } = await http.post(`/api/quotes/${id}/review/technical`, { action, notes }); if (!data?.ok) throw new Error(data?.error || "No se pudo registrar revisión técnica"); return data; }
export async function requestProductionFromAcopio(id, { notes } = {}) { const { data } = await http.post(`/api/quotes/${id}/acopio/request_production`, { notes }); if (!data?.ok) throw new Error(data?.error || "No se pudo solicitar cambio a Producción"); return data.quote; }
export async function moveToProduccion(id, { notes } = {}) { try { return await requestProductionFromAcopio(id, { notes }); } catch (e) { const msg = String(e?.message || "").toLowerCase(); if (msg.includes("not found") || msg.includes("404") || msg.includes("cannot post")) { const { data } = await http.post(`/api/quotes/${id}/move_to_produccion`, { notes }); if (!data?.ok) throw new Error(data?.error || "No se pudo mover a Producción"); return data.quote; } throw e; } }
export async function reviewAcopioCommercial(id, { action, notes } = {}) { const { data } = await http.post(`/api/quotes/${id}/acopio/review/commercial`, { action, notes }); if (!data?.ok) throw new Error(data?.error || "No se pudo revisar solicitud Acopio→Producción (Comercial)"); return data.quote; }
export async function reviewAcopioTechnical(id, { action, notes } = {}) { const { data } = await http.post(`/api/quotes/${id}/acopio/review/technical`, { action, notes }); if (!data?.ok) throw new Error(data?.error || "No se pudo revisar solicitud Acopio→Producción (Técnica)"); return data.quote; }
export async function createRevisionQuote(id) { const { data } = await http.post(`/api/quotes/${id}/revision`); if (!data?.ok) throw new Error(data?.error || "No se pudo crear el ajuste"); return data.quote; }
export async function getProductionPlanningEstimate({ quoteId = null, fromDate = null } = {}) {
  const params = new URLSearchParams();
  if (quoteId) params.set("quote_id", String(quoteId));
  if (fromDate) params.set("from_date", String(fromDate));
  const { data } = await http.get(`/api/production-planning/estimate?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo calcular la estimación de entrega");
  return data.estimate || null;
}
export async function getQuoteViewer({ reference = "", quoteId = "" } = {}) {
  const params = new URLSearchParams();
  if (reference) params.set("reference", String(reference));
  if (quoteId) params.set("quote_id", String(quoteId));
  const { data } = await http.get(`/api/quote-viewer?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el historial del portón");
  return data;
}

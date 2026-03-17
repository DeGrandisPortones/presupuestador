import { http } from "./http.js";

export async function createOrGetDoorFromQuote(quoteId) {
  const { data } = await http.post(`/api/doors/from-quote/${quoteId}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo abrir la puerta");
  return data.door;
}

export async function createStandaloneDoor() {
  const { data } = await http.post(`/api/doors`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear la puerta");
  return data.door;
}

export async function listDoors({ scope = "mine" } = {}) {
  const { data } = await http.get(`/api/doors?scope=${encodeURIComponent(scope)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las puertas");
  return data.doors || [];
}

export async function listDoorsByQuote(quoteId) {
  const { data } = await http.get(`/api/doors/by-quote/${quoteId}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las puertas vinculadas");
  return data.doors || [];
}

export async function listDoorSuppliers(query = "") {
  const { data } = await http.get(`/api/doors/suppliers?query=${encodeURIComponent(query)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los proveedores");
  return data.suppliers || [];
}

export async function getDoor(id) {
  const { data } = await http.get(`/api/doors/${id}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la puerta");
  return data.door;
}

export async function getDoorQuoteSummary(id, mode = "presupuesto") {
  const { data } = await http.get(`/api/doors/${id}/quote-summary?mode=${encodeURIComponent(mode)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo calcular el presupuesto de puerta");
  return data.summary;
}

export async function getDoorQuotePdfPayload(id, mode = "presupuesto") {
  const { data } = await http.get(`/api/doors/${id}/quote-pdf-payload?mode=${encodeURIComponent(mode)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo preparar el PDF de puerta");
  return data.payload;
}

export async function updateDoor(id, payload) {
  const { data } = await http.put(`/api/doors/${id}`, payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la puerta");
  return data.door;
}

export async function submitDoor(id) {
  const { data } = await http.post(`/api/doors/${id}/submit`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo enviar la puerta a aprobación");
  return data.door;
}

export async function reviewDoorCommercial(id, { action, notes } = {}) {
  const { data } = await http.post(`/api/doors/${id}/review/commercial`, { action, notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo registrar la revisión comercial");
  return data.door;
}

export async function reviewDoorTechnical(id, { action, notes } = {}) {
  const { data } = await http.post(`/api/doors/${id}/review/technical`, { action, notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo registrar la revisión técnica");
  return data.door;
}

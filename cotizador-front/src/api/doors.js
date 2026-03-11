import { http } from "./http.js";

export async function createDoor(payload = {}) {
  const { data } = await http.post(`/api/doors`, payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear la puerta");
  return data.door;
}

export async function createOrGetDoorFromQuote(quoteId) {
  const { data } = await http.post(`/api/doors/from-quote/${quoteId}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo abrir la puerta");
  return data.door;
}

export async function listDoors({ scope = "mine", quoteId = null } = {}) {
  const params = new URLSearchParams();
  params.set("scope", scope);
  if (quoteId) params.set("quote_id", quoteId);
  const { data } = await http.get(`/api/doors?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las puertas");
  return data.doors || [];
}

export async function listDoorSuppliers(query = "") {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  const { data } = await http.get(`/api/doors/suppliers?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los proveedores");
  return data.suppliers || [];
}

export async function getDoor(id) {
  const { data } = await http.get(`/api/doors/${id}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la puerta");
  return data.door;
}

export async function updateDoor(id, payload) {
  const { data } = await http.put(`/api/doors/${id}`, payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la puerta");
  return data.door;
}

export async function submitDoor(id) {
  const { data } = await http.post(`/api/doors/${id}/submit`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo confirmar la puerta");
  return data.door;
}

export async function reviewDoorCommercial(id, { action, notes } = {}) {
  const { data } = await http.post(`/api/doors/${id}/review/commercial`, { action, notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo revisar Comercial de la puerta");
  return data.door;
}

export async function reviewDoorTechnical(id, { action, notes } = {}) {
  const { data } = await http.post(`/api/doors/${id}/review/technical`, { action, notes });
  if (!data?.ok) throw new Error(data?.error || "No se pudo revisar Técnica de la puerta");
  return data.door;
}

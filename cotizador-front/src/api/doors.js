import { http } from "./http.js";

export async function createOrGetDoorFromQuote(quoteId) {
  const { data } = await http.post(`/api/doors/from-quote/${quoteId}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo abrir la puerta");
  return data.door;
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

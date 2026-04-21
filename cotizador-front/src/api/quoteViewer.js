import { http } from "./http.js";

export async function searchQuoteHistory(ref) {
  const { data } = await http.get(`/api/quote-viewer/search?ref=${encodeURIComponent(String(ref || ""))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo buscar el portón");
  return data.quotes || [];
}

export async function getQuoteHistory(id) {
  const { data } = await http.get(`/api/quote-viewer/history/${encodeURIComponent(String(id || ""))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el historial del portón");
  return data.history || null;
}

export async function listSalesActors() {
  const { data } = await http.get(`/api/quote-viewer/activity/users`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los usuarios");
  return data.users || [];
}

export async function getSalesActorActivity(userId) {
  const { data } = await http.get(`/api/quote-viewer/activity/${encodeURIComponent(String(userId || ""))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la actividad del usuario");
  return data.activity || null;
}

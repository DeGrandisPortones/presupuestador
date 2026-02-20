import { http } from "./http.js";

export async function adminGetCatalog(kind = "porton") {
  const { data } = await http.get(`/api/admin/catalog?kind=${encodeURIComponent(kind)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el catálogo");
  return data;
}

export async function adminCreateSection(kind = "porton", { name, position = 100 }) {
  const { data } = await http.post(`/api/admin/sections?kind=${encodeURIComponent(kind)}`, { name, position });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la sección");
  return data.section;
}

export async function adminDeleteSection(kind = "porton", id) {
  const { data } = await http.delete(`/api/admin/sections/${id}?kind=${encodeURIComponent(kind)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo borrar la sección");
  return true;
}

export async function adminSetTagSection(kind = "porton", tagId, section_id) {
  const { data } = await http.put(`/api/admin/tags/${tagId}/section?kind=${encodeURIComponent(kind)}`, { section_id });
  if (!data?.ok) throw new Error(data?.error || "No se pudo asignar la sección");
  return data.mapping;
}

export async function adminSetProductAlias(kind = "porton", productId, alias) {
  const { data } = await http.put(`/api/admin/products/${productId}/alias?kind=${encodeURIComponent(kind)}`, { alias });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar el alias");
  return data.alias;
}

export async function adminRefreshCatalog() {
  const { data } = await http.post("/api/admin/refresh", {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo refrescar");
  return data.catalog;
}

export async function adminGetQuotes(kind = "porton", limit = 200) {
  const { data } = await http.get(`/api/admin/quotes?kind=${encodeURIComponent(kind)}&limit=${encodeURIComponent(String(limit))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las cotizaciones");
  return data.quotes || [];
}

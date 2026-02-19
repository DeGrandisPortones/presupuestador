import { http } from "./http.js";

export async function adminGetCatalog() {
  const { data } = await http.get("/api/admin/catalog");
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el catálogo");
  return data;
}

export async function adminCreateSection({ name, position = 100 }) {
  const { data } = await http.post("/api/admin/sections", { name, position });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la sección");
  return data.section;
}

export async function adminDeleteSection(id) {
  const { data } = await http.delete(`/api/admin/sections/${id}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo borrar la sección");
  return true;
}

export async function adminSetTagSection(tagId, section_id) {
  const { data } = await http.put(`/api/admin/tags/${tagId}/section`, { section_id });
  if (!data?.ok) throw new Error(data?.error || "No se pudo asignar la sección");
  return data.mapping;
}

export async function adminSetProductAlias(productId, alias) {
  const { data } = await http.put(`/api/admin/products/${productId}/alias`, { alias });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar el alias");
  return data.alias;
}

export async function adminRefreshCatalog() {
  const { data } = await http.post("/api/admin/refresh", {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo refrescar");
  return data.catalog;
}

export async function adminGetQuotes(limit = 200) {
  const { data } = await http.get(`/api/admin/quotes?limit=${encodeURIComponent(String(limit))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las cotizaciones");
  return data.quotes || [];
}

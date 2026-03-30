import { http } from "./http.js";

export async function adminGetCatalog(kind = "porton") {
  const { data } = await http.get(`/api/admin/catalog?kind=${encodeURIComponent(kind)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el catálogo");
  return data;
}
export async function adminGetTechnicalMeasurementRules() {
  const { data } = await http.get(`/api/admin/technical-measurement-rules`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las reglas técnicas");
  return data.rules || { rules: [] };
}
export async function adminSaveTechnicalMeasurementRules(payload) {
  const { data } = await http.put(`/api/admin/technical-measurement-rules`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudieron guardar las reglas técnicas");
  return data.rules || { rules: [] };
}

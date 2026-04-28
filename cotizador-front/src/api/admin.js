import { http } from "./http.js";

export async function adminGetCatalog(kind = "porton") {
  const { data } = await http.get(`/api/admin/catalog?kind=${encodeURIComponent(kind)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el catálogo");
  return data;
}

export async function adminGetProductPdfNames(kind = "porton") {
  const { data } = await http.get(`/api/admin/product-pdf-names?kind=${encodeURIComponent(kind)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los nombres PDF");
  return data.items || [];
}

export async function adminSetProductPdfName(kind = "porton", productId, pdf_name) {
  const { data } = await http.put(`/api/admin/products/${encodeURIComponent(String(productId))}/pdf-name?kind=${encodeURIComponent(kind)}`, { pdf_name });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar el nombre PDF");
  return data.pdf_name || null;
}

export async function adminGetProductionPropertyAssignments() {
  const { data } = await http.get(`/api/admin/production-property-assignments`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las asignaciones de producción");
  return {
    source_properties: data.source_properties || [],
    target_properties: data.target_properties || [],
    assignments: data.assignments || [],
  };
}

export async function adminSetProductionPropertyAssignment(sourceKey, payload = {}) {
  const { data } = await http.put(`/api/admin/production-property-assignments/${encodeURIComponent(String(sourceKey || ""))}`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la asignación de producción");
  return data.assignment || null;
}

export async function adminGetFinalSettings() {
  const { data } = await http.get(`/api/admin/final-settings`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la tolerancia comercial");
  return data.settings || { tolerance_percent: 0, tolerance_area_m2: 0 };
}

export async function adminSaveFinalSettings(payload) {
  const { data } = await http.put(`/api/admin/final-settings`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la tolerancia comercial");
  return data.settings || { tolerance_percent: 0, tolerance_area_m2: 0 };
}

export async function adminGetMeasurementProductMappings() {
  const { data } = await http.get(`/api/admin/measurement-product-mappings`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las asignaciones de medición");
  return data.mappings || { rules: [] };
}

export async function adminSaveMeasurementProductMappings(payload) {
  const { data } = await http.put(`/api/admin/measurement-product-mappings`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudieron guardar las asignaciones de medición");
  return data.mappings || { rules: [] };
}

export async function adminGetDoorQuoteSettings() {
  const { data } = await http.get(`/api/admin/door-quote-settings`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la fórmula de puerta");
  return data.settings || { formula: "precio_ipanel + precio_venta_marco" };
}

export async function adminSaveDoorQuoteSettings(payload) {
  const { data } = await http.put(`/api/admin/door-quote-settings`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la fórmula de puerta");
  return data.settings || { formula: "precio_ipanel + precio_venta_marco" };
}

export async function adminGetTechnicalMeasurementRules(kind = "porton") {
  const { data } = await http.get(`/api/admin/technical-measurement-rules?kind=${encodeURIComponent(kind || "porton")}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las reglas técnicas");
  return data.rules || { rules: [] };
}

export async function adminSaveTechnicalMeasurementRules(kindOrPayload = "porton", maybePayload) {
  const hasExplicitKind = maybePayload !== undefined;
  const kind = hasExplicitKind ? kindOrPayload : "porton";
  const payload = hasExplicitKind ? maybePayload : kindOrPayload;
  const { data } = await http.put(`/api/admin/technical-measurement-rules?kind=${encodeURIComponent(kind || "porton")}`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudieron guardar las reglas técnicas");
  return data.rules || { rules: [] };
}

export async function adminGetTechnicalMeasurementFieldDefinitions() {
  const { data } = await http.get(`/api/admin/technical-measurement-fields`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los campos técnicos");
  return data.fields || { fields: [] };
}

export async function adminSaveTechnicalMeasurementFieldDefinitions(payload) {
  const { data } = await http.put(`/api/admin/technical-measurement-fields`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudieron guardar los campos técnicos");
  return data.fields || { fields: [] };
}

export async function adminGetProductionPlanning(year) {
  const { data } = await http.get(`/api/admin/production-planning?year=${encodeURIComponent(String(year))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la planificación de producción");
  return data.planning || { year: Number(year || 0), weeks: [] };
}

export async function adminSaveProductionPlanning(payload) {
  const { data } = await http.put(`/api/admin/production-planning`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la planificación de producción");
  return data.planning || { year: Number(payload?.year || 0), weeks: [] };
}

export async function adminCreateSection(kind = "porton", { name, position = 100, use_surface_qty = false }) {
  const { data } = await http.post(`/api/admin/sections?kind=${encodeURIComponent(kind)}`, { name, position, use_surface_qty });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la sección");
  return data.section;
}

export async function adminUpdateSection(kind = "porton", id, payload = {}) {
  const { data } = await http.put(`/api/admin/sections/${id}?kind=${encodeURIComponent(kind)}`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo actualizar la sección");
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

export async function adminSetProductVisibility(kind = "porton", productId, payload = {}) {
  const { data } = await http.put(`/api/admin/products/${productId}/visibility?kind=${encodeURIComponent(kind)}`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la visibilidad");
  return data.visibility;
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

export async function adminListUsers({ role = "all", q = "", active = "all" } = {}) {
  const qs = new URLSearchParams();
  if (role) qs.set("role", role);
  if (q) qs.set("q", q);
  if (active) qs.set("active", active);

  const { data } = await http.get(`/api/admin/users?${qs.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar usuarios");
  return data.users || [];
}

export async function adminCreateUser(payload) {
  const { data } = await http.post(`/api/admin/users`, payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo crear el usuario");
  return data.user;
}

export async function adminUpdateUser(id, payload) {
  const { data } = await http.put(`/api/admin/users/${encodeURIComponent(String(id))}`, payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudo actualizar el usuario");
  return data.user;
}

export async function adminSetTypeSections(kind = "porton", typeKey, section_ids = []) {
  const key = encodeURIComponent(String(typeKey || ""));
  const { data } = await http.put(`/api/admin/types/${key}/sections?kind=${encodeURIComponent(kind)}`, { section_ids });
  if (!data?.ok) throw new Error(data?.error || "No se pudo asignar secciones al tipo");
  return data.mapping;
}

export async function adminSetTypeVisibility(kind = "porton", typeKey, payload = {}) {
  const key = encodeURIComponent(String(typeKey || ""));
  const { data } = await http.put(`/api/admin/types/${key}/visibility?kind=${encodeURIComponent(kind)}`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la visibilidad del tipo");
  return data.visibility;
}

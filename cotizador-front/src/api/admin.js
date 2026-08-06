import { http } from "./http.js";
import { storeTechnicalRulesForKind } from "../domain/quote/technicalSnapshot.js";

function normalizeAdminQuoteParams(paramsOrKind = "porton", maybeLimit = 200) {
  if (paramsOrKind && typeof paramsOrKind === "object") {
    return {
      kind: paramsOrKind.kind || "",
      bucket: paramsOrKind.bucket || "all",
      q: paramsOrKind.q || "",
      limit: paramsOrKind.limit || 200,
    };
  }
  return { kind: paramsOrKind || "porton", bucket: "all", q: "", limit: maybeLimit || 200 };
}

export async function adminGetCatalog(kind = "porton") {
  const { data } = await http.get(`/api/admin/catalog?kind=${encodeURIComponent(kind)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el catálogo");
  return data;
}

export async function adminDebugOdooProduct({ templateId, productId, query } = {}) {
  const params = new URLSearchParams();
  if (templateId) params.set("template_id", String(templateId));
  if (productId) params.set("product_id", String(productId));
  if (query) params.set("q", String(query));
  const { data } = await http.get(`/api/catalog/odoo-product-debug?${params.toString()}`);
  return data;
}

export async function adminGetProductPdfNames(kind = "porton", brand = "default") {
  const { data } = await http.get(`/api/admin/product-pdf-names?kind=${encodeURIComponent(kind)}&brand=${encodeURIComponent(brand)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los nombres PDF");
  return data.items || [];
}

export async function adminSetProductPdfName(kind = "porton", productId, pdf_name, brand = "default") {
  const { data } = await http.put(`/api/admin/products/${encodeURIComponent(String(productId))}/pdf-name?kind=${encodeURIComponent(kind)}&brand=${encodeURIComponent(brand)}`, { pdf_name });
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

function normalizeCatalogKindParam(kind = "porton") {
  if (typeof kind === "string") return kind.trim() || "porton";
  if (kind && typeof kind === "object" && typeof kind.kind === "string") return kind.kind.trim() || "porton";
  return "porton";
}

export async function adminGetTechnicalMeasurementRules(kind = "porton") {
  const normalizedKind = normalizeCatalogKindParam(kind);
  const { data } = await http.get(`/api/admin/technical-measurement-rules?kind=${encodeURIComponent(normalizedKind)}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las reglas técnicas");
  const rules = data.rules || { rules: [] };
  storeTechnicalRulesForKind(normalizedKind, rules);
  return rules;
}

export async function adminSaveTechnicalMeasurementRules(kindOrPayload = "porton", maybePayload) {
  const hasExplicitKind = maybePayload !== undefined;
  const kind = hasExplicitKind ? kindOrPayload : "porton";
  const payload = hasExplicitKind ? maybePayload : kindOrPayload;
  const { data } = await http.put(`/api/admin/technical-measurement-rules?kind=${encodeURIComponent(kind || "porton")}`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudieron guardar las reglas técnicas");
  const rules = data.rules || { rules: [] };
  storeTechnicalRulesForKind(kind || "porton", rules);
  return rules;
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

export async function adminCreateSection(kind = "porton", { name, position = 100, use_surface_qty = false, budget_sector = null, budget_show_detail = true }) {
  const { data } = await http.post(`/api/admin/sections?kind=${encodeURIComponent(kind)}`, { name, position, use_surface_qty, budget_sector, budget_show_detail });
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

export async function adminGetQuotes(paramsOrKind = "porton", limit = 200) {
  const params = normalizeAdminQuoteParams(paramsOrKind, limit);
  const qs = new URLSearchParams();
  if (params.kind) qs.set("kind", params.kind);
  if (params.bucket) qs.set("bucket", params.bucket);
  if (params.q) qs.set("q", params.q);
  if (params.limit) qs.set("limit", String(params.limit));
  const { data } = await http.get(`/api/admin/quotes?${qs.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las cotizaciones");
  return data.quotes || [];
}

export async function adminDeleteQuote(id) {
  const { data } = await http.delete(`/api/admin/quotes/${encodeURIComponent(String(id))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo eliminar el presupuesto");
  return true;
}

export async function adminSetQuoteTechnicalFormula(id, enabled) {
  const { data } = await http.post(`/api/admin/quotes/${encodeURIComponent(String(id))}/technical-formula`, { enabled });
  if (!data?.ok) throw new Error(data?.error || "No se pudo actualizar el presupuesto");
  return data;
}

export async function adminResyncPortonMeasurements(identifier, { force = false } = {}) {
  const { data } = await http.post("/api/admin/resync/porton-measurements", { identifier, force });
  // Si esta bloqueado porque el cliente ya acepto, devolvemos la respuesta tal cual (no es un error
  // de verdad) para que la UI pueda ofrecer confirmar el forzado explicitamente.
  if (!data?.ok && !data?.blocked_reason) throw new Error(data?.error || "No se pudo resincronizar las medidas");
  return data;
}

export async function adminGetHistory({ kind = "", q = "", fulfillment = "all", from_date = "", to_date = "" } = {}) {
  const qs = new URLSearchParams();
  if (kind) qs.set("kind", kind);
  if (q) qs.set("q", q);
  if (fulfillment && fulfillment !== "all") qs.set("fulfillment", fulfillment);
  if (from_date) qs.set("from_date", from_date);
  if (to_date) qs.set("to_date", to_date);
  const { data } = await http.get(`/api/admin/history?${qs.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el historial");
  return data.quotes || [];
}

export async function adminGetHistoryDetail(id) {
  const { data } = await http.get(`/api/admin/history/${encodeURIComponent(String(id))}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el detalle");
  return data.quote;
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

export async function adminGetDoorTechnicalRules() {
  const { data } = await http.get(`/api/admin/door-technical-rules`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar las reglas tecnicas de puertas");
  return data.rules || {};
}

export async function adminSaveDoorTechnicalRules(payload = {}) {
  const { data } = await http.put(`/api/admin/door-technical-rules`, payload || {});
  if (!data?.ok) throw new Error(data?.error || "No se pudieron guardar las reglas tecnicas de puertas");
  return data.rules || {};
}

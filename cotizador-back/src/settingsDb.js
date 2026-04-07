import { dbQuery } from "./db.js";
import { normalizeDoorQuoteFormula } from "./doorQuoteFormula.js";

const FINAL_QUOTE_SETTINGS_KEY = "commercial_final_quote";
const MEASUREMENT_PRODUCT_MAPPINGS_KEY = "measurement_product_mappings";
const DOOR_QUOTE_SETTINGS_KEY = "door_quote_settings";
const TECHNICAL_MEASUREMENT_RULES_KEY = "technical_measurement_rules";
const TECHNICAL_MEASUREMENT_FIELDS_KEY = "technical_measurement_fields";
const DEFAULT_SURFACE_FINAL_FORMULA = "(alto_calculado_mm / 1000) * (ancho_calculado_mm / 1000)";
const DEFAULT_SURFACE_PARAMETERS = {
  clasico_kg_m2: 15,
  inyectado_kg_m2: 25,
  piernas_angostas_hasta_kg: 140,
  piernas_comunes_hasta_kg: 175,
  piernas_anchas_hasta_kg: 240,
  piernas_superanchas_hasta_kg: 300,
  peso_descuento_alto_mm: 10,
  peso_descuento_ancho_mm: 14,
  detras_vano_alto_mm: 100,
  detras_vano_ancho_angostas_mm: 140,
  detras_vano_ancho_comunes_mm: 200,
  detras_vano_ancho_anchas_mm: 280,
  detras_vano_ancho_superanchas_mm: 380,
  dentro_vano_alto_mm: -10,
  dentro_vano_ancho_mm: -20,
};

let ensured = false;

export async function ensureSettingsTable() {
  if (ensured) return;
  await dbQuery(`
    create table if not exists public.presupuestador_settings (
      key text primary key,
      value_json jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);
  for (const [key, value] of [
    [FINAL_QUOTE_SETTINGS_KEY, { tolerance_area_m2: 0 }],
    [MEASUREMENT_PRODUCT_MAPPINGS_KEY, { rules: [] }],
    [DOOR_QUOTE_SETTINGS_KEY, { formula: "precio_ipanel + precio_venta_marco" }],
    [TECHNICAL_MEASUREMENT_RULES_KEY, { rules: [], surface_final_formula: DEFAULT_SURFACE_FINAL_FORMULA, surface_helper_rules: [], surface_parameters: DEFAULT_SURFACE_PARAMETERS }],
    [TECHNICAL_MEASUREMENT_FIELDS_KEY, { fields: [] }],
  ]) {
    await dbQuery(
      `insert into public.presupuestador_settings (key, value_json) values ($1, $2::jsonb) on conflict (key) do nothing`,
      [key, JSON.stringify(value)],
    );
  }
  ensured = true;
}

function normalizeText(v) { return String(v ?? "").trim(); }
function normalizeToleranceAreaM2(value) {
  const n = Number(String(value ?? 0).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 10000) / 10000);
}
function normalizeDoorFormula(formula) {
  const raw = String(formula ?? "").trim();
  return raw ? normalizeDoorQuoteFormula(raw) : "precio_ipanel + precio_venta_marco";
}
function normalizeSurfaceFinalFormula(value) {
  const raw = String(value || "").trim();
  return raw || DEFAULT_SURFACE_FINAL_FORMULA;
}
function normalizeRuleOperator(value) {
  const op = String(value || "=").trim();
  return ["=", "!=", ">", ">=", "<", "<=", "contains"].includes(op) ? op : "=";
}
function normalizeRuleActionType(value) {
  const v = String(value || "set_value").trim().toLowerCase();
  return ["set_value", "clear_field", "show_field", "hide_field", "allow_options"].includes(v) ? v : "set_value";
}
function normalizeJoinMode(value) {
  return String(value || "and").trim().toLowerCase() === "or" ? "or" : "and";
}
function normalizeHelperKey(value) {
  let v = String(value || "").trim().replace(/[^A-Za-z0-9_$]+/g, "_");
  if (!v) return "";
  if (!/^[A-Za-z_$]/.test(v)) v = `helper_${v}`;
  return v;
}
function normalizeValueSourceType(value) {
  const v = String(value || "manual").trim().toLowerCase();
  return ["manual", "fixed", "budget_field", "current_user_field", "budget_section_product"].includes(v) ? v : "manual";
}
function normalizeEditableBy(value) {
  const v = String(value || "both").trim().toLowerCase();
  return ["both", "medidor", "tecnico", "none"].includes(v) ? v : "both";
}
function normalizeOdooBindingType(value) {
  const v = String(value || "none").trim().toLowerCase();
  return ["none", "repeat_budget_product", "custom_product", "selected_measurement_product"].includes(v) ? v : "none";
}
function normalizeBudgetProductValueKey(value) {
  const v = String(value || "display_name").trim();
  return ["presence_si_no", "display_name", "alias", "raw_name", "code", "product_id"].includes(v) ? v : "display_name";
}
function normalizeBudgetMultipleMode(value) {
  const v = String(value || "first").trim().toLowerCase();
  return ["first", "join"].includes(v) ? v : "first";
}
function normalizeBooleanFlag(value) { return value === true; }

function normalizeSurfaceParameterNumber(value, fallback = 0) {
  const n = Number(String(value ?? fallback).replace(",", "."));
  if (!Number.isFinite(n)) return Number(fallback || 0) || 0;
  return Math.round(n * 10000) / 10000;
}
function normalizeSurfaceParameters(raw = {}) {
  return {
    clasico_kg_m2: normalizeSurfaceParameterNumber(raw?.clasico_kg_m2, DEFAULT_SURFACE_PARAMETERS.clasico_kg_m2),
    inyectado_kg_m2: normalizeSurfaceParameterNumber(raw?.inyectado_kg_m2, DEFAULT_SURFACE_PARAMETERS.inyectado_kg_m2),
    piernas_angostas_hasta_kg: normalizeSurfaceParameterNumber(raw?.piernas_angostas_hasta_kg, DEFAULT_SURFACE_PARAMETERS.piernas_angostas_hasta_kg),
    piernas_comunes_hasta_kg: normalizeSurfaceParameterNumber(raw?.piernas_comunes_hasta_kg, DEFAULT_SURFACE_PARAMETERS.piernas_comunes_hasta_kg),
    piernas_anchas_hasta_kg: normalizeSurfaceParameterNumber(raw?.piernas_anchas_hasta_kg, DEFAULT_SURFACE_PARAMETERS.piernas_anchas_hasta_kg),
    piernas_superanchas_hasta_kg: normalizeSurfaceParameterNumber(raw?.piernas_superanchas_hasta_kg, DEFAULT_SURFACE_PARAMETERS.piernas_superanchas_hasta_kg),
    peso_descuento_alto_mm: normalizeSurfaceParameterNumber(raw?.peso_descuento_alto_mm, DEFAULT_SURFACE_PARAMETERS.peso_descuento_alto_mm),
    peso_descuento_ancho_mm: normalizeSurfaceParameterNumber(raw?.peso_descuento_ancho_mm, DEFAULT_SURFACE_PARAMETERS.peso_descuento_ancho_mm),
    detras_vano_alto_mm: normalizeSurfaceParameterNumber(raw?.detras_vano_alto_mm, DEFAULT_SURFACE_PARAMETERS.detras_vano_alto_mm),
    detras_vano_ancho_angostas_mm: normalizeSurfaceParameterNumber(raw?.detras_vano_ancho_angostas_mm, DEFAULT_SURFACE_PARAMETERS.detras_vano_ancho_angostas_mm),
    detras_vano_ancho_comunes_mm: normalizeSurfaceParameterNumber(raw?.detras_vano_ancho_comunes_mm, DEFAULT_SURFACE_PARAMETERS.detras_vano_ancho_comunes_mm),
    detras_vano_ancho_anchas_mm: normalizeSurfaceParameterNumber(raw?.detras_vano_ancho_anchas_mm, DEFAULT_SURFACE_PARAMETERS.detras_vano_ancho_anchas_mm),
    detras_vano_ancho_superanchas_mm: normalizeSurfaceParameterNumber(raw?.detras_vano_ancho_superanchas_mm, DEFAULT_SURFACE_PARAMETERS.detras_vano_ancho_superanchas_mm),
    dentro_vano_alto_mm: normalizeSurfaceParameterNumber(raw?.dentro_vano_alto_mm, DEFAULT_SURFACE_PARAMETERS.dentro_vano_alto_mm),
    dentro_vano_ancho_mm: normalizeSurfaceParameterNumber(raw?.dentro_vano_ancho_mm, DEFAULT_SURFACE_PARAMETERS.dentro_vano_ancho_mm),
  };
}

function normalizeTechnicalMeasurementRule(rule = {}, index = 0) {
  const source_key = normalizeText(rule.source_key || rule.field_key);
  if (!source_key) return null;
  const target_options = Array.isArray(rule.target_options)
    ? rule.target_options.map((x) => normalizeText(x)).filter(Boolean)
    : String(rule.target_options || "").split(",").map((x) => normalizeText(x)).filter(Boolean);
  return {
    id: normalizeText(rule.id || `rule_${index + 1}`),
    name: normalizeText(rule.name || source_key),
    active: rule?.active !== false,
    source_key,
    operator: normalizeRuleOperator(rule.operator),
    compare_value: rule?.compare_value ?? "",
    action_type: normalizeRuleActionType(rule.action_type),
    target_field: normalizeText(rule.target_field),
    target_value: rule?.target_value ?? "",
    target_options,
    apply_to_odoo: rule?.apply_to_odoo === true,
    product_id: Number(rule?.product_id || 0) || null,
    product_label: normalizeText(rule?.product_label || ""),
    sort_order: Number(rule?.sort_order || index + 1) || index + 1,
  };
}
function normalizeSurfaceHelperRule(rule = {}, index = 0) {
  const source_left = normalizeText(rule.source_left || rule.left_source || rule.source_key);
  const helper_key = normalizeHelperKey(rule.helper_key || rule.target_key);
  if (!source_left || !helper_key) return null;
  return {
    id: normalizeText(rule.id || `surface_helper_${index + 1}`),
    name: normalizeText(rule.name || helper_key),
    active: rule?.active !== false,
    source_left,
    operator_left: normalizeRuleOperator(rule.operator_left || rule.operator),
    compare_left: rule?.compare_left ?? rule?.compare_value ?? "",
    join_mode: normalizeJoinMode(rule.join_mode),
    source_right: normalizeText(rule.source_right),
    operator_right: normalizeRuleOperator(rule.operator_right || "="),
    compare_right: rule?.compare_right ?? "",
    helper_key,
    helper_value: rule?.helper_value ?? "",
    sort_order: Number(rule?.sort_order || index + 1) || index + 1,
  };
}
function normalizeTechnicalMeasurementRules(raw = {}) {
  const rules = Array.isArray(raw?.rules) ? raw.rules : [];
  const surface_helper_rules = Array.isArray(raw?.surface_helper_rules) ? raw.surface_helper_rules : [];
  return {
    rules: rules.map((r, i) => normalizeTechnicalMeasurementRule(r, i)).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order),
    surface_final_formula: normalizeSurfaceFinalFormula(raw?.surface_final_formula),
    surface_helper_rules: surface_helper_rules.map((r, i) => normalizeSurfaceHelperRule(r, i)).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order),
    surface_parameters: normalizeSurfaceParameters(raw?.surface_parameters),
  };
}
function normalizeFieldType(value) {
  const v = String(value || "text").trim().toLowerCase();
  return ["text", "number", "boolean", "enum", "odoo_product"].includes(v) ? v : "text";
}
function normalizeFieldSection(value) {
  const v = normalizeText(value).toLowerCase();
  const valid = ["datos_generales", "esquema_medidas", "revestimiento", "puerta_estructura", "rebajes_suelo", "observaciones", "otros"];
  return valid.includes(v) ? v : "otros";
}
function normalizeTechnicalMeasurementField(field = {}, index = 0) {
  const key = normalizeText(field.key || field.field_key);
  if (!key) return null;
  const options = Array.isArray(field.options)
    ? field.options.map((o) => typeof o === "object" ? { value: normalizeText(o.value), label: normalizeText(o.label || o.value) } : { value: normalizeText(o), label: normalizeText(o) }).filter((o) => o.value)
    : String(field.options || "").split(",").map((x) => normalizeText(x)).filter(Boolean).map((x) => ({ value: x, label: x }));
  const normalized = {
    key,
    label: normalizeText(field.label || key),
    type: normalizeFieldType(field.type || field.field_type),
    section: normalizeFieldSection(field.section),
    required: field?.required === true,
    active: field?.active !== false,
    options,
    sort_order: Number(field?.sort_order || index + 1) || index + 1,
    value_source_type: normalizeValueSourceType(field?.value_source_type),
    value_source_path: normalizeText(field?.value_source_path),
    fixed_value: field?.fixed_value ?? "",
    budget_section_id: Number(field?.budget_section_id || 0) || null,
    budget_section_name: normalizeText(field?.budget_section_name),
    budget_product_value_key: normalizeBudgetProductValueKey(field?.budget_product_value_key),
    budget_multiple_mode: normalizeBudgetMultipleMode(field?.budget_multiple_mode),
    editable_by: normalizeEditableBy(field?.editable_by),
    odoo_binding_type: normalizeOdooBindingType(field?.odoo_binding_type),
    odoo_product_id: Number(field?.odoo_product_id || 0) || null,
    odoo_product_label: normalizeText(field?.odoo_product_label),
    send_modification_to_commercial: normalizeBooleanFlag(field?.send_modification_to_commercial),
  };
  if (normalized.type === "odoo_product") {
    normalized.value_source_type = "budget_section_product";
    if (!normalized.budget_product_value_key || normalized.budget_product_value_key === "display_name") normalized.budget_product_value_key = "alias";
    normalized.budget_multiple_mode = "first";
    normalized.odoo_binding_type = "selected_measurement_product";
  }
  return normalized;
}
function normalizeTechnicalMeasurementFields(raw = {}) {
  const fields = Array.isArray(raw?.fields) ? raw.fields : [];
  return { fields: fields.map((f, i) => normalizeTechnicalMeasurementField(f, i)).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order) };
}

async function getSetting(key, fallback) {
  await ensureSettingsTable();
  const r = await dbQuery(`select value_json from public.presupuestador_settings where key=$1 limit 1`, [key]);
  return r.rows?.[0]?.value_json || fallback;
}
async function setSetting(key, value) {
  await ensureSettingsTable();
  await dbQuery(`insert into public.presupuestador_settings (key, value_json, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value_json=excluded.value_json, updated_at=now()`, [key, JSON.stringify(value)]);
  return value;
}

export async function getCommercialFinalQuoteSettings() {
  const raw = await getSetting(FINAL_QUOTE_SETTINGS_KEY, {});
  return { tolerance_area_m2: normalizeToleranceAreaM2(raw?.tolerance_area_m2) };
}
export async function setCommercialFinalQuoteSettings({ tolerance_area_m2 }) {
  return setSetting(FINAL_QUOTE_SETTINGS_KEY, { tolerance_area_m2: normalizeToleranceAreaM2(tolerance_area_m2) });
}
export async function getCommercialFinalToleranceAreaM2() {
  const s = await getCommercialFinalQuoteSettings();
  return s.tolerance_area_m2;
}
export async function getMeasurementProductMappings() { return { rules: [] }; }
export async function setMeasurementProductMappings(payload = {}) { return setSetting(MEASUREMENT_PRODUCT_MAPPINGS_KEY, payload); }
export async function getDoorQuoteSettings() {
  const raw = await getSetting(DOOR_QUOTE_SETTINGS_KEY, {});
  return { formula: normalizeDoorFormula(raw?.formula) };
}
export async function setDoorQuoteSettings(payload = {}) {
  return setSetting(DOOR_QUOTE_SETTINGS_KEY, { formula: normalizeDoorFormula(payload?.formula) });
}
export async function getTechnicalMeasurementRules() {
  const raw = await getSetting(TECHNICAL_MEASUREMENT_RULES_KEY, {});
  return normalizeTechnicalMeasurementRules(raw);
}
export async function setTechnicalMeasurementRules(payload = {}) {
  const current = await getTechnicalMeasurementRules();
  const merged = {
    ...(current || {}),
    ...(payload && typeof payload === "object" ? payload : {}),
    surface_final_formula: payload?.surface_final_formula !== undefined
      ? payload.surface_final_formula
      : current?.surface_final_formula,
    surface_helper_rules: payload?.surface_helper_rules !== undefined
      ? payload.surface_helper_rules
      : current?.surface_helper_rules,
    surface_parameters: payload?.surface_parameters !== undefined
      ? payload.surface_parameters
      : current?.surface_parameters,
  };
  return setSetting(TECHNICAL_MEASUREMENT_RULES_KEY, normalizeTechnicalMeasurementRules(merged));
}
export async function getMeasurementSurfaceFinalFormula() {
  const settings = await getTechnicalMeasurementRules();
  return normalizeSurfaceFinalFormula(settings?.surface_final_formula);
}
export async function getTechnicalMeasurementFieldDefinitions() {
  const raw = await getSetting(TECHNICAL_MEASUREMENT_FIELDS_KEY, {});
  return normalizeTechnicalMeasurementFields(raw);
}
export async function setTechnicalMeasurementFieldDefinitions(payload = {}) {
  return setSetting(TECHNICAL_MEASUREMENT_FIELDS_KEY, normalizeTechnicalMeasurementFields(payload));
}

export async function getCommercialFinalTolerancePercent() {
  return 0;
}

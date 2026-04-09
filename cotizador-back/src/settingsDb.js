import { dbQuery } from "./db.js";
import { normalizeDoorQuoteFormula } from "./doorQuoteFormula.js";
import { getPlanningYear, normalizePlanningWeeks, normalizeProductionPlanningSettings } from "./productionPlanningUtils.js";

const FINAL_QUOTE_SETTINGS_KEY = "commercial_final_quote";
const MEASUREMENT_PRODUCT_MAPPINGS_KEY = "measurement_product_mappings";
const DOOR_QUOTE_SETTINGS_KEY = "door_quote_settings";
const TECHNICAL_MEASUREMENT_RULES_KEY = "technical_measurement_rules";
const TECHNICAL_MEASUREMENT_FIELDS_KEY = "technical_measurement_fields";
const PRODUCTION_PLANNING_SETTINGS_KEY = "production_planning";
const DEFAULT_SURFACE_FINAL_FORMULA = "surface_automatica_m2";

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
    [TECHNICAL_MEASUREMENT_RULES_KEY, {
      rules: [],
      surface_final_formula: DEFAULT_SURFACE_FINAL_FORMULA,
      surface_helper_rules: [],
      surface_calc_params: {},
      section_dependency_rules: [],
      system_derivation_rules: [],
    }],
    [TECHNICAL_MEASUREMENT_FIELDS_KEY, { fields: [] }],
    [PRODUCTION_PLANNING_SETTINGS_KEY, { years: {} }],
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
function normalizeIdList(value) {
  if (Array.isArray(value)) return value.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
  return String(value || "").split(/[;,\s]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
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
  return {
    id: normalizeText(rule.id || `helper_${index + 1}`),
    name: normalizeText(rule.name || `Auxiliar ${index + 1}`),
    active: rule?.active !== false,
    source_left: normalizeText(rule.source_left),
    operator_left: normalizeRuleOperator(rule.operator_left),
    compare_left: rule?.compare_left ?? "",
    join_mode: ["and", "or"].includes(String(rule?.join_mode || "and").toLowerCase()) ? String(rule.join_mode).toLowerCase() : "and",
    source_right: normalizeText(rule.source_right),
    operator_right: normalizeRuleOperator(rule.operator_right),
    compare_right: rule?.compare_right ?? "",
    helper_key: normalizeText(rule.helper_key),
    helper_value: rule?.helper_value ?? "",
    sort_order: Number(rule?.sort_order || index + 1) || index + 1,
  };
}
function normalizeSectionDependencyRule(rule = {}, index = 0) {
  return {
    id: normalizeText(rule.id || `section_dep_${index + 1}`),
    name: normalizeText(rule.name || `Dependencia ${index + 1}`),
    active: rule?.active !== false,
    parent_section_id: Number(rule?.parent_section_id || 0) || null,
    required_product_ids: normalizeIdList(rule?.required_product_ids),
    match_mode: ["all", "any"].includes(String(rule?.match_mode || "any").toLowerCase()) ? String(rule.match_mode).toLowerCase() : "any",
    child_section_ids: normalizeIdList(rule?.child_section_ids),
    sort_order: Number(rule?.sort_order || index + 1) || index + 1,
  };
}
function normalizeSystemDerivationRule(rule = {}, index = 0) {
  return {
    id: normalizeText(rule.id || `system_der_${index + 1}`),
    name: normalizeText(rule.name || `Sistema derivado ${index + 1}`),
    active: rule?.active !== false,
    required_product_ids: normalizeIdList(rule?.required_product_ids),
    match_mode: ["all", "any"].includes(String(rule?.match_mode || "all").toLowerCase()) ? String(rule.match_mode).toLowerCase() : "all",
    derived_porton_type: normalizeText(rule?.derived_porton_type),
    sort_order: Number(rule?.sort_order || index + 1) || index + 1,
  };
}
function normalizeSurfaceCalcParams(raw = {}) {
  const out = {};
  for (const [key, value] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    if (["inside_vano_product_ids", "behind_vano_product_ids", "apto_para_revestir_product_ids", "sin_revestimiento_product_ids"].includes(key)) {
      out[key] = normalizeIdList(value);
      continue;
    }
    const text = String(value ?? "").trim();
    const num = Number(text.replace(",", "."));
    out[key] = Number.isFinite(num) ? num : text;
  }
  return out;
}
function normalizeTechnicalMeasurementRules(raw = {}) {
  const rules = Array.isArray(raw?.rules) ? raw.rules : [];
  const surface_helper_rules = Array.isArray(raw?.surface_helper_rules) ? raw.surface_helper_rules : [];
  const section_dependency_rules = Array.isArray(raw?.section_dependency_rules) ? raw.section_dependency_rules : [];
  const system_derivation_rules = Array.isArray(raw?.system_derivation_rules) ? raw.system_derivation_rules : [];
  return {
    rules: rules.map((r, i) => normalizeTechnicalMeasurementRule(r, i)).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order),
    surface_final_formula: normalizeSurfaceFinalFormula(raw?.surface_final_formula),
    surface_helper_rules: surface_helper_rules.map((r, i) => normalizeSurfaceHelperRule(r, i)).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order),
    surface_calc_params: normalizeSurfaceCalcParams(raw?.surface_calc_params || raw?.surface_params || raw?.measurement_surface_params || {}),
    section_dependency_rules: section_dependency_rules.map((r, i) => normalizeSectionDependencyRule(r, i)).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order),
    system_derivation_rules: system_derivation_rules.map((r, i) => normalizeSystemDerivationRule(r, i)).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order),
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
    surface_final_formula: payload?.surface_final_formula !== undefined ? payload.surface_final_formula : current?.surface_final_formula,
    surface_helper_rules: payload?.surface_helper_rules !== undefined ? payload.surface_helper_rules : current?.surface_helper_rules,
    surface_calc_params: payload?.surface_calc_params !== undefined ? payload.surface_calc_params : current?.surface_calc_params,
    section_dependency_rules: payload?.section_dependency_rules !== undefined ? payload.section_dependency_rules : current?.section_dependency_rules,
    system_derivation_rules: payload?.system_derivation_rules !== undefined ? payload.system_derivation_rules : current?.system_derivation_rules,
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

export async function getProductionPlanningSettings() {
  const raw = await getSetting(PRODUCTION_PLANNING_SETTINGS_KEY, { years: {} });
  return normalizeProductionPlanningSettings(raw);
}
export async function getProductionPlanningYear(year) {
  const settings = await getProductionPlanningSettings();
  return getPlanningYear(settings, year);
}
export async function setProductionPlanningYear({ year, weeks = [] } = {}) {
  const numericYear = Number(year || 0);
  if (!Number.isFinite(numericYear) || numericYear < 2000 || numericYear > 2100) throw new Error("Año inválido para planificación.");
  const current = await getProductionPlanningSettings();
  const next = {
    ...(current || {}),
    years: {
      ...(current?.years || {}),
      [String(numericYear)]: {
        year: numericYear,
        weeks: normalizePlanningWeeks(numericYear, weeks),
        updated_at: new Date().toISOString(),
      },
    },
  };
  const saved = await setSetting(PRODUCTION_PLANNING_SETTINGS_KEY, normalizeProductionPlanningSettings(next));
  return getPlanningYear(saved, numericYear);
}

export async function getCommercialFinalTolerancePercent() {
  return 0;
}

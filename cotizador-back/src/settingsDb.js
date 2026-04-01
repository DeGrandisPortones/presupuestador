import { dbQuery } from "./db.js";
import { normalizeDoorQuoteFormula } from "./doorQuoteFormula.js";

const FINAL_QUOTE_SETTINGS_KEY = "commercial_final_quote";
const MEASUREMENT_PRODUCT_MAPPINGS_KEY = "measurement_product_mappings";
const DOOR_QUOTE_SETTINGS_KEY = "door_quote_settings";
const TECHNICAL_MEASUREMENT_RULES_KEY = "technical_measurement_rules";
const TECHNICAL_MEASUREMENT_FIELDS_KEY = "technical_measurement_fields";
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
    [FINAL_QUOTE_SETTINGS_KEY, { tolerance_percent: 0 }],
    [MEASUREMENT_PRODUCT_MAPPINGS_KEY, { rules: [] }],
    [
      DOOR_QUOTE_SETTINGS_KEY,
      { formula: "precio_ipanel + precio_venta_marco" },
    ],
    [TECHNICAL_MEASUREMENT_RULES_KEY, { rules: [] }],
    [TECHNICAL_MEASUREMENT_FIELDS_KEY, { fields: [] }],
  ]) {
    await dbQuery(
      `insert into public.presupuestador_settings (key, value_json) values ($1, $2::jsonb) on conflict (key) do nothing`,
      [key, JSON.stringify(value)],
    );
  }
  ensured = true;
}

function normalizeText(v) {
  return String(v ?? "").trim();
}
function normalizeTolerancePercent(value) {
  const n = Number(String(value ?? 0).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}
function normalizeDoorFormula(formula) {
  const raw = String(formula ?? "").trim();
  return raw
    ? normalizeDoorQuoteFormula(raw)
    : "precio_ipanel + precio_venta_marco";
}
function normalizeRuleOperator(value) {
  const op = String(value || "=").trim();
  return ["=", "!=", ">", ">=", "<", "<=", "contains"].includes(op) ? op : "=";
}
function normalizeRuleActionType(value) {
  const v = String(value || "set_value")
    .trim()
    .toLowerCase();
  return ["set_value", "show_field", "hide_field", "allow_options"].includes(v)
    ? v
    : "set_value";
}
function normalizeValueSourceType(value) {
  const v = String(value || "manual")
    .trim()
    .toLowerCase();
  return ["manual", "fixed", "budget_field", "budget_section_product"].includes(
    v,
  )
    ? v
    : "manual";
}
function normalizeEditableBy(value) {
  const v = String(value || "both")
    .trim()
    .toLowerCase();
  return ["both", "medidor", "tecnico", "none"].includes(v) ? v : "both";
}
function normalizeOdooBindingType(value) {
  const v = String(value || "none")
    .trim()
    .toLowerCase();
  return ["none", "repeat_budget_product", "custom_product"].includes(v)
    ? v
    : "none";
}
function normalizeBudgetProductValueKey(value) {
  const v = String(value || "display_name").trim();
  return ["display_name", "alias", "raw_name", "code", "product_id"].includes(v)
    ? v
    : "display_name";
}
function normalizeBudgetMultipleMode(value) {
  const v = String(value || "first")
    .trim()
    .toLowerCase();
  return ["first", "join"].includes(v) ? v : "first";
}

function normalizeTechnicalMeasurementRule(rule = {}, index = 0) {
  const source_key = normalizeText(rule.source_key || rule.field_key);
  if (!source_key) return null;
  const target_options = Array.isArray(rule.target_options)
    ? rule.target_options.map((x) => normalizeText(x)).filter(Boolean)
    : String(rule.target_options || "")
        .split(",")
        .map((x) => normalizeText(x))
        .filter(Boolean);
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
function normalizeTechnicalMeasurementRules(raw = {}) {
  const rules = Array.isArray(raw?.rules) ? raw.rules : [];
  return {
    rules: rules
      .map((r, i) => normalizeTechnicalMeasurementRule(r, i))
      .filter(Boolean)
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}
function normalizeFieldType(value) {
  const v = String(value || "text")
    .trim()
    .toLowerCase();
  return ["text", "number", "boolean", "enum"].includes(v) ? v : "text";
}
function normalizeFieldSection(value) {
  const v = normalizeText(value).toLowerCase();
  const valid = [
    "datos_generales",
    "esquema_medidas",
    "revestimiento",
    "puerta_estructura",
    "rebajes_suelo",
    "observaciones",
    "otros",
  ];
  return valid.includes(v) ? v : "otros";
}
function normalizeTechnicalMeasurementField(field = {}, index = 0) {
  const key = normalizeText(field.key || field.field_key);
  if (!key) return null;
  const options = Array.isArray(field.options)
    ? field.options
        .map((o) =>
          typeof o === "object"
            ? {
                value: normalizeText(o.value),
                label: normalizeText(o.label || o.value),
              }
            : { value: normalizeText(o), label: normalizeText(o) },
        )
        .filter((o) => o.value)
    : String(field.options || "")
        .split(",")
        .map((x) => normalizeText(x))
        .filter(Boolean)
        .map((x) => ({ value: x, label: x }));
  return {
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
    budget_product_value_key: normalizeBudgetProductValueKey(
      field?.budget_product_value_key,
    ),
    budget_multiple_mode: normalizeBudgetMultipleMode(
      field?.budget_multiple_mode,
    ),
    editable_by: normalizeEditableBy(field?.editable_by),
    odoo_binding_type: normalizeOdooBindingType(field?.odoo_binding_type),
    odoo_product_id: Number(field?.odoo_product_id || 0) || null,
    odoo_product_label: normalizeText(field?.odoo_product_label),
  };
}
function normalizeTechnicalMeasurementFields(raw = {}) {
  const fields = Array.isArray(raw?.fields) ? raw.fields : [];
  return {
    fields: fields
      .map((f, i) => normalizeTechnicalMeasurementField(f, i))
      .filter(Boolean)
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

async function getSetting(key, fallback) {
  await ensureSettingsTable();
  const r = await dbQuery(
    `select value_json from public.presupuestador_settings where key=$1 limit 1`,
    [key],
  );
  return r.rows?.[0]?.value_json || fallback;
}
async function setSetting(key, value) {
  await ensureSettingsTable();
  await dbQuery(
    `insert into public.presupuestador_settings (key, value_json, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value_json=excluded.value_json, updated_at=now()`,
    [key, JSON.stringify(value)],
  );
  return value;
}

export async function getCommercialFinalQuoteSettings() {
  const raw = await getSetting(FINAL_QUOTE_SETTINGS_KEY, {});
  return {
    tolerance_percent: normalizeTolerancePercent(raw?.tolerance_percent),
  };
}
export async function setCommercialFinalQuoteSettings({ tolerance_percent }) {
  return setSetting(FINAL_QUOTE_SETTINGS_KEY, {
    tolerance_percent: normalizeTolerancePercent(tolerance_percent),
  });
}
export async function getCommercialFinalTolerancePercent() {
  const s = await getCommercialFinalQuoteSettings();
  return s.tolerance_percent;
}
export async function getMeasurementProductMappings() {
  return { rules: [] };
}
export async function setMeasurementProductMappings(payload = {}) {
  return setSetting(MEASUREMENT_PRODUCT_MAPPINGS_KEY, payload);
}
export async function getDoorQuoteSettings() {
  const raw = await getSetting(DOOR_QUOTE_SETTINGS_KEY, {});
  return { formula: normalizeDoorFormula(raw?.formula) };
}
export async function setDoorQuoteSettings(payload = {}) {
  return setSetting(DOOR_QUOTE_SETTINGS_KEY, {
    formula: normalizeDoorFormula(payload?.formula),
  });
}
export async function getTechnicalMeasurementRules() {
  const raw = await getSetting(TECHNICAL_MEASUREMENT_RULES_KEY, {});
  return normalizeTechnicalMeasurementRules(raw);
}
export async function setTechnicalMeasurementRules(payload = {}) {
  return setSetting(
    TECHNICAL_MEASUREMENT_RULES_KEY,
    normalizeTechnicalMeasurementRules(payload),
  );
}
export async function getTechnicalMeasurementFieldDefinitions() {
  const raw = await getSetting(TECHNICAL_MEASUREMENT_FIELDS_KEY, {});
  return normalizeTechnicalMeasurementFields(raw);
}
export async function setTechnicalMeasurementFieldDefinitions(payload = {}) {
  return setSetting(
    TECHNICAL_MEASUREMENT_FIELDS_KEY,
    normalizeTechnicalMeasurementFields(payload),
  );
}

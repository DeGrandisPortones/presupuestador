import { dbQuery } from "./db.js";
import { normalizeDoorQuoteFormula } from "./doorQuoteFormula.js";

const FINAL_QUOTE_SETTINGS_KEY = "commercial_final_quote";
const MEASUREMENT_PRODUCT_MAPPINGS_KEY = "measurement_product_mappings";
const DOOR_QUOTE_SETTINGS_KEY = "door_quote_settings";
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

  await dbQuery(
    `insert into public.presupuestador_settings (key, value_json) values ($1, $2::jsonb) on conflict (key) do nothing`,
    [FINAL_QUOTE_SETTINGS_KEY, JSON.stringify({ tolerance_percent: 0 })]
  );
  await dbQuery(
    `insert into public.presupuestador_settings (key, value_json) values ($1, $2::jsonb) on conflict (key) do nothing`,
    [MEASUREMENT_PRODUCT_MAPPINGS_KEY, JSON.stringify({ rules: [] })]
  );
  await dbQuery(
    `insert into public.presupuestador_settings (key, value_json) values ($1, $2::jsonb) on conflict (key) do nothing`,
    [DOOR_QUOTE_SETTINGS_KEY, JSON.stringify({ formula: "precio_ipanel + precio_venta_marco" })]
  );

  ensured = true;
}

function normalizeTolerancePercent(value) {
  const n = Number(String(value ?? 0).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 100) / 100;
}
function normalizeText(value) { return String(value ?? "").trim(); }
function normalizeFieldMode(value) {
  const v = String(value || "enum").trim().toLowerCase();
  if (["enum", "integer", "boolean", "text"].includes(v)) return v;
  return "enum";
}
function normalizeGroupedRule(rule = {}) {
  const fieldKey = normalizeText(rule.field_key);
  const fieldLabel = normalizeText(rule.field_label || fieldKey);
  const fieldMode = normalizeFieldMode(rule.field_mode || rule.mode);
  const rawValues = Array.isArray(rule.values) ? rule.values : Array.isArray(rule.mappings) ? rule.mappings : [];
  const values = rawValues
    .map((entry) => ({
      expected_value: normalizeText(entry?.expected_value ?? entry?.value),
      product_id: Number(entry?.product_id || 0) || null,
      product_label: normalizeText(entry?.product_label || entry?.label || ""),
      active: entry?.active !== false,
      position: Number(entry?.position || 0) || 0,
    }))
    .filter((entry) => entry.expected_value && entry.product_id)
    .sort((a, b) => (a.position - b.position) || a.expected_value.localeCompare(b.expected_value, "es"));
  if (!fieldKey) return null;
  return { field_key: fieldKey, field_label: fieldLabel || fieldKey, field_mode: fieldMode, active: rule?.active !== false, values };
}
function groupFlatRules(flatRules = []) {
  const byField = new Map();
  for (const raw of flatRules) {
    const fieldKey = normalizeText(raw?.field_key);
    if (!fieldKey) continue;
    if (!byField.has(fieldKey)) {
      byField.set(fieldKey, { field_key: fieldKey, field_label: normalizeText(raw?.field_label || fieldKey), field_mode: normalizeFieldMode(raw?.field_mode || raw?.mode), active: raw?.active !== false, values: [] });
    }
    const grouped = byField.get(fieldKey);
    grouped.values.push({ expected_value: normalizeText(raw?.expected_value ?? raw?.value), product_id: Number(raw?.product_id || 0) || null, product_label: normalizeText(raw?.product_label || raw?.label || ""), active: raw?.active !== false, position: Number(raw?.position || 0) || 0 });
  }
  return [...byField.values()].map((rule) => normalizeGroupedRule(rule)).filter(Boolean);
}
function normalizeMeasurementProductMappings(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rules = Array.isArray(source.rules) ? source.rules : Array.isArray(source.mappings) ? source.mappings : [];
  const groupedRules = rules.some((rule) => Array.isArray(rule?.values) || Array.isArray(rule?.mappings)) ? rules.map((rule) => normalizeGroupedRule(rule)).filter(Boolean) : groupFlatRules(rules);
  return { rules: groupedRules };
}
function normalizeDoorFormula(formula) {
  const raw = String(formula ?? "").trim();
  if (!raw) return "precio_ipanel + precio_venta_marco";
  return normalizeDoorQuoteFormula(raw);
}

export async function getCommercialFinalQuoteSettings() {
  await ensureSettingsTable();
  const r = await dbQuery(`select value_json from public.presupuestador_settings where key=$1 limit 1`, [FINAL_QUOTE_SETTINGS_KEY]);
  const raw = r.rows?.[0]?.value_json || {};
  return { tolerance_percent: normalizeTolerancePercent(raw?.tolerance_percent) };
}
export async function setCommercialFinalQuoteSettings({ tolerance_percent }) {
  await ensureSettingsTable();
  const normalized = { tolerance_percent: normalizeTolerancePercent(tolerance_percent) };
  await dbQuery(`insert into public.presupuestador_settings (key, value_json, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value_json=excluded.value_json, updated_at=now()`, [FINAL_QUOTE_SETTINGS_KEY, JSON.stringify(normalized)]);
  return normalized;
}
export async function getCommercialFinalTolerancePercent() {
  const s = await getCommercialFinalQuoteSettings();
  return normalizeTolerancePercent(s.tolerance_percent);
}
export async function getMeasurementProductMappings() {
  await ensureSettingsTable();
  const r = await dbQuery(`select value_json from public.presupuestador_settings where key=$1 limit 1`, [MEASUREMENT_PRODUCT_MAPPINGS_KEY]);
  return normalizeMeasurementProductMappings(r.rows?.[0]?.value_json || {});
}
export async function setMeasurementProductMappings(payload = {}) {
  await ensureSettingsTable();
  const normalized = normalizeMeasurementProductMappings(payload);
  await dbQuery(`insert into public.presupuestador_settings (key, value_json, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value_json=excluded.value_json, updated_at=now()`, [MEASUREMENT_PRODUCT_MAPPINGS_KEY, JSON.stringify(normalized)]);
  return normalized;
}
export async function getDoorQuoteSettings() {
  await ensureSettingsTable();
  const r = await dbQuery(`select value_json from public.presupuestador_settings where key=$1 limit 1`, [DOOR_QUOTE_SETTINGS_KEY]);
  const raw = r.rows?.[0]?.value_json || {};
  return { formula: normalizeDoorFormula(raw?.formula) };
}
export async function setDoorQuoteSettings(payload = {}) {
  await ensureSettingsTable();
  const normalized = { formula: normalizeDoorFormula(payload?.formula) };
  await dbQuery(`insert into public.presupuestador_settings (key, value_json, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value_json=excluded.value_json, updated_at=now()`, [DOOR_QUOTE_SETTINGS_KEY, JSON.stringify(normalized)]);
  return normalized;
}

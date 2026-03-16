import { dbQuery } from "./db.js";

const FINAL_QUOTE_SETTINGS_KEY = "commercial_final_quote";
const MEASUREMENT_PRODUCT_MAPPINGS_KEY = "measurement_product_mappings";
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
    `
    insert into public.presupuestador_settings (key, value_json)
    values ($1, $2::jsonb)
    on conflict (key) do nothing
    `,
    [FINAL_QUOTE_SETTINGS_KEY, JSON.stringify({ tolerance_percent: 0 })]
  );

  await dbQuery(
    `
    insert into public.presupuestador_settings (key, value_json)
    values ($1, $2::jsonb)
    on conflict (key) do nothing
    `,
    [MEASUREMENT_PRODUCT_MAPPINGS_KEY, JSON.stringify({ rules: [] })]
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

function normalizeMeasurementRule(raw, index = 0) {
  const productId = Number(raw?.product_id || 0);
  const qtyMode = String(raw?.qty_mode || "fixed").toLowerCase().trim() === "field" ? "field" : "fixed";
  const fixedQty = Number(String(raw?.qty_value ?? 1).replace(",", "."));
  return {
    id: String(raw?.id || `rule_${index + 1}`),
    label: String(raw?.label || raw?.field_key || `Regla ${index + 1}`).trim(),
    field_key: String(raw?.field_key || "").trim(),
    expected_value: String(raw?.expected_value ?? "").trim(),
    product_id: Number.isFinite(productId) ? productId : 0,
    qty_mode: qtyMode,
    qty_value: Number.isFinite(fixedQty) && fixedQty > 0 ? Math.round(fixedQty * 1000) / 1000 : 1,
    qty_field_key: String(raw?.qty_field_key || "").trim(),
    active: raw?.active !== false,
  };
}

export async function getCommercialFinalQuoteSettings() {
  await ensureSettingsTable();

  const r = await dbQuery(
    `select value_json from public.presupuestador_settings where key=$1 limit 1`,
    [FINAL_QUOTE_SETTINGS_KEY]
  );

  const raw = r.rows?.[0]?.value_json || {};
  return {
    tolerance_percent: normalizeTolerancePercent(raw?.tolerance_percent),
  };
}

export async function setCommercialFinalQuoteSettings({ tolerance_percent }) {
  await ensureSettingsTable();

  const normalized = {
    tolerance_percent: normalizeTolerancePercent(tolerance_percent),
  };

  await dbQuery(
    `
    insert into public.presupuestador_settings (key, value_json, updated_at)
    values ($1, $2::jsonb, now())
    on conflict (key)
    do update set value_json=excluded.value_json, updated_at=now()
    `,
    [FINAL_QUOTE_SETTINGS_KEY, JSON.stringify(normalized)]
  );

  return normalized;
}

export async function getCommercialFinalTolerancePercent() {
  const s = await getCommercialFinalQuoteSettings();
  return normalizeTolerancePercent(s.tolerance_percent);
}

export async function getMeasurementProductMappings() {
  await ensureSettingsTable();

  const r = await dbQuery(
    `select value_json from public.presupuestador_settings where key=$1 limit 1`,
    [MEASUREMENT_PRODUCT_MAPPINGS_KEY]
  );

  const raw = r.rows?.[0]?.value_json || {};
  const rules = Array.isArray(raw?.rules) ? raw.rules.map((x, i) => normalizeMeasurementRule(x, i)) : [];
  return { rules };
}

export async function setMeasurementProductMappings({ rules }) {
  await ensureSettingsTable();
  const normalized = {
    rules: Array.isArray(rules) ? rules.map((x, i) => normalizeMeasurementRule(x, i)).filter((x) => x.field_key && x.product_id) : [],
  };

  await dbQuery(
    `
    insert into public.presupuestador_settings (key, value_json, updated_at)
    values ($1, $2::jsonb, now())
    on conflict (key)
    do update set value_json=excluded.value_json, updated_at=now()
    `,
    [MEASUREMENT_PRODUCT_MAPPINGS_KEY, JSON.stringify(normalized)]
  );

  return normalized;
}

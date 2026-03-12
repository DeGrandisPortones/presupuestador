import { dbQuery } from "./db.js";

const FINAL_QUOTE_SETTINGS_KEY = "commercial_final_quote";
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

  ensured = true;
}

function normalizeTolerancePercent(value) {
  const n = Number(String(value ?? 0).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 100) / 100;
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

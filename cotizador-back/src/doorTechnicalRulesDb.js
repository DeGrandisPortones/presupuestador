import { dbQuery } from "./db.js";

const DOOR_TECHNICAL_RULES_KEY = "door_technical_rules";

const DEFAULT_DOOR_TECHNICAL_RULES = Object.freeze({
  ipanel_width_subtract_mm: 0,
  ipanel_height_subtract_mm: 0,
  structure_width_extra_mm: 0,
  structure_height_extra_mm: 0,
  auto_update_ipanel_dimensions: true,
  ipanel_fulfillment_mode: "acopio",
  structure_fulfillment_mode: "acopio",
});

let ensured = false;

function toNumber(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}
function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
function normalizeMode(value, fallback = "acopio") {
  const v = String(value || fallback).trim().toLowerCase();
  return ["acopio", "produccion"].includes(v) ? v : fallback;
}
function normalizeRules(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    ipanel_width_subtract_mm: Math.max(0, toNumber(source.ipanel_width_subtract_mm, DEFAULT_DOOR_TECHNICAL_RULES.ipanel_width_subtract_mm)),
    ipanel_height_subtract_mm: Math.max(0, toNumber(source.ipanel_height_subtract_mm, DEFAULT_DOOR_TECHNICAL_RULES.ipanel_height_subtract_mm)),
    structure_width_extra_mm: toNumber(source.structure_width_extra_mm, DEFAULT_DOOR_TECHNICAL_RULES.structure_width_extra_mm),
    structure_height_extra_mm: toNumber(source.structure_height_extra_mm, DEFAULT_DOOR_TECHNICAL_RULES.structure_height_extra_mm),
    auto_update_ipanel_dimensions: source.auto_update_ipanel_dimensions !== false,
    ipanel_fulfillment_mode: normalizeMode(source.ipanel_fulfillment_mode, DEFAULT_DOOR_TECHNICAL_RULES.ipanel_fulfillment_mode),
    structure_fulfillment_mode: normalizeMode(source.structure_fulfillment_mode, DEFAULT_DOOR_TECHNICAL_RULES.structure_fulfillment_mode),
  };
}

async function ensureDoorTechnicalRulesSetting() {
  if (ensured) return;
  await dbQuery(`
    create table if not exists public.presupuestador_settings (
      key text primary key,
      value_json jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);
  await dbQuery(
    `insert into public.presupuestador_settings (key, value_json)
     values ($1, $2::jsonb)
     on conflict (key) do nothing`,
    [DOOR_TECHNICAL_RULES_KEY, JSON.stringify(DEFAULT_DOOR_TECHNICAL_RULES)],
  );
  ensured = true;
}

export async function getDoorTechnicalRules() {
  await ensureDoorTechnicalRulesSetting();
  const r = await dbQuery(`select value_json from public.presupuestador_settings where key=$1 limit 1`, [DOOR_TECHNICAL_RULES_KEY]);
  return normalizeRules(r.rows?.[0]?.value_json || DEFAULT_DOOR_TECHNICAL_RULES);
}

export async function setDoorTechnicalRules(payload = {}) {
  await ensureDoorTechnicalRulesSetting();
  const rules = normalizeRules(payload);
  await dbQuery(
    `insert into public.presupuestador_settings (key, value_json, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (key) do update set value_json=excluded.value_json, updated_at=now()`,
    [DOOR_TECHNICAL_RULES_KEY, JSON.stringify(rules)],
  );
  return rules;
}

export function getDoorDimensionMm(record = {}, keys = []) {
  for (const key of keys) {
    const n = toNumber(record?.[key], 0);
    if (n > 0) return n;
  }
  return 0;
}

export function calcDoorTechnicalDimensions(record = {}, rules = DEFAULT_DOOR_TECHNICAL_RULES) {
  const normalizedRules = normalizeRules(rules);
  const doorWidthMm = getDoorDimensionMm(record, ["ancho_puerta_mm", "ancho_estructura_mm", "ancho_marco_mm", "width_mm"]);
  const doorHeightMm = getDoorDimensionMm(record, ["alto_puerta_mm", "alto_estructura_mm", "alto_marco_mm", "height_mm"]);

  const ipanelWidthMm = doorWidthMm > 0 ? Math.max(0, doorWidthMm - normalizedRules.ipanel_width_subtract_mm) : 0;
  const ipanelHeightMm = doorHeightMm > 0 ? Math.max(0, doorHeightMm - normalizedRules.ipanel_height_subtract_mm) : 0;
  const structureWidthMm = doorWidthMm > 0 ? Math.max(0, doorWidthMm + normalizedRules.structure_width_extra_mm) : 0;
  const structureHeightMm = doorHeightMm > 0 ? Math.max(0, doorHeightMm + normalizedRules.structure_height_extra_mm) : 0;

  return {
    door_width_mm: doorWidthMm,
    door_height_mm: doorHeightMm,
    ipanel_width_mm: ipanelWidthMm,
    ipanel_height_mm: ipanelHeightMm,
    structure_width_mm: structureWidthMm,
    structure_height_mm: structureHeightMm,
    ipanel_width_m: ipanelWidthMm > 0 ? round3(ipanelWidthMm / 1000) : 0,
    ipanel_height_m: ipanelHeightMm > 0 ? round3(ipanelHeightMm / 1000) : 0,
    structure_width_m: structureWidthMm > 0 ? round3(structureWidthMm / 1000) : 0,
    structure_height_m: structureHeightMm > 0 ? round3(structureHeightMm / 1000) : 0,
  };
}

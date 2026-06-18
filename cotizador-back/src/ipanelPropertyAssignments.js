import { dbQuery } from "./db.js";

const TABLE = "public.presupuestador_ipanel_property_assignments";
let ensured = false;

async function ensureTable() {
  if (ensured) return;
  await dbQuery(`
    create table if not exists ${TABLE} (
      source_key text primary key,
      target_property text null,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  ensured = true;
}

export async function getIpanelPropertyAssignmentsMap() {
  await ensureTable();
  const q = await dbQuery(`
    select source_key, target_property
    from ${TABLE}
    where is_active = true and coalesce(target_property, '') <> ''
    order by source_key asc
  `);
  const out = new Map();
  for (const row of q.rows || []) {
    const k = String(row.source_key || "").trim();
    const t = String(row.target_property || "").trim();
    if (k && t) out.set(k, t);
  }
  return out;
}

export function applyIpanelPropertyAssignments(payload, assignmentsMap) {
  const out = {};
  const map = assignmentsMap instanceof Map ? assignmentsMap : new Map();
  for (const [sourceKey, targetProp] of map.entries()) {
    if (!targetProp) continue;
    const value = payload?.[sourceKey];
    out[targetProp] = value !== undefined && value !== null && value !== "" ? value : null;
  }
  return out;
}

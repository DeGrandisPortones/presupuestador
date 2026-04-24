import { dbQuery } from "./db.js";

const DEFAULT_TARGET_PROPERTIES = [
  "Sistema",
  "Descripcion",
  "Observaciones",
  "lado_mas_alto",
  "calc_espada",
];

const BASE_SOURCE_PROPERTIES = [
  { source_key: "nv", label: "NV", group: "Referencias", description: "Número de nota de venta final." },
  { source_key: "referencia_nv", label: "Referencia NV", group: "Referencias", description: "Texto completo de la NV (ej: NV5056)." },
  { source_key: "referencia_np", label: "Referencia NP", group: "Referencias", description: "Texto completo de la NP origen, si existe." },
  { source_key: "quote_number", label: "Número interno presupuesto", group: "Referencias", description: "Número interno del presupuestador." },
  { source_key: "fecha_presupuesto", label: "Fecha presupuesto", group: "Fechas", description: "Fecha de creación del presupuesto original." },
  { source_key: "fecha_confirmacion", label: "Fecha confirmación", group: "Fechas", description: "Fecha en la que se confirmó el presupuesto." },
  { source_key: "fecha_aprobacion_comercial", label: "Fecha aprobación comercial", group: "Fechas", description: "Fecha de aprobación comercial." },
  { source_key: "fecha_aprobacion_tecnica", label: "Fecha aprobación técnica", group: "Fechas", description: "Fecha de aprobación técnica inicial." },
  { source_key: "fecha_np", label: "Fecha NP", group: "Fechas", description: "Fecha de generación/sync de la NP en Odoo, si existe." },
  { source_key: "fecha_medicion", label: "Fecha medición", group: "Fechas", description: "Fecha de medición del portón, si existe." },
  { source_key: "fecha_revision_tecnica_final", label: "Fecha revisión técnica final", group: "Fechas", description: "Fecha de revisión técnica final de la medición." },
  { source_key: "fecha_solicitud_salida_acopio", label: "Fecha solicitud salida de acopio", group: "Fechas", description: "Fecha en la que se pidió pasar un portón de acopio a producción." },
  { source_key: "fecha_nv", label: "Fecha NV", group: "Fechas", description: "Fecha de generación/sync de la NV final en Odoo." },

  { source_key: "catalog_kind", label: "Tipo de catálogo", group: "General", description: "porton / ipanel / otros." },
  { source_key: "fulfillment_mode", label: "Modo", group: "General", description: "acopio / produccion." },
  { source_key: "payment_method", label: "Forma de pago", group: "General", description: "Forma de pago del presupuesto." },

  { source_key: "cliente_nombre", label: "Cliente nombre", group: "Cliente", description: "Nombre del cliente final." },
  { source_key: "cliente_apellido", label: "Cliente apellido", group: "Cliente", description: "Apellido del cliente final." },
  { source_key: "cliente_nombre_completo", label: "Cliente nombre completo", group: "Cliente", description: "Nombre y apellido del cliente final." },
  { source_key: "cliente_telefono", label: "Cliente teléfono", group: "Cliente", description: "Teléfono del cliente final." },
  { source_key: "cliente_email", label: "Cliente email", group: "Cliente", description: "Email del cliente final." },
  { source_key: "cliente_direccion", label: "Cliente dirección", group: "Cliente", description: "Dirección del cliente final." },
  { source_key: "cliente_localidad", label: "Cliente localidad", group: "Cliente", description: "Ciudad / localidad del cliente final." },
  { source_key: "cliente_maps_url", label: "Cliente Maps", group: "Cliente", description: "URL de Google Maps del cliente." },

  { source_key: "vendido_por_rol", label: "Vendido por rol", group: "Venta", description: "Rol del usuario que vendió el portón." },
  { source_key: "vendido_por_nombre", label: "Vendido por nombre", group: "Venta", description: "Nombre del usuario que vendió el portón." },
  { source_key: "vendido_por_username", label: "Vendido por usuario", group: "Venta", description: "Username del usuario que vendió el portón." },
  { source_key: "vendedor_nombre", label: "Vendedor nombre", group: "Venta", description: "Nombre del vendedor, si la venta la hizo un vendedor." },
  { source_key: "distribuidor_nombre", label: "Distribuidor nombre", group: "Venta", description: "Nombre del distribuidor, si la venta la hizo un distribuidor." },

  { source_key: "porton_type", label: "Sistema (label visible)", group: "Portón", description: "Tipo/sistema visible, en mayúsculas como el desplegable del cotizador." },
  { source_key: "porton_type_key", label: "Sistema (key interna)", group: "Portón", description: "Key interna, ej: acero_simil_aluminio_clasico." },
  { source_key: "alto_final_mm", label: "Alto final (mm)", group: "Portón", description: "Alto final en milímetros." },
  { source_key: "ancho_final_mm", label: "Ancho final (mm)", group: "Portón", description: "Ancho final en milímetros." },
  { source_key: "cantidad_parantes", label: "Cantidad parantes", group: "Portón", description: "Cantidad de parantes." },
  { source_key: "orientacion_parantes", label: "Orientación parantes", group: "Portón", description: "Orientación de parantes." },
  { source_key: "distribucion_parantes", label: "Distribución parantes", group: "Portón", description: "Distribución de parantes." },
  { source_key: "observaciones_parantes", label: "Observaciones parantes", group: "Portón", description: "Observaciones de parantes." },

  { source_key: "tolerance_percent", label: "Tolerancia %", group: "Métricas", description: "Tolerancia porcentual final aplicada." },
  { source_key: "tolerance_amount", label: "Tolerancia importe", group: "Métricas", description: "Tolerancia monetaria aplicada." },
  { source_key: "difference_amount", label: "Diferencia final", group: "Métricas", description: "Diferencia final calculada." },
  { source_key: "absorbed_by_company", label: "Absorbido por empresa", group: "Métricas", description: "true / false." },
  { source_key: "final_amount_to_charge", label: "Importe final a cobrar", group: "Métricas", description: "Monto final de la NV." },
];

let ensured = false;

async function ensureProductionPropertyAssignmentsTable() {
  if (ensured) return;

  await dbQuery(`
    create table if not exists public.presupuestador_production_property_assignments (
      source_key text primary key,
      target_property text null,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  ensured = true;
}

function normalizeSourceKey(value) {
  return String(value || "").trim();
}

function normalizeTargetProperty(value) {
  return String(value || "").trim();
}

function slugifySimple(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function buildSectionSourceKey(sectionName) {
  const slug = slugifySimple(sectionName);
  return slug ? `section__${slug}` : "";
}

async function safeListValues(sql) {
  try {
    const q = await dbQuery(sql);
    return (q.rows || []).map((row) => String(row.value || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function listDynamicSectionSourceCatalog() {
  try {
    const q = await dbQuery(`
      select distinct name
        from public.presupuestador_sections
       where coalesce(name, '') <> ''
       order by name asc
    `);
    return (q.rows || [])
      .map((row) => String(row?.name || "").trim())
      .filter(Boolean)
      .map((sectionName) => ({
        source_key: buildSectionSourceKey(sectionName),
        label: `Sección: ${sectionName}`,
        group: "Secciones",
        description: `Productos elegidos dentro de la sección ${sectionName}.`,
      }))
      .filter((item) => item.source_key);
  } catch {
    return [];
  }
}

export async function listProductionSourceCatalog() {
  await ensureProductionPropertyAssignmentsTable();
  const dynamicSections = await listDynamicSectionSourceCatalog();
  return [...BASE_SOURCE_PROPERTIES, ...dynamicSections];
}

export async function listIntegratorTargetProperties() {
  await ensureProductionPropertyAssignmentsTable();

  const values = new Set(DEFAULT_TARGET_PROPERTIES);

  for (const value of await safeListValues(`
    select distinct column_name as value
      from public.preproduccion_formulas
     where coalesce(column_name, '') <> ''
     order by 1
  `)) {
    values.add(value);
  }

  for (const value of await safeListValues(`
    select distinct target_property as value
      from public.preproduccion_property_mappings
     where coalesce(target_property, '') <> ''
     order by 1
  `)) {
    values.add(value);
  }

  for (const value of await safeListValues(`
    select distinct target_property as value
      from public.presupuestador_production_property_assignments
     where coalesce(target_property, '') <> ''
     order by 1
  `)) {
    values.add(value);
  }

  for (const value of await safeListValues(`
    select distinct j.value as value
      from public.preproduccion_valores pv
      cross join lateral jsonb_object_keys(coalesce(pv.data, '{}'::jsonb)) as j(value)
     where coalesce(j.value, '') <> ''
     order by 1
     limit 1000
  `)) {
    values.add(value);
  }

  return Array.from(values).sort((a, b) => String(a).localeCompare(String(b), "es"));
}

export async function listProductionPropertyAssignments() {
  await ensureProductionPropertyAssignmentsTable();
  const q = await dbQuery(`
    select source_key, target_property, is_active, created_at, updated_at
      from public.presupuestador_production_property_assignments
     order by source_key asc
  `);
  return q.rows || [];
}

export async function getProductionPropertyAssignmentsMap() {
  const rows = await listProductionPropertyAssignments();
  const out = new Map();
  for (const row of rows) {
    const sourceKey = normalizeSourceKey(row?.source_key);
    const targetProperty = normalizeTargetProperty(row?.target_property);
    if (!sourceKey || !targetProperty || row?.is_active === false) continue;
    out.set(sourceKey, targetProperty);
  }
  return out;
}

export async function setProductionPropertyAssignment(sourceKey, payload = {}) {
  await ensureProductionPropertyAssignmentsTable();

  const key = normalizeSourceKey(sourceKey);
  if (!key) throw new Error("source_key inválido");

  const targetProperty = normalizeTargetProperty(payload?.target_property);
  const isActive = payload?.is_active !== false;

  const q = await dbQuery(
    `
    insert into public.presupuestador_production_property_assignments
      (source_key, target_property, is_active)
    values ($1, $2, $3)
    on conflict (source_key)
    do update set
      target_property = excluded.target_property,
      is_active = excluded.is_active,
      updated_at = now()
    returning source_key, target_property, is_active, created_at, updated_at
    `,
    [key, targetProperty || null, isActive]
  );

  return q.rows?.[0] || null;
}

function hasMeaningfulValue(value) {
  return !(
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "number" && Number.isNaN(value))
  );
}

export function applyProductionPropertyAssignments(payload, assignmentsMap) {
  const out = {};
  const map = assignmentsMap instanceof Map ? assignmentsMap : new Map();

  for (const [sourceKey, targetPropertyRaw] of map.entries()) {
    const targetProperty = normalizeTargetProperty(targetPropertyRaw);
    if (!targetProperty) continue;

    const value = payload?.[sourceKey];
    if (!hasMeaningfulValue(value)) continue;

    out[targetProperty] = value;
  }

  return out;
}

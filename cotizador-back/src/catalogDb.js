import { dbQuery } from "./db.js";

let catalogControlsEnsured = false;
const KINDS = new Set(["porton", "ipanel", "plegados", "otros", "puerta"]);
const KIND_SQL = "'porton', 'ipanel', 'plegados', 'otros', 'puerta'";

export function normKind(kind) {
  const k = String(kind || "porton").toLowerCase().trim();
  if (!KINDS.has(k)) throw new Error('kind inválido (usar "porton", "ipanel", "plegados", "otros" o "puerta")');
  return k;
}

async function dropCatalogKindChecks(tableNames = []) {
  await dbQuery(`
    do $$
    declare item record;
    begin
      for item in
        select c.conname, c.conrelid::regclass as table_name
          from pg_constraint c
          join pg_class rel on rel.oid = c.conrelid
          join pg_namespace nsp on nsp.oid = rel.relnamespace
         where nsp.nspname = 'public'
           and rel.relname = any(array[${tableNames.map((x) => `'${x.replace("'", "''")}'`).join(",")}])
           and c.contype = 'c'
           and pg_get_constraintdef(c.oid) ilike '%catalog_kind%'
      loop
        execute format('alter table %s drop constraint if exists %I', item.table_name, item.conname);
      end loop;
    end $$;
  `);
}

async function seedPlegadosFromIpanelControls() {
  const existing = await dbQuery(`select count(*)::int as count from public.presupuestador_sections where catalog_kind='plegados'`);
  if (Number(existing.rows?.[0]?.count || 0) > 0) return;

  const ipanelSections = await dbQuery(`select id, name, position, use_surface_qty from public.presupuestador_sections where catalog_kind='ipanel' order by position asc, name asc`);
  if (!(ipanelSections.rows || []).length) return;

  const sectionIdMap = new Map();
  for (const row of ipanelSections.rows || []) {
    const inserted = await dbQuery(
      `insert into public.presupuestador_sections (name, position, catalog_kind, use_surface_qty) values ($1, $2, 'plegados', $3) returning id`,
      [String(row.name || '').trim(), Number(row.position || 100), !!row.use_surface_qty],
    );
    const nextId = Number(inserted.rows?.[0]?.id || 0);
    if (nextId) sectionIdMap.set(Number(row.id), nextId);
  }

  const ipanelTagSections = await dbQuery(`select tag_id, section_id from public.presupuestador_tag_sections where catalog_kind='ipanel'`);
  for (const row of ipanelTagSections.rows || []) {
    const nextSectionId = sectionIdMap.get(Number(row.section_id));
    if (!nextSectionId) continue;
    await dbQuery(
      `insert into public.presupuestador_tag_sections (catalog_kind, tag_id, section_id) values ('plegados', $1, $2) on conflict (catalog_kind, tag_id) do nothing`,
      [Number(row.tag_id), nextSectionId],
    );
  }

  await dbQuery(`insert into public.presupuestador_product_aliases (catalog_kind, product_id, alias) select 'plegados', product_id, alias from public.presupuestador_product_aliases where catalog_kind='ipanel' on conflict (catalog_kind, product_id) do nothing`);
  await dbQuery(`insert into public.presupuestador_product_visibility (catalog_kind, product_id, disable_for_vendedor, disable_for_distribuidor, no_permanent_stock) select 'plegados', product_id, disable_for_vendedor, disable_for_distribuidor, no_permanent_stock from public.presupuestador_product_visibility where catalog_kind='ipanel' on conflict (catalog_kind, product_id) do nothing`);
  await dbQuery(`insert into public.presupuestador_type_visibility (catalog_kind, type_key, disable_for_vendedor, disable_for_distribuidor) select 'plegados', type_key, disable_for_vendedor, disable_for_distribuidor from public.presupuestador_type_visibility where catalog_kind='ipanel' on conflict (catalog_kind, type_key) do nothing`);
  await dbQuery(`insert into public.presupuestador_product_pdf_names (catalog_kind, product_id, pdf_name) select 'plegados', product_id, pdf_name from public.presupuestador_product_pdf_names where catalog_kind='ipanel' on conflict (catalog_kind, product_id) do nothing`);
}

async function ensureCatalogControls() {
  if (catalogControlsEnsured) return;

  await dbQuery(`
    create table if not exists public.presupuestador_sections (
      id serial primary key,
      name text not null,
      position integer not null default 100,
      catalog_kind text not null default 'porton',
      use_surface_qty boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await dbQuery(`alter table public.presupuestador_sections add column if not exists catalog_kind text not null default 'porton';`);
  await dbQuery(`alter table public.presupuestador_sections add column if not exists use_surface_qty boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_sections add column if not exists budget_sector text null;`);
  await dbQuery(`alter table public.presupuestador_sections drop constraint if exists presupuestador_sections_budget_sector_check;`);
  await dbQuery(`alter table public.presupuestador_sections add constraint presupuestador_sections_budget_sector_check check (budget_sector is null or budget_sector in ('producto', 'automatizacion', 'servicios'));`);
  await dbQuery(`alter table public.presupuestador_sections add column if not exists budget_show_detail boolean not null default true;`);

  await dbQuery(`
    create table if not exists public.presupuestador_tag_sections (
      catalog_kind text not null,
      tag_id integer not null,
      section_id integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (catalog_kind, tag_id)
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_product_aliases (
      catalog_kind text not null,
      product_id integer not null,
      alias text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (catalog_kind, product_id)
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_type_sections (
      catalog_kind text not null,
      type_key text not null,
      section_id integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (catalog_kind, type_key, section_id)
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_product_visibility (
      catalog_kind text not null,
      product_id integer not null,
      disable_for_vendedor boolean not null default false,
      disable_for_distribuidor boolean not null default false,
      no_permanent_stock boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (catalog_kind, product_id)
    );
  `);
  await dbQuery(`alter table public.presupuestador_product_visibility add column if not exists no_permanent_stock boolean not null default false;`);

  await dbQuery(`
    create table if not exists public.presupuestador_type_visibility (
      catalog_kind text not null,
      type_key text not null,
      disable_for_vendedor boolean not null default false,
      disable_for_distribuidor boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (catalog_kind, type_key)
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_product_pdf_names (
      catalog_kind text not null,
      product_id integer not null,
      pdf_name text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (catalog_kind, product_id)
    );
  `);

  for (const table of [
    "presupuestador_sections",
    "presupuestador_tag_sections",
    "presupuestador_product_aliases",
    "presupuestador_type_sections",
    "presupuestador_product_visibility",
    "presupuestador_type_visibility",
    "presupuestador_product_pdf_names",
  ]) {
    await dbQuery(`alter table public.${table} add column if not exists created_at timestamptz not null default now();`);
    await dbQuery(`alter table public.${table} add column if not exists updated_at timestamptz not null default now();`);
  }

  await dropCatalogKindChecks([
    "presupuestador_sections",
    "presupuestador_tag_sections",
    "presupuestador_product_aliases",
    "presupuestador_type_sections",
    "presupuestador_product_visibility",
    "presupuestador_type_visibility",
    "presupuestador_product_pdf_names",
  ]);

  for (const [table, constraint] of [
    ["presupuestador_sections", "presupuestador_sections_catalog_kind_check"],
    ["presupuestador_tag_sections", "presupuestador_tag_sections_catalog_kind_check"],
    ["presupuestador_product_aliases", "presupuestador_product_aliases_catalog_kind_check"],
    ["presupuestador_type_sections", "presupuestador_type_sections_catalog_kind_check"],
    ["presupuestador_product_visibility", "presupuestador_product_visibility_catalog_kind_check"],
    ["presupuestador_type_visibility", "presupuestador_type_visibility_catalog_kind_check"],
    ["presupuestador_product_pdf_names", "presupuestador_product_pdf_names_catalog_kind_check"],
  ]) {
    await dbQuery(`alter table public.${table} add constraint ${constraint} check (catalog_kind in (${KIND_SQL}));`);
  }

  await seedPlegadosFromIpanelControls();
  catalogControlsEnsured = true;
}

function normalizeBudgetSector(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "producto" || v === "automatizacion" || v === "servicios" ? v : null;
}

export async function listSections(kind) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const q = await dbQuery(
    `select id, name, position, catalog_kind, use_surface_qty, budget_sector, budget_show_detail
       from public.presupuestador_sections
      where catalog_kind = $1
      order by position asc, name asc`,
    [k],
  );
  return q.rows || [];
}

export async function createSection(kind, { name, position = 100, use_surface_qty = false, budget_sector = null, budget_show_detail = true }) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const q = await dbQuery(
    `insert into public.presupuestador_sections (name, position, catalog_kind, use_surface_qty, budget_sector, budget_show_detail)
     values ($1, $2, $3, $4, $5, $6)
     returning id, name, position, catalog_kind, use_surface_qty, budget_sector, budget_show_detail`,
    [String(name || "").trim(), Number(position || 100), k, !!use_surface_qty, normalizeBudgetSector(budget_sector), budget_show_detail !== false],
  );
  return q.rows?.[0];
}

export async function updateSection(kind, id, patch = {}) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const sid = Number(id);
  if (!sid) throw new Error("sectionId inválido");
  const currentQ = await dbQuery(`select id, name, position, catalog_kind, use_surface_qty, budget_sector, budget_show_detail from public.presupuestador_sections where id=$1 and catalog_kind=$2 limit 1`, [sid, k]);
  const current = currentQ.rows?.[0];
  if (!current) throw new Error("Sección no encontrada");
  const q = await dbQuery(
    `update public.presupuestador_sections
        set name=$3, position=$4, use_surface_qty=$5, budget_sector=$6, budget_show_detail=$7, updated_at=now()
      where id=$1 and catalog_kind=$2
      returning id, name, position, catalog_kind, use_surface_qty, budget_sector, budget_show_detail`,
    [
      sid,
      k,
      patch.name !== undefined ? String(patch.name || "").trim() : current.name,
      patch.position !== undefined ? Number(patch.position || 0) : Number(current.position || 0),
      patch.use_surface_qty !== undefined ? !!patch.use_surface_qty : !!current.use_surface_qty,
      patch.budget_sector !== undefined ? normalizeBudgetSector(patch.budget_sector) : current.budget_sector,
      patch.budget_show_detail !== undefined ? !!patch.budget_show_detail : !!current.budget_show_detail,
    ],
  );
  return q.rows?.[0] || current;
}

export async function deleteSection(kind, id) {
  await ensureCatalogControls();
  await dbQuery(`delete from public.presupuestador_sections where id=$1 and catalog_kind=$2`, [Number(id), normKind(kind)]);
  return true;
}

export async function getTagSectionMap(kind) {
  await ensureCatalogControls();
  const q = await dbQuery(`select tag_id, section_id from public.presupuestador_tag_sections where catalog_kind=$1`, [normKind(kind)]);
  const map = new Map();
  for (const r of q.rows || []) map.set(Number(r.tag_id), Number(r.section_id));
  return map;
}

export async function setTagSection(kind, tagId, sectionId) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const tid = Number(tagId);
  const sid = sectionId == null || sectionId === "" ? null : Number(sectionId);
  if (!tid) throw new Error("tagId inválido");
  if (!sid) {
    await dbQuery(`delete from public.presupuestador_tag_sections where catalog_kind=$1 and tag_id=$2`, [k, tid]);
    return { catalog_kind: k, tag_id: tid, section_id: null };
  }
  await dbQuery(
    `insert into public.presupuestador_tag_sections (catalog_kind, tag_id, section_id)
     values ($1,$2,$3)
     on conflict (catalog_kind, tag_id) do update set section_id=excluded.section_id, updated_at=now()`,
    [k, tid, sid],
  );
  return { catalog_kind: k, tag_id: tid, section_id: sid };
}

export async function getProductAliasMap(kind) {
  await ensureCatalogControls();
  const q = await dbQuery(`select product_id, alias from public.presupuestador_product_aliases where catalog_kind=$1`, [normKind(kind)]);
  return new Map((q.rows || []).map((r) => [Number(r.product_id), String(r.alias || "")]));
}

export async function setProductAlias(kind, productId, alias) {
  await ensureCatalogControls();
  const k = normKind(kind); const pid = Number(productId); if (!pid) throw new Error("productId inválido");
  const a = String(alias || "").trim();
  if (!a) { await dbQuery(`delete from public.presupuestador_product_aliases where catalog_kind=$1 and product_id=$2`, [k, pid]); return { catalog_kind: k, product_id: pid, alias: null }; }
  await dbQuery(`insert into public.presupuestador_product_aliases (catalog_kind, product_id, alias) values ($1,$2,$3) on conflict (catalog_kind, product_id) do update set alias=excluded.alias, updated_at=now()`, [k, pid, a]);
  return { catalog_kind: k, product_id: pid, alias: a };
}

export async function getProductVisibilityMap(kind) {
  await ensureCatalogControls();
  const q = await dbQuery(`select product_id, disable_for_vendedor, disable_for_distribuidor, no_permanent_stock from public.presupuestador_product_visibility where catalog_kind=$1`, [normKind(kind)]);
  const map = new Map();
  for (const r of q.rows || []) map.set(Number(r.product_id), { disable_for_vendedor: !!r.disable_for_vendedor, disable_for_distribuidor: !!r.disable_for_distribuidor, no_permanent_stock: !!r.no_permanent_stock });
  return map;
}

export async function setProductVisibility(kind, productId, patch = {}) {
  await ensureCatalogControls();
  const k = normKind(kind); const pid = Number(productId); if (!pid) throw new Error("productId inválido");
  const v = { disable_for_vendedor: !!patch.disable_for_vendedor, disable_for_distribuidor: !!patch.disable_for_distribuidor, no_permanent_stock: !!patch.no_permanent_stock };
  await dbQuery(`insert into public.presupuestador_product_visibility (catalog_kind, product_id, disable_for_vendedor, disable_for_distribuidor, no_permanent_stock) values ($1,$2,$3,$4,$5) on conflict (catalog_kind, product_id) do update set disable_for_vendedor=excluded.disable_for_vendedor, disable_for_distribuidor=excluded.disable_for_distribuidor, no_permanent_stock=excluded.no_permanent_stock, updated_at=now()`, [k, pid, v.disable_for_vendedor, v.disable_for_distribuidor, v.no_permanent_stock]);
  return { catalog_kind: k, product_id: pid, ...v };
}

export async function getProductPdfNameMap(kind, productIds = null) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const ids = Array.isArray(productIds) ? productIds.map(Number).filter(Boolean) : [];
  const q = ids.length
    ? await dbQuery(`select product_id, pdf_name from public.presupuestador_product_pdf_names where catalog_kind=$1 and product_id=any($2::int[])`, [k, ids])
    : await dbQuery(`select product_id, pdf_name from public.presupuestador_product_pdf_names where catalog_kind=$1`, [k]);
  return new Map((q.rows || []).map((r) => [Number(r.product_id), String(r.pdf_name || "")]));
}

export async function setProductPdfName(kind, productId, pdfName) {
  await ensureCatalogControls();
  const k = normKind(kind); const pid = Number(productId); if (!pid) throw new Error("productId inválido");
  const value = String(pdfName || "").trim();
  if (!value) { await dbQuery(`delete from public.presupuestador_product_pdf_names where catalog_kind=$1 and product_id=$2`, [k, pid]); return { catalog_kind: k, product_id: pid, pdf_name: null }; }
  await dbQuery(`insert into public.presupuestador_product_pdf_names (catalog_kind, product_id, pdf_name) values ($1,$2,$3) on conflict (catalog_kind, product_id) do update set pdf_name=excluded.pdf_name, updated_at=now()`, [k, pid, value]);
  return { catalog_kind: k, product_id: pid, pdf_name: value };
}

export async function getTypeVisibilityMap(kind) {
  await ensureCatalogControls();
  const q = await dbQuery(`select type_key, disable_for_vendedor, disable_for_distribuidor from public.presupuestador_type_visibility where catalog_kind=$1`, [normKind(kind)]);
  const out = {};
  for (const r of q.rows || []) out[String(r.type_key || "")] = { disable_for_vendedor: !!r.disable_for_vendedor, disable_for_distribuidor: !!r.disable_for_distribuidor };
  return out;
}

export async function setTypeVisibility(kind, typeKey, patch = {}) {
  await ensureCatalogControls();
  const k = normKind(kind); const key = String(typeKey || "").trim(); if (!key) throw new Error("typeKey inválido");
  const v = { disable_for_vendedor: !!patch.disable_for_vendedor, disable_for_distribuidor: !!patch.disable_for_distribuidor };
  await dbQuery(`insert into public.presupuestador_type_visibility (catalog_kind, type_key, disable_for_vendedor, disable_for_distribuidor) values ($1,$2,$3,$4) on conflict (catalog_kind, type_key) do update set disable_for_vendedor=excluded.disable_for_vendedor, disable_for_distribuidor=excluded.disable_for_distribuidor, updated_at=now()`, [k, key, v.disable_for_vendedor, v.disable_for_distribuidor]);
  return { catalog_kind: k, type_key: key, ...v };
}

export async function getTypeSectionsMap(kind) { await ensureCatalogControls(); void kind; return {}; }
export async function setTypeSections(kind, typeKey, sectionIds) { await ensureCatalogControls(); return { catalog_kind: normKind(kind), type_key: String(typeKey || "").trim(), section_ids: Array.isArray(sectionIds) ? sectionIds.map(Number).filter(Boolean) : [] }; }

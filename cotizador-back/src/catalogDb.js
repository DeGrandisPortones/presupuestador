import { dbQuery } from "./db.js";

let catalogControlsEnsured = false;
async function ensureCatalogControls() {
  if (catalogControlsEnsured) return;

  await dbQuery(`
    alter table public.presupuestador_sections
      add column if not exists use_surface_qty boolean not null default false;
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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (catalog_kind, product_id)
    );
  `);

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

  catalogControlsEnsured = true;
}

const KINDS = new Set(["porton", "ipanel", "otros"]);
export function normKind(kind) {
  const k = String(kind || "porton").toLowerCase().trim();
  if (!KINDS.has(k)) throw new Error('kind inválido (usar "porton", "ipanel" u "otros")');
  return k;
}

export async function listSections(kind) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const q = await dbQuery(
    `select id, name, position, catalog_kind, use_surface_qty
       from public.presupuestador_sections
      where catalog_kind = $1
      order by position asc, name asc`,
    [k]
  );
  return q.rows || [];
}

export async function createSection(kind, { name, position = 100, use_surface_qty = false }) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const q = await dbQuery(
    `insert into public.presupuestador_sections (name, position, catalog_kind, use_surface_qty)
     values ($1, $2, $3, $4)
     returning id, name, position, catalog_kind, use_surface_qty`,
    [String(name || "").trim(), Number(position || 100), k, !!use_surface_qty]
  );
  return q.rows?.[0];
}

export async function updateSection(kind, id, patch = {}) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const sid = Number(id);
  if (!sid) throw new Error("sectionId inválido");

  const currentQ = await dbQuery(
    `select id, name, position, catalog_kind, use_surface_qty
       from public.presupuestador_sections
      where id = $1 and catalog_kind = $2
      limit 1`,
    [sid, k]
  );
  const current = currentQ.rows?.[0];
  if (!current) throw new Error("Sección no encontrada");

  const nextName = patch.name !== undefined ? String(patch.name || "").trim() : current.name;
  const nextPosition = patch.position !== undefined ? Number(patch.position || 0) : Number(current.position || 0);
  const nextUseSurface = patch.use_surface_qty !== undefined ? !!patch.use_surface_qty : !!current.use_surface_qty;

  const q = await dbQuery(
    `update public.presupuestador_sections
        set name = $3,
            position = $4,
            use_surface_qty = $5
      where id = $1 and catalog_kind = $2
      returning id, name, position, catalog_kind, use_surface_qty`,
    [sid, k, nextName, nextPosition, nextUseSurface]
  );
  return q.rows?.[0] || current;
}

export async function deleteSection(kind, id) {
  await ensureCatalogControls();
  const k = normKind(kind);
  await dbQuery(
    `delete from public.presupuestador_sections
      where id = $1 and catalog_kind = $2`,
    [Number(id), k]
  );
  return true;
}

export async function getTagSectionMap(kind) {
  const k = normKind(kind);
  const q = await dbQuery(
    `select tag_id, section_id, catalog_kind
       from public.presupuestador_tag_sections
      where catalog_kind = $1`,
    [k]
  );
  const map = new Map();
  for (const r of (q.rows || [])) map.set(Number(r.tag_id), Number(r.section_id));
  return map;
}

export async function setTagSection(kind, tagId, sectionId) {
  const k = normKind(kind);
  const tid = Number(tagId);
  const sid = sectionId == null || sectionId === "" ? null : Number(sectionId);

  if (!tid) throw new Error("tagId inválido");

  if (!sid) {
    await dbQuery(
      `delete from public.presupuestador_tag_sections
        where catalog_kind=$1 and tag_id=$2`,
      [k, tid]
    );
    return { catalog_kind: k, tag_id: tid, section_id: null };
  }

  await dbQuery(
    `insert into public.presupuestador_tag_sections (catalog_kind, tag_id, section_id)
     values ($1, $2, $3)
     on conflict (catalog_kind, tag_id)
     do update set section_id = excluded.section_id, updated_at = now()`,
    [k, tid, sid]
  );
  return { catalog_kind: k, tag_id: tid, section_id: sid };
}

export async function getProductAliasMap(kind) {
  const k = normKind(kind);
  const q = await dbQuery(
    `select product_id, alias
       from public.presupuestador_product_aliases
      where catalog_kind = $1`,
    [k]
  );
  const map = new Map();
  for (const r of (q.rows || [])) map.set(Number(r.product_id), String(r.alias || ""));
  return map;
}

export async function setProductAlias(kind, productId, alias) {
  const k = normKind(kind);
  const pid = Number(productId);
  if (!pid) throw new Error("productId inválido");

  const a = String(alias || "").trim();
  if (!a) {
    await dbQuery(
      `delete from public.presupuestador_product_aliases
        where catalog_kind=$1 and product_id=$2`,
      [k, pid]
    );
    return { catalog_kind: k, product_id: pid, alias: null };
  }

  await dbQuery(
    `insert into public.presupuestador_product_aliases (catalog_kind, product_id, alias)
     values ($1, $2, $3)
     on conflict (catalog_kind, product_id)
     do update set alias = excluded.alias, updated_at = now()`,
    [k, pid, a]
  );
  return { catalog_kind: k, product_id: pid, alias: a };
}

export async function getProductVisibilityMap(kind) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const q = await dbQuery(
    `select product_id, disable_for_vendedor, disable_for_distribuidor
       from public.presupuestador_product_visibility
      where catalog_kind = $1`,
    [k]
  );
  const map = new Map();
  for (const r of (q.rows || [])) {
    map.set(Number(r.product_id), {
      disable_for_vendedor: !!r.disable_for_vendedor,
      disable_for_distribuidor: !!r.disable_for_distribuidor,
    });
  }
  return map;
}

export async function setProductVisibility(kind, productId, patch = {}) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const pid = Number(productId);
  if (!pid) throw new Error("productId inválido");

  const disableForVendedor = !!patch.disable_for_vendedor;
  const disableForDistribuidor = !!patch.disable_for_distribuidor;

  await dbQuery(
    `insert into public.presupuestador_product_visibility
       (catalog_kind, product_id, disable_for_vendedor, disable_for_distribuidor)
     values ($1, $2, $3, $4)
     on conflict (catalog_kind, product_id)
     do update set
       disable_for_vendedor = excluded.disable_for_vendedor,
       disable_for_distribuidor = excluded.disable_for_distribuidor,
       updated_at = now()`,
    [k, pid, disableForVendedor, disableForDistribuidor]
  );

  return {
    catalog_kind: k,
    product_id: pid,
    disable_for_vendedor: disableForVendedor,
    disable_for_distribuidor: disableForDistribuidor,
  };
}

export async function getTypeVisibilityMap(kind) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const q = await dbQuery(
    `select type_key, disable_for_vendedor, disable_for_distribuidor
       from public.presupuestador_type_visibility
      where catalog_kind = $1`,
    [k]
  );
  const out = {};
  for (const r of (q.rows || [])) {
    out[String(r.type_key || "")] = {
      disable_for_vendedor: !!r.disable_for_vendedor,
      disable_for_distribuidor: !!r.disable_for_distribuidor,
    };
  }
  return out;
}

export async function setTypeVisibility(kind, typeKey, patch = {}) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const key = String(typeKey || "").trim();
  if (!key) throw new Error("typeKey inválido");

  const disableForVendedor = !!patch.disable_for_vendedor;
  const disableForDistribuidor = !!patch.disable_for_distribuidor;

  await dbQuery(
    `insert into public.presupuestador_type_visibility
       (catalog_kind, type_key, disable_for_vendedor, disable_for_distribuidor)
     values ($1, $2, $3, $4)
     on conflict (catalog_kind, type_key)
     do update set
       disable_for_vendedor = excluded.disable_for_vendedor,
       disable_for_distribuidor = excluded.disable_for_distribuidor,
       updated_at = now()`,
    [k, key, disableForVendedor, disableForDistribuidor]
  );

  return {
    catalog_kind: k,
    type_key: key,
    disable_for_vendedor: disableForVendedor,
    disable_for_distribuidor: disableForDistribuidor,
  };
}

export async function getTypeSectionsMap(kind) {
  await ensureCatalogControls();
  void kind;
  return {};
}

export async function setTypeSections(kind, typeKey, sectionIds) {
  await ensureCatalogControls();
  const k = normKind(kind);
  const key = String(typeKey || "").trim();
  const ids = Array.isArray(sectionIds) ? sectionIds.map((x) => Number(x)).filter(Boolean) : [];
  return { catalog_kind: k, type_key: key, section_ids: ids };
}

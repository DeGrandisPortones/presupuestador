import { dbQuery } from "./db.js";


let typeSectionsEnsured = false;
async function ensureTypeSectionsTable() {
  if (typeSectionsEnsured) return;
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
  typeSectionsEnsured = true;
}

const KINDS = new Set(["porton","ipanel"]);
export function normKind(kind) {
  const k = String(kind || "porton").toLowerCase().trim();
  if (!KINDS.has(k)) throw new Error('kind inválido (usar "porton" o "ipanel")');
  return k;
}

export async function listSections(kind) {
  const k = normKind(kind);
  const q = await dbQuery(
    `select id, name, position, catalog_kind
       from public.presupuestador_sections
      where catalog_kind = $1
      order by position asc, name asc`,
    [k]
  );
  return q.rows || [];
}

export async function createSection(kind, { name, position = 100 }) {
  const k = normKind(kind);
  const q = await dbQuery(
    `insert into public.presupuestador_sections (name, position, catalog_kind)
     values ($1, $2, $3)
     returning id, name, position, catalog_kind`,
    [String(name || "").trim(), Number(position || 100), k]
  );
  return q.rows?.[0];
}

export async function deleteSection(kind, id) {
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
    // borrar mapeo
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


export async function getTypeSectionsMap(kind) {
  await ensureTypeSectionsTable();
  const k = normKind(kind);
  const q = await dbQuery(
    `select type_key, section_id
       from public.presupuestador_type_sections
      where catalog_kind = $1
      order by type_key asc, section_id asc`,
    [k]
  );

  const out = {};
  for (const r of (q.rows || [])) {
    const key = String(r.type_key || "");
    if (!out[key]) out[key] = [];
    out[key].push(Number(r.section_id));
  }
  return out;
}

export async function setTypeSections(kind, typeKey, sectionIds) {
  await ensureTypeSectionsTable();
  const k = normKind(kind);
  const key = String(typeKey || "").trim();
  if (!key) throw new Error("typeKey inválido");

  const ids = Array.isArray(sectionIds) ? sectionIds.map((x) => Number(x)).filter(Boolean) : [];

  await dbQuery(
    `delete from public.presupuestador_type_sections where catalog_kind=$1 and type_key=$2`,
    [k, key]
  );

  for (const sid of ids) {
    await dbQuery(
      `insert into public.presupuestador_type_sections (catalog_kind, type_key, section_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [k, key, sid]
    );
  }

  return { catalog_kind: k, type_key: key, section_ids: ids };
}

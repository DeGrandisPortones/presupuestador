import { dbQuery } from "./db.js";

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

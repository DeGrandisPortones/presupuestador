import { dbQuery } from "./db.js";

// Tablas para dashboard/catalogo (secciones, mapeo tag->seccion, alias visible por producto)

let ensured = false;

export async function ensureCatalogTables() {
  if (ensured) return;

  // Nota: usamos IF NOT EXISTS para que sea idempotente.
  await dbQuery(`
    create table if not exists public.presupuestador_sections (
      id bigserial primary key,
      name text not null unique,
      position integer not null default 100,
      created_at timestamptz not null default now()
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_tag_sections (
      tag_id bigint primary key,
      section_id bigint not null references public.presupuestador_sections(id) on delete cascade,
      updated_at timestamptz not null default now()
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_product_aliases (
      product_id bigint primary key,
      alias text not null,
      updated_at timestamptz not null default now()
    );
  `);

  ensured = true;
}

export async function listSections() {
  await ensureCatalogTables();
  const r = await dbQuery(
    `select id, name, position from public.presupuestador_sections order by position asc, name asc`
  );
  return r.rows || [];
}

export async function upsertSection({ id = null, name, position = 100 }) {
  await ensureCatalogTables();
  const n = String(name || "").trim();
  if (!n) throw new Error("Falta name");
  const pos = Number(position || 100);

  if (id) {
    const r = await dbQuery(
      `update public.presupuestador_sections set name=$2, position=$3 where id=$1 returning id, name, position`,
      [Number(id), n, pos]
    );
    return r.rows?.[0] || null;
  }

  const r = await dbQuery(
    `insert into public.presupuestador_sections (name, position) values ($1, $2)
     on conflict (name) do update set position=excluded.position
     returning id, name, position`,
    [n, pos]
  );
  return r.rows?.[0] || null;
}

export async function deleteSection(id) {
  await ensureCatalogTables();
  await dbQuery(`delete from public.presupuestador_sections where id=$1`, [Number(id)]);
}

export async function setTagSection({ tagId, sectionId }) {
  await ensureCatalogTables();
  const tid = Number(tagId);
  const sid = sectionId ? Number(sectionId) : null;
  if (!tid) throw new Error("tagId inválido");

  if (!sid) {
    await dbQuery(`delete from public.presupuestador_tag_sections where tag_id=$1`, [tid]);
    return { tag_id: tid, section_id: null };
  }

  const r = await dbQuery(
    `insert into public.presupuestador_tag_sections (tag_id, section_id)
     values ($1, $2)
     on conflict (tag_id) do update set section_id=excluded.section_id, updated_at=now()
     returning tag_id, section_id`,
    [tid, sid]
  );
  return r.rows?.[0] || null;
}

export async function listTagSections() {
  await ensureCatalogTables();
  const r = await dbQuery(`select tag_id, section_id from public.presupuestador_tag_sections`);
  return r.rows || [];
}

export async function setProductAlias({ productId, alias }) {
  await ensureCatalogTables();
  const pid = Number(productId);
  const a = String(alias || "").trim();
  if (!pid) throw new Error("productId inválido");

  if (!a) {
    await dbQuery(`delete from public.presupuestador_product_aliases where product_id=$1`, [pid]);
    return { product_id: pid, alias: null };
  }

  const r = await dbQuery(
    `insert into public.presupuestador_product_aliases (product_id, alias)
     values ($1, $2)
     on conflict (product_id) do update set alias=excluded.alias, updated_at=now()
     returning product_id, alias`,
    [pid, a]
  );
  return r.rows?.[0] || null;
}

export async function listProductAliases() {
  await ensureCatalogTables();
  const r = await dbQuery(`select product_id, alias from public.presupuestador_product_aliases`);
  return r.rows || [];
}

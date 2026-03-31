import { dbQuery } from "./db.js";

let ensured = false;

export async function ensureUsersAdminColumns() {
  if (ensured) return;

  await dbQuery(`alter table public.presupuestador_users add column if not exists full_name text null;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists is_active boolean not null default true;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists default_maps_url text null;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists is_medidor boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists is_logistica boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists is_superuser boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists odoo_pricelist_id integer null;`);

  try {
    await dbQuery(`alter table public.presupuestador_users drop constraint if exists presupuestador_users_role_check;`);
  } catch {
    // ignore
  }
  try {
    await dbQuery(
      `alter table public.presupuestador_users add constraint presupuestador_users_role_check
       check (
         coalesce(is_distribuidor,false)
         or coalesce(is_vendedor,false)
         or coalesce(is_enc_comercial,false)
         or coalesce(is_rev_tecnica,false)
         or coalesce(is_medidor,false)
         or coalesce(is_logistica,false)
         or coalesce(is_superuser,false)
       ) not valid;`
    );
  } catch {
    // ignore
  }

  ensured = true;
}

function normRole(role) {
  const r = String(role || "all").toLowerCase().trim();
  if (!["all", "vendedor", "distribuidor", "medidor", "logistica", "superuser"].includes(r)) {
    throw new Error("role inválido");
  }
  return r;
}

function normActive(active) {
  const a = String(active || "all").toLowerCase().trim();
  if (!["all", "true", "false", "active", "inactive"].includes(a)) throw new Error("active inválido");
  if (a === "active") return "true";
  if (a === "inactive") return "false";
  return a;
}

function normalizePricelistId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function listUsers({ role = "all", q = "", active = "all" } = {}) {
  await ensureUsersAdminColumns();

  const roleN = normRole(role);
  const activeN = normActive(active);
  const query = String(q || "").trim();

  const where = [];
  const params = [];

  where.push("(is_vendedor = true or is_distribuidor = true or is_medidor = true or is_logistica = true or is_superuser = true)");

  if (roleN === "vendedor") where.push("is_vendedor = true");
  if (roleN === "distribuidor") where.push("is_distribuidor = true");
  if (roleN === "medidor") where.push("is_medidor = true");
  if (roleN === "logistica") where.push("is_logistica = true");
  if (roleN === "superuser") where.push("is_superuser = true");

  if (activeN === "true") where.push("is_active = true");
  if (activeN === "false") where.push("is_active = false");

  if (query) {
    params.push(`%${query}%`);
    params.push(`%${query}%`);
    where.push(`(username ilike $${params.length - 1} or coalesce(full_name,'') ilike $${params.length})`);
  }

  const sql = `
    select id, username, full_name,
           is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser,
           is_enc_comercial, is_rev_tecnica,
           is_active,
           odoo_partner_id,
           odoo_pricelist_id,
           default_maps_url,
           created_at, updated_at
    from public.presupuestador_users
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by username asc
    limit 500
  `;

  const r = await dbQuery(sql, params);
  return r.rows || [];
}

export async function createUser({
  username,
  password,
  full_name = null,
  is_distribuidor = false,
  is_vendedor = false,
  is_medidor = false,
  is_logistica = false,
  is_superuser = false,
  odoo_partner_id = null,
  odoo_pricelist_id = null,
  default_maps_url = null,
  is_active = true,
} = {}) {
  await ensureUsersAdminColumns();

  const u = String(username || "").trim();
  const p = String(password || "");
  const name = full_name !== null ? String(full_name).trim() : null;

  if (!u) throw new Error("Falta username");
  if (!p) throw new Error("Falta password");

  const dist = !!is_distribuidor;
  const vend = !!is_vendedor;
  const med = !!is_medidor;
  const log = !!is_logistica;
  const sup = !!is_superuser;
  if (!dist && !vend && !med && !log && !sup) throw new Error("El usuario debe tener al menos un rol");

  const pid = odoo_partner_id ? Number(odoo_partner_id) : null;
  const pricelistId = dist ? normalizePricelistId(odoo_pricelist_id) : null;
  if (dist && !pricelistId) throw new Error("Falta lista de precios para el distribuidor");

  const r = await dbQuery(
    `
    insert into public.presupuestador_users
      (username, password_hash, full_name, is_active,
       is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser,
       is_enc_comercial, is_rev_tecnica,
       odoo_partner_id, odoo_pricelist_id, default_maps_url)
    values
      ($1, crypt($2, gen_salt('bf')), $3, $4,
       $5, $6, $7, $8, $9,
       false, false,
       $10, $11, $12)
    returning id, username, full_name,
              is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser,
              is_enc_comercial, is_rev_tecnica,
              is_active, odoo_partner_id, odoo_pricelist_id, default_maps_url, created_at, updated_at
    `,
    [u, p, name, !!is_active, dist, vend, med, log, sup, pid, pricelistId, (default_maps_url ? String(default_maps_url).trim() : null)]
  );

  return r.rows?.[0] || null;
}

export async function updateUser(id, {
  full_name,
  password,
  is_distribuidor,
  is_vendedor,
  is_medidor,
  is_logistica,
  is_superuser,
  odoo_partner_id,
  odoo_pricelist_id,
  default_maps_url,
  is_active,
} = {}) {
  await ensureUsersAdminColumns();

  const userId = Number(id);
  if (!userId) throw new Error("id inválido");

  const cur = await dbQuery(
    `select id, is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser, is_active, full_name, odoo_partner_id, odoo_pricelist_id, default_maps_url
       from public.presupuestador_users where id=$1 limit 1`,
    [userId]
  );
  const current = cur.rows?.[0];
  if (!current) throw new Error("Usuario no encontrado");

  const dist = is_distribuidor !== undefined ? !!is_distribuidor : !!current.is_distribuidor;
  const vend = is_vendedor !== undefined ? !!is_vendedor : !!current.is_vendedor;
  const med = is_medidor !== undefined ? !!is_medidor : !!current.is_medidor;
  const log = is_logistica !== undefined ? !!is_logistica : !!current.is_logistica;
  const sup = is_superuser !== undefined ? !!is_superuser : !!current.is_superuser;
  if (!dist && !vend && !med && !log && !sup) throw new Error("El usuario debe tener al menos un rol");

  const active = is_active !== undefined ? !!is_active : !!current.is_active;
  const name = full_name !== undefined ? (full_name === null ? null : String(full_name).trim()) : current.full_name;
  const pid = odoo_partner_id !== undefined ? (odoo_partner_id ? Number(odoo_partner_id) : null) : current.odoo_partner_id;
  const pricelistId = dist
    ? (odoo_pricelist_id !== undefined ? normalizePricelistId(odoo_pricelist_id) : normalizePricelistId(current.odoo_pricelist_id))
    : null;
  if (dist && !pricelistId) throw new Error("Falta lista de precios para el distribuidor");
  const mapsUrl = default_maps_url !== undefined ? (default_maps_url ? String(default_maps_url).trim() : null) : (current.default_maps_url ?? null);

  const pass = password !== undefined ? String(password || "") : "";

  const r = await dbQuery(
    `
    update public.presupuestador_users
    set full_name = $2,
        is_active = $3,
        is_distribuidor = $4,
        is_vendedor = $5,
        is_medidor = $6,
        is_logistica = $7,
        is_superuser = $8,
        odoo_partner_id = $9,
        odoo_pricelist_id = $10,
        default_maps_url = $11,
        password_hash = case when $12::text is null or $12::text = '' then password_hash else crypt($12::text, gen_salt('bf')) end,
        updated_at = now()
    where id = $1
    returning id, username, full_name,
              is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser,
              is_enc_comercial, is_rev_tecnica,
              is_active, odoo_partner_id, odoo_pricelist_id, default_maps_url, created_at, updated_at
    `,
    [userId, name, active, dist, vend, med, log, sup, pid, pricelistId, mapsUrl, pass]
  );

  return r.rows?.[0] || null;
}

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
  await dbQuery(`alter table public.presupuestador_users add column if not exists is_administracion boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists odoo_pricelist_id integer null;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists assigned_seller_user_id integer null;`);
  await dbQuery(`alter table public.presupuestador_users add column if not exists visible_password text null;`);
  await dbQuery(`create index if not exists presupuestador_users_assigned_seller_idx on public.presupuestador_users(assigned_seller_user_id);`);

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
         or coalesce(is_administracion,false)
       ) not valid;`
    );
  } catch {
    // ignore
  }

  ensured = true;
}

function normRole(role) {
  const r = String(role || "all").toLowerCase().trim();
  if (!["all", "vendedor", "distribuidor", "medidor", "logistica", "superuser", "administracion"].includes(r)) {
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

function normalizeSellerUserId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function assertValidSellerUserId(sellerUserId) {
  const sellerId = normalizeSellerUserId(sellerUserId);
  if (!sellerId) return null;
  const r = await dbQuery(
    `select id from public.presupuestador_users where id=$1 and coalesce(is_vendedor,false)=true and coalesce(is_active,true)=true limit 1`,
    [sellerId]
  );
  if (!r.rows?.[0]) throw new Error("El vendedor asignado no existe o no está activo");
  return sellerId;
}

export async function listUsers({ role = "all", q = "", active = "all" } = {}) {
  await ensureUsersAdminColumns();

  const roleN = normRole(role);
  const activeN = normActive(active);
  const query = String(q || "").trim();

  const where = [];
  const params = [];

  where.push("(u.is_vendedor = true or u.is_distribuidor = true or u.is_medidor = true or u.is_logistica = true or u.is_superuser = true or u.is_administracion = true)");

  if (roleN === "vendedor") where.push("u.is_vendedor = true");
  if (roleN === "distribuidor") where.push("u.is_distribuidor = true");
  if (roleN === "medidor") where.push("u.is_medidor = true");
  if (roleN === "logistica") where.push("u.is_logistica = true");
  if (roleN === "superuser") where.push("u.is_superuser = true");
  if (roleN === "administracion") where.push("u.is_administracion = true");

  if (activeN === "true") where.push("u.is_active = true");
  if (activeN === "false") where.push("u.is_active = false");

  if (query) {
    params.push(`%${query}%`);
    params.push(`%${query}%`);
    where.push(`(u.username ilike $${params.length - 1} or coalesce(u.full_name,'') ilike $${params.length})`);
  }

  const sql = `
    select u.id, u.username, u.full_name,
           u.is_distribuidor, u.is_vendedor, u.is_medidor, u.is_logistica, u.is_superuser,
           u.is_enc_comercial, u.is_rev_tecnica, u.is_administracion,
           u.is_active,
           u.odoo_partner_id,
           u.odoo_pricelist_id,
           u.default_maps_url,
           u.assigned_seller_user_id,
           u.visible_password,
           s.username as assigned_seller_username,
           s.full_name as assigned_seller_full_name,
           u.created_at, u.updated_at
    from public.presupuestador_users u
    left join public.presupuestador_users s on s.id = u.assigned_seller_user_id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by u.username asc
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
  is_administracion = false,
  odoo_partner_id = null,
  odoo_pricelist_id = null,
  default_maps_url = null,
  assigned_seller_user_id = null,
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
  const adm = !!is_administracion;
  if (!dist && !vend && !med && !log && !sup && !adm) throw new Error("El usuario debe tener al menos un rol");

  const pid = odoo_partner_id ? Number(odoo_partner_id) : null;
  const pricelistId = dist ? normalizePricelistId(odoo_pricelist_id) : null;
  if (dist && !pricelistId) throw new Error("Falta lista de precios para el distribuidor");

  const sellerUserId = dist ? await assertValidSellerUserId(assigned_seller_user_id) : null;
  if (dist && !sellerUserId) throw new Error("Falta vendedor asignado para el distribuidor");

  const r = await dbQuery(
    `
    insert into public.presupuestador_users
      (username, password_hash, visible_password, full_name, is_active,
       is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser, is_administracion,
       is_enc_comercial, is_rev_tecnica,
       odoo_partner_id, odoo_pricelist_id, default_maps_url, assigned_seller_user_id)
    values
      ($1, crypt($2, gen_salt('bf')), $3, $4, $5,
       $6, $7, $8, $9, $10, $11,
       false, false,
       $12, $13, $14, $15)
    returning id, username, full_name,
              is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser, is_administracion,
              is_enc_comercial, is_rev_tecnica,
              is_active, odoo_partner_id, odoo_pricelist_id, default_maps_url,
              assigned_seller_user_id, visible_password, created_at, updated_at
    `,
    [
      u,
      p,
      dist ? p : null,
      name,
      !!is_active,
      dist,
      vend,
      med,
      log,
      sup,
      adm,
      pid,
      pricelistId,
      (default_maps_url ? String(default_maps_url).trim() : null),
      sellerUserId,
    ]
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
  is_administracion,
  odoo_partner_id,
  odoo_pricelist_id,
  default_maps_url,
  assigned_seller_user_id,
  is_active,
} = {}) {
  await ensureUsersAdminColumns();

  const userId = Number(id);
  if (!userId) throw new Error("id inválido");

  const cur = await dbQuery(
    `select id, is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser, is_administracion, is_active, full_name, odoo_partner_id, odoo_pricelist_id, default_maps_url, assigned_seller_user_id, visible_password
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
  const adm = is_administracion !== undefined ? !!is_administracion : !!current.is_administracion;
  if (!dist && !vend && !med && !log && !sup && !adm) throw new Error("El usuario debe tener al menos un rol");

  const active = is_active !== undefined ? !!is_active : !!current.is_active;
  const name = full_name !== undefined ? (full_name === null ? null : String(full_name).trim()) : current.full_name;
  const pid = odoo_partner_id !== undefined ? (odoo_partner_id ? Number(odoo_partner_id) : null) : current.odoo_partner_id;
  const pricelistId = dist
    ? (odoo_pricelist_id !== undefined ? normalizePricelistId(odoo_pricelist_id) : normalizePricelistId(current.odoo_pricelist_id))
    : null;
  if (dist && !pricelistId) throw new Error("Falta lista de precios para el distribuidor");

  const sellerFieldProvided = assigned_seller_user_id !== undefined;
  const roleFieldProvided = is_distribuidor !== undefined || is_vendedor !== undefined || is_medidor !== undefined || is_logistica !== undefined || is_superuser !== undefined;
  const requestedSellerId = sellerFieldProvided ? normalizeSellerUserId(assigned_seller_user_id) : normalizeSellerUserId(current.assigned_seller_user_id);
  let sellerUserId = dist ? requestedSellerId : null;
  if (dist && (sellerFieldProvided || roleFieldProvided)) {
    sellerUserId = await assertValidSellerUserId(requestedSellerId);
    if (!sellerUserId) throw new Error("Falta vendedor asignado para el distribuidor");
  } else if (dist && sellerUserId) {
    sellerUserId = await assertValidSellerUserId(sellerUserId);
  }

  const mapsUrl = default_maps_url !== undefined ? (default_maps_url ? String(default_maps_url).trim() : null) : (current.default_maps_url ?? null);
  const pass = password !== undefined ? String(password || "") : "";
  const visiblePassword = pass ? pass : "";

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
        is_administracion = $9,
        odoo_partner_id = $10,
        odoo_pricelist_id = $11,
        default_maps_url = $12,
        password_hash = case when $13::text is null or $13::text = '' then password_hash else crypt($13::text, gen_salt('bf')) end,
        visible_password = case when $14::text is null or $14::text = '' then visible_password else $14::text end,
        assigned_seller_user_id = $15,
        updated_at = now()
    where id = $1
    returning id, username, full_name,
              is_distribuidor, is_vendedor, is_medidor, is_logistica, is_superuser, is_administracion,
              is_enc_comercial, is_rev_tecnica,
              is_active, odoo_partner_id, odoo_pricelist_id, default_maps_url,
              assigned_seller_user_id, visible_password, created_at, updated_at
    `,
    [userId, name, active, dist, vend, med, log, sup, adm, pid, pricelistId, mapsUrl, pass, visiblePassword, sellerUserId]
  );

  return r.rows?.[0] || null;
}

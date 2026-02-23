import { dbQuery } from "./db.js";

let ensured = false;

export async function ensureUsersAdminColumns() {
  if (ensured) return;

  // full_name: nombre visible
  await dbQuery(`alter table public.presupuestador_users add column if not exists full_name text null;`);

  // is_active: habilitar/inhabilitar login y uso del sistema
  await dbQuery(`alter table public.presupuestador_users add column if not exists is_active boolean not null default true;`);

  ensured = true;
}

function normRole(role) {
  const r = String(role || "all").toLowerCase().trim();
  if (!["all","vendedor","distribuidor"].includes(r)) throw new Error("role inválido");
  return r;
}

function normActive(active) {
  const a = String(active || "all").toLowerCase().trim();
  if (!["all","true","false","active","inactive"].includes(a)) throw new Error("active inválido");
  if (a === "active") return "true";
  if (a === "inactive") return "false";
  return a;
}

export async function listUsers({ role = "all", q = "", active = "all" } = {}) {
  await ensureUsersAdminColumns();

  const roleN = normRole(role);
  const activeN = normActive(active);
  const query = String(q || "").trim();

  const where = [];
  const params = [];

  // Solo vendedores/distribuidores
  where.push("(is_vendedor = true or is_distribuidor = true)");

  if (roleN === "vendedor") where.push("is_vendedor = true");
  if (roleN === "distribuidor") where.push("is_distribuidor = true");

  if (activeN === "true") where.push("is_active = true");
  if (activeN === "false") where.push("is_active = false");

  if (query) {
    params.push(`%${query}%`);
    params.push(`%${query}%`);
    where.push(`(username ilike $${params.length-1} or coalesce(full_name,'') ilike $${params.length})`);
  }

  const sql = `
    select id, username, full_name,
           is_distribuidor, is_vendedor,
           is_active,
           odoo_partner_id,
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
  odoo_partner_id = null,
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
  if (!dist && !vend) throw new Error("El usuario debe ser vendedor o distribuidor");

  const pid = odoo_partner_id ? Number(odoo_partner_id) : null;

  const r = await dbQuery(
    `
    insert into public.presupuestador_users
      (username, password_hash, full_name, is_active,
       is_distribuidor, is_vendedor,
       is_enc_comercial, is_rev_tecnica,
       odoo_partner_id)
    values
      ($1, crypt($2, gen_salt('bf')), $3, $4,
       $5, $6,
       false, false,
       $7)
    returning id, username, full_name, is_distribuidor, is_vendedor, is_active, odoo_partner_id, created_at, updated_at
    `,
    [u, p, name, !!is_active, dist, vend, pid]
  );

  return r.rows?.[0] || null;
}

export async function updateUser(id, {
  full_name,
  password,
  is_distribuidor,
  is_vendedor,
  odoo_partner_id,
  is_active,
} = {}) {
  await ensureUsersAdminColumns();

  const userId = Number(id);
  if (!userId) throw new Error("id inválido");

  // Leemos roles actuales para completar defaults
  const cur = await dbQuery(
    `select id, is_distribuidor, is_vendedor, is_active, full_name, odoo_partner_id
       from public.presupuestador_users where id=$1 limit 1`,
    [userId]
  );
  const current = cur.rows?.[0];
  if (!current) throw new Error("Usuario no encontrado");

  const dist = is_distribuidor !== undefined ? !!is_distribuidor : !!current.is_distribuidor;
  const vend = is_vendedor !== undefined ? !!is_vendedor : !!current.is_vendedor;
  if (!dist && !vend) throw new Error("El usuario debe ser vendedor o distribuidor");

  const active = is_active !== undefined ? !!is_active : !!current.is_active;
  const name = full_name !== undefined ? (full_name === null ? null : String(full_name).trim()) : current.full_name;
  const pid = odoo_partner_id !== undefined ? (odoo_partner_id ? Number(odoo_partner_id) : null) : current.odoo_partner_id;
  const pass = password !== undefined ? String(password || "") : null;

  const r = await dbQuery(
    `
    update public.presupuestador_users
    set full_name = $2,
        is_active = $3,
        is_distribuidor = $4,
        is_vendedor = $5,
        odoo_partner_id = $6,
        password_hash = case when $7 is null or $7 = '' then password_hash else crypt($7, gen_salt('bf')) end,
        updated_at = now()
    where id = $1
    returning id, username, full_name, is_distribuidor, is_vendedor, is_active, odoo_partner_id, created_at, updated_at
    `,
    [userId, name, active, dist, vend, pid, pass]
  );

  return r.rows?.[0] || null;
}

import { dbQuery } from "./db.js";

let ensured = false;

export async function ensureUsersAdminColumns() {
  if (ensured) return;

  // full_name: nombre visible
  await dbQuery(`alter table public.presupuestador_users add column if not exists full_name text null;`);

  // is_active: habilitar/inhabilitar login y uso del sistema
  await dbQuery(`alter table public.presupuestador_users add column if not exists is_active boolean not null default true;`);

  // default_maps_url: URL sugerida para Google Maps (prefill en cotizador)
  await dbQuery(`alter table public.presupuestador_users add column if not exists default_maps_url text null;`);

  // is_medidor: usuario técnico que carga mediciones
  await dbQuery(`alter table public.presupuestador_users add column if not exists is_medidor boolean not null default false;`);

  // ✅ Fix: el esquema original tenía un CHECK que exige que el usuario tenga al menos un rol.
  // Al agregar is_medidor, el CHECK viejo no lo contempla y falla al crear usuarios medidores.
  // Reemplazamos el CHECK por uno que incluya is_medidor.
  // Usamos NOT VALID para no romper si existieran filas históricas que no cumplan.
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
       ) not valid;`
    );
  } catch {
    // ignore
  }

  ensured = true;
}

function normRole(role) {
  const r = String(role || "all").toLowerCase().trim();
  if (!["all", "vendedor", "distribuidor", "medidor"].includes(r)) throw new Error("role inválido");
  return r;
}

function normActive(active) {
  const a = String(active || "all").toLowerCase().trim();
  if (!["all", "true", "false", "active", "inactive"].includes(a)) throw new Error("active inválido");
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

  // Solo usuarios operativos del presupuestador (vendedor/distribuidor/medidor)
  where.push("(is_vendedor = true or is_distribuidor = true or is_medidor = true)");

  if (roleN === "vendedor") where.push("is_vendedor = true");
  if (roleN === "distribuidor") where.push("is_distribuidor = true");
  if (roleN === "medidor") where.push("is_medidor = true");

  if (activeN === "true") where.push("is_active = true");
  if (activeN === "false") where.push("is_active = false");

  if (query) {
    params.push(`%${query}%`);
    params.push(`%${query}%`);
    where.push(`(username ilike $${params.length - 1} or coalesce(full_name,'') ilike $${params.length})`);
  }

  const sql = `
    select id, username, full_name,
           is_distribuidor, is_vendedor, is_medidor,
           is_enc_comercial, is_rev_tecnica,
           is_active,
           odoo_partner_id,
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
  odoo_partner_id = null,
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
  if (!dist && !vend && !med) throw new Error("El usuario debe ser vendedor, distribuidor o medidor");

  const pid = odoo_partner_id ? Number(odoo_partner_id) : null;

  const r = await dbQuery(
    `
    insert into public.presupuestador_users
      (username, password_hash, full_name, is_active,
       is_distribuidor, is_vendedor, is_medidor,
       is_enc_comercial, is_rev_tecnica,
       odoo_partner_id, default_maps_url)
    values
      ($1, crypt($2, gen_salt('bf')), $3, $4,
       $5, $6, $7,
       false, false,
       $8, $9)
    returning id, username, full_name,
              is_distribuidor, is_vendedor, is_medidor,
              is_enc_comercial, is_rev_tecnica,
              is_active, odoo_partner_id, default_maps_url, created_at, updated_at
    `,
    [u, p, name, !!is_active, dist, vend, med, pid, (default_maps_url ? String(default_maps_url).trim() : null)]
  );

  return r.rows?.[0] || null;
}

export async function updateUser(id, {
  full_name,
  password,
  is_distribuidor,
  is_vendedor,
  is_medidor,
  odoo_partner_id,
  default_maps_url,
  is_active,
} = {}) {
  await ensureUsersAdminColumns();

  const userId = Number(id);
  if (!userId) throw new Error("id inválido");

  // Leemos roles actuales para completar defaults
  const cur = await dbQuery(
    `select id, is_distribuidor, is_vendedor, is_medidor, is_active, full_name, odoo_partner_id, default_maps_url
       from public.presupuestador_users where id=$1 limit 1`,
    [userId]
  );
  const current = cur.rows?.[0];
  if (!current) throw new Error("Usuario no encontrado");

  const dist = is_distribuidor !== undefined ? !!is_distribuidor : !!current.is_distribuidor;
  const vend = is_vendedor !== undefined ? !!is_vendedor : !!current.is_vendedor;
  const med = is_medidor !== undefined ? !!is_medidor : !!current.is_medidor;
  if (!dist && !vend && !med) throw new Error("El usuario debe ser vendedor, distribuidor o medidor");

  const active = is_active !== undefined ? !!is_active : !!current.is_active;
  const name = full_name !== undefined ? (full_name === null ? null : String(full_name).trim()) : current.full_name;
  const pid = odoo_partner_id !== undefined ? (odoo_partner_id ? Number(odoo_partner_id) : null) : current.odoo_partner_id;
  const mapsUrl = default_maps_url !== undefined ? (default_maps_url ? String(default_maps_url).trim() : null) : (current.default_maps_url ?? null);

  // FIX: si el front no manda "password" (undefined), mandamos '' para que Postgres tipifique el parámetro como text.
  const pass = password !== undefined ? String(password || "") : "";

  const r = await dbQuery(
    `
    update public.presupuestador_users
    set full_name = $2,
        is_active = $3,
        is_distribuidor = $4,
        is_vendedor = $5,
        is_medidor = $6,
        odoo_partner_id = $7,
        default_maps_url = $8,
        password_hash = case when $9::text is null or $9::text = '' then password_hash else crypt($9::text, gen_salt('bf')) end,
        updated_at = now()
    where id = $1
    returning id, username, full_name,
              is_distribuidor, is_vendedor, is_medidor,
              is_enc_comercial, is_rev_tecnica,
              is_active, odoo_partner_id, default_maps_url, created_at, updated_at
    `,
    [userId, name, active, dist, vend, med, pid, mapsUrl, pass]
  );

  return r.rows?.[0] || null;
}

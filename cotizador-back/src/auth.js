import jwt from "jsonwebtoken";
import { dbQuery } from "./db.js";
import { ensureUsersAdminColumns } from "./usersDb.js";

function withEffectiveRoles(user) {
  const isSuperuser = !!user?.is_superuser;
  return {
    ...user,
    is_superuser: isSuperuser,
    is_distribuidor: isSuperuser || !!user?.is_distribuidor,
    is_vendedor: isSuperuser || !!user?.is_vendedor,
    is_enc_comercial: isSuperuser || !!user?.is_enc_comercial,
    is_rev_tecnica: isSuperuser || !!user?.is_rev_tecnica,
    is_medidor: isSuperuser || !!user?.is_medidor,
    is_logistica: isSuperuser || !!user?.is_logistica,
    is_administracion: isSuperuser || !!user?.is_administracion,
    // Excepcion puntual de medidas (ver usersDb.js): superuser siempre la tiene, como
    // el resto de los permisos.
    unlimited_dimensions: isSuperuser || !!user?.unlimited_dimensions,
  };
}

function userCanUseAssignedPricelist(user = {}) {
  return user?.is_distribuidor === true && user?.is_vendedor !== true && user?.is_superuser !== true;
}

export function sanitizeUserForPricing(user = {}) {
  const u = withEffectiveRoles(user || {});
  return {
    ...u,
    // Vendedores, superusuarios y usuarios mixtos vendedor/distribuidor siempre cotizan con Predeterminada.
    // No exponemos la lista asignada para que el frontend no bloquee el catalogo esperando otra lista.
    odoo_pricelist_id: userCanUseAssignedPricelist(u) ? (u.odoo_pricelist_id ?? null) : null,
  };
}

export function signToken(user) {
  const u = sanitizeUserForPricing(user);
  const payload = {
    user_id: u.id,
    username: u.username,

    is_superuser: !!u.is_superuser,
    is_distribuidor: !!u.is_distribuidor,
    is_vendedor: !!u.is_vendedor,
    is_enc_comercial: !!u.is_enc_comercial,
    is_rev_tecnica: !!u.is_rev_tecnica,
    is_medidor: !!u.is_medidor,
    is_logistica: !!u.is_logistica,
    is_administracion: !!u.is_administracion,
    unlimited_dimensions: !!u.unlimited_dimensions,

    odoo_partner_id: u.odoo_partner_id ?? null,
    odoo_pricelist_id: u.odoo_pricelist_id ?? null,

    full_name: u.full_name ?? null,
    default_maps_url: u.default_maps_url ?? null,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// Refresca roles/partner desde DB para evitar tokens viejos.
export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ ok: false, error: "Falta Authorization: Bearer <token>" });

  try {
    const decoded = jwt.verify(m[1], process.env.JWT_SECRET);

    try {
      await ensureUsersAdminColumns();
    } catch {
      // ignore
    }

    let fresh = null;
    try {
      const r = await dbQuery(
        `
        select id, username, full_name,
               coalesce(is_superuser, false) as is_superuser,
               is_distribuidor, is_vendedor,
               is_enc_comercial, is_rev_tecnica, is_medidor, is_logistica,
               coalesce(is_administracion, false) as is_administracion,
               odoo_partner_id,
               odoo_pricelist_id,
               default_maps_url,
               coalesce(is_active, true) as is_active,
               coalesce(see_all_distributors, false) as see_all_distributors,
               coalesce(unlimited_dimensions, false) as unlimited_dimensions
        from public.presupuestador_users
        where id = $1
        limit 1
`,
        [decoded.user_id]
      );
      fresh = r.rows?.[0] || null;
    } catch {
      fresh = null;
    }

    const u = fresh
      ? sanitizeUserForPricing({
          ...decoded,
          user_id: fresh.id,
          id: fresh.id,
          username: fresh.username,
          full_name: fresh.full_name ?? null,
          is_superuser: !!fresh.is_superuser,
          is_distribuidor: !!fresh.is_distribuidor,
          is_vendedor: !!fresh.is_vendedor,
          is_enc_comercial: !!fresh.is_enc_comercial,
          is_rev_tecnica: !!fresh.is_rev_tecnica,
          is_medidor: !!fresh.is_medidor,
          is_logistica: !!fresh.is_logistica,
          is_administracion: !!fresh.is_administracion,
          odoo_partner_id: fresh.odoo_partner_id ?? null,
          odoo_pricelist_id: fresh.odoo_pricelist_id ?? null,
          default_maps_url: fresh.default_maps_url ?? null,
          is_active: !!fresh.is_active,
          see_all_distributors: !!fresh.see_all_distributors,
          unlimited_dimensions: !!fresh.unlimited_dimensions,
        })
      : sanitizeUserForPricing({ ...decoded, is_active: decoded.is_active ?? true });

    if (u.is_active === false) {
      return res.status(403).json({ ok: false, error: "Usuario inhabilitado" });
    }

    req.user = u;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
  }
}

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
  };
}

export function signToken(user) {
  const u = withEffectiveRoles(user);
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
               odoo_partner_id,
               odoo_pricelist_id,
               default_maps_url,
               coalesce(is_active, true) as is_active
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
      ? withEffectiveRoles({
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
          odoo_partner_id: fresh.odoo_partner_id ?? null,
          odoo_pricelist_id: fresh.odoo_pricelist_id ?? null,
          default_maps_url: fresh.default_maps_url ?? null,
          is_active: !!fresh.is_active,
        })
      : withEffectiveRoles({ ...decoded, is_active: decoded.is_active ?? true });

    if (u.is_active === false) {
      return res.status(403).json({ ok: false, error: "Usuario inhabilitado" });
    }

    req.user = u;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
  }
}

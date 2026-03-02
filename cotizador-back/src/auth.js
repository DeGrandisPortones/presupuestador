import jwt from "jsonwebtoken";
import { dbQuery } from "./db.js";
import { ensureUsersAdminColumns } from "./usersDb.js";

export function signToken(user) {
  const payload = {
    user_id: user.id,
    username: user.username,

    is_distribuidor: !!user.is_distribuidor,
    is_vendedor: !!user.is_vendedor,
    is_enc_comercial: !!user.is_enc_comercial,
    is_rev_tecnica: !!user.is_rev_tecnica,
    is_medidor: !!user.is_medidor,
    is_logistica: !!user.is_logistica,

    odoo_partner_id: user.odoo_partner_id ?? null,

    full_name: user.full_name ?? null,
    default_maps_url: user.default_maps_url ?? null,
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
               is_distribuidor, is_vendedor,
               is_enc_comercial, is_rev_tecnica, is_medidor, is_logistica,
               odoo_partner_id,
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
      ? {
          ...decoded,
          user_id: fresh.id,
          username: fresh.username,
          full_name: fresh.full_name ?? null,
          is_distribuidor: !!fresh.is_distribuidor,
          is_vendedor: !!fresh.is_vendedor,
          is_enc_comercial: !!fresh.is_enc_comercial,
          is_rev_tecnica: !!fresh.is_rev_tecnica,
          is_medidor: !!fresh.is_medidor,
          is_logistica: !!fresh.is_logistica,
          odoo_partner_id: fresh.odoo_partner_id ?? null,
          default_maps_url: fresh.default_maps_url ?? null,
          is_active: !!fresh.is_active,
        }
      : { ...decoded, is_active: decoded.is_active ?? true };

    if (u.is_active === false) {
      return res.status(403).json({ ok: false, error: "Usuario inhabilitado" });
    }

    req.user = u;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
  }
}

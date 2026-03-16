import jwt from "jsonwebtoken";
import { dbQuery } from "./db.js";
import { ensureUsersAdminColumns } from "./usersDb.js";

function withEffectiveRoles(user) {
  const isSuper = !!user?.is_superuser;
  return {
    ...user,
    is_superuser: isSuper,
    is_distribuidor: isSuper || !!user?.is_distribuidor,
    is_vendedor: isSuper || !!user?.is_vendedor,
    is_enc_comercial: isSuper || !!user?.is_enc_comercial,
    is_rev_tecnica: isSuper || !!user?.is_rev_tecnica,
    is_medidor: isSuper || !!user?.is_medidor,
    is_logistica: isSuper || !!user?.is_logistica,
  };
}

export function signToken(user) {
  const effective = withEffectiveRoles(user || {});
  const payload = {
    user_id: effective.id,
    username: effective.username,

    is_superuser: !!effective.is_superuser,
    is_distribuidor: !!effective.is_distribuidor,
    is_vendedor: !!effective.is_vendedor,
    is_enc_comercial: !!effective.is_enc_comercial,
    is_rev_tecnica: !!effective.is_rev_tecnica,
    is_medidor: !!effective.is_medidor,
    is_logistica: !!effective.is_logistica,

    odoo_partner_id: effective.odoo_partner_id ?? null,

    full_name: effective.full_name ?? null,
    default_maps_url: effective.default_maps_url ?? null,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

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
               is_superuser,
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

    const rawUser = fresh
      ? {
          ...decoded,
          user_id: fresh.id,
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
          default_maps_url: fresh.default_maps_url ?? null,
          is_active: !!fresh.is_active,
        }
      : { ...decoded, is_active: decoded.is_active ?? true };

    const effectiveUser = withEffectiveRoles(rawUser);

    if (effectiveUser.is_active === false) {
      return res.status(403).json({ ok: false, error: "Usuario inhabilitado" });
    }

    req.user = effectiveUser;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token inválido/expirado" });
  }
}

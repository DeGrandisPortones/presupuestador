import express from "express";
import { dbQuery } from "../db.js";
import { signToken, requireAuth } from "../auth.js";
import { ensureUsersAdminColumns } from "../usersDb.js";

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

export function buildAuthRouter() {
  const router = express.Router();

  router.post("/login", async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) throw new Error("Falta username/password");

      await ensureUsersAdminColumns();

      const q = await dbQuery(
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
        where lower(username) = lower($1)
          and password_hash = crypt($2, password_hash)
        limit 1
        `,
        [String(username).trim(), String(password)]
      );

      const rawUser = q.rows?.[0];
      if (!rawUser) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });
      if (rawUser.is_active === false) return res.status(403).json({ ok: false, error: "Usuario inhabilitado" });

      const user = withEffectiveRoles(rawUser);
      const token = signToken(user);
      res.json({ ok: true, token, user });
    } catch (e) {
      next(e);
    }
  });

  router.get("/me", requireAuth, async (req, res) => {
    res.json({ ok: true, user: req.user });
  });

  return router;
}

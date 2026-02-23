import express from "express";
import { dbQuery } from "../db.js";
import { signToken, requireAuth } from "../auth.js";
import { ensureUsersAdminColumns } from "../usersDb.js";

export function buildAuthRouter() {
  const router = express.Router();

  // LOGIN
  router.post("/login", async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) throw new Error("Falta username/password");

      // Aseguramos columnas nuevas (full_name/is_active)
      await ensureUsersAdminColumns();

      // Validación con pgcrypto: password_hash = crypt(password, password_hash)
      const q = await dbQuery(
        `
        select id, username, full_name,
               is_distribuidor, is_vendedor,
               is_enc_comercial, is_rev_tecnica,
               odoo_partner_id,
               coalesce(is_active, true) as is_active
        from public.presupuestador_users
        where username = $1
          and password_hash = crypt($2, password_hash)
        limit 1
        `,
        [String(username).trim(), String(password)]
      );

      const user = q.rows?.[0];
      if (!user) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });
      if (user.is_active === false) return res.status(403).json({ ok: false, error: "Usuario inhabilitado" });

      const token = signToken(user);
      res.json({ ok: true, token, user });
    } catch (e) {
      next(e);
    }
  });

  // ME
  router.get("/me", requireAuth, async (req, res) => {
    res.json({ ok: true, user: req.user });
  });

  return router;
}

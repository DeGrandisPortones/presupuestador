import express from "express";
import { dbQuery } from "../db.js";
import { signToken, requireAuth } from "../auth.js";
import { loadCatalogBootstrap } from "../catalogBootstrap.js";

export function buildAuthRouter(odoo) {
  const router = express.Router();

  // LOGIN
  router.post("/login", async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) throw new Error("Falta username/password");

      // Validación con pgcrypto: password_hash = crypt(password, password_hash)
const q = await dbQuery(
  `
  select id, username,
         is_distribuidor, is_vendedor,
         is_enc_comercial, is_rev_tecnica,
         odoo_partner_id
  from public.presupuestador_users
  where username = $1
    and password_hash = crypt($2, password_hash)
  limit 1
  `,
  [username, password]
);



      const user = q.rows?.[0];
      if (!user) return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

      const token = signToken(user);

      // Opcional: bootstrap de Odoo en el login (productos + listas)
      let bootstrap = null;
      let bootstrap_error = null;
      try {
        if (odoo?.executeKw) bootstrap = await loadCatalogBootstrap(odoo);
      } catch (e) {
        bootstrap_error = e?.message || "No se pudo cargar bootstrap de Odoo";
      }

      res.json({ ok: true, token, user, bootstrap, bootstrap_error });
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

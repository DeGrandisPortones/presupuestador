import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureUsersAdminColumns } from "../usersDb.js";

function requireSeller(req, res, next) {
  if (!req.user?.is_vendedor && !req.user?.is_superuser) {
    return res.status(403).json({ ok: false, error: "No autorizado" });
  }
  next();
}

export function buildSellerDistributorsRouter() {
  const router = express.Router();

  router.get("/mine", requireAuth, requireSeller, async (req, res, next) => {
    try {
      await ensureUsersAdminColumns();
      const sellerId = Number(req.user?.user_id || req.user?.id || 0);
      if (!sellerId) return res.status(400).json({ ok: false, error: "Usuario inválido" });

      const q = await dbQuery(
        `
        select d.id,
               d.username,
               d.full_name,
               d.is_active,
               d.odoo_partner_id,
               d.odoo_pricelist_id,
               d.default_maps_url,
               d.visible_password,
               d.created_at,
               d.updated_at,
               s.id as assigned_seller_user_id,
               s.username as assigned_seller_username,
               s.full_name as assigned_seller_full_name
          from public.presupuestador_users d
          left join public.presupuestador_users s on s.id = d.assigned_seller_user_id
         where coalesce(d.is_distribuidor,false) = true
           and d.assigned_seller_user_id = $1
         order by coalesce(nullif(d.full_name,''), d.username) asc, d.username asc
        `,
        [sellerId]
      );

      res.json({ ok: true, distributors: q.rows || [] });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

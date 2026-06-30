import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureUsersAdminColumns } from "../usersDb.js";

function validateGoogleMapsUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    const path = String(parsed.pathname || "").toLowerCase();
    if (["maps.app.goo.gl", "www.google.com", "google.com", "maps.google.com", "g.page"].includes(host)) return raw;
    if (host.endsWith(".google.com") && path.includes("maps")) return raw;
  } catch {
    throw new Error("Google Maps invalido");
  }
  throw new Error("Google Maps invalido");
}

function requireSellerOrCommercial(req, res, next) {
  if (!req.user?.is_vendedor && !req.user?.is_enc_comercial && !req.user?.is_superuser) {
    return res.status(403).json({ ok: false, error: "No autorizado" });
  }
  next();
}

function canSeeAllDistributors(user) {
  return !!(user?.is_superuser || user?.is_enc_comercial || user?.see_all_distributors);
}

export function buildSellerDistributorsRouter() {
  const router = express.Router();

  router.get("/mine", requireAuth, requireSellerOrCommercial, async (req, res, next) => {
    try {
      await ensureUsersAdminColumns();
      const sellerId = Number(req.user?.user_id || req.user?.id || 0);
      const seeAll = canSeeAllDistributors(req.user);
      if (!sellerId && !seeAll) return res.status(400).json({ ok: false, error: "Usuario invalido" });

      const q = await dbQuery(
        `
        select d.id,
               d.username,
               d.full_name,
               d.is_active,
               d.odoo_partner_id,
               d.odoo_pricelist_id,
               d.default_maps_url,
               d.phone,
               d.visible_password,
               d.created_at,
               d.updated_at,
               s.id as assigned_seller_user_id,
               s.username as assigned_seller_username,
               s.full_name as assigned_seller_full_name
          from public.presupuestador_users d
          left join public.presupuestador_users s on s.id = d.assigned_seller_user_id
         where coalesce(d.is_distribuidor,false) = true
           and ($1::boolean = true or d.assigned_seller_user_id = $2)
         order by coalesce(nullif(s.full_name,''), s.username, '') asc,
                  coalesce(nullif(d.full_name,''), d.username) asc,
                  d.username asc
        `,
        [seeAll, sellerId]
      );

      res.json({ ok: true, distributors: q.rows || [], scope: seeAll ? "all" : "mine" });
    } catch (e) {
      next(e);
    }
  });

  router.put("/:id/default-maps-url", requireAuth, requireSellerOrCommercial, async (req, res, next) => {
    try {
      await ensureUsersAdminColumns();
      const distributorId = Number(req.params.id || 0);
      const sellerId = Number(req.user?.user_id || req.user?.id || 0);
      const seeAll = canSeeAllDistributors(req.user);
      if (!distributorId) return res.status(400).json({ ok: false, error: "Distribuidor invalido" });
      if (!sellerId && !seeAll) return res.status(400).json({ ok: false, error: "Usuario invalido" });

      const defaultMapsUrl = validateGoogleMapsUrl(req.body?.default_maps_url || "");
      const params = seeAll
        ? [distributorId, defaultMapsUrl]
        : [distributorId, defaultMapsUrl, sellerId];
      const ownerWhere = seeAll ? "" : "and d.assigned_seller_user_id = $3";

      const q = await dbQuery(
        `
        update public.presupuestador_users d
           set default_maps_url = nullif($2::text, ''),
               updated_at = now()
         where d.id = $1
           and coalesce(d.is_distribuidor,false) = true
           ${ownerWhere}
         returning d.id,
               d.username,
               d.full_name,
               d.is_active,
               d.odoo_partner_id,
               d.odoo_pricelist_id,
               d.default_maps_url,
               d.visible_password,
               d.created_at,
               d.updated_at,
               d.assigned_seller_user_id
        `,
        params
      );
      const distributor = q.rows?.[0] || null;
      if (!distributor) return res.status(404).json({ ok: false, error: "Distribuidor no encontrado o no asignado a tu usuario" });
      res.json({ ok: true, distributor });
    } catch (e) {
      next(e);
    }
  });

  router.put("/:id/phone", requireAuth, requireSellerOrCommercial, async (req, res, next) => {
    try {
      await ensureUsersAdminColumns();
      const distributorId = Number(req.params.id || 0);
      const sellerId = Number(req.user?.user_id || req.user?.id || 0);
      const seeAll = canSeeAllDistributors(req.user);
      if (!distributorId) return res.status(400).json({ ok: false, error: "Distribuidor invalido" });
      if (!sellerId && !seeAll) return res.status(400).json({ ok: false, error: "Usuario invalido" });

      const phone = String(req.body?.phone || "").trim().slice(0, 64);
      const params = seeAll ? [distributorId, phone] : [distributorId, phone, sellerId];
      const ownerWhere = seeAll ? "" : "and d.assigned_seller_user_id = $3";

      const q = await dbQuery(
        `update public.presupuestador_users d
            set phone = nullif($2::text, ''),
                updated_at = now()
          where d.id = $1
            and coalesce(d.is_distribuidor,false) = true
            ${ownerWhere}
          returning d.id, d.username, d.full_name, d.is_active, d.odoo_partner_id,
                    d.odoo_pricelist_id, d.default_maps_url, d.phone,
                    d.visible_password, d.created_at, d.updated_at, d.assigned_seller_user_id`,
        params
      );
      const distributor = q.rows?.[0] || null;
      if (!distributor) return res.status(404).json({ ok: false, error: "Distribuidor no encontrado o no asignado a tu usuario" });
      res.json({ ok: true, distributor });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

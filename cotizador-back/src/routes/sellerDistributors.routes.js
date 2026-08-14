import express from "express";
import { fork } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";
import { ensureUsersAdminColumns } from "../usersDb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_VALIDATOR_SCRIPT = path.join(__dirname, "../pdfImageValidator.worker.mjs");

// Valida en un proceso hijo aislado que el logo subido sea una imagen realmente
// decodificable antes de guardarla - ver el comment grande en
// pdfImageValidator.worker.mjs sobre por que no alcanza con un try/catch normal
// (un PNG corrupto puede tirar abajo el proceso de Node entero).
function validateImageDecodable(dataUrl) {
  return new Promise((resolve) => {
    let settled = false;
    const child = fork(LOGO_VALIDATOR_SCRIPT, [], { stdio: "ignore" });
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve({ ok, error });
    };
    const timer = setTimeout(() => finish(false, "Tiempo de espera agotado validando la imagen"), 8000);
    child.on("message", (msg) => finish(!!msg?.ok, msg?.error));
    child.on("error", (e) => finish(false, e?.message || "No se pudo validar la imagen"));
    child.on("exit", (code) => finish(code === 0, code === 0 ? undefined : "El archivo no es una imagen valida"));
    try {
      child.send(dataUrl);
    } catch (e) {
      finish(false, e?.message || "No se pudo validar la imagen");
    }
  });
}

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

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Mismo formato que usa el resto del presupuestador para adjuntos chicos (ver
// fileToPlegadoAttachment en el front): "data:<mime>;base64,<...>". Se valida el
// mime y un tamaño razonable para un logo de encabezado (no hace falta libreria de
// imagenes: el dibujo final en el PDF usa "fit" y no distorsiona el aspect ratio).
function validateLogoDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^data:([a-zA-Z0-9/+.-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("El logo debe ser una imagen (PNG, JPG o WEBP)");
  const [, mime, base64Body] = match;
  if (!ALLOWED_LOGO_MIME_TYPES.has(mime.toLowerCase())) throw new Error("El logo debe ser PNG, JPG o WEBP");
  const approxBytes = Math.ceil((base64Body.length * 3) / 4);
  if (approxBytes > MAX_LOGO_BYTES) throw new Error("El logo no puede superar 2 MB");
  return raw;
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
               (d.logo_data_url is not null) as has_logo,
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

  // Devuelve el logo completo (data URL) de UN distribuidor puntual - separado del
  // listado en /mine para no mandar el base64 de todos los distribuidores en cada
  // carga de la tabla (ahi solo va has_logo).
  router.get("/:id/logo", requireAuth, requireSellerOrCommercial, async (req, res, next) => {
    try {
      await ensureUsersAdminColumns();
      const distributorId = Number(req.params.id || 0);
      const sellerId = Number(req.user?.user_id || req.user?.id || 0);
      const seeAll = canSeeAllDistributors(req.user);
      if (!distributorId) return res.status(400).json({ ok: false, error: "Distribuidor invalido" });
      if (!sellerId && !seeAll) return res.status(400).json({ ok: false, error: "Usuario invalido" });

      const params = seeAll ? [distributorId] : [distributorId, sellerId];
      const ownerWhere = seeAll ? "" : "and d.assigned_seller_user_id = $2";
      const q = await dbQuery(
        `select d.logo_data_url
           from public.presupuestador_users d
          where d.id = $1
            and coalesce(d.is_distribuidor,false) = true
            ${ownerWhere}`,
        params
      );
      const row = q.rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "Distribuidor no encontrado o no asignado a tu usuario" });
      res.json({ ok: true, logo_data_url: row.logo_data_url || null });
    } catch (e) {
      next(e);
    }
  });

  router.put("/:id/logo", requireAuth, requireSellerOrCommercial, async (req, res, next) => {
    try {
      await ensureUsersAdminColumns();
      const distributorId = Number(req.params.id || 0);
      const sellerId = Number(req.user?.user_id || req.user?.id || 0);
      const seeAll = canSeeAllDistributors(req.user);
      if (!distributorId) return res.status(400).json({ ok: false, error: "Distribuidor invalido" });
      if (!sellerId && !seeAll) return res.status(400).json({ ok: false, error: "Usuario invalido" });

      let logoDataUrl;
      try {
        logoDataUrl = validateLogoDataUrl(req.body?.logo_data_url || "");
      } catch (e) {
        return res.status(400).json({ ok: false, error: e?.message || "Logo invalido" });
      }
      if (logoDataUrl) {
        const check = await validateImageDecodable(logoDataUrl);
        if (!check.ok) {
          return res.status(400).json({ ok: false, error: `El archivo no se pudo procesar como imagen (${check.error || "formato invalido"}). Probá con otro archivo.` });
        }
      }
      const params = seeAll ? [distributorId, logoDataUrl] : [distributorId, logoDataUrl, sellerId];
      const ownerWhere = seeAll ? "" : "and d.assigned_seller_user_id = $3";

      const q = await dbQuery(
        `update public.presupuestador_users d
            set logo_data_url = nullif($2::text, ''),
                updated_at = now()
          where d.id = $1
            and coalesce(d.is_distribuidor,false) = true
            ${ownerWhere}
          returning d.id, d.username, d.full_name, d.is_active, d.odoo_partner_id,
                    d.odoo_pricelist_id, d.default_maps_url, d.phone,
                    d.visible_password, d.logo_data_url, d.created_at, d.updated_at, d.assigned_seller_user_id`,
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

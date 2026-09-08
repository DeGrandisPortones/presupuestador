// Autenticación para la API de partner (ver routes/partner.routes.js): un
// distribuidor externo (ej. el sistema de un distribuidor que quiere cotizar
// contra el nuestro) se identifica con una API key propia, sin loguearse como
// usuario. Cada key mapea 1:1 a una fila de presupuestador_users con
// is_distribuidor=true, así el precio que recibe usa automáticamente SU lista
// de Odoo (odoo_pricelist_id) - no hace falta que nos pasen ningún dato
// adicional de a qué distribuidor pertenecen.
import crypto from "crypto";
import { dbQuery } from "./db.js";
import { ensureUsersAdminColumns } from "./usersDb.js";

export function hashPartnerApiKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey || ""), "utf8").digest("hex");
}

// La key nunca se guarda en texto plano: solo se muestra una vez, al generarla
// (misma lógica que un token de acceso de cualquier API de terceros).
export function generatePartnerApiKey() {
  const raw = `pk_${crypto.randomBytes(32).toString("hex")}`;
  return { raw, hash: hashPartnerApiKey(raw), prefix: raw.slice(0, 10) };
}

function extractApiKey(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return String(req.headers["x-api-key"] || "").trim();
}

export async function requirePartnerApiKey(req, res, next) {
  const key = extractApiKey(req);
  if (!key) return res.status(401).json({ ok: false, error: "Falta Authorization: Bearer <api key>" });

  try {
    await ensureUsersAdminColumns();
    const hash = hashPartnerApiKey(key);
    const r = await dbQuery(
      `select id, username, full_name, odoo_partner_id, odoo_pricelist_id, coalesce(is_active, true) as is_active
         from public.presupuestador_users
        where partner_api_key_hash = $1 and coalesce(is_distribuidor, false) = true
        limit 1`,
      [hash]
    );
    const row = r.rows?.[0] || null;
    if (!row || row.is_active === false || !row.odoo_pricelist_id) {
      return res.status(401).json({ ok: false, error: "API key inválida" });
    }

    dbQuery(`update public.presupuestador_users set partner_api_key_last_used_at = now() where id = $1`, [row.id]).catch(() => {});

    req.partnerDistributor = {
      id: Number(row.id),
      username: row.username,
      full_name: row.full_name || row.username,
      odoo_partner_id: row.odoo_partner_id ? Number(row.odoo_partner_id) : null,
      odoo_pricelist_id: Number(row.odoo_pricelist_id),
    };
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "No se pudo validar la API key" });
  }
}

// Rate limit simple en memoria, ventana deslizante de 1 minuto. Alcanza para un
// solo proceso Node (que es como corre hoy este backend); si en algún momento
// corre en varias instancias en simultáneo, esto hay que moverlo a un store
// compartido (Redis) para que el límite sea real entre instancias.
//
// Hay dos límites porque uno solo no alcanza: el límite por key sirve para un
// distribuidor real que se pasa de rosca, pero requirePartnerApiKey hace un
// select por cada key que llega (no hay forma de invalidar una key falsa sin
// mirar la base) - alguien mandando una key inventada distinta en cada request
// evitaría el límite por key y seguiría generando una consulta por intento. El
// límite por IP, que se chequea antes y no depende de si la key es válida, es
// el que corta ese caso.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS_PER_KEY = 60;
const RATE_LIMIT_MAX_REQUESTS_PER_IP = 120;
const hitsByKeyHash = new Map();
const hitsByIp = new Map();

function checkAndBumpBucket(map, bucketKey, maxRequests) {
  const now = Date.now();
  const hits = (map.get(bucketKey) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= maxRequests) return false;
  hits.push(now);
  map.set(bucketKey, hits);
  return true;
}

// Sin esto, una IP o key vista una sola vez se queda para siempre en el Map (el
// array queda vacío, pero la entrada no) - en un endpoint público eso es una
// fuga de memoria lenta. Barre cada 10' lo que ya no tiene hits recientes.
setInterval(() => {
  const now = Date.now();
  for (const map of [hitsByKeyHash, hitsByIp]) {
    for (const [bucketKey, hits] of map.entries()) {
      if (!hits.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) map.delete(bucketKey);
    }
  }
}, 10 * 60 * 1000).unref();

export function partnerRateLimit(req, res, next) {
  if (!checkAndBumpBucket(hitsByIp, req.ip || "unknown", RATE_LIMIT_MAX_REQUESTS_PER_IP)) {
    return res.status(429).json({ ok: false, error: "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo." });
  }

  const key = extractApiKey(req);
  if (!key) return next(); // requirePartnerApiKey ya va a rechazar esto después
  const hash = hashPartnerApiKey(key);
  if (!checkAndBumpBucket(hitsByKeyHash, hash, RATE_LIMIT_MAX_REQUESTS_PER_KEY)) {
    return res.status(429).json({ ok: false, error: "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo." });
  }
  next();
}

import express from "express";
import axios from "axios";
import { requireAuth } from "../auth.js";

// URL base de la app Informe (ventas-api), que ya calcula las comisiones de
// vendedores a partir de Odoo + esta misma base de datos. Presupuestador solo
// consulta y filtra por el vendedor logueado, no reimplementa el cálculo.
const INFORMES_API_BASE = String(
  process.env.INFORMES_API_BASE || "https://informesdgportones-vp3y.onrender.com",
).replace(/\/+$/, "");

function isVendedorUser(user) {
  return !!(user?.is_vendedor && !user?.is_distribuidor);
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Flavio cobra mensual (tramos 1-12/13-20/21+), el resto de vendedoras
// quincenal (tramos 1-6/7-10/11+ por cada mitad del mes). Ver api/src/index.js
// de la app Informe (function portonRate) para la fuente de esta regla.
function isFlavio(fullName) {
  return /flavio/i.test(String(fullName || ""));
}

function currentYyyyMm(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentQuincena(date = new Date()) {
  return date.getDate() <= 15 ? "first" : "second";
}

async function fetchComisionesFromInformes({ month, mode, period }) {
  const params = { month, mode };
  if (period && period !== "full") params.period = period;
  const { data } = await axios.get(`${INFORMES_API_BASE}/comisiones`, { params, timeout: 20000 });
  if (!data?.ok) throw new Error(data?.error || "No se pudo obtener las comisiones");
  return data;
}

function emptyCommissionSummary() {
  return {
    seller_name: null,
    porton_count: 0,
    porton_count_dist: 0,
    porton_count_vend: 0,
    total_commission_ars: 0,
    matched: false,
    invoices: [],
  };
}

export function buildCommissionsRouter() {
  const router = express.Router();

  router.use(requireAuth);

  router.get("/mine", async (req, res, next) => {
    try {
      if (!isVendedorUser(req.user)) return res.status(403).json({ ok: false, error: "No autorizado" });

      const fullName = String(req.user?.full_name || "").trim();
      if (!fullName) {
        return res.json({
          ok: true,
          month: currentYyyyMm(),
          mode: "vendido",
          period: "full",
          is_flavio: false,
          ...emptyCommissionSummary(),
          reason: "Tu usuario no tiene nombre completo cargado; pedile a un superusuario que lo complete para poder calcular tu comisión.",
        });
      }

      const flavio = isFlavio(fullName);
      const month = /^\d{4}-\d{2}$/.test(String(req.query?.month || "")) ? String(req.query.month) : currentYyyyMm();
      // "vendido" (default): suma NP/NV ya generadas aunque todavia no esten
      // facturadas, para que el vendedor vea su comision estimada apenas vende,
      // sin esperar a que Administracion facture (ver app Informe, mode=vendido).
      const mode = ["facturado", "vendido", "pagado"].includes(req.query?.mode) ? req.query.mode : "vendido";
      const period = flavio
        ? "full"
        : (["first", "second"].includes(req.query?.period) ? req.query.period : currentQuincena());

      const data = await fetchComisionesFromInformes({ month, mode, period });
      const target = normalizeName(fullName);
      const match = (data.results || []).find((r) => normalizeName(r.seller_name) === target);

      return res.json({
        ok: true,
        month,
        mode,
        period,
        is_flavio: flavio,
        ...(match
          ? {
              seller_name: match.seller_name,
              porton_count: Number(match.porton_count || 0),
              porton_count_dist: Number(match.porton_count_dist || 0),
              porton_count_vend: Number(match.porton_count_vend || 0),
              total_commission_ars: Number(match.total_commission_ars || 0),
              matched: true,
              invoices: Array.isArray(match.invoices) ? match.invoices : [],
            }
          : emptyCommissionSummary()),
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

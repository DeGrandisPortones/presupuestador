import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";

const TACA_TACA_PLAN_NAME = String(process.env.ODOO_TACA_TACA_PLAN_NAME || "Taca Taca").trim();
const CASH_PAYMENT_METHOD = "EFECTIVO";
const TRANSFER_PAYMENT_METHOD = "TRANSFERENCIA";
const LEGACY_CASH_TRANSFER_PAYMENT_METHOD = "EFECTIVO - TRANSFERENCIA";

const DEFAULT_PAYMENT_METHODS = [
  "CHEQUE 0 - 30 - 60",
  "CHEQUE 0 - 30 - 60 - 90 -120",
  "CORDOBESA 10 CUOTAS",
  "CORDOBESA 14 CUOTAS",
  "CORDOBESA 18 CUOTAS",
  "CORDOBESA 4 CUOTAS",
  "CORDOBESA 6 CUOTAS",
  "CUENTA CORRIENTE",
  CASH_PAYMENT_METHOD,
  TRANSFER_PAYMENT_METHOD,
  "NARANJA 12 CUOTAS",
  "NARANJA 3 CUOTAS",
  "NARANJA 6 CUOTAS",
  "OTRAS TC BANC 3 CUOTAS",
  "OTRAS TC BANC 6 CUOTAS",
];
const MULTIPLE_PAYMENT_METHOD = "PAGO MÚLTIPLE";
const DEFAULT_PAYMENT_METHOD_BY_KEY = new Map(DEFAULT_PAYMENT_METHODS.map((method) => [normalizePaymentMethodKey(method), method]));

function requireEncComercialOrSuperuser(req, res, next) {
  if (!req.user?.is_enc_comercial && !req.user?.is_superuser) {
    return res.status(403).json({ ok: false, error: "No autorizado" });
  }
  next();
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function toIntId(v) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : null;
}
function normalizePaymentMethodKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function isMultiplePaymentMethod(value) {
  return normalizePaymentMethodKey(value).startsWith("PAGO MULTIPLE");
}
function isCashPaymentMethod(value) {
  return normalizePaymentMethodKey(value) === normalizePaymentMethodKey(CASH_PAYMENT_METHOD);
}
function isLegacyCashTransferPaymentMethod(value) {
  return normalizePaymentMethodKey(value) === normalizePaymentMethodKey(LEGACY_CASH_TRANSFER_PAYMENT_METHOD);
}
function isVisibleSavedPaymentMethod(value) {
  return !isLegacyCashTransferPaymentMethod(value);
}
function buildSavedMaps(saved = []) {
  const byStableKey = new Map();
  const byDisplayKey = new Map();
  for (const row of Array.isArray(saved) ? saved : []) {
    const stableKey = normalizePaymentMethodKey(row?.payment_method_key || row?.payment_method);
    const displayKey = normalizePaymentMethodKey(row?.payment_method);
    if (stableKey) byStableKey.set(stableKey, row);
    if (displayKey && isVisibleSavedPaymentMethod(row?.payment_method)) byDisplayKey.set(displayKey, row);
  }
  return { byStableKey, byDisplayKey };
}
function getSavedRowFromMaps(maps, paymentMethodOrKey) {
  const key = normalizePaymentMethodKey(paymentMethodOrKey);
  if (!key || !maps) return null;
  const direct = maps.byStableKey?.get(key);
  if (direct) return direct;
  const byName = maps.byDisplayKey?.get(key);
  if (byName) return byName;
  if (isCashPaymentMethod(paymentMethodOrKey)) {
    return maps.byStableKey?.get(normalizePaymentMethodKey(LEGACY_CASH_TRANSFER_PAYMENT_METHOD)) || null;
  }
  return null;
}
function buildPaymentMethodEntries(saved = []) {
  const maps = buildSavedMaps(saved);
  const defaultKeys = new Set(DEFAULT_PAYMENT_METHODS.map(normalizePaymentMethodKey));
  const usedStableKeys = new Set();
  const entries = [];

  for (const defaultMethod of DEFAULT_PAYMENT_METHODS) {
    const stableKey = normalizePaymentMethodKey(defaultMethod);
    const row = maps.byStableKey.get(stableKey) || null;
    const displayName = row?.payment_method && isVisibleSavedPaymentMethod(row.payment_method)
      ? row.payment_method
      : defaultMethod;
    entries.push({ stableKey, paymentMethod: displayName, row });
    usedStableKeys.add(stableKey);
  }

  for (const row of saved) {
    if (!row?.payment_method || !isVisibleSavedPaymentMethod(row.payment_method)) continue;
    const stableKey = normalizePaymentMethodKey(row.payment_method_key || row.payment_method);
    if (!stableKey || usedStableKeys.has(stableKey) || defaultKeys.has(stableKey)) continue;
    entries.push({ stableKey, paymentMethod: row.payment_method, row });
    usedStableKeys.add(stableKey);
  }

  return entries;
}
function parseTacaTacaPaymentMethod(paymentMethod) {
  const raw = String(paymentMethod || "").trim();
  const normalized = normalizePaymentMethodKey(raw);
  if (!normalized) return null;

  let cardType = "";
  if (normalized.startsWith("CORDOBESA")) cardType = "cordobesa";
  else if (normalized.startsWith("NARANJA")) cardType = "naranja";
  else if (normalized.startsWith("OTRAS TC BANC") || normalized.startsWith("OTRAS")) cardType = "otras";
  if (!cardType) return null;

  const installmentsMatch = normalized.match(/\b(\d{1,2})\b/);
  const installments = installmentsMatch ? Number(installmentsMatch[1]) : null;
  if (!Number.isFinite(installments) || installments <= 0) return null;

  return { raw, normalized, cardType, installments };
}
function cleanPercent(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return round2(Math.max(-100, n));
}
function parseMultiplePaymentComponents(paymentMethod) {
  const raw = String(paymentMethod || "").trim();
  if (!isMultiplePaymentMethod(raw)) return null;
  const matches = [...raw.matchAll(/\[([^\]]+)\]\s*([0-9.,]+)\s*%/g)];
  if (!matches.length) return [];
  return matches
    .map((m) => ({
      payment_method: String(m[1] || "").trim(),
      share_percent: cleanPercent(m[2]),
    }))
    .filter((x) => x.payment_method && x.share_percent > 0);
}

let financingRateFieldCache = undefined;
async function resolveFinancingRateFieldMeta(odoo) {
  if (financingRateFieldCache !== undefined) return financingRateFieldCache;
  try {
    const fields = await odoo.executeKw("sale.financing.rate", "fields_get", [], { attributes: ["type"] });
    financingRateFieldCache = {
      planField: fields?.plan_id ? "plan_id" : null,
      cardTypeField: fields?.card_type ? "card_type" : null,
      installmentsField: fields?.installments ? "installments" : (fields?.cuotas ? "cuotas" : null),
      percentField: fields?.rate_percent ? "rate_percent" : (fields?.percent ? "percent" : null),
      activeField: fields?.active ? "active" : null,
    };
    return financingRateFieldCache;
  } catch {
    financingRateFieldCache = null;
    return financingRateFieldCache;
  }
}

let tacaTacaPlanIdCache = undefined;
async function resolveTacaTacaPlanId(odoo) {
  if (tacaTacaPlanIdCache !== undefined) return tacaTacaPlanIdCache;
  try {
    let ids = await odoo.executeKw("sale.financing.plan", "search", [[["name", "=", TACA_TACA_PLAN_NAME]]], { limit: 1 });
    let id = toIntId(ids?.[0]);
    if (!id) {
      ids = await odoo.executeKw("sale.financing.plan", "search", [[["name", "ilike", TACA_TACA_PLAN_NAME]]], { limit: 1 });
      id = toIntId(ids?.[0]);
    }
    tacaTacaPlanIdCache = id || null;
    return tacaTacaPlanIdCache;
  } catch {
    tacaTacaPlanIdCache = null;
    return tacaTacaPlanIdCache;
  }
}

async function resolveTacaTacaRate(odoo, { planId, cardType, installments }) {
  const meta = await resolveFinancingRateFieldMeta(odoo);
  if (!meta?.planField || !meta?.cardTypeField || !meta?.installmentsField) return null;

  const baseDomain = [
    [meta.planField, "=", Number(planId)],
    [meta.cardTypeField, "=", String(cardType)],
    [meta.installmentsField, "=", Number(installments)],
  ];
  const fields = ["id", meta.planField, meta.cardTypeField, meta.installmentsField, meta.percentField].filter(Boolean);

  try {
    let domain = baseDomain.slice();
    if (meta.activeField) domain.push([meta.activeField, "=", true]);

    let rows = await odoo.executeKw("sale.financing.rate", "search_read", [domain], { fields, limit: 1, order: "id desc" });
    let rate = rows?.[0] || null;
    if (!rate) {
      rows = await odoo.executeKw("sale.financing.rate", "search_read", [baseDomain], { fields, limit: 1, order: "id desc" });
      rate = rows?.[0] || null;
    }
    return rate;
  } catch {
    return null;
  }
}

async function ensureFinancingSettingsTable() {
  await dbQuery(`
    create table if not exists public.presupuestador_financing_settings (
      payment_method_key text primary key,
      payment_method text not null,
      percent numeric not null default 0,
      active boolean not null default true,
      updated_at timestamptz not null default now(),
      updated_by integer null
    )
  `);
}

async function listSavedSettings() {
  await ensureFinancingSettingsTable();
  const r = await dbQuery(`select payment_method_key, payment_method, percent, active from public.presupuestador_financing_settings order by payment_method asc`);
  return r.rows || [];
}

async function getSavedSettingByKey(key) {
  const normalizedKey = normalizePaymentMethodKey(key);
  if (!normalizedKey) return null;
  const r = await dbQuery(`select payment_method_key, payment_method, percent, active from public.presupuestador_financing_settings where payment_method_key=$1 limit 1`, [normalizedKey]);
  return r.rows?.[0] || null;
}

async function getSavedSetting(paymentMethod) {
  await ensureFinancingSettingsTable();
  const key = normalizePaymentMethodKey(paymentMethod);
  if (!key) return null;

  const direct = await getSavedSettingByKey(key);
  if (direct) return direct;

  const saved = await listSavedSettings();
  const maps = buildSavedMaps(saved);
  const byDisplayName = maps.byDisplayKey.get(key);
  if (byDisplayName) return byDisplayName;

  // La opción vieja "EFECTIVO - TRANSFERENCIA" se conserva como respaldo sólo para EFECTIVO.
  // Así el descuento ya cargado (por ejemplo -5%) no se pierde al separar Transferencia.
  if (isCashPaymentMethod(paymentMethod)) {
    return await getSavedSettingByKey(LEGACY_CASH_TRANSFER_PAYMENT_METHOD);
  }

  return null;
}

async function resolveOdooPreview(odoo, paymentMethod) {
  const parsed = parseTacaTacaPaymentMethod(paymentMethod);
  if (!parsed) {
    return {
      applies_financing: false,
      percent: 0,
      card_type: null,
      installments: null,
      plan_id: null,
      rate_id: null,
      payment_method: paymentMethod,
      source: "none",
    };
  }

  const planId = await resolveTacaTacaPlanId(odoo);
  if (!planId) {
    return {
      applies_financing: false,
      percent: 0,
      card_type: parsed.cardType,
      installments: parsed.installments,
      plan_id: null,
      rate_id: null,
      payment_method: paymentMethod,
      source: "odoo",
    };
  }

  const rate = await resolveTacaTacaRate(odoo, { planId, cardType: parsed.cardType, installments: parsed.installments });
  const meta = await resolveFinancingRateFieldMeta(odoo);
  const rawPercent = meta?.percentField ? rate?.[meta.percentField] : null;
  const percent = cleanPercent(rawPercent);

  return {
    applies_financing: !!rate?.id && percent > 0,
    percent,
    card_type: parsed.cardType,
    installments: parsed.installments,
    plan_id: Number(planId) || null,
    rate_id: toIntId(rate?.id),
    payment_method: paymentMethod,
    source: "odoo",
  };
}

async function resolveSingleEffectivePreview(odoo, paymentMethod) {
  const method = String(paymentMethod || "").trim();
  if (!method) {
    return {
      ok: true,
      applies_financing: false,
      percent: 0,
      card_type: null,
      installments: null,
      plan_id: null,
      rate_id: null,
      payment_method: "",
      source: "none",
    };
  }

  const saved = await getSavedSetting(method);
  const odooPreview = await resolveOdooPreview(odoo, method);
  if (saved) {
    const percent = saved.active === false ? 0 : cleanPercent(saved.percent);
    return {
      ok: true,
      ...odooPreview,
      applies_financing: percent !== 0,
      percent,
      payment_method: method,
      source: "config",
      config_active: saved.active !== false,
      odoo_percent: odooPreview.percent || 0,
    };
  }
  return { ok: true, ...odooPreview, odoo_percent: odooPreview.percent || 0 };
}

async function resolveMultiplePreview(odoo, paymentMethod) {
  const components = parseMultiplePaymentComponents(paymentMethod) || [];
  const shareTotal = round2(components.reduce((acc, x) => acc + Number(x.share_percent || 0), 0));
  if (!components.length || Math.abs(shareTotal - 100) > 0.01) {
    return {
      ok: true,
      applies_financing: false,
      percent: 0,
      payment_method: paymentMethod,
      source: "multiple",
      multiple_valid: false,
      multiple_share_total: shareTotal,
      components,
    };
  }

  const resolved = [];
  let weighted = 0;
  for (const component of components) {
    const preview = await resolveSingleEffectivePreview(odoo, component.payment_method);
    const componentPercent = cleanPercent(preview?.percent || 0);
    const contribution = round2((Number(component.share_percent || 0) / 100) * componentPercent);
    weighted += contribution;
    resolved.push({
      payment_method: component.payment_method,
      share_percent: component.share_percent,
      financing_percent: componentPercent,
      weighted_percent: contribution,
      source: preview?.source || "none",
    });
  }

  const percent = round2(weighted);
  return {
    ok: true,
    applies_financing: percent !== 0,
    percent,
    payment_method: paymentMethod,
    source: "multiple",
    multiple_valid: true,
    multiple_share_total: shareTotal,
    components: resolved,
  };
}

async function resolveEffectivePreview(odoo, paymentMethod) {
  const method = String(paymentMethod || "").trim();
  if (isMultiplePaymentMethod(method)) return resolveMultiplePreview(odoo, method);
  return resolveSingleEffectivePreview(odoo, method);
}

async function buildMethodsResponse(odoo) {
  const saved = await listSavedSettings();
  const defaultKeys = DEFAULT_PAYMENT_METHODS.map(normalizePaymentMethodKey);
  const methods = [];

  for (const entry of buildPaymentMethodEntries(saved)) {
    const paymentMethod = entry.paymentMethod;
    const key = entry.stableKey;
    const row = entry.row || null;
    const odooPreview = await resolveOdooPreview(odoo, paymentMethod);
    const percent = row ? (row.active === false ? 0 : cleanPercent(row.percent)) : odooPreview.percent;
    methods.push({
      payment_method: paymentMethod,
      payment_method_key: key,
      percent: cleanPercent(percent),
      saved_percent: row ? cleanPercent(row.percent) : null,
      active: row ? row.active !== false : true,
      has_override: !!row,
      source: row ? "config" : "odoo",
      odoo_percent: cleanPercent(odooPreview.percent),
      applies_financing: cleanPercent(percent) !== 0,
      card_type: odooPreview.card_type,
      installments: odooPreview.installments,
      plan_id: odooPreview.plan_id,
      rate_id: odooPreview.rate_id,
      is_custom: !defaultKeys.includes(key),
    });
  }

  methods.sort((a, b) => String(a.payment_method).localeCompare(String(b.payment_method), "es"));
  return methods;
}

export function buildFinancingSettingsRouter(odoo) {
  const router = express.Router();

  router.get("/preview", requireAuth, async (req, res, next) => {
    try {
      res.json(await resolveEffectivePreview(odoo, String(req.query.payment_method || "")));
    } catch (e) { next(e); }
  });

  router.get("/payment-methods", requireAuth, async (_req, res, next) => {
    try {
      const saved = await listSavedSettings();
      const methodNames = [MULTIPLE_PAYMENT_METHOD, ...buildPaymentMethodEntries(saved).map((entry) => entry.paymentMethod)];
      methodNames.sort((a, b) => String(a).localeCompare(String(b), "es"));
      res.json({ ok: true, payment_methods: methodNames });
    } catch (e) { next(e); }
  });

  router.get("/", requireAuth, requireEncComercialOrSuperuser, async (_req, res, next) => {
    try {
      const methods = await buildMethodsResponse(odoo);
      res.json({ ok: true, methods });
    } catch (e) { next(e); }
  });

  router.put("/", requireAuth, requireEncComercialOrSuperuser, async (req, res, next) => {
    try {
      await ensureFinancingSettingsTable();
      const methods = Array.isArray(req.body?.methods) ? req.body.methods : [];
      const seenKeys = new Set();
      const seenNames = new Set();
      for (const item of methods) {
        let paymentMethod = String(item?.payment_method || "").trim().replace(/\s+/g, " ");
        const displayKey = normalizePaymentMethodKey(paymentMethod);
        const requestedStableKey = normalizePaymentMethodKey(item?.payment_method_key || "");
        const stableKey = requestedStableKey || displayKey;
        if (!stableKey || !displayKey || seenKeys.has(stableKey) || seenNames.has(displayKey) || isMultiplePaymentMethod(paymentMethod) || isLegacyCashTransferPaymentMethod(paymentMethod)) continue;

        const existing = await getSavedSettingByKey(stableKey);
        const defaultName = DEFAULT_PAYMENT_METHOD_BY_KEY.get(stableKey) || null;
        const previousName = existing?.payment_method || defaultName || null;
        if (!req.user?.is_superuser) {
          if (!previousName) throw new Error("Solo el superusuario puede agregar nuevas formas de pago.");
          if (normalizePaymentMethodKey(previousName) !== displayKey) throw new Error("Solo el superusuario puede editar nombres de formas de pago.");
          paymentMethod = previousName;
        }

        seenKeys.add(stableKey);
        seenNames.add(displayKey);
        await dbQuery(`
          insert into public.presupuestador_financing_settings (payment_method_key, payment_method, percent, active, updated_at, updated_by)
          values ($1, $2, $3, $4, now(), $5)
          on conflict (payment_method_key) do update set
            payment_method = excluded.payment_method,
            percent = excluded.percent,
            active = excluded.active,
            updated_at = now(),
            updated_by = excluded.updated_by
        `, [stableKey, paymentMethod, cleanPercent(item?.percent), item?.active !== false, req.user?.user_id || null]);
      }

      const out = await buildMethodsResponse(odoo);
      res.json({ ok: true, methods: out });
    } catch (e) { next(e); }
  });

  return router;
}

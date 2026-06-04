import express from "express";
import { requireAuth } from "../auth.js";
import { dbQuery } from "../db.js";

const TACA_TACA_PLAN_NAME = String(process.env.ODOO_TACA_TACA_PLAN_NAME || "Taca Taca").trim();
const CASH_PAYMENT_METHOD = "EFECTIVO";
const TRANSFER_PAYMENT_METHOD = "TRANSFERENCIA";
const LEGACY_CASH_TRANSFER_PAYMENT_METHOD = "EFECTIVO - TRANSFERENCIA";

const DEFAULT_PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Cta Cte",
  "Cheques 30",
  "Cheques 0 - 30 - 60 - 90 - 120",
  "Cheques 0 - 30 - 60 - 90 - 120 - 150 - 180",
  "CORDOBESA 4 CUOTAS",
  "CORDOBESA 6 CUOTAS",
  "CORDOBESA 10 CUOTAS",
  "CORDOBESA 12 CUOTAS",
  "CORDOBESA 14 CUOTAS",
  "CORDOBESA 18 CUOTAS",
  "NARANJA 3 CUOTAS",
  "NARANJA 6 CUOTAS",
  "NARANJA 12 CUOTAS",
  "OTRAS TC BANC 3 CUOTAS",
  "OTRAS TC BANC 6 CUOTAS",
];
const MULTIPLE_PAYMENT_METHOD = "Pago Multiple";

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
function defaultPercentOverride(paymentMethod) {
  const key = normalizePaymentMethodKey(paymentMethod);
  if (key === normalizePaymentMethodKey("CORDOBESA 12 CUOTAS")) return 24;
  return null;
}
function methodKeyAliases(value) {
  const key = normalizePaymentMethodKey(value);
  const aliases = [key];
  if (key.startsWith("CHEQUES ")) aliases.push(key.replace(/^CHEQUES /, "CHEQUE "));
  if (key.startsWith("CHEQUE ")) aliases.push(key.replace(/^CHEQUE /, "CHEQUES "));
  return [...new Set(aliases.filter(Boolean))];
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
function cleanPaymentMethodName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}
function defaultMethodKeys() {
  return DEFAULT_PAYMENT_METHODS.map((method) => normalizePaymentMethodKey(method));
}
function defaultMethodKeySet() {
  return new Set(defaultMethodKeys());
}
function getSavedRowFromMap(byKey, paymentMethod) {
  if (!byKey) return null;
  for (const key of methodKeyAliases(paymentMethod)) {
    const direct = byKey.get(key);
    if (direct) return direct;
  }
  if (isCashPaymentMethod(paymentMethod)) {
    return byKey.get(normalizePaymentMethodKey(LEGACY_CASH_TRANSFER_PAYMENT_METHOD)) || null;
  }
  return null;
}
function getSavedDisplayName(row, fallback) {
  const name = cleanPaymentMethodName(row?.payment_method);
  return name && isVisibleSavedPaymentMethod(name) ? name : fallback;
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

function findSavedSettingByDisplayName(saved, paymentMethod) {
  const keys = methodKeyAliases(paymentMethod);
  if (!keys.length) return null;
  return (saved || []).find((row) => isVisibleSavedPaymentMethod(row?.payment_method) && keys.includes(normalizePaymentMethodKey(row?.payment_method))) || null;
}

async function getSavedSetting(paymentMethod) {
  await ensureFinancingSettingsTable();
  const key = normalizePaymentMethodKey(paymentMethod);
  if (!key) return null;

  const saved = await listSavedSettings();

  const byDisplayName = findSavedSettingByDisplayName(saved, paymentMethod);
  if (byDisplayName) return byDisplayName;

  for (const aliasKey of methodKeyAliases(paymentMethod)) {
    const direct = await getSavedSettingByKey(aliasKey);
    if (direct) return direct;
  }

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

  const defaultPercent = defaultPercentOverride(method);
  if (defaultPercent !== null) {
    const percent = cleanPercent(defaultPercent);
    return {
      ok: true,
      ...odooPreview,
      applies_financing: percent !== 0,
      percent,
      payment_method: method,
      source: "default",
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
  const byKey = new Map(saved.map((row) => [normalizePaymentMethodKey(row.payment_method_key || row.payment_method), row]));
  const defaultKeys = defaultMethodKeys();
  const defaultKeySet = new Set(defaultKeys);
  const methods = [];

  for (const defaultPaymentMethod of DEFAULT_PAYMENT_METHODS) {
    const key = normalizePaymentMethodKey(defaultPaymentMethod);
    const row = getSavedRowFromMap(byKey, defaultPaymentMethod);
    const displayName = row ? getSavedDisplayName(row, defaultPaymentMethod) : defaultPaymentMethod;
    const odooPreview = await resolveOdooPreview(odoo, displayName);
    const defaultPercent = defaultPercentOverride(defaultPaymentMethod);
    const percent = row ? (row.active === false ? 0 : cleanPercent(row.percent)) : (defaultPercent !== null ? defaultPercent : odooPreview.percent);
    methods.push({
      payment_method: displayName,
      payment_method_key: key,
      default_payment_method: defaultPaymentMethod,
      percent: cleanPercent(percent),
      saved_percent: row ? cleanPercent(row.percent) : (defaultPercent !== null ? cleanPercent(defaultPercent) : null),
      active: row ? row.active !== false : true,
      has_override: !!row || defaultPercent !== null,
      source: row ? "config" : (defaultPercent !== null ? "default" : "odoo"),
      odoo_percent: cleanPercent(odooPreview.percent),
      applies_financing: cleanPercent(percent) !== 0,
      card_type: odooPreview.card_type,
      installments: odooPreview.installments,
      plan_id: odooPreview.plan_id,
      rate_id: odooPreview.rate_id,
      is_custom: false,
      is_default: true,
    });
  }

  for (const row of saved) {
    const key = normalizePaymentMethodKey(row.payment_method_key || row.payment_method);
    const displayName = getSavedDisplayName(row, "");
    if (!key || !displayName || defaultKeySet.has(key) || isMultiplePaymentMethod(displayName) || isLegacyCashTransferPaymentMethod(displayName)) continue;
    const odooPreview = await resolveOdooPreview(odoo, displayName);
    const percent = row.active === false ? 0 : cleanPercent(row.percent);
    methods.push({
      payment_method: displayName,
      payment_method_key: key,
      default_payment_method: null,
      percent: cleanPercent(percent),
      saved_percent: cleanPercent(row.percent),
      active: row.active !== false,
      has_override: true,
      source: "config",
      odoo_percent: cleanPercent(odooPreview.percent),
      applies_financing: cleanPercent(percent) !== 0,
      card_type: odooPreview.card_type,
      installments: odooPreview.installments,
      plan_id: odooPreview.plan_id,
      rate_id: odooPreview.rate_id,
      is_custom: true,
      is_default: false,
    });
  }

  return methods;
}

async function buildPaymentMethodNames() {
  const saved = await listSavedSettings();
  const byKey = new Map(saved.map((row) => [normalizePaymentMethodKey(row.payment_method_key || row.payment_method), row]));
  const defaultKeySet = defaultMethodKeySet();
  const names = [MULTIPLE_PAYMENT_METHOD];

  for (const defaultPaymentMethod of DEFAULT_PAYMENT_METHODS) {
    const row = getSavedRowFromMap(byKey, defaultPaymentMethod);
    names.push(row ? getSavedDisplayName(row, defaultPaymentMethod) : defaultPaymentMethod);
  }

  for (const row of saved) {
    const key = normalizePaymentMethodKey(row.payment_method_key || row.payment_method);
    const displayName = getSavedDisplayName(row, "");
    if (!key || !displayName || defaultKeySet.has(key) || isMultiplePaymentMethod(displayName) || isLegacyCashTransferPaymentMethod(displayName)) continue;
    names.push(displayName);
  }

  return [...new Set(names.filter(Boolean))];
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
      const paymentMethods = await buildPaymentMethodNames();
      paymentMethods.sort((a, b) => {
        if (isMultiplePaymentMethod(a)) return -1;
        if (isMultiplePaymentMethod(b)) return 1;
        return String(a).localeCompare(String(b), "es");
      });
      res.json({ ok: true, payment_methods: paymentMethods });
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
      for (const item of methods) {
        const paymentMethod = cleanPaymentMethodName(item?.payment_method);
        const existingKey = normalizePaymentMethodKey(item?.payment_method_key || item?.default_payment_method || "");
        const key = existingKey || normalizePaymentMethodKey(paymentMethod);
        if (!key || !paymentMethod || seenKeys.has(key) || isMultiplePaymentMethod(paymentMethod) || isLegacyCashTransferPaymentMethod(paymentMethod)) continue;
        seenKeys.add(key);
        await dbQuery(`
          insert into public.presupuestador_financing_settings (payment_method_key, payment_method, percent, active, updated_at, updated_by)
          values ($1, $2, $3, $4, now(), $5)
          on conflict (payment_method_key) do update set
            payment_method = excluded.payment_method,
            percent = excluded.percent,
            active = excluded.active,
            updated_at = now(),
            updated_by = excluded.updated_by
        `, [key, paymentMethod, cleanPercent(item?.percent), item?.active !== false, req.user?.user_id || null]);
      }

      const out = await buildMethodsResponse(odoo);
      res.json({ ok: true, methods: out });
    } catch (e) { next(e); }
  });

  return router;
}

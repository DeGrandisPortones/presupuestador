import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import Input from "../../../ui/Input";
import { downloadPlegadoAttachment, fileToPlegadoAttachment, formatPlegadoAttachmentMeta, getPlegadoAttachment, openPlegadoAttachment } from "../../../utils/plegadoAttachment.js";

const WIDTH_MIN_M = 2.4;
const WIDTH_MAX_M = 7;
const HEIGHT_MIN_M = 2;
const HEIGHT_MAX_M = 3;
const PORTON_MAX_WEIGHT_KG = 350;
const IPANEL_WIDTH_MAX_M = 1.16;
const IPANEL_HEIGHT_MAX_M = 2.45;
const IPANEL_LAMAS_WIDTH_MAX_M = 2;
const IPANEL_LAMAS_HEIGHT_MAX_M = 3;
const IPANEL_LAMAS_22_PRODUCT_IDS = new Set([4061, 3590]);
const IPANEL_DIVIDER_LINE_MM = 10;
const PARANTES_SPECIAL_PRODUCT_ID = 3006;
const APTOS_PARA_REVESTIR_TYPE = "para_revestir_con_al_pvc_otros";
const DEFAULT_PARANTES_TUBE_DISCOUNT_MM = 40;
const DOOR_FIXED_PARANTE_DISTANCE_MM = 825;
const VANO_BEHIND_PRODUCT_ID = 3022;
const VANO_INSIDE_PRODUCT_ID = 3023;
const VANO_PLACEMENT_PRODUCT_IDS = new Set([VANO_BEHIND_PRODUCT_ID, VANO_INSIDE_PRODUCT_ID]);
const VANO_REAR_PLACEMENT_LABELS = {
  [VANO_BEHIND_PRODUCT_ID]: "Por detras del vano",
  [VANO_INSIDE_PRODUCT_ID]: "Dentro del vano",
};
const VANO_WIDTH_ADD_BY_LEGS_MM_DEFAULT = {
  angostas: 140,
  comunes: 200,
  anchas: 280,
  superanchas: 380,
};
const VANO_HEIGHT_ADD_MM_DEFAULT = 100;
// "Revestimiento especial x m2": al elegirlo pide los kg/m2 al vendedor (ver SectionCatalog.jsx)
// y ese valor reemplaza el peso calculado del porton (define tipo de piernas y medidas de paso/hoja).
const REVESTIMIENTO_ESPECIAL_PRODUCT_ID = 4176;
const ORDINAL_LABELS = ["primer", "segundo", "tercer", "cuarto", "quinto", "sexto", "septimo", "octavo", "noveno", "decimo"];
const SURFACE_PARAMETERS_STORAGE_KEY = "presupuestador:technical_surface_parameters:porton";

function readStoredSurfaceParameters() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    const raw = window.localStorage.getItem(SURFACE_PARAMETERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function parseOptionalNumber(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toNumber(v) { const n = parseOptionalNumber(v); return Number.isFinite(n) ? n : 0; }
function normalizeDecimal(v) { return String(v ?? "").replace(/[^0-9.,]/g, ""); }
function normalizeDecimalWithDot(v) { return normalizeDecimal(v).replace(",", "."); }
function normalizeIntegerInput(v) { return String(v ?? "").replace(/\D+/g, ""); }
function normalizeIpanelDivisionsInput(v, max = 18) {
  const raw = normalizeIntegerInput(v);
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  const safeMax = Math.max(2, Math.trunc(Number(max) || 18));
  return String(Math.min(safeMax, Math.max(0, Math.trunc(n))));
}
function clampIpanelDivisions(v, max = 18) {
  const raw = normalizeIntegerInput(v);
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  const safeMax = Math.max(2, Math.trunc(Number(max) || 18));
  return String(Math.min(safeMax, Math.max(2, Math.trunc(n))));
}
function normalizeIpanelLamasOrientation(value) {
  const raw = norm(value);
  if (raw.includes("vert")) return "vertical";
  if (raw.includes("horiz")) return "horizontal";
  return "horizontal";
}
function getIpanelDivisionsMaxByOrientation(value) {
  return normalizeIpanelLamasOrientation(value) === "vertical" ? 7 : 18;
}
function isIpanelDivisionsOutOfBounds(v, max = 18) {
  const raw = String(v ?? "").trim();
  if (!raw) return false;
  const n = Number(raw);
  const safeMax = Math.max(2, Math.trunc(Number(max) || 18));
  return !Number.isFinite(n) || n < 2 || n > safeMax || !Number.isInteger(n);
}
function sanitizeIpanelSectionSizes(value, count = 0) {
  const list = Array.isArray(value) ? value : [];
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  return list.slice(0, safeCount).map((item) => normalizeDecimalMmInput(item));
}
function roundMm(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
function round4(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}
function getIpanelAxisDimensionMm({ orientation, widthM, heightM }) {
  const isVertical = normalizeIpanelLamasOrientation(orientation) === "vertical";
  const axisMeters = isVertical ? Number(widthM || 0) : Number(heightM || 0);
  const axisMm = axisMeters > 0 ? axisMeters * 1000 : 0;
  return roundMm(Math.max(0, axisMm));
}
function buildUniformIpanelSectionSizes({ count, axisDimensionMm, dividerMm = IPANEL_DIVIDER_LINE_MM }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (!safeCount) return [];
  const safeDivider = Math.max(0, Number(dividerMm || 0));
  const freeSpan = roundMm(Math.max(0, Number(axisDimensionMm || 0) - Math.max(0, safeCount - 1) * safeDivider));
  if (!freeSpan) return Array.from({ length: safeCount }, () => "");
  const base = roundMm(freeSpan / safeCount);
  const values = [];
  let used = 0;
  for (let index = 0; index < safeCount; index += 1) {
    const remaining = roundMm(freeSpan - used);
    const next = index === safeCount - 1 ? remaining : Math.min(base, remaining);
    values.push(formatNumberForInput(next));
    used = roundMm(used + next);
  }
  return values;
}
function computeIpanelSectionMetrics({ values, count, axisDimensionMm, dividerMm = IPANEL_DIVIDER_LINE_MM, dividersIncludedInSectionSizes = false }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  const safeDivider = Math.max(0, Number(dividerMm || 0));
  const safeValues = sanitizeIpanelSectionSizes(values, safeCount);
  const parsed = safeValues.map((item) => parseMmNumber(item) || 0);
  const sectionsTotalMm = roundMm(parsed.reduce((acc, item) => acc + item, 0));
  const nominalDividersTotalMm = roundMm(Math.max(0, safeCount - 1) * safeDivider);
  const dividersTotalMm = dividersIncludedInSectionSizes ? 0 : nominalDividersTotalMm;
  const totalUsedMm = roundMm(sectionsTotalMm + dividersTotalMm);
  const availableMm = roundMm(Math.max(0, Number(axisDimensionMm || 0)));
  const remainingMm = roundMm(availableMm - totalUsedMm);
  return {
    parsed,
    sectionsTotalMm,
    dividersTotalMm,
    nominalDividersTotalMm,
    totalUsedMm,
    availableMm,
    remainingMm,
    exceeds: remainingMm < -0.01,
    matchesExactly: Math.abs(remainingMm) <= 0.5,
  };
}
function buildClassicIpanelSectionSizes(axisDimensionMm, classicStepMm = 353) {
  const axis = Math.max(0, roundMm(axisDimensionMm));
  const step = Math.max(1, Number(classicStepMm || 353));
  if (!axis) return [];
  const fullCount = Math.max(0, Math.floor(axis / step));
  const remainder = roundMm(axis - fullCount * step);
  const edge = remainder > 0.01 ? roundMm(remainder / 2) : 0;
  const values = [];
  if (edge > 0) values.push(formatNumberForInput(edge));
  for (let index = 0; index < fullCount; index += 1) values.push(formatNumberForInput(step));
  if (edge > 0) values.push(formatNumberForInput(edge));
  if (values.length >= 2) return values;
  return [formatNumberForInput(roundMm(axis / 2)), formatNumberForInput(roundMm(axis / 2))];
}

function norm(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function normalizeKind(value) { return String(value || "porton").trim().toLowerCase(); }
function hasSurfaceParamContent(value) { return !!(value && typeof value === "object" && Object.keys(value).length); }
function isEmptyParamValue(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return !Object.keys(value).length;
  return String(value).trim() === "";
}
export function getRulesParams(rulesData) {
  const root = rulesData || {};
  const portonRules = root.catalog_rules?.porton || {};
  const params = {
    ...(hasSurfaceParamContent(root.measurement_surface_params) ? root.measurement_surface_params : {}),
    ...(hasSurfaceParamContent(root.surface_params) ? root.surface_params : {}),
    ...(hasSurfaceParamContent(root.surface_calc_params) ? root.surface_calc_params : {}),
    ...(hasSurfaceParamContent(root.surface_parameters) ? root.surface_parameters : {}),
    ...(hasSurfaceParamContent(root.parantes_config) ? root.parantes_config : {}),
    ...(hasSurfaceParamContent(portonRules.measurement_surface_params) ? portonRules.measurement_surface_params : {}),
    ...(hasSurfaceParamContent(portonRules.surface_params) ? portonRules.surface_params : {}),
    ...(hasSurfaceParamContent(portonRules.surface_calc_params) ? portonRules.surface_calc_params : {}),
    ...(hasSurfaceParamContent(portonRules.surface_parameters) ? portonRules.surface_parameters : {}),
    ...(hasSurfaceParamContent(portonRules.parantes_config) ? portonRules.parantes_config : {}),
  };
  const stored = readStoredSurfaceParameters();
  for (const [key, value] of Object.entries(stored)) {
    if (!isEmptyParamValue(value) && isEmptyParamValue(params[key])) params[key] = value;
  }
  return params;
}
function getNumberParam(params, keys, fallback) {
  for (const key of keys) {
    const value = Number(String(params?.[key] ?? "").replace(",", "."));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}
function getOptionalNumberParam(params, keys) {
  for (const key of keys) {
    const raw = params?.[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const value = Number(String(raw).replace(",", "."));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}
function formatNumberForInput(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
function formatMetersFromMm(mm) {
  const n = Number(mm || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${(n / 1000).toFixed(2)} m`;
}
function formatMm(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${formatNumberForInput(n)} mm`;
}
function parseMmNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function normalizeDecimalMmInput(v) { return String(v ?? "").replace(/[^0-9.,]/g, ""); }

const LINE_ID_KEYS_FOR_PARANTES = [
  "product_id", "id", "presupuestador_id", "presupuestador_product_id", "productId", "productID",
  "catalog_product_id", "catalogProductId", "odoo_product_id", "odoo_external_id", "odoo_id", "odoo_template_id", "odoo_variant_id",
];
function collectLineProductIdsForParantes(line) {
  const ids = [];
  for (const key of LINE_ID_KEYS_FOR_PARANTES) {
    const n = Number(line?.[key] || 0);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  const lineKey = String(line?.line_key || line?.key || "").trim();
  if (lineKey) {
    const firstToken = Number((lineKey.match(/^\d+/) || [])[0] || 0);
    if (Number.isFinite(firstToken) && firstToken > 0) ids.push(firstToken);
  }
  return ids;
}
function getBudgetProductIdsFromLines(lines) {
  const ids = [];
  for (const line of Array.isArray(lines) ? lines : []) ids.push(...collectLineProductIdsForParantes(line));
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}
function getBudgetProductIdSetFromLines(lines) { return new Set(getBudgetProductIdsFromLines(lines)); }
function lineTextMatchesIpanelVarillado(line = {}) {
  const text = [line?.name, line?.raw_name, line?.display_name, line?.alias, line?.code]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return text.includes("varillado") || text.includes("varill");
}
function hasIpanelVarilladoProduct(lines) {
  return (Array.isArray(lines) ? lines : []).some((line) => lineTextMatchesIpanelVarillado(line));
}
function detectNoCladdingByProducts(lines, params) {
  const ids = getBudgetProductIdSetFromLines(lines);
  if (ids.has(REVESTIMIENTO_ESPECIAL_PRODUCT_ID)) return true;
  const noCladdingId = Number(params?.no_cladding_product_id || 0);
  return !!(noCladdingId && ids.has(noCladdingId));
}
function inferKgM2FromType(portonType) {
  const t = norm(portonType);
  if (!t) return 0;
  if (t.includes("para_revestir")) return 0;
  if (t.includes("inyect") || t.includes("doble_iny") || t.endsWith("_iny") || t.includes("_iny_")) return 25;
  if (t.includes("clas") || t.includes("estandar")) return 15;
  return 0;
}
function isAptoDerivedType(portonType) { return norm(portonType) === APTOS_PARA_REVESTIR_TYPE; }
function normalizeAptoKgRules(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map((item, index) => ({
      id: String(item?.id || `apto_rule_${index + 1}`),
      product_id: Number(item?.product_id || 0),
      kg_m2: Number(String(item?.kg_m2 ?? "").replace(",", ".")),
    }))
    .filter((item) => item.product_id > 0 && Number.isFinite(item.kg_m2) && item.kg_m2 > 0);
}
function resolveAptoKgM2ByProducts(lines, params) {
  const rules = normalizeAptoKgRules(params?.apto_revestir_kg_m2_rules);
  if (!rules.length) return 0;
  const ids = getBudgetProductIdSetFromLines(lines);
  for (const rule of rules) if (ids.has(rule.product_id)) return rule.kg_m2;
  return 0;
}
function getByCleanPath(source, path) {
  const parts = String(path || "").replace(/^payload\./, "").replace(/^dimensions\./, "").split(".").filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}
function resolveSellerKgM2Entry(dimensions, params) {
  const source = dimensions && typeof dimensions === "object" ? dimensions : {};
  const candidates = [];
  if (params?.seller_kg_m2_field_path) candidates.push(params.seller_kg_m2_field_path);
  candidates.push("dimensions.kg_m2", "kg_m2", "kg_m2_entry", "entry_kg_m2", "custom_kg_m2", "peso_m2", "payload.kg_m2_entry");
  for (const path of candidates) {
    const cleanPath = String(path || "").trim();
    if (!cleanPath) continue;
    const value = cleanPath.includes(".") ? getByCleanPath(source, cleanPath) : source?.[cleanPath];
    const n = parseOptionalNumber(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
function resolveDefaultKgM2FromType(portonType, params) {
  const t = norm(portonType);
  if (t.includes("inyect") || t.includes("doble_iny") || t.endsWith("_iny") || t.includes("_iny_")) {
    return getNumberParam(params, ["injected_kg_m2", "kg_m2_inyectado"], 25);
  }
  return getNumberParam(params, ["classic_kg_m2", "kg_m2_clasico", "kg_m2_clasico_estandar"], 15);
}
function legsTypeForWeight(weightKg, isApto, params) {
  const limitAngostas = getNumberParam(params, [isApto ? "no_cladding_angostas_max_kg" : "legs_angostas_max_kg", isApto ? "limit_angostas_apto_kg" : "limit_angostas_kg", "piernas_angostas_hasta_kg"], isApto ? 80 : 140);
  const limitComunes = getNumberParam(params, ["legs_comunes_max_kg", "limit_comunes_kg", "piernas_comunes_hasta_kg"], 175);
  const limitAnchas = getNumberParam(params, ["legs_anchas_max_kg", "limit_anchas_kg", "piernas_anchas_hasta_kg"], 240);
  const limitSuper = getNumberParam(params, ["legs_superanchas_max_kg", "limit_superanchas_kg", "piernas_superanchas_hasta_kg"], 300);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return "-";
  if (weightKg <= limitAngostas) return "Angostas";
  if (weightKg <= limitComunes) return "Comunes";
  if (weightKg <= limitAnchas) return "Anchas";
  if (weightKg <= limitSuper) return "Superanchas";
  return "Especiales";
}
function mapLegsKeyForWidth(legsLabel) {
  const t = norm(legsLabel);
  if (t.includes("super")) return "superanchas";
  if (t.includes("especial")) return "especiales";
  if (t.includes("ancha")) return "anchas";
  if (t.includes("comun")) return "comunes";
  return "angostas";
}
function getPasoWidthDiscountByLegMm(legsKey, params) {
  const key = String(legsKey || "").trim().toLowerCase();
  const defaults = { angostas: 80, comunes: 110, anchas: 150, superanchas: 200, especiales: 200 };
  const keyMap = {
    angostas: ["paso_width_discount_angostas_mm", "paso_ancho_descuento_angostas_mm", "step_width_discount_angostas_mm"],
    comunes: ["paso_width_discount_comunes_mm", "paso_ancho_descuento_comunes_mm", "step_width_discount_comunes_mm"],
    anchas: ["paso_width_discount_anchas_mm", "paso_ancho_descuento_anchas_mm", "step_width_discount_anchas_mm"],
    superanchas: ["paso_width_discount_superanchas_mm", "paso_ancho_descuento_superanchas_mm", "step_width_discount_superanchas_mm"],
    especiales: ["paso_width_discount_especiales_mm", "paso_ancho_descuento_especiales_mm", "step_width_discount_especiales_mm"],
  };
  const selectedKey = Object.prototype.hasOwnProperty.call(keyMap, key) ? key : "angostas";
  const configured = getOptionalNumberParam(params, keyMap[selectedKey]);
  if (configured !== null) return configured;
  return defaults[selectedKey];
}
function getSelectedVanoPlacementProductId(lines) {
  const ids = getBudgetProductIdSetFromLines(lines);
  for (const id of VANO_PLACEMENT_PRODUCT_IDS) {
    if (ids.has(id)) return id;
  }
  return 0;
}
function getVanoPlacementLabel(productId) {
  return VANO_REAR_PLACEMENT_LABELS[Number(productId || 0)] || "Por dentro del vano";
}
function hasExplicitVanoMeasures(dimensions = {}) {
  return Object.prototype.hasOwnProperty.call(dimensions || {}, "vano_width")
    || Object.prototype.hasOwnProperty.call(dimensions || {}, "vano_height")
    || String(dimensions?.porton_measure_source || "").trim() === "vano";
}
function normalizeLegsKeyForVano(legsLabel) {
  const key = mapLegsKeyForWidth(legsLabel);
  if (key === "especiales") return "superanchas";
  return key || "angostas";
}
const VANO_LEGS_ADD_WIDTH_PARAM_KEYS = {
  angostas: ["legs_angostas_add_width_mm"],
  comunes: ["legs_comunes_add_width_mm"],
  anchas: ["legs_anchas_add_width_mm"],
  superanchas: ["legs_superanchas_add_width_mm"],
};
// Mismas claves de surfaceParameters que usa el calculo de piernas en medicion tecnica (pdfBudgetExtras.js),
// para que "Por detras del vano" de el mismo resultado en el presupuesto y en el PDF de medicion.
function getVanoWidthAddM(legsKey, params) {
  const key = normalizeLegsKeyForVano(legsKey);
  const mm = getNumberParam(params, VANO_LEGS_ADD_WIDTH_PARAM_KEYS[key] || VANO_LEGS_ADD_WIDTH_PARAM_KEYS.angostas, VANO_WIDTH_ADD_BY_LEGS_MM_DEFAULT[key] ?? VANO_WIDTH_ADD_BY_LEGS_MM_DEFAULT.angostas);
  return mm / 1000;
}
function getVanoHeightAddM(params) {
  const mm = getNumberParam(params, ["behind_vano_add_height_mm"], VANO_HEIGHT_ADD_MM_DEFAULT);
  return mm / 1000;
}
function computePortonFromVano({ vanoWidthM, vanoHeightM, placementProductId, legsKey, params }) {
  const width = Number(vanoWidthM || 0) || 0;
  const height = Number(vanoHeightM || 0) || 0;
  const id = Number(placementProductId || 0);
  const isBehindVano = id === VANO_BEHIND_PRODUCT_ID;
  const widthAddM = isBehindVano ? getVanoWidthAddM(legsKey, params) : 0;
  const heightAddM = isBehindVano ? getVanoHeightAddM(params) : 0;
  return {
    widthM: width > 0 ? round4(width + widthAddM) : 0,
    heightM: height > 0 ? round4(height + heightAddM) : 0,
    widthAddM,
    heightAddM,
  };
}
function parseProductIdList(value) {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
  return String(value || "").split(/[^0-9]+/).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}
function uniqueProductIds(ids = []) { return [...new Set((Array.isArray(ids) ? ids : []).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0))]; }
function normalizeProductRuleObject(rule) {
  if (Array.isArray(rule)) return { product_ids: uniqueProductIds(parseProductIdList(rule)), match_mode: "all", active: true };
  if (rule && typeof rule === "object") {
    return {
      product_ids: uniqueProductIds(parseProductIdList(rule.product_ids || rule.required_product_ids || rule.ids || rule.product_id)),
      match_mode: String(rule.match_mode || "all").toLowerCase() === "any" ? "any" : "all",
      active: rule.active !== false,
    };
  }
  return { product_ids: uniqueProductIds(parseProductIdList(rule)), match_mode: "any", active: true };
}
function parseProductCombinationRules(value) {
  if (Array.isArray(value)) return value.map((rule) => normalizeProductRuleObject(rule)).filter((rule) => rule.active && rule.product_ids.length);
  const rules = [];
  const chunks = String(value || "").split(/[;\n]+/).map((chunk) => chunk.trim()).filter(Boolean);
  for (const chunk of chunks) {
    if (/[+&]/.test(chunk)) {
      const productIds = uniqueProductIds(parseProductIdList(chunk));
      if (productIds.length) rules.push({ product_ids: productIds, match_mode: "all", active: true });
      continue;
    }
    const productIds = uniqueProductIds(parseProductIdList(chunk));
    for (const productId of productIds) rules.push({ product_ids: [productId], match_mode: "any", active: true });
  }
  return rules;
}
function productRuleMatches(rule, lines) {
  const ids = getBudgetProductIdSetFromLines(lines);
  const required = Array.isArray(rule?.product_ids) ? rule.product_ids : [];
  if (!required.length) return false;
  if (String(rule?.match_mode || "all").toLowerCase() === "any") return required.some((productId) => ids.has(Number(productId)));
  return required.every((productId) => ids.has(Number(productId)));
}
function hasHojaRebajeLateral(lines, params) {
  const rules = [
    ...parseProductCombinationRules(params?.hoja_rebaje_lateral_product_ids),
    ...parseProductCombinationRules(params?.rebaje_lateral_product_ids),
    ...parseProductCombinationRules(params?.leaf_lateral_rebaje_product_ids),
    ...parseProductCombinationRules(params?.lateral_rebate_product_ids),
  ];
  return rules.some((rule) => productRuleMatches(rule, lines));
}
function lineTextForDoorDetection(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => [line?.name, line?.raw_name, line?.display_name, line?.alias, line?.code].filter(Boolean).join(" "))
    .map(normalizeSearchText)
    .join(" | ");
}
function hasLeftDoorForParantes(lines, params) {
  const leftDoorRules = [
    ...parseProductCombinationRules(params?.parantes_left_door_product_ids),
    ...parseProductCombinationRules(params?.left_door_product_ids),
    ...parseProductCombinationRules(params?.puerta_izquierda_product_ids),
    ...parseProductCombinationRules(params?.door_left_product_ids),
    ...parseProductCombinationRules(params?.porton_left_door_product_ids),
    ...parseProductCombinationRules(params?.porton_puerta_izquierda_product_ids),
  ];
  if (leftDoorRules.some((rule) => productRuleMatches(rule, lines))) return true;
  const text = lineTextForDoorDetection(lines);
  return text.includes("puerta izquierda") || text.includes("puerta izq") || text.includes("izquierda puerta");
}
function hasRightDoorForParantes(lines, params) {
  if (hasLeftDoorForParantes(lines, params)) return false;
  const rightDoorRules = [
    ...parseProductCombinationRules(params?.parantes_right_door_product_ids),
    ...parseProductCombinationRules(params?.right_door_product_ids),
    ...parseProductCombinationRules(params?.puerta_derecha_product_ids),
    ...parseProductCombinationRules(params?.door_right_product_ids),
    ...parseProductCombinationRules(params?.porton_right_door_product_ids),
    ...parseProductCombinationRules(params?.porton_puerta_derecha_product_ids),
  ];
  if (rightDoorRules.some((rule) => productRuleMatches(rule, lines))) return true;
  const text = lineTextForDoorDetection(lines);
  return text.includes("puerta derecha") || text.includes("puerta der") || text.includes("derecha puerta");
}
function resolveDoorSideForParantes(lines, params) {
  if (hasLeftDoorForParantes(lines, params)) return "izquierdo";
  if (hasRightDoorForParantes(lines, params)) return "derecho";
  return "";
}
function normalizeSearchText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function resolveOrientationFromLineNames(lines) {
  const text = (Array.isArray(lines) ? lines : [])
    .map((line) => [line?.name, line?.raw_name, line?.display_name, line?.alias, line?.code].filter(Boolean).join(" "))
    .map(normalizeSearchText)
    .join(" | ");
  if (!text) return "";
  if (text.includes("orientacion horizontal") || text.includes("orientacion de los parantes horizontal")) return "horizontal";
  if (text.includes("orientacion vertical") || text.includes("orientacion de los parantes vertical")) return "verticales";
  return "";
}
function resolveNonAptoParantesOrientation(lines, params) {
  const directRules = Array.isArray(params?.non_apto_parantes_orientation_rules)
    ? params.non_apto_parantes_orientation_rules
    : Array.isArray(params?.parantes_orientation_rules)
      ? params.parantes_orientation_rules
      : [];
  for (const rawRule of directRules) {
    const orientation = normalizeOrientation(rawRule?.orientation || rawRule?.orientacion || rawRule?.value);
    const rule = {
      product_ids: parseProductIdList(rawRule?.product_ids || rawRule?.required_product_ids || rawRule?.ids || rawRule?.product_id),
      match_mode: String(rawRule?.match_mode || "all").toLowerCase() === "any" ? "any" : "all",
      active: rawRule?.active !== false,
    };
    if (rule.active && productRuleMatches(rule, lines)) return orientation;
  }
  const horizontalRules = [
    ...parseProductCombinationRules(params?.non_apto_parantes_horizontal_product_ids),
    ...parseProductCombinationRules(params?.parantes_horizontal_product_ids),
    ...parseProductCombinationRules(params?.horizontal_parantes_product_ids),
  ];
  if (horizontalRules.some((rule) => productRuleMatches(rule, lines))) return "horizontal";
  const verticalRules = [
    ...parseProductCombinationRules(params?.non_apto_parantes_vertical_product_ids),
    ...parseProductCombinationRules(params?.parantes_vertical_product_ids),
    ...parseProductCombinationRules(params?.vertical_parantes_product_ids),
  ];
  if (verticalRules.some((rule) => productRuleMatches(rule, lines))) return "verticales";
  return resolveOrientationFromLineNames(lines);
}
function getParantesTubeDiscountMm(params) {
  return getNumberParam(params, ["parantes_tube_discount_mm", "parantes_cano_discount_mm", "descuento_cano_parantes_mm", "descuento_tubo_parantes_mm", "parantes_tube_width_mm"], DEFAULT_PARANTES_TUBE_DISCOUNT_MM);
}
function normalizeOrientation(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "horizontal" || raw === "horizontales") return "horizontal";
  return "verticales";
}
function normalizeDistribution(value) { return String(value || "").trim().toLowerCase() === "especial" ? "especial" : "repartido"; }
function hasSpecialParantesProduct(lines) { return getBudgetProductIdSetFromLines(lines).has(PARANTES_SPECIAL_PRODUCT_ID); }
function computeVerticalParantesCount(widthM, lines) {
  const width = Number(widthM || 0) || 0;
  if (!(width > 0)) return 0;
  const baseWidth = hasSpecialParantesProduct(lines) ? width : Math.max(0, width - 0.8);
  return Math.max(0, Math.floor(baseWidth));
}
function computeAutomaticParantesCount({ orientation, widthM, heightM, lines }) {
  const normalizedOrientation = normalizeOrientation(orientation);
  if (normalizedOrientation === "horizontal") {
    const height = Number(heightM || 0) || 0;
    if (!(height > 0)) return 0;
    return Math.max(0, Math.floor(height));
  }
  return computeVerticalParantesCount(widthM, lines);
}
function getParantesCount(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}
function normalizeDistanceList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim());
  if (value && typeof value === "object") return Object.values(value).map((item) => String(item ?? "").trim());
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw.split(";").map((item) => item.trim()).filter(Boolean);
}
function padDistanceList(values, count) {
  const next = normalizeDistanceList(values).slice(0, count);
  while (next.length < count) next.push("");
  return next;
}
function paranteDistanceLabel(index) {
  const ordinal = ORDINAL_LABELS[index] || `${index + 1}`;
  return `Distancia dentro a dentro ${ordinal} parante`;
}
function buildParantesPayload({ distances, tubeDiscountMm }) {
  return {
    distancias_parantes_mm: distances,
    distancia_primer_parante_mm: distances?.[0] || "",
    descuento_cano_parantes_mm: tubeDiscountMm,
  };
}
export function buildCalculatedPreview({ widthM, heightM, lines, params, portonType, dimensions }) {
  const widthMm = Math.round((Number(widthM || 0) || 0) * 1000);
  const heightMm = Math.round((Number(heightM || 0) || 0) * 1000);
  const areaM2 = (Number(widthM || 0) || 0) * (Number(heightM || 0) || 0);
  const aptoParaRevestir = isAptoDerivedType(portonType) || detectNoCladdingByProducts(lines, params);
  const aptoKg = aptoParaRevestir ? resolveAptoKgM2ByProducts(lines, params) : 0;
  const sellerKgM2 = resolveSellerKgM2Entry(dimensions, params);
  const inferredKg = inferKgM2FromType(portonType);
  const defaultKgM2 = resolveDefaultKgM2FromType(portonType, params);
  const effectiveKgM2 = aptoParaRevestir ? (aptoKg || sellerKgM2 || defaultKgM2 || inferredKg) : (sellerKgM2 || inferredKg || defaultKgM2);
  const weightHeightDiscountMm = Number(params?.weight_height_discount_mm || 10);
  const weightWidthDiscountMm = Number(params?.weight_width_discount_mm || 14);
  const discountedHeightMm = Math.max(0, heightMm - weightHeightDiscountMm);
  const discountedWidthMm = Math.max(0, widthMm - weightWidthDiscountMm);
  const estimatedWeightKg = areaM2 > 0 && effectiveKgM2 > 0
    ? Number((discountedHeightMm / 1000 * discountedWidthMm / 1000 * effectiveKgM2).toFixed(2))
    : 0;
  const legsLabel = legsTypeForWeight(estimatedWeightKg, aptoParaRevestir, params);
  const legsKey = mapLegsKeyForWidth(legsLabel);
  const pasoWidthDiscountMm = getPasoWidthDiscountByLegMm(legsKey, params);
  const anchoPasoMm = Math.max(0, widthMm - pasoWidthDiscountMm);
  const hojaHeightDiscountMm = 100;
  const hojaRebajeLateralDiscountMm = getNumberParam(params, ["hoja_lateral_rebaje_width_discount_mm", "rebaje_lateral_hoja_discount_mm", "leaf_lateral_rebaje_width_discount_mm"], 5);
  const pasoAltoFromHojaDiscountMm = 100;
  const hasRebajeLateral = hasHojaRebajeLateral(lines, params);
  const altoHojaMm = Math.max(0, heightMm - hojaHeightDiscountMm);
  const altoPasoMm = Math.max(0, altoHojaMm - pasoAltoFromHojaDiscountMm);
  const anchoHojaMm = Math.max(0, anchoPasoMm - (hasRebajeLateral ? hojaRebajeLateralDiscountMm : 0));
  return { effectiveKgM2, estimatedWeightKg, legsLabel, altoPasoMm, anchoPasoMm, altoHojaMm, anchoHojaMm, hasRebajeLateral };
}
// Mismas reglas que usa el editor del presupuesto (aptos vs no-aptos, puerta embutida con
// parante fijo, distribucion especial, etc.) para armar los props de <ParantesSketchModal>.
// La usan tambien la medicion y cualquier otro lugar que necesite mostrar el mismo esquema,
// para que nunca se desincronicen entre si.
export function computeParantesSchemeProps({ dimensions = {}, lines = [], params = {}, portonType = "", width = 0, height = 0 }) {
  const preview = buildCalculatedPreview({ widthM: width, heightM: height, lines, params, portonType, dimensions });
  const aptoParaRevestir = isAptoDerivedType(portonType) || detectNoCladdingByProducts(lines, params);
  const isNonAptoPorton = !aptoParaRevestir;
  const detectedDoorSide = resolveDoorSideForParantes(lines, params);
  const detectedDoorLabel = detectedDoorSide === "izquierdo" ? "Puerta Izquierda" : (detectedDoorSide === "derecho" ? "Puerta Derecha" : "");
  const hasDoorParantesConfig = !!detectedDoorSide;
  const nonAptoConfiguredOrientation = isNonAptoPorton ? resolveNonAptoParantesOrientation(lines, params) : "";
  const orientation = normalizeOrientation(dimensions?.orientacion_parantes);
  const effectiveParantesOrientation = isNonAptoPorton && nonAptoConfiguredOrientation ? nonAptoConfiguredOrientation : orientation;
  const distribution = normalizeDistribution(dimensions?.distribucion_parantes);
  const autoParantesCount = computeAutomaticParantesCount({ orientation: effectiveParantesOrientation, widthM: width, heightM: height, lines });
  const parantesCount = getParantesCount(dimensions?.cantidad_parantes) || autoParantesCount;
  const tubeDiscountMm = getParantesTubeDiscountMm(params);
  const baseParantesDimensionMm = effectiveParantesOrientation === "horizontal"
    ? Math.max(0, Number(preview?.altoHojaMm || preview?.altoPasoMm || 0))
    : Math.max(0, Number(preview?.anchoHojaMm || preview?.anchoPasoMm || 0));
  const rawParantesDistances = dimensions?.distancias_parantes_mm ?? dimensions?.distancias_parantes ?? [];
  const distributeUniformly = dimensions?.distribuir_parantes_uniformemente === true || String(dimensions?.distribuir_parantes_uniformemente || "").trim().toLowerCase() === "true";
  const showSpecialParantesDistances = aptoParaRevestir && distribution === "especial";
  const aptoHasDoorFixedReference = aptoParaRevestir && hasDoorParantesConfig;
  const aptoManualFixedReferenceEnabled = showSpecialParantesDistances && !hasDoorParantesConfig && (
    dimensions?.parantes_primer_parante_distancia_fija === true ||
    String(dimensions?.parantes_primer_parante_distancia_fija || "").trim().toLowerCase() === "true" ||
    dimensions?.parantes_simular_referencia_horizontal === true ||
    String(dimensions?.parantes_simular_referencia_horizontal || "").trim().toLowerCase() === "true"
  );
  const aptoSimulaHorizontalReferencia = aptoHasDoorFixedReference || aptoManualFixedReferenceEnabled;
  const aptoReferenciaLado = String(dimensions?.parantes_referencia_lado || detectedDoorSide || "izquierdo").trim().toLowerCase() === "derecho" ? "derecho" : "izquierdo";
  const aptoReferenciaDistancia = String(dimensions?.parantes_referencia_distancia_mm ?? dimensions?.parantes_primer_parante_distancia_mm ?? String(DOOR_FIXED_PARANTE_DISTANCE_MM));
  const aptoReferenciaDistanciaMm = Math.max(0, parseMmNumber(aptoReferenciaDistancia) || DOOR_FIXED_PARANTE_DISTANCE_MM);
  const nonAptoDoorFixedReference = isNonAptoPorton && hasDoorParantesConfig;
  const effectiveFixedReference = aptoSimulaHorizontalReferencia || nonAptoDoorFixedReference;
  const effectiveFixedReferenceSide = aptoSimulaHorizontalReferencia ? aptoReferenciaLado : (detectedDoorSide || aptoReferenciaLado);
  const effectiveFixedReferenceDistanceMm = aptoSimulaHorizontalReferencia ? aptoReferenciaDistanciaMm : DOOR_FIXED_PARANTE_DISTANCE_MM;
  const aptoParantesRestantesCount = aptoSimulaHorizontalReferencia ? Math.max(0, parantesCount - 1) : parantesCount;
  const aptoDistributionBaseDimensionMm = aptoSimulaHorizontalReferencia && effectiveParantesOrientation === "verticales"
    ? Math.max(0, baseParantesDimensionMm - aptoReferenciaDistanciaMm)
    : baseParantesDimensionMm;
  const effectiveParantesRestantesCount = effectiveFixedReference ? Math.max(0, parantesCount - 1) : parantesCount;
  const effectiveDistributionBaseDimensionMm = effectiveFixedReference && effectiveParantesOrientation === "verticales"
    ? Math.max(0, baseParantesDimensionMm - effectiveFixedReferenceDistanceMm)
    : baseParantesDimensionMm;
  void aptoDistributionBaseDimensionMm;
  const countForDistances = effectiveFixedReference ? effectiveParantesRestantesCount : (showSpecialParantesDistances ? aptoParantesRestantesCount : parantesCount);
  let resolvedParantesDistances;
  if (aptoSimulaHorizontalReferencia && distribution !== "especial") {
    resolvedParantesDistances = buildResolvedParantesDistances({
      distanceList: [],
      distributeUniformly: true,
      parantesCount: countForDistances,
      baseDimensionMm: effectiveDistributionBaseDimensionMm,
      tubeDiscountMm,
    });
  } else if (showSpecialParantesDistances && distributeUniformly) {
    resolvedParantesDistances = buildResolvedParantesDistances({
      distanceList: [],
      distributeUniformly: true,
      parantesCount: countForDistances,
      baseDimensionMm: effectiveDistributionBaseDimensionMm,
      tubeDiscountMm,
    });
  } else {
    resolvedParantesDistances = padDistanceList(normalizeDistanceList(rawParantesDistances), countForDistances);
  }
  const resolvedDistancesHaveValues = normalizeDistanceList(resolvedParantesDistances).some((item) => {
    const n = parseMmNumber(item);
    return Number.isFinite(n) && n > 0;
  });
  const distancesForFixedReferenceSketch = effectiveFixedReference && !resolvedDistancesHaveValues
    ? buildUniformParantesDistances({
        parantesCount: effectiveParantesRestantesCount,
        baseDimensionMm: effectiveDistributionBaseDimensionMm,
        tubeDiscountMm,
      })
    : resolvedParantesDistances;
  const sketchParantesDistances = effectiveFixedReference
    ? buildFixedReferenceSketchDistances({
        distances: distancesForFixedReferenceSketch,
        orientation: effectiveParantesOrientation,
        fixedDistanceMm: effectiveFixedReferenceDistanceMm,
      })
    : resolvedParantesDistances;
  const sketchParantesCount = effectiveFixedReference ? effectiveParantesRestantesCount : parantesCount;
  const resolvedBaseDimensionMm = baseParantesDimensionMm || getBaseParantesDimensionMm({ orientation: effectiveParantesOrientation, widthM: width, heightM: height });

  return {
    hasScheme: sketchParantesCount > 0 && resolvedBaseDimensionMm > 0,
    orientation: effectiveParantesOrientation,
    parantesCount: sketchParantesCount,
    baseDimensionMm: resolvedBaseDimensionMm,
    distances: sketchParantesDistances,
    distributeUniformly: false,
    tubeDiscountMm,
    portonWidthMm: Math.max(0, Number(preview?.anchoHojaMm || preview?.anchoPasoMm || 0)),
    portonHeightMm: Math.max(0, Number(preview?.altoHojaMm || preview?.altoPasoMm || 0)),
    hasFixedVerticalReference: effectiveFixedReference,
    fixedReferenceSide: effectiveFixedReferenceSide,
    fixedReferenceDistanceMm: effectiveFixedReferenceDistanceMm,
    doorLabel: detectedDoorLabel,
  };
}
function inputStateStyle(hasError) {
  return hasError
    ? { width: "100%", borderColor: "#dc2626", boxShadow: "0 0 0 3px rgba(220, 38, 38, 0.12)", background: "#fff7f7" }
    : { width: "100%" };
}
function disabledComputedInputStyle(extra = {}) {
  return { width: "100%", background: "#f3f4f6", color: "#475569", borderColor: "#d1d5db", ...extra };
}
function measurementTripleMm(values) {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => Number(String(v ?? "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return { values: nums, min: Math.min(...nums) };
}
function MeasuredValuesNote({ triple }) {
  if (!triple) return null;
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 800,
        border: "1.5px solid #fca5a5",
        background: "#fef2f2",
        color: "#7f1d1d",
        borderRadius: 8,
        padding: "6px 10px",
      }}
    >
      Valores medidos:{" "}
      {triple.values.map((v, i) => (
        <span key={i}>
          <span style={{ color: v === triple.min ? "#166534" : "#7f1d1d" }}>
            {v}
          </span>
          {i < triple.values.length - 1 ? " / " : ""}
        </span>
      ))}{" "}
      mm <span style={{ fontStyle: "italic" }}>(se toma el menor)</span>
    </div>
  );
}
function FieldBox({ label, helper, helperColor, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div className="muted">{label}</div>
      {children}
      {helper ? <div className="muted" style={{ lineHeight: 1.3, minHeight: 32, color: helperColor || undefined }}>{helper}</div> : <div style={{ minHeight: 32 }} />}
    </div>
  );
}
function ComputedCard({ label, value, warn = false }) {
  return (
    <div style={{ border: warn ? "1px solid #fca5a5" : "1px solid #d1d5db", borderRadius: 10, padding: 10, background: warn ? "#fef2f2" : "#f3f4f6" }}>
      <div className="muted">{label}</div>
      <div style={{ fontWeight: 800, color: warn ? "#b91c1c" : "#334155" }}>{value || "-"}</div>
    </div>
  );
}
function getBaseParantesDimensionMm({ orientation, widthM, heightM }) {
  const baseM = normalizeOrientation(orientation) === "horizontal" ? Number(heightM || 0) : Number(widthM || 0);
  return Math.max(0, Math.round((Number.isFinite(baseM) ? baseM : 0) * 1000));
}
function getParantesEffectiveSpanMm(baseDimensionMm, tubeDiscountMm) {
  void tubeDiscountMm;
  const base = Math.max(0, Number(baseDimensionMm || 0));
  return Math.max(0, base);
}
function buildUniformParantesDistances({ firstDistanceMm, parantesCount, baseDimensionMm, tubeDiscountMm }) {
  void tubeDiscountMm;
  const count = Math.max(0, Math.trunc(Number(parantesCount || 0)));
  if (!count) return [];
  const base = Math.max(0, Number(baseDimensionMm || 0));
  const next = Array(count).fill("");
  const rawFirst = Number(firstDistanceMm || 0);
  const hasFixedFirst = Number.isFinite(rawFirst) && rawFirst > 0;
  if (hasFixedFirst) {
    const first = Math.max(0, Math.min(rawFirst, base));
    next[0] = formatNumberForInput(first);
    if (count === 1) return next;
    const remainingStep = Math.max(0, (base - first) / count);
    for (let i = 1; i < count; i += 1) next[i] = formatNumberForInput(remainingStep);
    return next;
  }
  const uniformStep = Math.max(0, base / (count + 1));
  for (let i = 0; i < count; i += 1) next[i] = formatNumberForInput(uniformStep);
  return next;
}
function buildResolvedParantesDistances({ distanceList, distributeUniformly, parantesCount, baseDimensionMm, tubeDiscountMm }) {
  const current = padDistanceList(distanceList, parantesCount);
  if (!distributeUniformly) return current;
  const first = parseMmNumber(current[0]);
  return buildUniformParantesDistances({ firstDistanceMm: first, parantesCount, baseDimensionMm, tubeDiscountMm });
}
function buildSketchParanteMarkers({ distances, parantesCount, baseDimensionMm, tubeDiscountMm }) {
  const count = Math.max(0, Math.trunc(Number(parantesCount || 0)));
  const tube = Math.max(0, Number(tubeDiscountMm || 0) || DEFAULT_PARANTES_TUBE_DISCOUNT_MM);
  const span = getParantesEffectiveSpanMm(baseDimensionMm, tube);
  if (!count || !span) return [];

  const normalizedDistances = padDistanceList(distances, count);
  const hasAnyDistance = normalizedDistances.some((item) => {
    const n = parseMmNumber(item);
    return Number.isFinite(n) && n > 0;
  });
  const distanceInputs = (hasAnyDistance
    ? normalizedDistances
    : buildUniformParantesDistances({ parantesCount: count, baseDimensionMm, tubeDiscountMm: tube })
  ).map((item) => parseMmNumber(item));

  const positions = [];
  let centerCursor = 0;
  for (let index = 0; index < count; index += 1) {
    const distance = distanceInputs[index];
    const gap = Number.isFinite(distance) && distance > 0 ? distance : 0;
    centerCursor += gap;
    const center = Math.max(tube / 2, Math.min(Math.max(tube / 2, span - tube / 2), centerCursor));
    positions.push(Math.max(0, center - tube / 2));
    centerCursor = center;
  }
  return positions.map((position, index) => ({
    index,
    position,
    widthMm: tube,
    label: ORDINAL_LABELS[index] ? `${ORDINAL_LABELS[index]} parante` : `parante ${index + 1}`,
    distance: distanceInputs[index],
  }));
}
function getFinalLateralGapMm(markers, baseDimensionMm, tubeDiscountMm) {
  const tube = Math.max(0, Number(tubeDiscountMm || 0) || DEFAULT_PARANTES_TUBE_DISCOUNT_MM);
  const span = getParantesEffectiveSpanMm(baseDimensionMm, tube);
  if (!Number.isFinite(span) || span <= 0 || !Array.isArray(markers) || !markers.length) return null;
  const last = markers[markers.length - 1];
  const lastCenter = Number(last?.position || 0) + Number(last?.widthMm || tube) / 2;
  const gap = span - lastCenter;
  return Number.isFinite(gap) && gap >= 0 ? gap : null;
}
function buildDisplayMarkers(markers = [], effectiveSpanMm, reverseAxis) {
  return (Array.isArray(markers) ? markers : []).map((marker) => {
    const widthMm = Number(marker?.widthMm || 0) || 0;
    const position = Math.max(0, Number(marker?.position || 0) || 0);
    const drawPositionMm = reverseAxis ? Math.max(0, effectiveSpanMm - position - widthMm) : position;
    const centerMm = drawPositionMm + widthMm / 2;
    const distanceFromActiveLateralMm = reverseAxis
      ? Math.max(0, effectiveSpanMm - drawPositionMm - widthMm)
      : drawPositionMm;
    return { ...marker, drawPositionMm, centerMm, distanceFromActiveLateralMm };
  });
}
function buildDimensionSegments(markers = [], effectiveSpanMm, reverseAxis = false) {
  const displayed = buildDisplayMarkers(markers, effectiveSpanMm, reverseAxis);
  const orderedDisplayed = [...displayed].sort((a, b) => (a?.centerMm || 0) - (b?.centerMm || 0));
  const points = [0, ...orderedDisplayed.map((marker) => marker.centerMm), effectiveSpanMm];
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startMm = points[index];
    const endMm = points[index + 1];
    segments.push({ index, startMm, endMm, lengthMm: Math.max(0, endMm - startMm) });
  }
  return { displayed, segments };
}
function buildFixedReferenceSketchDistances({ distances = [], orientation, fixedDistanceMm }) {
  const list = normalizeDistanceList(distances);
  if (normalizeOrientation(orientation) !== "verticales" || !list.length) return list;
  const fixed = Math.max(0, parseMmNumber(fixedDistanceMm) || 0);
  const firstGap = parseMmNumber(list[0]) || 0;
  return [formatNumberForInput(fixed + firstGap), ...list.slice(1)];
}
// Dibujo puro del esquema (sin el modal alrededor), para poder reusarlo tal cual en
// lugares que lo muestran embebido (medicion) ademas del modal del presupuestador.
export function ParantesSchemeDiagram({
  orientation,
  parantesCount,
  baseDimensionMm,
  distances,
  distributeUniformly,
  tubeDiscountMm,
  portonWidthMm = 0,
  portonHeightMm = 0,
  hasFixedVerticalReference = false,
  fixedReferenceSide = "izquierdo",
  fixedReferenceDistanceMm = 0,
  doorLabel = "",
  onClose,
}) {
  const isHorizontal = normalizeOrientation(orientation) === "horizontal";
  const count = Math.max(0, Math.trunc(Number(parantesCount || 0)));
  const tube = Math.max(0, Number(tubeDiscountMm || 0) || DEFAULT_PARANTES_TUBE_DISCOUNT_MM);
  const effectiveSpan = Math.max(1, getParantesEffectiveSpanMm(baseDimensionMm, tube));
  const distanceList = buildResolvedParantesDistances({
    distanceList: distances,
    distributeUniformly,
    parantesCount: count,
    baseDimensionMm,
    tubeDiscountMm: tube,
  });
  const markers = buildSketchParanteMarkers({ distances: distanceList, parantesCount: count, baseDimensionMm, tubeDiscountMm: tube });
  const fixedSide = String(fixedReferenceSide || "izquierdo").trim().toLowerCase() === "derecho" ? "derecho" : "izquierdo";
  const fixedDistance = Math.max(0, Number(fixedReferenceDistanceMm || 0) || 0);
  const reverseAxis = !isHorizontal && !!hasFixedVerticalReference && fixedSide === "derecho";
  const { displayed: displayMarkers, segments: dimensionSegments } = buildDimensionSegments(markers, effectiveSpan, reverseAxis);
  const finalLateralGapMm = getFinalLateralGapMm(markers, baseDimensionMm, tube);
  const width = 720;
  const height = 360;
  const rectX = 70;
  const rectY = 55;
  const rectW = 560;
  const rectH = 220;
  const axisLength = isHorizontal ? rectH : rectW;
  const scale = axisLength / effectiveSpan;
  const axisStart = isHorizontal ? rectY : rectX;
  const crossStart = isHorizontal ? rectX : rectY;
  const crossSize = isHorizontal ? rectW : rectH;
  const segmentColor = "#dc2626";
  const paranteColor = "#2563eb";
  const fixedColor = "#16a34a";
  const lateralColor = "#111827";
  const axisLabelA = isHorizontal ? "Superior" : "Izquierdo";
  const axisLabelB = isHorizontal ? "Inferior" : "Derecho";
  const effectivePortonWidthMm = Math.max(1, Number(portonWidthMm || 0) || Number(baseDimensionMm || 0) || 1);
  const fixedBoundaryMm = Math.max(0, Math.min(effectivePortonWidthMm, fixedSide === "derecho" ? effectivePortonWidthMm - fixedDistance : fixedDistance));
  const fixedBoundaryPx = rectX + (fixedBoundaryMm / effectivePortonWidthMm) * rectW;
  const showFixedVerticalReference = !!hasFixedVerticalReference && fixedDistance > 0 && effectivePortonWidthMm > 1;
  const normalizedDoorLabel = String(doorLabel || "").trim();
  const doorTextX = showFixedVerticalReference
    ? (fixedSide === "izquierdo" ? (rectX + fixedBoundaryPx) / 2 : (fixedBoundaryPx + rectX + rectW) / 2)
    : 0;
  const doorTextWidth = showFixedVerticalReference
    ? Math.max(0, fixedSide === "izquierdo" ? fixedBoundaryPx - rectX : rectX + rectW - fixedBoundaryPx)
    : 0;
  const horizontalStartX = isHorizontal && showFixedVerticalReference
    ? (fixedSide === "izquierdo" ? fixedBoundaryPx : rectX)
    : rectX;
  const horizontalEndX = isHorizontal && showFixedVerticalReference
    ? (fixedSide === "izquierdo" ? rectX + rectW : fixedBoundaryPx)
    : rectX + rectW;
  const horizontalMarkerLabelX = fixedSide === "derecho" && showFixedVerticalReference ? horizontalStartX - 22 : horizontalEndX + 22;

  return (
    <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Esquema de parantes</div>
            <div className="muted">
              Orientación {isHorizontal ? "horizontal" : "vertical"} - {count || 0} parantes internos + 2 laterales - base exterior {formatMm(baseDimensionMm)} - ancho caño {formatMm(tube)} - luz para repartir {formatMm(effectiveSpan)}{showFixedVerticalReference ? ` - parante fijo ${fixedSide} a ${formatNumberForInput(fixedDistance)} mm` : ""}
            </div>
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 12px", background: "#fff", cursor: "pointer" }}>
              Cerrar
            </button>
          ) : null}
        </div>
        <div className="spacer" />
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", border: "1px solid #e5e7eb", borderRadius: 14, background: "#f8fafc" }}>
          {isHorizontal ? (
            <>
              <text x="10" y={rectY + 8} fontSize="13" fontWeight="800" fill="#111827">{axisLabelA}</text>
              <text x="10" y={rectY + rectH + 18} fontSize="13" fontWeight="800" fill="#111827">{axisLabelB}</text>
            </>
          ) : (
            <>
              <text
                x={rectX - 36}
                y={rectY + rectH / 2}
                textAnchor="middle"
                fontSize="13"
                fontWeight="800"
                fill="#111827"
                transform={`rotate(-90 ${rectX - 36} ${rectY + rectH / 2})`}
              >
                {axisLabelA}
              </text>
              <text
                x={rectX + rectW + 36}
                y={rectY + rectH / 2}
                textAnchor="middle"
                fontSize="13"
                fontWeight="800"
                fill="#111827"
                transform={`rotate(90 ${rectX + rectW + 36} ${rectY + rectH / 2})`}
              >
                {axisLabelB}
              </text>
            </>
          )}
          <rect x={rectX} y={rectY} width={rectW} height={rectH} rx="8" fill="#ffffff" stroke="#334155" strokeWidth="3" />
          <line x1={rectX + rectW / 2} y1={rectY} x2={rectX + rectW / 2} y2={rectY + rectH} stroke="#e5e7eb" strokeWidth="1" />
          <line x1={rectX} y1={rectY + rectH / 2} x2={rectX + rectW} y2={rectY + rectH / 2} stroke="#e5e7eb" strokeWidth="1" />
          {isHorizontal ? (
            <>
              <line x1={horizontalStartX} y1={rectY + 4} x2={horizontalEndX} y2={rectY + 4} stroke={lateralColor} strokeWidth="8" strokeLinecap="round" />
              <line x1={horizontalStartX} y1={rectY + rectH - 4} x2={horizontalEndX} y2={rectY + rectH - 4} stroke={lateralColor} strokeWidth="8" strokeLinecap="round" />
            </>
          ) : (
            <>
              <line x1={rectX + 4} y1={rectY} x2={rectX + 4} y2={rectY + rectH} stroke={lateralColor} strokeWidth="8" strokeLinecap="round" />
              <line x1={rectX + rectW - 4} y1={rectY} x2={rectX + rectW - 4} y2={rectY + rectH} stroke={lateralColor} strokeWidth="8" strokeLinecap="round" />
            </>
          )}
          {showFixedVerticalReference ? (
            <g>
              <line x1={fixedBoundaryPx} y1={rectY} x2={fixedBoundaryPx} y2={rectY + rectH} stroke={fixedColor} strokeWidth="6" strokeLinecap="round" />
              <rect x={Math.max(rectX + 4, Math.min(rectX + rectW - 100, fixedBoundaryPx - 50))} y={rectY + 10} width="100" height="22" rx="7" fill="#dcfce7" stroke={fixedColor} />
              <text x={Math.max(rectX + 54, Math.min(rectX + rectW - 50, fixedBoundaryPx))} y={rectY + 26} textAnchor="middle" fontSize="11" fontWeight="900" fill="#166534">Parante fijo</text>
              {normalizedDoorLabel && doorTextWidth > 60 ? (
                <g>
                  <rect x={Math.max(rectX + 6, doorTextX - Math.min(95, doorTextWidth / 2 - 6))} y={rectY + rectH / 2 - 15} width={Math.min(190, Math.max(90, doorTextWidth - 12))} height="30" rx="9" fill="#fef3c7" stroke="#f59e0b" />
                  <text x={doorTextX} y={rectY + rectH / 2 + 5} textAnchor="middle" fontSize="13" fontWeight="900" fill="#92400e">{normalizedDoorLabel}</text>
                </g>
              ) : null}
              <line x1={fixedSide === "izquierdo" ? rectX : fixedBoundaryPx} y1={rectY - 16} x2={fixedSide === "izquierdo" ? fixedBoundaryPx : rectX + rectW} y2={rectY - 16} stroke={fixedColor} strokeWidth="2" />
              <line x1={fixedSide === "izquierdo" ? rectX : fixedBoundaryPx} y1={rectY - 21} x2={fixedSide === "izquierdo" ? rectX : fixedBoundaryPx} y2={rectY - 11} stroke={fixedColor} strokeWidth="2" />
              <line x1={fixedSide === "izquierdo" ? fixedBoundaryPx : rectX + rectW} y1={rectY - 21} x2={fixedSide === "izquierdo" ? fixedBoundaryPx : rectX + rectW} y2={rectY - 11} stroke={fixedColor} strokeWidth="2" />
              <text x={(fixedSide === "izquierdo" ? (rectX + fixedBoundaryPx) : (fixedBoundaryPx + rectX + rectW)) / 2} y={rectY - 22} textAnchor="middle" fontSize="11" fontWeight="900" fill={fixedColor}>{Math.round(fixedDistance)} mm</text>
            </g>
          ) : null}
          {displayMarkers.map((marker) => {
            const posPx = axisStart + marker.centerMm * scale;
            if (isHorizontal) {
              return (
                <g key={`marker-${marker.index}`}>
                  <line x1={horizontalStartX} y1={posPx} x2={horizontalEndX} y2={posPx} stroke={paranteColor} strokeWidth="5" />
                  <circle cx={horizontalMarkerLabelX} cy={posPx} r="12" fill={paranteColor} />
                  <text x={horizontalMarkerLabelX} y={posPx + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">{marker.index + 1}</text>
                </g>
              );
            }
            return (
              <g key={`marker-${marker.index}`}>
                <line x1={posPx} y1={rectY} x2={posPx} y2={rectY + rectH} stroke={paranteColor} strokeWidth="5" />
                <circle cx={posPx} cy={rectY + rectH + 22} r="12" fill={paranteColor} />
                <text x={posPx} y={rectY + rectH + 27} textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">{marker.index + 1}</text>
              </g>
            );
          })}
          {dimensionSegments.map((segment) => {
            const startPx = axisStart + segment.startMm * scale;
            const endPx = axisStart + segment.endMm * scale;
            const midPx = (startPx + endPx) / 2;
            const label = `${Math.round(segment.lengthMm)} mm`;
            if (isHorizontal) {
              const x = rectX + rectW + 62;
              return (
                <g key={`seg-${segment.index}`}>
                  <line x1={x} y1={startPx} x2={x} y2={endPx} stroke={segmentColor} strokeWidth="2" />
                  <line x1={x - 6} y1={startPx} x2={x + 6} y2={startPx} stroke={segmentColor} strokeWidth="2" />
                  <line x1={x - 6} y1={endPx} x2={x + 6} y2={endPx} stroke={segmentColor} strokeWidth="2" />
                  <text x={x + 10} y={midPx + 4} fontSize="11" fontWeight="800" fill={segmentColor}>{label}</text>
                </g>
              );
            }
            const y = rectY + rectH + 62;
            return (
              <g key={`seg-${segment.index}`}>
                <line x1={startPx} y1={y} x2={endPx} y2={y} stroke={segmentColor} strokeWidth="2" />
                <line x1={startPx} y1={y - 6} x2={startPx} y2={y + 6} stroke={segmentColor} strokeWidth="2" />
                <line x1={endPx} y1={y - 6} x2={endPx} y2={y + 6} stroke={segmentColor} strokeWidth="2" />
                <text x={midPx} y={y + 18} textAnchor="middle" fontSize="11" fontWeight="800" fill={segmentColor}>{label}</text>
              </g>
            );
          })}
        </svg>
        <div className="spacer" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
          <ComputedCard label={isHorizontal ? "Parante superior" : "Parante lateral inicial"} value="0 mm" />
          {displayMarkers.map((marker) => (
            <ComputedCard
              key={`card-${marker.index}`}
              label={`Parante interno ${marker.index + 1}`}
              value={`${Math.round(marker.distanceFromActiveLateralMm)} mm desde ${isHorizontal ? "superior" : "lateral"}`}
            />
          ))}
          <ComputedCard label={isHorizontal ? "Parante inferior" : "Parante lateral final"} value={`${Math.round(effectiveSpan)} mm`} />
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {distributeUniformly ? "Resto distribuido uniformemente" : "Distribución cargada manualmente"}
          {finalLateralGapMm !== null ? ` · Libre final: ${Math.round(finalLateralGapMm)} mm` : ""}
          {portonWidthMm || portonHeightMm ? ` · Hoja ${formatMm(portonWidthMm)} x ${formatMm(portonHeightMm)}` : ""}
        </div>
    </div>
  );
}
export function ParantesSketchModal({ open, onClose, ...diagramProps }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(980px, 96vw)",
          maxHeight: "92vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 20px 60px rgba(15,23,42,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ParantesSchemeDiagram {...diagramProps} onClose={onClose} />
      </div>
    </div>
  );
}

function IpanelDivisionsSketchModal({
  open,
  onClose,
  orientation = "horizontal",
  widthMm = 0,
  heightMm = 0,
  dividerMm = IPANEL_DIVIDER_LINE_MM,
  sectionSizes = [],
  dividersIncludedInSectionSizes = false,
}) {
  if (!open) return null;
  const normalizedOrientation = normalizeIpanelLamasOrientation(orientation);
  const isVertical = normalizedOrientation === "vertical";
  const safeSectionSizes = Array.isArray(sectionSizes) ? sectionSizes : [];
  const count = safeSectionSizes.length;
  const panelWidthMm = Math.max(1, Number(widthMm || 0));
  const panelHeightMm = Math.max(1, Number(heightMm || 0));
  const maxCanvasWidth = 420;
  const maxCanvasHeight = 460;
  const scale = Math.min(maxCanvasWidth / panelWidthMm, maxCanvasHeight / panelHeightMm, 1);
  const panelWidthPx = Math.max(170, Math.round(panelWidthMm * scale));
  const panelHeightPx = Math.max(220, Math.round(panelHeightMm * scale));
  const panelX = 20;
  const panelY = 20;
  const sectionGuideOffsetPx = 28;
  const sectionGuideTickPx = 8;
  const sectionGuideLabelGapPx = 8;
  const topGuideOffsetPx = 32;
  const bottomGuideOffsetPx = 34;
  const leftGuideOffsetPx = 14;
  const rightGuideOffsetPx = 34;
  const axisDimensionMm = isVertical ? panelWidthMm : panelHeightMm;
  const mainAxisPx = isVertical ? panelWidthPx : panelHeightPx;
  const safeDividerPx = Math.max(2, (axisDimensionMm > 0 ? dividerMm / axisDimensionMm : 0) * mainAxisPx);
  const sectionsTotalMm = safeSectionSizes.reduce((acc, item) => acc + Math.max(0, Number(item || 0)), 0);
  const totalUsedMm = sectionsTotalMm + Math.max(0, count - 1) * dividerMm;
  const correctionScale = totalUsedMm > 0 ? axisDimensionMm / totalUsedMm : 1;
  const clampedCorrectionScale = Number.isFinite(correctionScale) && correctionScale > 0 ? correctionScale : 1;
  const bands = [];
  let cursorMm = 0;
  for (let index = 0; index < count; index += 1) {
    const rawSectionMm = Math.max(0, Number(safeSectionSizes[index] || 0));
    const sectionMm = rawSectionMm * clampedCorrectionScale;
    bands.push({ type: "section", index, startMm: cursorMm, sizeMm: sectionMm, rawSizeMm: rawSectionMm });
    cursorMm += sectionMm;
    if (!dividersIncludedInSectionSizes && index < count - 1) {
      const dividerSize = dividerMm * clampedCorrectionScale;
      bands.push({ type: "divider", index, startMm: cursorMm, sizeMm: dividerSize, rawSizeMm: dividerMm });
      cursorMm += dividerSize;
    }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{ width: "min(960px, 100%)", maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 18, border: "1px solid #e5e7eb", boxShadow: "0 18px 50px rgba(15,23,42,.18)", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Esquema del Ipanel</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Orientación de lamas {isVertical ? "vertical" : "horizontal"} · {count || 0} secciones · línea entre secciones {formatMm(dividerMm)}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "1px solid #ddd", borderRadius: 10, background: "#fff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Cerrar</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 420px) minmax(240px, 1fr)", gap: 18, alignItems: "start" }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, background: "#f8fafc" }}>
            <svg width="100%" viewBox={`-80 -50 ${panelWidthPx + (isVertical ? 160 : 290)} ${panelHeightPx + (isVertical ? 200 : 170)}`} role="img" aria-label="Esquema del Ipanel con divisiones">
              <rect x={panelX} y={panelY} width={panelWidthPx} height={panelHeightPx} rx="14" fill="#ffffff" stroke="#0f172a" strokeWidth="2.2" />
              {bands.map((band) => {
                const startPx = (axisDimensionMm > 0 ? band.startMm / axisDimensionMm : 0) * mainAxisPx;
                const sizePx = (axisDimensionMm > 0 ? band.sizeMm / axisDimensionMm : 0) * mainAxisPx;
                if (band.type === "section") {
                  const x = isVertical ? panelX + startPx : panelX;
                  const y = isVertical ? panelY : panelY + startPx;
                  const width = isVertical ? sizePx : panelWidthPx;
                  const height = isVertical ? panelHeightPx : sizePx;
                  const guideColor = "#2563eb";
                  const isAlt = band.index % 2 === 1;
                  return (
                    <g key={`band-${band.type}-${band.index}`}>
                      <rect x={x} y={y} width={Math.max(0, width)} height={Math.max(0, height)} fill={band.index % 2 === 0 ? "#dff3f6" : "#eef2f7"} />
                      {isVertical ? (
                        <g>
                          {(() => {
                            const guideY = isAlt ? panelY + panelHeightPx + bottomGuideOffsetPx : panelY - topGuideOffsetPx;
                            const labelY = guideY + (isAlt ? 22 : -10);
                            return (
                              <>
                                <line x1={x} y1={guideY} x2={x + width} y2={guideY} stroke={guideColor} strokeWidth="1.8" />
                                <line x1={x} y1={guideY - sectionGuideTickPx} x2={x} y2={guideY + sectionGuideTickPx} stroke={guideColor} strokeWidth="1.8" />
                                <line x1={x + width} y1={guideY - sectionGuideTickPx} x2={x + width} y2={guideY + sectionGuideTickPx} stroke={guideColor} strokeWidth="1.8" />
                                <text x={x + width / 2} y={labelY} textAnchor="middle" fontSize="11" fontWeight="700" fill={guideColor}>
                                  {formatNumberForInput(band.rawSizeMm)} mm
                                </text>
                              </>
                            );
                          })()}
                        </g>
                      ) : (
                        <g>
                          {(() => {
                            const guideX = isAlt ? panelX - leftGuideOffsetPx : panelX + panelWidthPx + rightGuideOffsetPx;
                            const labelX = guideX + (isAlt ? -sectionGuideLabelGapPx : sectionGuideLabelGapPx);
                            return (
                              <>
                                <line x1={guideX} y1={y} x2={guideX} y2={y + height} stroke={guideColor} strokeWidth="1.8" />
                                <line x1={guideX - sectionGuideTickPx} y1={y} x2={guideX + sectionGuideTickPx} y2={y} stroke={guideColor} strokeWidth="1.8" />
                                <line x1={guideX - sectionGuideTickPx} y1={y + height} x2={guideX + sectionGuideTickPx} y2={y + height} stroke={guideColor} strokeWidth="1.8" />
                                <text x={labelX} y={y + height / 2} textAnchor={isAlt ? "end" : "start"} dominantBaseline="middle" fontSize="11" fontWeight="700" fill={guideColor}>
                                  {formatNumberForInput(band.rawSizeMm)} mm
                                </text>
                              </>
                            );
                          })()}
                        </g>
                      )}
                      {dividersIncludedInSectionSizes && band.index < count - 1 ? (() => {
                        const red = "#ef2323";
                        if (isVertical) {
                          const boundaryX = x + width;
                          return (
                            <>
                              <line x1={boundaryX} y1={panelY} x2={boundaryX} y2={panelY + panelHeightPx} stroke={red} strokeWidth="2.2" />
                              <line x1={boundaryX} y1={panelY} x2={boundaryX} y2={panelY + panelHeightPx} stroke="#334155" strokeWidth="1.1" strokeDasharray="4 4" />
                            </>
                          );
                        }
                        const boundaryY = y + height;
                        return (
                          <>
                            <line x1={panelX} y1={boundaryY} x2={panelX + panelWidthPx} y2={boundaryY} stroke={red} strokeWidth="2.2" />
                            <line x1={panelX} y1={boundaryY} x2={panelX + panelWidthPx} y2={boundaryY} stroke="#334155" strokeWidth="1.1" strokeDasharray="4 4" />
                          </>
                        );
                      })() : null}
                    </g>
                  );
                }
                const rectX = isVertical ? panelX + startPx : panelX;
                const rectY = isVertical ? panelY : panelY + startPx;
                const rectWidth = isVertical ? sizePx : panelWidthPx;
                const rectHeight = isVertical ? panelHeightPx : sizePx;
                const stripeW = Math.max(2, rectWidth);
                const stripeH = Math.max(2, rectHeight);
                const red = "#ef2323";
                const borderThickness = Math.max(2, Math.min(4, (isVertical ? stripeW : stripeH) * 0.18));
                const centerX1 = isVertical ? rectX + stripeW / 2 : rectX;
                const centerY1 = isVertical ? rectY : rectY + stripeH / 2;
                const centerX2 = isVertical ? rectX + stripeW / 2 : rectX + stripeW;
                const centerY2 = isVertical ? rectY + stripeH : rectY + stripeH / 2;
                return (
                  <g key={`band-${band.type}-${band.index}`}>
                    <rect x={rectX} y={rectY} width={stripeW} height={stripeH} fill="#ffffff" stroke={red} strokeWidth="1.4" />
                    {isVertical ? (
                      <>
                        <line x1={rectX + borderThickness / 2} y1={rectY} x2={rectX + borderThickness / 2} y2={rectY + stripeH} stroke={red} strokeWidth={borderThickness} />
                        <line x1={rectX + stripeW - borderThickness / 2} y1={rectY} x2={rectX + stripeW - borderThickness / 2} y2={rectY + stripeH} stroke={red} strokeWidth={borderThickness} />
                      </>
                    ) : (
                      <>
                        <line x1={rectX} y1={rectY + borderThickness / 2} x2={rectX + stripeW} y2={rectY + borderThickness / 2} stroke={red} strokeWidth={borderThickness} />
                        <line x1={rectX} y1={rectY + stripeH - borderThickness / 2} x2={rectX + stripeW} y2={rectY + stripeH - borderThickness / 2} stroke={red} strokeWidth={borderThickness} />
                      </>
                    )}
                    <line x1={centerX1} y1={centerY1} x2={centerX2} y2={centerY2} stroke="#334155" strokeWidth="1.3" strokeDasharray="4 4" />
                  </g>
                );
              })}
            </svg>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, background: "#fff" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Detalle</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <ComputedCard label="Ancho" value={panelWidthMm > 0 ? formatMm(panelWidthMm) : "-"} />
              <ComputedCard label="Alto" value={panelHeightMm > 0 ? formatMm(panelHeightMm) : "-"} />
              <ComputedCard label="Secciones" value={String(count || 0)} />
              <ComputedCard label="Orientación" value={isVertical ? "Vertical" : "Horizontal"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function isTruthyFlag(value) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function IpanelLamasSetupModal({
  open,
  widthM = 0,
  heightM = 0,
  initialOrientation = "horizontal",
  initialDivisions = "",
  initialSectionSizes = [],
  initialClassicMode = false,
  onSave,
}) {
  const [widthMeters, setWidthMeters] = useState("");
  const [heightMeters, setHeightMeters] = useState("");
  const [orientation, setOrientation] = useState("horizontal");
  const [divisions, setDivisions] = useState("");
  const [sectionSizes, setSectionSizes] = useState([]);
  const [classicMode, setClassicMode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const normalizedOrientation = normalizeIpanelLamasOrientation(initialOrientation || "horizontal");
    const count = Math.max(0, Math.trunc(Number(initialDivisions || 0)));
    setWidthMeters(formatNumberForInput(widthM));
    setHeightMeters(formatNumberForInput(heightM));
    setOrientation(normalizedOrientation);
    setDivisions(count >= 2 ? String(count) : "");
    setSectionSizes(count >= 2 ? sanitizeIpanelSectionSizes(initialSectionSizes, count) : []);
    setClassicMode(!!initialClassicMode);
    setError("");
  }, [open, widthM, heightM, initialOrientation, initialDivisions, initialSectionSizes, initialClassicMode]);

  const modalWidthValue = parseOptionalNumber(normalizeDecimalWithDot(widthMeters));
  const modalHeightValue = parseOptionalNumber(normalizeDecimalWithDot(heightMeters));
  const widthInvalid = modalWidthValue === null || !(modalWidthValue > 0) || modalWidthValue > IPANEL_LAMAS_WIDTH_MAX_M;
  const heightInvalid = modalHeightValue === null || !(modalHeightValue > 0) || modalHeightValue > IPANEL_LAMAS_HEIGHT_MAX_M;
  const modalWidthM = Number(modalWidthValue || 0);
  const modalHeightM = Number(modalHeightValue || 0);

  const maxDivisions = getIpanelDivisionsMaxByOrientation(orientation);
  const divisionsCount = Math.max(0, Math.trunc(Number(divisions || 0)));
  const axisDimensionMm = useMemo(
    () => getIpanelAxisDimensionMm({ orientation, widthM: modalWidthM, heightM: modalHeightM }),
    [orientation, modalWidthM, modalHeightM],
  );
  const safeSectionSizes = useMemo(
    () => sanitizeIpanelSectionSizes(sectionSizes, divisionsCount),
    [sectionSizes, divisionsCount],
  );
  const metrics = useMemo(
    () => computeIpanelSectionMetrics({
      values: safeSectionSizes,
      count: divisionsCount,
      axisDimensionMm,
      dividerMm: IPANEL_DIVIDER_LINE_MM,
      dividersIncludedInSectionSizes: classicMode,
    }),
    [safeSectionSizes, divisionsCount, axisDimensionMm, classicMode],
  );
  const divisionsOutOfBounds = isIpanelDivisionsOutOfBounds(divisions, maxDivisions);
  const hasAllSectionSizes = divisionsCount >= 2
    && safeSectionSizes.length === divisionsCount
    && safeSectionSizes.every((item) => {
      const n = parseMmNumber(item);
      return Number.isFinite(n) && n > 0;
    });
  const canSave = !widthInvalid && !heightInvalid && !divisionsOutOfBounds && hasAllSectionSizes && metrics.matchesExactly;

  function setSectionSizeAt(index, value) {
    setSectionSizes((current) => {
      const next = Array.from({ length: divisionsCount }, (_, idx) => String(current?.[idx] ?? ""));
      next[index] = normalizeDecimalMmInput(value);
      return next;
    });
  }

  function applyClassicDistribution() {
    const classicSizes = buildClassicIpanelSectionSizes(axisDimensionMm, 353);
    const classicCount = classicSizes.length;
    if (classicCount < 2) {
      setError("Cargá primero ancho y alto del Ipanel en este popup para calcular las divisiones.");
      return;
    }
    setDivisions(String(classicCount));
    setSectionSizes(classicSizes);
    setClassicMode(true);
    setError("");
  }

  function applyUniformDistribution() {
    const count = Math.max(2, Math.min(maxDivisions, Math.trunc(Number(divisions || 0) || 2)));
    const uniformSizes = buildUniformIpanelSectionSizes({
      count,
      axisDimensionMm,
      dividerMm: IPANEL_DIVIDER_LINE_MM,
    });
    if (!axisDimensionMm || !uniformSizes.length) {
      setError("Cargá primero ancho y alto del Ipanel en este popup para calcular las divisiones.");
      return;
    }
    setDivisions(String(count));
    setSectionSizes(uniformSizes);
    setClassicMode(false);
    setError("");
  }

  function handleSave() {
    if (widthInvalid || heightInvalid) {
      setError(`Completá ancho y alto del Ipanel. Panel en lamas permite hasta ${IPANEL_LAMAS_WIDTH_MAX_M.toFixed(2)} m de ancho y ${IPANEL_LAMAS_HEIGHT_MAX_M.toFixed(2)} m de alto.`);
      return;
    }
    if (divisionsOutOfBounds) {
      setError(`La cantidad de divisiones debe ser un entero entre 2 y ${maxDivisions}.`);
      return;
    }
    if (!hasAllSectionSizes) {
      setError("Completá la medida en mm de todas las secciones.");
      return;
    }
    if (!metrics.matchesExactly) {
      setError(metrics.exceeds
        ? `Las divisiones exceden la medida disponible por ${formatMm(Math.abs(metrics.remainingMm))}.`
        : `Las divisiones no completan la medida disponible. Restan ${formatMm(metrics.remainingMm)}.`);
      return;
    }
    onSave?.({
      width: normalizeDecimal(widthMeters),
      height: normalizeDecimal(heightMeters),
      ipanel_lamas_orientacion: orientation,
      orientacion_ipanel_lamas: orientation,
      ipanel_orientacion_lamas: orientation,
      ipanel_lamas_orientation: orientation,
      ipanel_divisiones: String(divisionsCount),
      cantidad_divisiones_ipanel: String(divisionsCount),
      ipanel_divisiones_medidas_mm: safeSectionSizes,
      medidas_divisiones_ipanel_mm: safeSectionSizes,
      ipanel_section_sizes_mm: safeSectionSizes,
      ipanel_distribucion_divisiones: classicMode ? "clasica" : "repartido",
      ipanel_divisiones_distribucion: classicMode ? "clasica" : "repartido",
      ipanel_divisiones_incluyen_liston: classicMode,
      ipanel_divisor_mm: String(IPANEL_DIVIDER_LINE_MM),
      linea_division_ipanel_mm: String(IPANEL_DIVIDER_LINE_MM),
      ipanel_lamas_popup_completed: true,
      ipanel_lamas_setup_completed: true,
    });
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(860px, 96vw)",
          maxHeight: "92vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 18,
          padding: 18,
          boxShadow: "0 22px 70px rgba(15,23,42,0.35)",
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 6 }}>
          Datos obligatorios del Panel en Lamas 22mm
        </div>
        <div className="muted" style={{ marginBottom: 14 }}>
          Completá las medidas y los datos de lamas para continuar con el presupuesto. Después podés modificarlos desde la sección Medidas del Ipanel.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start" }}>
          <FieldBox label="Ancho del Ipanel (m)" helper={`Panel en lamas max ${IPANEL_LAMAS_WIDTH_MAX_M.toFixed(2)} m.`} helperColor={widthInvalid ? "#b91c1c" : undefined}>
            <Input
              type="text"
              inputMode="decimal"
              value={widthMeters}
              onChange={(value) => {
                setWidthMeters(normalizeDecimal(value));
                setClassicMode(false);
                setError("");
              }}
              onBlur={(e) => setWidthMeters(normalizeDecimal(e?.target?.value))}
              placeholder="Ej: 1.16"
              style={inputStateStyle(widthInvalid)}
            />
          </FieldBox>
          <FieldBox label="Alto del Ipanel (m)" helper={`Panel en lamas max ${IPANEL_LAMAS_HEIGHT_MAX_M.toFixed(2)} m.`} helperColor={heightInvalid ? "#b91c1c" : undefined}>
            <Input
              type="text"
              inputMode="decimal"
              value={heightMeters}
              onChange={(value) => {
                setHeightMeters(normalizeDecimal(value));
                setClassicMode(false);
                setError("");
              }}
              onBlur={(e) => setHeightMeters(normalizeDecimal(e?.target?.value))}
              placeholder="Ej: 2.45"
              style={inputStateStyle(heightInvalid)}
            />
          </FieldBox>
          <FieldBox label="Orientación de lamas">
            <select
              value={orientation}
              onChange={(e) => {
                const nextOrientation = normalizeIpanelLamasOrientation(e.target.value);
                const nextMax = getIpanelDivisionsMaxByOrientation(nextOrientation);
                const nextDivisions = clampIpanelDivisions(divisions, nextMax);
                setOrientation(nextOrientation);
                if (nextDivisions && nextDivisions !== divisions) {
                  setDivisions(nextDivisions);
                  setSectionSizes((current) => sanitizeIpanelSectionSizes(current, Number(nextDivisions || 0)));
                }
                setError("");
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </FieldBox>
          <FieldBox label="Cantidad de divisiones" helper={`Entero entre 2 y ${maxDivisions}.`} helperColor={divisionsOutOfBounds ? "#b91c1c" : undefined}>
            <Input
              type="text"
              inputMode="numeric"
              value={divisions}
              onChange={(value) => {
                const next = normalizeIpanelDivisionsInput(value, maxDivisions);
                setDivisions(next);
                setSectionSizes((current) => sanitizeIpanelSectionSizes(current, Number(next || 0)));
                setClassicMode(false);
                setError("");
              }}
              onBlur={(e) => {
                const next = clampIpanelDivisions(e?.target?.value, maxDivisions);
                setDivisions(next);
                setSectionSizes((current) => sanitizeIpanelSectionSizes(current, Number(next || 0)));
              }}
              placeholder="Ej: 4"
              style={inputStateStyle(divisionsOutOfBounds)}
            />
          </FieldBox>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 14px" }}>
          <button type="button" onClick={applyClassicDistribution} style={{ border: "1px solid #c7d2fe", borderRadius: 10, background: "#eef2ff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>
            Usar distribución clásica automática
          </button>
          <button type="button" onClick={applyUniformDistribution} style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>
            Repartir uniforme
          </button>
        </div>

        {divisionsCount >= 2 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {Array.from({ length: divisionsCount }, (_, index) => (
              <FieldBox key={`setup-ipanel-section-${index}`} label={`Sección ${index + 1}`} helper={orientation === "vertical" ? "Medida útil en mm sobre el ancho." : "Medida útil en mm sobre el alto."}>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={String(sectionSizes[index] ?? "")}
                  onChange={(value) => {
                    setSectionSizeAt(index, value);
                    setClassicMode(false);
                    setError("");
                  }}
                  onBlur={(e) => setSectionSizeAt(index, e?.target?.value)}
                  placeholder={index === 0 ? "Ej: 600" : "Ej: 580"}
                  style={{ width: "100%" }}
                />
              </FieldBox>
            ))}
          </div>
        ) : null}

        <div className="spacer" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <ComputedCard label="Base para repartir" value={axisDimensionMm > 0 ? formatMm(axisDimensionMm) : "-"} />
          <ComputedCard label="Espesor total de líneas" value={metrics.nominalDividersTotalMm > 0 ? formatMm(metrics.nominalDividersTotalMm) : "-"} />
          <ComputedCard label="Medidas útiles cargadas" value={metrics.sectionsTotalMm > 0 ? formatMm(metrics.sectionsTotalMm) : "-"} />
          <ComputedCard label="Estado" value={metrics.exceeds ? `Excede ${formatMm(Math.abs(metrics.remainingMm))}` : (metrics.matchesExactly ? "Reparto completo" : `Restan ${formatMm(metrics.remainingMm)}`)} />
        </div>

        {error ? <div style={{ color: "#b91c1c", fontWeight: 800, marginTop: 12 }}>{error}</div> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              border: "1px solid #00a99d",
              borderRadius: 10,
              background: canSave ? "#00a99d" : "#9ca3af",
              color: "#fff",
              padding: "10px 14px",
              fontWeight: 900,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            Guardar datos y continuar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PortonDimensions({ kind = "porton" }) {
  const normalizedKind = normalizeKind(kind);
  const isPorton = normalizedKind === "porton";
  const isIpanel = normalizedKind === "ipanel";
  const isPlegados = normalizedKind === "plegados";
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);
  const lines = useQuoteStore((s) => s.lines);
  const measurementForm = useQuoteStore((s) => s.measurementForm);
  const measuredWidths = measurementTripleMm(measurementForm?.esquema?.ancho);
  const measuredHeights = measurementTripleMm(measurementForm?.esquema?.alto);
  const [parantesSketchOpen, setParantesSketchOpen] = useState(false);
  const [ipanelSketchOpen, setIpanelSketchOpen] = useState(false);
  const [ipanelLamasSetupOpen, setIpanelLamasSetupOpen] = useState(false);
  const [plegadoAttachmentError, setPlegadoAttachmentError] = useState("");
  const rulesQ = useQuery({ queryKey: ["technical-rules-dimensions-preview"], queryFn: () => adminGetTechnicalMeasurementRules("porton"), staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true, enabled: isPorton });

  const plegadoAttachment = getPlegadoAttachment({ payload: { dimensions } });
  async function handlePlegadoAttachmentChange(event) {
    const file = event?.target?.files?.[0] || null;
    if (!file) return;
    try {
      setPlegadoAttachmentError("");
      const attachment = await fileToPlegadoAttachment(file);
      setDimensions({ plegado_plano_attachment: attachment, plano_plegado_attachment: attachment });
    } catch (error) {
      setPlegadoAttachmentError(error?.message || "No se pudo adjuntar el plano.");
    } finally {
      if (event?.target) event.target.value = "";
    }
  }

  const portonWidthRaw = String(dimensions?.width ?? "");
  const portonHeightRaw = String(dimensions?.height ?? "");
  const vanoWidthRaw = isPorton ? String(dimensions?.vano_width ?? dimensions?.width ?? "") : portonWidthRaw;
  const vanoHeightRaw = isPorton ? String(dimensions?.vano_height ?? dimensions?.height ?? "") : portonHeightRaw;
  const widthRaw = isPorton ? vanoWidthRaw : portonWidthRaw;
  const heightRaw = isPorton ? vanoHeightRaw : portonHeightRaw;
  const width = useMemo(() => toNumber(isPorton ? portonWidthRaw : widthRaw), [isPorton, portonWidthRaw, widthRaw]);
  const height = useMemo(() => toNumber(isPorton ? portonHeightRaw : heightRaw), [isPorton, portonHeightRaw, heightRaw]);
  const widthValue = useMemo(() => parseOptionalNumber(normalizeDecimalWithDot(isPorton ? portonWidthRaw : widthRaw)), [isPorton, portonWidthRaw, widthRaw]);
  const heightValue = useMemo(() => parseOptionalNumber(normalizeDecimalWithDot(isPorton ? portonHeightRaw : heightRaw)), [isPorton, portonHeightRaw, heightRaw]);
  const vanoWidth = useMemo(() => toNumber(vanoWidthRaw), [vanoWidthRaw]);
  const vanoHeight = useMemo(() => toNumber(vanoHeightRaw), [vanoHeightRaw]);
  const selectedProductIdsForIpanel = useMemo(() => getBudgetProductIdSetFromLines(lines), [lines]);
  const hasIpanelLamas22Panel = isIpanel && [...IPANEL_LAMAS_22_PRODUCT_IDS].some((id) => selectedProductIdsForIpanel.has(id));
  const hasIpanelVarilladoPanel = isIpanel && hasIpanelVarilladoProduct(lines);
  const hasIpanelExtendedAllowedPanel = hasIpanelLamas22Panel || hasIpanelVarilladoPanel;
  const ipanelWidthMaxForSelection = hasIpanelExtendedAllowedPanel ? IPANEL_LAMAS_WIDTH_MAX_M : IPANEL_WIDTH_MAX_M;
  const ipanelHeightMaxForSelection = hasIpanelExtendedAllowedPanel ? IPANEL_LAMAS_HEIGHT_MAX_M : IPANEL_HEIGHT_MAX_M;
  const widthOutOfBounds = widthValue !== null && (isPorton ? (widthValue < WIDTH_MIN_M || widthValue > WIDTH_MAX_M) : (isIpanel ? widthValue > ipanelWidthMaxForSelection : false));
  const heightOutOfBounds = heightValue !== null && (isPorton ? (heightValue < HEIGHT_MIN_M || heightValue > HEIGHT_MAX_M) : (isIpanel ? heightValue > ipanelHeightMaxForSelection : false));
  const hasSizeError = (isPorton || isIpanel) && (widthOutOfBounds || heightOutOfBounds);
  const widthHelper = isPorton ? "Minimo 2.4 m - Maximo 7 m" : (isIpanel ? "Panel simple max 1.16 m. Lamas y varillado max 2.00 m" : "");
  const heightHelper = isPorton ? "Minimo 2 m - Maximo 3 m" : (isIpanel ? "Maximo 2.45 m (245 cm)" : "");
  const widthPlaceholder = isIpanel ? "Ej: 1.16" : "Ej: 3.2";
  const heightPlaceholder = isIpanel ? "Ej: 2.45" : "Ej: 2.1";
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);
  const ipanelLamasOrientation = normalizeIpanelLamasOrientation(
    dimensions?.ipanel_lamas_orientacion ??
    dimensions?.orientacion_ipanel_lamas ??
    dimensions?.ipanel_orientacion_lamas ??
    dimensions?.ipanel_lamas_orientation ??
    "horizontal"
  );
  const ipanelDivisionsMax = getIpanelDivisionsMaxByOrientation(ipanelLamasOrientation);
  const ipanelDivisionsValue = String(dimensions?.ipanel_divisiones ?? dimensions?.cantidad_divisiones_ipanel ?? "");
  const ipanelDivisionsCount = Math.max(0, Math.trunc(Number(ipanelDivisionsValue || 0)));
  const ipanelDividersIncludedInSectionSizes = dimensions?.ipanel_divisiones_incluyen_liston === true || String(dimensions?.ipanel_divisiones_incluyen_liston || "").trim().toLowerCase() === "true";
  const ipanelDistributionMode = String(dimensions?.ipanel_distribucion_divisiones || dimensions?.ipanel_divisiones_distribucion || "").trim().toLowerCase();
  const isIpanelClassicDistribution = ipanelDividersIncludedInSectionSizes || ipanelDistributionMode === "clasica";
  const ipanelAxisDimensionMm = useMemo(() => getIpanelAxisDimensionMm({ orientation: ipanelLamasOrientation, widthM: width, heightM: height }), [ipanelLamasOrientation, width, height]);
  const rawIpanelSectionSizes = useMemo(
    () => sanitizeIpanelSectionSizes(dimensions?.ipanel_divisiones_medidas_mm ?? dimensions?.medidas_divisiones_ipanel_mm ?? dimensions?.ipanel_section_sizes_mm ?? [], ipanelDivisionsCount),
    [dimensions?.ipanel_divisiones_medidas_mm, dimensions?.medidas_divisiones_ipanel_mm, dimensions?.ipanel_section_sizes_mm, ipanelDivisionsCount],
  );
  const ipanelSectionMetrics = useMemo(
    () => computeIpanelSectionMetrics({ values: rawIpanelSectionSizes, count: ipanelDivisionsCount, axisDimensionMm: ipanelAxisDimensionMm, dividerMm: IPANEL_DIVIDER_LINE_MM, dividersIncludedInSectionSizes: isIpanelClassicDistribution }),
    [rawIpanelSectionSizes, ipanelDivisionsCount, ipanelAxisDimensionMm, isIpanelClassicDistribution],
  );
  const ipanelDivisionsHasError = hasIpanelLamas22Panel && isIpanelDivisionsOutOfBounds(ipanelDivisionsValue, ipanelDivisionsMax);
  const ipanelLamasSetupCompleted = isTruthyFlag(dimensions?.ipanel_lamas_popup_completed) || isTruthyFlag(dimensions?.ipanel_lamas_setup_completed);

  useEffect(() => {
    if (!hasIpanelLamas22Panel) {
      setIpanelLamasSetupOpen(false);
      return;
    }
    if (!ipanelLamasSetupCompleted) setIpanelLamasSetupOpen(true);
  }, [hasIpanelLamas22Panel, ipanelLamasSetupCompleted]);

  useEffect(() => {
    if (!hasIpanelLamas22Panel) return;
    const currentOrientation = String(
      dimensions?.ipanel_lamas_orientacion ??
      dimensions?.orientacion_ipanel_lamas ??
      dimensions?.ipanel_orientacion_lamas ??
      dimensions?.ipanel_lamas_orientation ??
      ""
    ).trim();
    const patch = {};
    if (!currentOrientation) {
      patch.ipanel_lamas_orientacion = "horizontal";
      patch.orientacion_ipanel_lamas = "horizontal";
      patch.ipanel_orientacion_lamas = "horizontal";
      patch.ipanel_lamas_orientation = "horizontal";
    }
    const shouldDefaultClassic = !ipanelDistributionMode || ipanelDistributionMode === "clasica" || dimensions?.ipanel_divisiones_incluyen_liston === true;
    if (shouldDefaultClassic && ipanelAxisDimensionMm > 0) {
      const classicSizes = buildClassicIpanelSectionSizes(ipanelAxisDimensionMm, 353);
      const classicCount = classicSizes.length;
      if (classicCount >= 2) {
        if (String(ipanelDivisionsValue || "") !== String(classicCount)) {
          patch.ipanel_divisiones = String(classicCount);
          patch.cantidad_divisiones_ipanel = String(classicCount);
        }
        const currentClassicSizes = sanitizeIpanelSectionSizes(
          dimensions?.ipanel_divisiones_medidas_mm ?? dimensions?.medidas_divisiones_ipanel_mm ?? dimensions?.ipanel_section_sizes_mm ?? [],
          classicCount,
        );
        if (JSON.stringify(currentClassicSizes) !== JSON.stringify(classicSizes)) {
          patch.ipanel_divisiones_medidas_mm = classicSizes;
          patch.medidas_divisiones_ipanel_mm = classicSizes;
          patch.ipanel_section_sizes_mm = classicSizes;
        }
        if (ipanelDistributionMode !== "clasica") {
          patch.ipanel_distribucion_divisiones = "clasica";
          patch.ipanel_divisiones_distribucion = "clasica";
        }
        if (dimensions?.ipanel_divisiones_incluyen_liston !== true) patch.ipanel_divisiones_incluyen_liston = true;
      }
    } else {
      const clamped = clampIpanelDivisions(ipanelDivisionsValue, ipanelDivisionsMax);
      if (ipanelDivisionsValue && clamped && String(clamped) !== String(ipanelDivisionsValue)) {
        patch.ipanel_divisiones = clamped;
        patch.cantidad_divisiones_ipanel = clamped;
      }
      if (ipanelDivisionsCount >= 2) {
        const currentSizes = sanitizeIpanelSectionSizes(
          dimensions?.ipanel_divisiones_medidas_mm ?? dimensions?.medidas_divisiones_ipanel_mm ?? dimensions?.ipanel_section_sizes_mm ?? [],
          ipanelDivisionsCount,
        );
        let nextSizes = currentSizes.slice(0, ipanelDivisionsCount);
        if (nextSizes.length < ipanelDivisionsCount) {
          const defaults = buildUniformIpanelSectionSizes({ count: ipanelDivisionsCount, axisDimensionMm: ipanelAxisDimensionMm, dividerMm: IPANEL_DIVIDER_LINE_MM });
          nextSizes = Array.from({ length: ipanelDivisionsCount }, (_, index) => nextSizes[index] || defaults[index] || "");
        }
        if (!nextSizes.some((item) => String(item || "").trim())) {
          nextSizes = buildUniformIpanelSectionSizes({ count: ipanelDivisionsCount, axisDimensionMm: ipanelAxisDimensionMm, dividerMm: IPANEL_DIVIDER_LINE_MM });
        }
        const currentSerialized = JSON.stringify(currentSizes);
        const nextSerialized = JSON.stringify(nextSizes);
        if (currentSerialized !== nextSerialized) {
          patch.ipanel_divisiones_medidas_mm = nextSizes;
          patch.medidas_divisiones_ipanel_mm = nextSizes;
          patch.ipanel_section_sizes_mm = nextSizes;
        }
      }
    }
    if (!String(dimensions?.ipanel_divisor_mm ?? dimensions?.linea_division_ipanel_mm ?? "").trim()) {
      patch.ipanel_divisor_mm = String(IPANEL_DIVIDER_LINE_MM);
      patch.linea_division_ipanel_mm = String(IPANEL_DIVIDER_LINE_MM);
    }
    if (Object.keys(patch).length) setDimensions(patch);
  }, [hasIpanelLamas22Panel, ipanelDivisionsValue, ipanelDivisionsCount, ipanelDivisionsMax, ipanelAxisDimensionMm, ipanelDistributionMode, dimensions?.ipanel_divisiones_incluyen_liston, dimensions?.ipanel_lamas_orientacion, dimensions?.orientacion_ipanel_lamas, dimensions?.ipanel_orientacion_lamas, dimensions?.ipanel_lamas_orientation, dimensions?.ipanel_divisiones_medidas_mm, dimensions?.medidas_divisiones_ipanel_mm, dimensions?.ipanel_section_sizes_mm, dimensions?.ipanel_divisor_mm, dimensions?.linea_division_ipanel_mm, setDimensions]);

  const params = useMemo(() => getRulesParams(rulesQ.data), [rulesQ.data]);
  const selectedVanoPlacementProductId = useMemo(() => isPorton ? getSelectedVanoPlacementProductId(lines) : 0, [isPorton, lines]);
  const selectedVanoPlacementLabel = getVanoPlacementLabel(selectedVanoPlacementProductId);
  const explicitVanoMeasures = isPorton && hasExplicitVanoMeasures(dimensions);
  const preview = useMemo(() => buildCalculatedPreview({ widthM: width, heightM: height, lines, params, portonType, dimensions }), [width, height, lines, params, portonType, dimensions]);
  const vanoLegsKey = normalizeLegsKeyForVano(preview?.legsLabel);
  const calculatedPortonFromVano = useMemo(
    () => computePortonFromVano({
      vanoWidthM: vanoWidth,
      vanoHeightM: vanoHeight,
      placementProductId: selectedVanoPlacementProductId,
      legsKey: vanoLegsKey,
      params,
    }),
    [vanoWidth, vanoHeight, selectedVanoPlacementProductId, vanoLegsKey, params],
  );

  useEffect(() => {
    // vano_size_auto_calc solo se setea en presupuestos nuevos (ver store.reset()) o cuando "Actualizar
    // presupuesto" lo activa a proposito para un presupuesto viejo sin ancho/alto cargado (ver CotizadorPage
    // index.jsx). Los presupuestos existentes cargados via loadFromQuote no lo tienen por defecto, asi que
    // este calculo no les toca ancho/alto en pantalla con solo abrirlos.
    if (!isPorton || !explicitVanoMeasures || !dimensions?.vano_size_auto_calc) return;
    const nextWidth = calculatedPortonFromVano.widthM > 0 ? formatNumberForInput(calculatedPortonFromVano.widthM) : "";
    const nextHeight = calculatedPortonFromVano.heightM > 0 ? formatNumberForInput(calculatedPortonFromVano.heightM) : "";
    const patch = {
      porton_measure_source: "vano",
      porton_colocacion_product_id: selectedVanoPlacementProductId || null,
      porton_colocacion_label: selectedVanoPlacementLabel,
      porton_vano_width_m: vanoWidth > 0 ? Number(vanoWidth.toFixed(3)) : 0,
      porton_vano_height_m: vanoHeight > 0 ? Number(vanoHeight.toFixed(3)) : 0,
      porton_width_extra_m: calculatedPortonFromVano.widthAddM,
      porton_height_extra_m: calculatedPortonFromVano.heightAddM,
      porton_width_calculated_m: calculatedPortonFromVano.widthM,
      porton_height_calculated_m: calculatedPortonFromVano.heightM,
      porton_piernas_calculo: vanoLegsKey,
    };
    if (nextWidth && String(dimensions?.width ?? "") !== nextWidth) patch.width = nextWidth;
    if (nextHeight && String(dimensions?.height ?? "") !== nextHeight) patch.height = nextHeight;
    const changed = Object.entries(patch).some(([key, value]) => String(dimensions?.[key] ?? "") !== String(value ?? ""));
    if (changed) setDimensions(patch);
  }, [
    isPorton,
    explicitVanoMeasures,
    dimensions?.vano_size_auto_calc,
    selectedVanoPlacementProductId,
    selectedVanoPlacementLabel,
    vanoWidth,
    vanoHeight,
    calculatedPortonFromVano.widthM,
    calculatedPortonFromVano.heightM,
    calculatedPortonFromVano.widthAddM,
    calculatedPortonFromVano.heightAddM,
    vanoLegsKey,
    dimensions?.width,
    dimensions?.height,
    dimensions?.porton_measure_source,
    dimensions?.porton_colocacion_product_id,
    dimensions?.porton_colocacion_label,
    dimensions?.porton_vano_width_m,
    dimensions?.porton_vano_height_m,
    dimensions?.porton_width_extra_m,
    dimensions?.porton_height_extra_m,
    dimensions?.porton_width_calculated_m,
    dimensions?.porton_height_calculated_m,
    dimensions?.porton_piernas_calculo,
    setDimensions,
  ]);

  useEffect(() => {
    // Se guarda el peso estimado dentro de dimensions para poder validar el tope maximo del
    // porton (350 kg) al confirmar/guardar, sin tener que recalcular la formula completa alli.
    if (!isPorton) return;
    const kg = preview?.estimatedWeightKg > 0 ? preview.estimatedWeightKg : 0;
    if (String(dimensions?.porton_estimated_weight_kg ?? "") !== String(kg)) {
      setDimensions({ porton_estimated_weight_kg: kg });
    }
  }, [isPorton, preview?.estimatedWeightKg, dimensions?.porton_estimated_weight_kg, setDimensions]);

  const aptoParaRevestir = isAptoDerivedType(portonType) || detectNoCladdingByProducts(lines, params);
  const isNonAptoPorton = isPorton && !aptoParaRevestir;
  const detectedDoorSide = useMemo(() => isPorton ? resolveDoorSideForParantes(lines, params) : "", [isPorton, lines, params]);
  const detectedDoorLabel = detectedDoorSide === "izquierdo" ? "Puerta Izquierda" : (detectedDoorSide === "derecho" ? "Puerta Derecha" : "");
  const hasDoorParantesConfig = !!detectedDoorSide;
  const nonAptoConfiguredOrientation = isNonAptoPorton ? resolveNonAptoParantesOrientation(lines, params) : "";
  const orientation = normalizeOrientation(dimensions?.orientacion_parantes);
  const effectiveParantesOrientation = isNonAptoPorton && nonAptoConfiguredOrientation ? nonAptoConfiguredOrientation : orientation;
  const distribution = normalizeDistribution(dimensions?.distribucion_parantes);
  const parantesFieldsReadOnly = isNonAptoPorton;
  const autoParantesCount = computeAutomaticParantesCount({ orientation: effectiveParantesOrientation, widthM: width, heightM: height, lines });
  const parantesCount = getParantesCount(dimensions?.cantidad_parantes);
  const tubeDiscountMm = getParantesTubeDiscountMm(params);
  const baseParantesDimensionMm = useMemo(
    () => {
      if (effectiveParantesOrientation === "horizontal") return Math.max(0, Number(preview?.altoHojaMm || preview?.altoPasoMm || 0));
      return Math.max(0, Number(preview?.anchoHojaMm || preview?.anchoPasoMm || 0));
    },
    [effectiveParantesOrientation, preview?.altoHojaMm, preview?.anchoHojaMm, preview?.altoPasoMm, preview?.anchoPasoMm],
  );
  const rawParantesDistances = dimensions?.distancias_parantes_mm ?? dimensions?.distancias_parantes ?? [];
  const hasStoredParantesConfig = isPorton && (
    String(dimensions?.cantidad_parantes ?? "").trim() ||
    String(dimensions?.orientacion_parantes ?? "").trim() ||
    String(dimensions?.distribucion_parantes ?? "").trim() ||
    String(dimensions?.observaciones_parantes ?? "").trim() ||
    (Array.isArray(rawParantesDistances) && rawParantesDistances.some((item) => String(item ?? "").trim()))
  );
  const distributeUniformly = dimensions?.distribuir_parantes_uniformemente === true || String(dimensions?.distribuir_parantes_uniformemente || "").trim().toLowerCase() === "true";
  const showSpecialParantesDistances = isPorton && aptoParaRevestir && distribution === "especial";
  const aptoHasDoorFixedReference = isPorton && aptoParaRevestir && hasDoorParantesConfig;
  const aptoManualFixedReferenceEnabled = showSpecialParantesDistances && !hasDoorParantesConfig && (
    dimensions?.parantes_primer_parante_distancia_fija === true ||
    String(dimensions?.parantes_primer_parante_distancia_fija || "").trim().toLowerCase() === "true" ||
    dimensions?.parantes_simular_referencia_horizontal === true ||
    String(dimensions?.parantes_simular_referencia_horizontal || "").trim().toLowerCase() === "true"
  );
  const aptoSimulaHorizontalReferencia = aptoHasDoorFixedReference || aptoManualFixedReferenceEnabled;
  const aptoReferenciaLado = String(dimensions?.parantes_referencia_lado || detectedDoorSide || "izquierdo").trim().toLowerCase() === "derecho" ? "derecho" : "izquierdo";
  const aptoReferenciaDistancia = String(dimensions?.parantes_referencia_distancia_mm ?? dimensions?.parantes_primer_parante_distancia_mm ?? String(DOOR_FIXED_PARANTE_DISTANCE_MM));
  const aptoReferenciaDistanciaMm = Math.max(0, parseMmNumber(aptoReferenciaDistancia) || DOOR_FIXED_PARANTE_DISTANCE_MM);
  const nonAptoDoorFixedReference = isNonAptoPorton && hasDoorParantesConfig;
  const effectiveFixedReference = aptoSimulaHorizontalReferencia || nonAptoDoorFixedReference;
  const effectiveFixedReferenceSide = aptoSimulaHorizontalReferencia ? aptoReferenciaLado : (detectedDoorSide || aptoReferenciaLado);
  const effectiveFixedReferenceDistanceMm = aptoSimulaHorizontalReferencia ? aptoReferenciaDistanciaMm : DOOR_FIXED_PARANTE_DISTANCE_MM;
  const aptoParantesRestantesCount = aptoSimulaHorizontalReferencia ? Math.max(0, parantesCount - 1) : parantesCount;
  const aptoDistributionBaseDimensionMm = aptoSimulaHorizontalReferencia && effectiveParantesOrientation === "verticales"
    ? Math.max(0, baseParantesDimensionMm - aptoReferenciaDistanciaMm)
    : baseParantesDimensionMm;
  const effectiveParantesRestantesCount = effectiveFixedReference ? Math.max(0, parantesCount - 1) : parantesCount;
  const effectiveDistributionBaseDimensionMm = effectiveFixedReference && effectiveParantesOrientation === "verticales"
    ? Math.max(0, baseParantesDimensionMm - effectiveFixedReferenceDistanceMm)
    : baseParantesDimensionMm;
  const resolvedParantesDistances = useMemo(() => {
    const current = normalizeDistanceList(rawParantesDistances);
    const countForDistances = effectiveFixedReference ? effectiveParantesRestantesCount : (showSpecialParantesDistances ? aptoParantesRestantesCount : parantesCount);
    if (aptoSimulaHorizontalReferencia && distribution !== "especial") {
      return buildResolvedParantesDistances({
        distanceList: [],
        distributeUniformly: true,
        parantesCount: countForDistances,
        baseDimensionMm: effectiveDistributionBaseDimensionMm,
        tubeDiscountMm,
      });
    }
    if (showSpecialParantesDistances && distributeUniformly) {
      return buildResolvedParantesDistances({
        distanceList: [],
        distributeUniformly: true,
        parantesCount: countForDistances,
        baseDimensionMm: effectiveDistributionBaseDimensionMm,
        tubeDiscountMm,
      });
    }
    return padDistanceList(current, countForDistances);
  }, [rawParantesDistances, showSpecialParantesDistances, distributeUniformly, aptoParantesRestantesCount, parantesCount, effectiveFixedReference, effectiveParantesRestantesCount, effectiveDistributionBaseDimensionMm, tubeDiscountMm, aptoSimulaHorizontalReferencia, distribution]);
  const resolvedDistancesHaveValues = normalizeDistanceList(resolvedParantesDistances).some((item) => {
    const n = parseMmNumber(item);
    return Number.isFinite(n) && n > 0;
  });
  const distancesForFixedReferenceSketch = effectiveFixedReference && !resolvedDistancesHaveValues
    ? buildUniformParantesDistances({
        parantesCount: effectiveParantesRestantesCount,
        baseDimensionMm: effectiveDistributionBaseDimensionMm,
        tubeDiscountMm,
      })
    : resolvedParantesDistances;
  const sketchParantesDistances = effectiveFixedReference
    ? buildFixedReferenceSketchDistances({
        distances: distancesForFixedReferenceSketch,
        orientation: effectiveParantesOrientation,
        fixedDistanceMm: effectiveFixedReferenceDistanceMm,
      })
    : resolvedParantesDistances;
  const sketchParantesCount = effectiveFixedReference ? effectiveParantesRestantesCount : parantesCount;

  useEffect(() => {
    if (!isPorton || !aptoParaRevestir || !hasDoorParantesConfig) return;
    const fixedEnabled = dimensions?.parantes_primer_parante_distancia_fija === true ||
      String(dimensions?.parantes_primer_parante_distancia_fija || "").trim().toLowerCase() === "true" ||
      dimensions?.parantes_simular_referencia_horizontal === true ||
      String(dimensions?.parantes_simular_referencia_horizontal || "").trim().toLowerCase() === "true";
    const isSpecialDistribution = distribution === "especial";
    const patch = {};
    if (!fixedEnabled) {
      patch.parantes_primer_parante_distancia_fija = true;
      patch.parantes_simular_referencia_horizontal = true;
    }
    if (String(dimensions?.parantes_referencia_lado || "").trim().toLowerCase() !== detectedDoorSide) {
      patch.parantes_referencia_lado = detectedDoorSide;
    }
    const currentDistance = String(dimensions?.parantes_referencia_distancia_mm ?? dimensions?.parantes_primer_parante_distancia_mm ?? "").trim();
    if (!isSpecialDistribution) {
      if (currentDistance !== String(DOOR_FIXED_PARANTE_DISTANCE_MM)) {
        patch.parantes_referencia_distancia_mm = String(DOOR_FIXED_PARANTE_DISTANCE_MM);
        patch.parantes_primer_parante_distancia_mm = String(DOOR_FIXED_PARANTE_DISTANCE_MM);
      }
      if (dimensions?.distribuir_parantes_uniformemente !== true) patch.distribuir_parantes_uniformemente = true;
    } else if (!currentDistance) {
      patch.parantes_referencia_distancia_mm = String(DOOR_FIXED_PARANTE_DISTANCE_MM);
      patch.parantes_primer_parante_distancia_mm = String(DOOR_FIXED_PARANTE_DISTANCE_MM);
    }
    if (parantesCount <= 0) patch.cantidad_parantes = "1";
    if (Object.keys(patch).length) setDimensions(patch);
  }, [
    isPorton,
    aptoParaRevestir,
    hasDoorParantesConfig,
    detectedDoorSide,
    distribution,
    dimensions?.parantes_primer_parante_distancia_fija,
    dimensions?.parantes_simular_referencia_horizontal,
    dimensions?.parantes_referencia_lado,
    dimensions?.parantes_referencia_distancia_mm,
    dimensions?.parantes_primer_parante_distancia_mm,
    dimensions?.distribuir_parantes_uniformemente,
    parantesCount,
    setDimensions,
  ]);

  useEffect(() => {
    if (!isPorton) return;
    const patch = {};
    const currentOrientationRaw = String(dimensions?.orientacion_parantes || "").trim();
    const currentDistributionRaw = String(dimensions?.distribucion_parantes || "").trim();
    const currentCountRaw = String(dimensions?.cantidad_parantes ?? "").trim();
    const currentCountNumber = getParantesCount(dimensions?.cantidad_parantes);
    const shouldAutoManageNonAptoParantes = isNonAptoPorton;

    if (shouldAutoManageNonAptoParantes && nonAptoConfiguredOrientation && orientation !== nonAptoConfiguredOrientation) patch.orientacion_parantes = nonAptoConfiguredOrientation;
    else if (!currentOrientationRaw) patch.orientacion_parantes = "verticales";

    if (shouldAutoManageNonAptoParantes && distribution !== "repartido") patch.distribucion_parantes = "repartido";
    else if (!currentDistributionRaw) patch.distribucion_parantes = "repartido";

    const nextCount = String(autoParantesCount);
    const shouldUpdateParantesCount = isNonAptoPorton || !currentCountRaw || currentCountNumber <= 0;
    if (shouldUpdateParantesCount && currentCountRaw !== nextCount) patch.cantidad_parantes = nextCount;
    if (Object.keys(patch).length) setDimensions(patch);
  }, [isPorton, isNonAptoPorton, nonAptoConfiguredOrientation, orientation, distribution, autoParantesCount, dimensions?.orientacion_parantes, dimensions?.distribucion_parantes, dimensions?.cantidad_parantes, setDimensions]);

  useEffect(() => {
    if (!isPorton) return;
    const nextKgM2 = aptoParaRevestir ? (resolveAptoKgM2ByProducts(lines, params) || preview.effectiveKgM2) : "";
    if (aptoParaRevestir && nextKgM2 > 0) {
      const nextValue = formatNumberForInput(nextKgM2);
      if (String(dimensions?.kg_m2 || "").trim() !== nextValue) setDimensions({ kg_m2: nextValue });
    } else if (!aptoParaRevestir && String(dimensions?.kg_m2 || "").trim()) {
      setDimensions({ kg_m2: "" });
    }
  }, [isPorton, aptoParaRevestir, dimensions?.kg_m2, lines, params, preview.effectiveKgM2, setDimensions]);

  useEffect(() => {
    if (!isPorton) return;
    const patch = {
      paso_ancho_mm: preview.anchoPasoMm,
      paso_alto_mm: preview.altoPasoMm,
      paso_ancho_m: preview.anchoPasoMm > 0 ? Number((preview.anchoPasoMm / 1000).toFixed(3)) : 0,
      paso_alto_m: preview.altoPasoMm > 0 ? Number((preview.altoPasoMm / 1000).toFixed(3)) : 0,
      medidas_paso_ancho_mm: preview.anchoPasoMm,
      medidas_paso_alto_mm: preview.altoPasoMm,
      medidas_paso_text: preview.anchoPasoMm > 0 && preview.altoPasoMm > 0 ? `${formatMetersFromMm(preview.anchoPasoMm)} x ${formatMetersFromMm(preview.altoPasoMm)}` : "",
      hoja_ancho_mm: preview.anchoHojaMm,
      hoja_alto_mm: preview.altoHojaMm,
      hoja_ancho_m: preview.anchoHojaMm > 0 ? Number((preview.anchoHojaMm / 1000).toFixed(3)) : 0,
      hoja_alto_m: preview.altoHojaMm > 0 ? Number((preview.altoHojaMm / 1000).toFixed(3)) : 0,
    };
    const changed = Object.entries(patch).some(([key, value]) => String(dimensions?.[key] ?? "") !== String(value ?? ""));
    if (changed) setDimensions(patch);
  }, [isPorton, preview.anchoPasoMm, preview.altoPasoMm, preview.anchoHojaMm, preview.altoHojaMm, setDimensions]);

  if (!isPorton && !isIpanel && !isPlegados) return null;
  const title = isPlegados ? "Medidas del plegado" : (isPorton ? "Medidas del Vano" : "Medidas del Ipanel");
  function setVanoDimension(key, value) {
    const normalized = normalizeDecimal(value);
    if (key === "width") {
      setDimensions({ vano_width: normalized, porton_measure_source: "vano" });
    } else {
      setDimensions({ vano_height: normalized, porton_measure_source: "vano" });
    }
  }
  const parantesHelper = parantesFieldsReadOnly
    ? (hasDoorParantesConfig ? `Solo lectura. ${detectedDoorLabel}: primer parante a ${DOOR_FIXED_PARANTE_DISTANCE_MM} mm del lateral ${detectedDoorSide}.` : "Solo lectura. Se calcula automaticamente segun reglas tecnicas, orientacion y medidas cargadas.")
    : effectiveParantesOrientation === "verticales"
      ? (hasSpecialParantesProduct(lines) ? "Se sugiere automaticamente usando el ancho completo. Si queres, podes cambiar el valor manualmente." : "Se sugiere automaticamente restando 0.80 m al ancho. Si queres, podes cambiar el valor manualmente.")
      : "En horizontal podes ajustar manualmente la cantidad de parantes.";
  const orientationReadOnlyHelper = parantesFieldsReadOnly ? "Solo lectura. Definida automaticamente por reglas tecnicas segun los IDs del presupuesto." : "";

  function setParantesDistanceAt(index, value) {
    if (parantesFieldsReadOnly) return;
    const targetCount = aptoSimulaHorizontalReferencia ? Math.max(aptoParantesRestantesCount, index + 1) : Math.max(parantesCount, index + 1);
    const next = padDistanceList(rawParantesDistances, targetCount);
    next[index] = normalizeDecimalMmInput(value);
    setDimensions(buildParantesPayload({ distances: next, tubeDiscountMm }));
  }
  function addParanteDistance() {
    if (parantesFieldsReadOnly) return;
    const nextCount = Math.max(0, parantesCount) + 1;
    const nextRestantesCount = aptoSimulaHorizontalReferencia ? Math.max(0, nextCount - 1) : nextCount;
    const nextDistances = padDistanceList(rawParantesDistances, nextRestantesCount);
    setDimensions({ cantidad_parantes: String(nextCount), ...buildParantesPayload({ distances: nextDistances, tubeDiscountMm }) });
  }
  function setIpanelSectionSizeAt(index, value) {
    const safeCount = Math.max(0, ipanelDivisionsCount);
    if (!safeCount) return;
    const next = Array.from({ length: safeCount }, (_, currentIndex) => rawIpanelSectionSizes[currentIndex] || "");
    next[index] = normalizeDecimalMmInput(value);
    setDimensions({
      ipanel_divisiones_medidas_mm: next,
      medidas_divisiones_ipanel_mm: next,
      ipanel_section_sizes_mm: next,
      ipanel_distribucion_divisiones: "manual",
      ipanel_divisiones_distribucion: "manual",
      ipanel_divisiones_incluyen_liston: false,
    });
  }
  function redistributeIpanelSections() {
    if (ipanelDivisionsCount < 2) return;
    const next = buildUniformIpanelSectionSizes({ count: ipanelDivisionsCount, axisDimensionMm: ipanelAxisDimensionMm, dividerMm: IPANEL_DIVIDER_LINE_MM });
    setDimensions({
      ipanel_divisiones_medidas_mm: next,
      medidas_divisiones_ipanel_mm: next,
      ipanel_section_sizes_mm: next,
      ipanel_distribucion_divisiones: "repartido",
      ipanel_divisiones_distribucion: "repartido",
      ipanel_divisiones_incluyen_liston: false,
    });
  }
  function applyClassicIpanelDistribution() {
    const next = buildClassicIpanelSectionSizes(ipanelAxisDimensionMm, 353);
    if (!next.length) return;
    setDimensions({
      ipanel_divisiones: String(next.length),
      cantidad_divisiones_ipanel: String(next.length),
      ipanel_divisiones_medidas_mm: next,
      medidas_divisiones_ipanel_mm: next,
      ipanel_section_sizes_mm: next,
      ipanel_distribucion_divisiones: "clasica",
      ipanel_divisiones_distribucion: "clasica",
      ipanel_divisiones_incluyen_liston: true,
    });
  }

  function saveIpanelLamasSetup(patch) {
    setDimensions(patch);
    setIpanelLamasSetupOpen(false);
  }

  function setAptoFixedFirstParante(checked) {
    const nextChecked = !!checked;
    const currentDistance = normalizeDecimalMmInput(aptoReferenciaDistancia || String(DOOR_FIXED_PARANTE_DISTANCE_MM)) || String(DOOR_FIXED_PARANTE_DISTANCE_MM);
    const patch = {
      parantes_primer_parante_distancia_fija: nextChecked,
      parantes_simular_referencia_horizontal: nextChecked,
      parantes_referencia_lado: nextChecked ? (dimensions?.parantes_referencia_lado || "izquierdo") : "",
      parantes_referencia_distancia_mm: nextChecked ? currentDistance : "",
      parantes_primer_parante_distancia_mm: nextChecked ? currentDistance : "",
    };
    if (nextChecked && parantesCount <= 0) patch.cantidad_parantes = "1";
    setDimensions(patch);
  }

  return (
    <>
      <IpanelLamasSetupModal
        open={ipanelLamasSetupOpen}
        widthM={width}
        heightM={height}
        initialOrientation={ipanelLamasOrientation}
        initialDivisions={ipanelDivisionsValue}
        initialSectionSizes={rawIpanelSectionSizes}
        initialClassicMode={isIpanelClassicDistribution}
        onSave={saveIpanelLamasSetup}
      />
      <div style={{ border: `1px solid ${hasSizeError ? "#fca5a5" : "transparent"}`, borderRadius: 14, padding: 4, background: hasSizeError ? "#fff7f7" : "transparent" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      {hasSizeError ? <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}>Se encuentra fuera de los limites de tamano.</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start" }}>
        <FieldBox label={isPorton ? "Ancho del vano (m)" : "Ancho (m)"} helper={widthHelper} helperColor={widthOutOfBounds ? "#b91c1c" : undefined}>
          <Input type="text" inputMode="decimal" value={widthRaw} onChange={(v) => isPorton ? setVanoDimension("width", v) : setDimensions({ width: normalizeDecimal(v) })} onBlur={(e) => isPorton ? setVanoDimension("width", e?.target?.value) : setDimensions({ width: normalizeDecimal(e?.target?.value) })} placeholder={isIpanel ? "Ej: 1.16" : "Ej: 3.2"} style={inputStateStyle(widthOutOfBounds)} />
          {isPorton ? <MeasuredValuesNote triple={measuredWidths} /> : null}
        </FieldBox>
        <FieldBox label={isPorton ? "Alto del vano (m)" : "Alto (m)"} helper={heightHelper} helperColor={heightOutOfBounds ? "#b91c1c" : undefined}>
          <Input type="text" inputMode="decimal" value={heightRaw} onChange={(v) => isPorton ? setVanoDimension("height", v) : setDimensions({ height: normalizeDecimal(v) })} onBlur={(e) => isPorton ? setVanoDimension("height", e?.target?.value) : setDimensions({ height: normalizeDecimal(e?.target?.value) })} placeholder={heightPlaceholder} style={inputStateStyle(heightOutOfBounds)} />
          {isPorton ? <MeasuredValuesNote triple={measuredHeights} /> : null}
        </FieldBox>
        {hasIpanelLamas22Panel ? (<>
          <FieldBox label="Orientación de lamas">
            <select
              value={ipanelLamasOrientation}
              onChange={(e) => {
                const nextOrientation = normalizeIpanelLamasOrientation(e.target.value);
                const nextMax = getIpanelDivisionsMaxByOrientation(nextOrientation);
                const nextDivisions = clampIpanelDivisions(ipanelDivisionsValue, nextMax);
                setDimensions({
                  ipanel_lamas_orientacion: nextOrientation,
                  orientacion_ipanel_lamas: nextOrientation,
                  ipanel_orientacion_lamas: nextOrientation,
                  ipanel_lamas_orientation: nextOrientation,
                  ...(nextDivisions ? { ipanel_divisiones: nextDivisions, cantidad_divisiones_ipanel: nextDivisions } : {}),
                });
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </FieldBox>
          <FieldBox label="Cantidad de divisiones" helper={`Entero positivo entre 2 y ${ipanelDivisionsMax}.`} helperColor={ipanelDivisionsHasError ? "#b91c1c" : undefined}>
            <Input
              type="text"
              inputMode="numeric"
              value={ipanelDivisionsValue}
              onChange={(v) => {
                const next = normalizeIpanelDivisionsInput(v, ipanelDivisionsMax);
                setDimensions({ ipanel_divisiones: next, cantidad_divisiones_ipanel: next, ipanel_distribucion_divisiones: "repartido", ipanel_divisiones_distribucion: "repartido", ipanel_divisiones_incluyen_liston: false });
              }}
              onBlur={(e) => {
                const next = clampIpanelDivisions(e?.target?.value, ipanelDivisionsMax);
                setDimensions({ ipanel_divisiones: next, cantidad_divisiones_ipanel: next, ipanel_distribucion_divisiones: "repartido", ipanel_divisiones_distribucion: "repartido", ipanel_divisiones_incluyen_liston: false });
              }}
              placeholder="Ej: 4"
              style={inputStateStyle(ipanelDivisionsHasError)}
            />
          </FieldBox>
        </>) : null}
        {isPlegados ? (<>
          <FieldBox label="Superficie del plegado"><div style={{ fontWeight: 800, fontSize: 16, minHeight: 40, display: "flex", alignItems: "center", padding: "9px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#334155" }}>{area ? `${area.toFixed(2)} m2` : "-"}</div></FieldBox>
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: "#0f172a" }}>Descripción del plegado</div>
            <textarea value={String(dimensions?.plegado_descripcion ?? dimensions?.descripcion_plegado ?? dimensions?.description ?? "")} onChange={(e) => setDimensions({ plegado_descripcion: e.target.value, descripcion_plegado: e.target.value })} rows={4} style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: "11px 12px", resize: "vertical", fontFamily: "inherit", fontWeight: 700, fontSize: 15, lineHeight: 1.45 }} placeholder="Describí el plegado, material, observaciones o cualquier dato técnico necesario..." />
            <div className="muted">Información técnica o detalle que verá Comercial y Técnica.</div>
          </div>
          <div style={{ gridColumn: "1 / -1", border: "1px solid #d9e5f7", background: "#f7fbff", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>Adjuntá el plano</div>
            <div className="muted" style={{ marginBottom: 10 }}>Obligatorio para plegados. Puede ser PDF o imagen.</div>
            <input type="file" accept="application/pdf,image/*" onChange={handlePlegadoAttachmentChange} />
            {plegadoAttachment ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                <span style={{ fontWeight: 800 }}>{formatPlegadoAttachmentMeta(plegadoAttachment)}</span>
                <button type="button" onClick={() => openPlegadoAttachment(plegadoAttachment)} style={{ border: "1px solid #c7d2fe", borderRadius: 10, background: "#eef2ff", padding: "7px 10px", fontWeight: 800, cursor: "pointer" }}>Ver plano</button>
                <button type="button" onClick={() => downloadPlegadoAttachment(plegadoAttachment)} style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: "7px 10px", fontWeight: 800, cursor: "pointer" }}>Descargar</button>
                <button type="button" onClick={() => setDimensions({ plegado_plano_attachment: null, plano_plegado_attachment: null })} style={{ border: "1px solid #fecaca", borderRadius: 10, background: "#fff1f2", color: "#991b1b", padding: "7px 10px", fontWeight: 800, cursor: "pointer" }}>Quitar</button>
              </div>
            ) : <div className="muted" style={{ marginTop: 10 }}>Sin plano adjunto.</div>}
            {plegadoAttachmentError ? <div style={{ color: "#b91c1c", fontWeight: 800, marginTop: 8 }}>{plegadoAttachmentError}</div> : null}
          </div>
        </>) : null}
        {isPorton ? (<>
          <FieldBox label="Tipo de colocación"><Input value={selectedVanoPlacementLabel} disabled placeholder="Por dentro del vano" style={disabledComputedInputStyle()} /></FieldBox>
          <FieldBox label="Ancho calculado del portón"><Input value={width ? `${formatNumberForInput(width)} m` : ""} disabled placeholder="Se calcula desde el vano" style={disabledComputedInputStyle()} /></FieldBox>
          <FieldBox label="Alto calculado del portón"><Input value={height ? `${formatNumberForInput(height)} m` : ""} disabled placeholder="Se calcula desde el vano" style={disabledComputedInputStyle()} /></FieldBox>
          {selectedVanoPlacementProductId === VANO_BEHIND_PRODUCT_ID ? (
            <FieldBox label="Adicional por piernas"><Input value={`${formatNumberForInput(calculatedPortonFromVano.widthAddM)} m (${vanoLegsKey})`} disabled style={disabledComputedInputStyle()} /></FieldBox>
          ) : null}
          {selectedVanoPlacementProductId === VANO_BEHIND_PRODUCT_ID ? (
            <FieldBox label="Adicional de alto (dintel)"><Input value={`${formatNumberForInput(calculatedPortonFromVano.heightAddM)} m`} disabled style={disabledComputedInputStyle()} /></FieldBox>
          ) : null}
          {explicitVanoMeasures && !dimensions?.vano_size_auto_calc ? (
            <FieldBox label="Calculo automatico">
              <div style={{ fontSize: 13, color: "#92400e", fontWeight: 700, padding: "9px 12px", borderRadius: 10, border: "1px solid #fde68a", background: "#fffbeb", display: "flex", flexDirection: "column", gap: 8 }}>
                <span>Este presupuesto es anterior al calculo automatico por vano: el ancho/alto no se recalculan solos para no modificar lo ya guardado.</span>
                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm("Se va a recalcular el ancho/alto del porton a partir del vano, sobrescribiendo los valores actuales. ¿Continuar?");
                    if (!ok) return;
                    setDimensions({ vano_size_auto_calc: true });
                  }}
                  style={{ alignSelf: "flex-start", border: "1px solid #d97706", borderRadius: 10, background: "#fff", color: "#92400e", padding: "7px 10px", fontWeight: 800, cursor: "pointer" }}
                >
                  Recalcular ahora
                </button>
              </div>
            </FieldBox>
          ) : null}
          <FieldBox label="Tipo / Sistema derivado"><Input value={portonType || ""} disabled placeholder="Se completa segun la combinacion de productos" style={disabledComputedInputStyle()} /></FieldBox>
          <FieldBox label="Kg por m2"><Input value={formatNumberForInput(preview.effectiveKgM2)} placeholder="Se calcula automaticamente segun el sistema" style={disabledComputedInputStyle()} disabled /></FieldBox>
          <FieldBox label="Superficie"><div style={{ fontWeight: 800, fontSize: 16, minHeight: 40, display: "flex", alignItems: "center", padding: "9px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#334155" }}>{area ? `${area.toFixed(2)} m2` : "-"}</div></FieldBox>
          <FieldBox label="Orientacion de los parantes" helper={orientationReadOnlyHelper}><select value={parantesFieldsReadOnly ? effectiveParantesOrientation : orientation} onChange={(e) => { if (!parantesFieldsReadOnly) setDimensions({ orientacion_parantes: e.target.value }); }} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: parantesFieldsReadOnly ? "#f3f4f6" : "#fff", color: parantesFieldsReadOnly ? "#475569" : undefined }} disabled={parantesFieldsReadOnly}><option value="verticales">Verticales</option><option value="horizontal">Horizontal</option></select></FieldBox>
          <FieldBox label="Cantidad de parantes" helper={parantesHelper}><Input type="text" inputMode="numeric" value={String(dimensions?.cantidad_parantes ?? "")} disabled={parantesFieldsReadOnly} onChange={(v) => { if (!parantesFieldsReadOnly) setDimensions({ cantidad_parantes: normalizeIntegerInput(v) }); }} onBlur={(e) => { if (!parantesFieldsReadOnly) setDimensions({ cantidad_parantes: normalizeIntegerInput(e?.target?.value) }); }} style={parantesFieldsReadOnly ? disabledComputedInputStyle() : { width: "100%" }} placeholder="Ej: 3" /></FieldBox>
          <FieldBox label="Distribucion de los parantes" helper={parantesFieldsReadOnly ? "Solo lectura. Para no aptos se usa repartido automaticamente." : ""}><select value={distribution} onChange={(e) => { if (!parantesFieldsReadOnly) setDimensions({ distribucion_parantes: e.target.value }); }} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: parantesFieldsReadOnly ? "#f3f4f6" : "#fff", color: parantesFieldsReadOnly ? "#475569" : undefined }} disabled={parantesFieldsReadOnly}><option value="repartido">Repartido</option><option value="especial">Especial</option></select></FieldBox>
        </>) : null}
      </div>

      {hasIpanelLamas22Panel && ipanelDivisionsCount >= 2 ? (<>
        <div className="spacer" />
        <div style={{ border: "1px solid #dbeafe", background: "#f8fbff", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Esquema del Ipanel</div>
              <div className="muted">
                {ipanelLamasOrientation === "vertical" ? "Las divisiones se reparten sobre el ancho del panel." : "Las divisiones se reparten sobre el alto del panel."} Cada línea de separación interior ocupa {formatMm(IPANEL_DIVIDER_LINE_MM)} y se muestra punteada.
              </div>
            </div>
            <button type="button" onClick={() => setIpanelSketchOpen(true)} style={{ border: "1px solid #c7d2fe", borderRadius: 10, background: "#eef2ff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Ver esquema</button>
          </div>
          <div className="spacer" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <ComputedCard label="Base para repartir" value={ipanelAxisDimensionMm > 0 ? formatMm(ipanelAxisDimensionMm) : "-"} />
            <ComputedCard label="Espesor total de líneas" value={ipanelSectionMetrics.nominalDividersTotalMm > 0 ? formatMm(ipanelSectionMetrics.nominalDividersTotalMm) : "-"} />
            <ComputedCard label="Medidas útiles cargadas" value={ipanelSectionMetrics.sectionsTotalMm > 0 ? formatMm(ipanelSectionMetrics.sectionsTotalMm) : "-"} />
            <ComputedCard label="Estado" value={ipanelSectionMetrics.exceeds ? `Excede ${formatMm(Math.abs(ipanelSectionMetrics.remainingMm))}` : (ipanelSectionMetrics.matchesExactly ? "Reparto completo" : `Restan ${formatMm(ipanelSectionMetrics.remainingMm)}`)} />
          </div>
          <div className="spacer" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {Array.from({ length: ipanelDivisionsCount }, (_, index) => (
              <FieldBox
                key={`ipanel-section-${index}`}
                label={`Sección ${index + 1}`}
                helper={ipanelLamasOrientation === "vertical" ? "Medida útil en mm sobre el ancho." : "Medida útil en mm sobre el alto."}
              >
                <Input
                  type="text"
                  inputMode="decimal"
                  value={String(rawIpanelSectionSizes[index] ?? "")}
                  onChange={(value) => setIpanelSectionSizeAt(index, value)}
                  onBlur={(e) => setIpanelSectionSizeAt(index, e?.target?.value)}
                  placeholder={index === 0 ? "Ej: 600" : "Ej: 580"}
                  style={{ width: "100%" }}
                />
              </FieldBox>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <button type="button" onClick={redistributeIpanelSections} style={{ border: "1px solid #ddd", borderRadius: 10, background: "#fff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Repartir en partes iguales</button>
            <button type="button" onClick={applyClassicIpanelDistribution} style={{ border: "1px solid #0f766e", borderRadius: 10, background: "#ecfdf5", color: "#0f766e", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Distribución clásica</button>
          </div>
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: ipanelSectionMetrics.exceeds ? "#fee2e2" : "#eff6ff", color: ipanelSectionMetrics.exceeds ? "#991b1b" : "#1d4ed8", fontWeight: 700 }}>
            {ipanelSectionMetrics.exceeds
              ? `Las medidas de las secciones superan la dimensión total disponible. Reducí ${formatMm(Math.abs(ipanelSectionMetrics.remainingMm))} para continuar.`
              : ipanelSectionMetrics.matchesExactly
                ? "Las divisiones ocupan exactamente toda la dimensión del panel."
                : `Todavía quedan ${formatMm(ipanelSectionMetrics.remainingMm)} sin repartir. Podés asignarlo manualmente o usar el reparto automático.`}
          </div>
        </div>
      </>) : null}

      {showSpecialParantesDistances ? (<>
        <div className="spacer" />
        <div style={{ border: "1px solid #e0e7ff", background: "#f8fbff", borderRadius: 14, padding: 12 }}>
          <FieldBox label="Observaciones de distribucion especial"><textarea value={String(dimensions?.observaciones_parantes ?? "")} onChange={(e) => setDimensions({ observaciones_parantes: e.target.value })} rows={3} style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: "10px 12px", resize: "vertical", fontFamily: "inherit" }} placeholder="Indica como debe ser la distribucion especial de los parantes." /></FieldBox>
          <div className="spacer" />
          {aptoHasDoorFixedReference ? <>
            <div style={{ fontWeight: 800, color: "#0f172a" }}>Parante vertical de puerta fijo</div>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              <FieldBox label="Lado del parante fijo" helper="Se usa como referencia para distribuir el resto."><select value={aptoReferenciaLado} onChange={(e) => setDimensions({ parantes_referencia_lado: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}><option value="izquierdo">Izquierdo</option><option value="derecho">Derecho</option></select></FieldBox>
              <FieldBox label="Distancia del parante fijo" helper="Numero en mm desde el lado elegido. En especial se puede editar."><Input type="text" inputMode="decimal" value={aptoReferenciaDistancia} onChange={(v) => setDimensions({ parantes_referencia_distancia_mm: normalizeDecimalMmInput(v), parantes_primer_parante_distancia_mm: normalizeDecimalMmInput(v) })} onBlur={(e) => { const next = normalizeDecimalMmInput(e?.target?.value) || String(DOOR_FIXED_PARANTE_DISTANCE_MM); setDimensions({ parantes_referencia_distancia_mm: next, parantes_primer_parante_distancia_mm: next }); }} placeholder="Ej: 825" style={{ width: "100%" }} /></FieldBox>
            </div>
          </> : <>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={aptoManualFixedReferenceEnabled} onChange={(e) => setAptoFixedFirstParante(e.target.checked)} />Fijar un parante inicial</label>
            {aptoManualFixedReferenceEnabled ? <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              <FieldBox label="Lado del parante fijo" helper="Elegí el lateral desde donde se mide el primer parante."><select value={aptoReferenciaLado} onChange={(e) => setDimensions({ parantes_referencia_lado: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}><option value="izquierdo">Izquierdo</option><option value="derecho">Derecho</option></select></FieldBox>
              <FieldBox label="Distancia del parante fijo" helper="Numero en mm desde el lado elegido. Luego se distribuye el resto."><Input type="text" inputMode="decimal" value={aptoReferenciaDistancia} onChange={(v) => setDimensions({ parantes_referencia_distancia_mm: normalizeDecimalMmInput(v), parantes_primer_parante_distancia_mm: normalizeDecimalMmInput(v) })} onBlur={(e) => { const next = normalizeDecimalMmInput(e?.target?.value) || String(DOOR_FIXED_PARANTE_DISTANCE_MM); setDimensions({ parantes_referencia_distancia_mm: next, parantes_primer_parante_distancia_mm: next }); }} placeholder="Ej: 825" style={{ width: "100%" }} /></FieldBox>
            </div> : null}
          </>}
          <div className="spacer" />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={distributeUniformly} onChange={(e) => setDimensions({ distribuir_parantes_uniformemente: e.target.checked })} />Distribuir uniformemente</label>
          <div className="spacer" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
            {padDistanceList(resolvedParantesDistances, Math.max(effectiveParantesRestantesCount, 0)).map((distance, index) => {
              const distanceLabel = aptoSimulaHorizontalReferencia ? `Parante restante ${index + 1}` : paranteDistanceLabel(index);
              const distanceHelper = distributeUniformly
                ? "Calculado automaticamente."
                : (aptoSimulaHorizontalReferencia ? "Distancia manual desde el parante fijo o desde el parante restante anterior." : "Numero en mm. Puede tener decimales.");
              return (
              <FieldBox key={`distance-${index}`} label={distanceLabel} helper={distanceHelper}>
                <Input type="text" inputMode="decimal" value={String(distance ?? "")} disabled={distributeUniformly} onChange={(v) => setParantesDistanceAt(index, v)} onBlur={(e) => setParantesDistanceAt(index, e?.target?.value)} placeholder={index === 0 ? "Ej: 800" : "Ej: 720"} style={distributeUniformly ? disabledComputedInputStyle() : { width: "100%" }} />
              </FieldBox>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}><button type="button" onClick={addParanteDistance} style={{ border: "1px solid #ddd", borderRadius: 10, background: "#fff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>+ Agregar parante</button></div>
        </div>
      </>) : null}

      {isPorton ? (<>
        <div className="spacer" />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
          <div><div style={{ fontWeight: 900, marginBottom: 4 }}>Esquema de hoja y parantes</div><div className="muted">Disponible para todos los portones. Los parantes laterales se muestran aparte y no se cuentan dentro de la cantidad ingresada.</div></div>
          <button type="button" onClick={() => setParantesSketchOpen(true)} style={{ border: "1px solid #c7d2fe", borderRadius: 10, background: "#eef2ff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Ver esquema de parantes</button>
        </div>
        <div className="spacer" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <ComputedCard label="Medidas de paso" value={preview.altoPasoMm > 0 && preview.anchoPasoMm > 0 ? `${formatMetersFromMm(preview.anchoPasoMm)} x ${formatMetersFromMm(preview.altoPasoMm)}` : "-"} />
          <ComputedCard label="Medidas de hoja" value={preview.altoHojaMm > 0 && preview.anchoHojaMm > 0 ? `${formatMetersFromMm(preview.anchoHojaMm)} x ${formatMetersFromMm(preview.altoHojaMm)}` : "-"} />
          <ComputedCard label="Rebaje lateral" value={preview.hasRebajeLateral ? "Si" : "No"} />
          <ComputedCard label="Kg/m2 efectivo" value={preview.effectiveKgM2 > 0 ? `${preview.effectiveKgM2.toFixed(2)} kg/m2` : "-"} />
          <ComputedCard
            label="Peso estimado"
            value={preview.estimatedWeightKg > 0 ? `${preview.estimatedWeightKg.toFixed(2)} kg` : "-"}
            // Tope de peso desactivado a pedido (revertido en main, no borrado por si hay
            // que reactivarlo). Descomentar para volver a marcar en rojo el peso estimado.
            // warn={preview.estimatedWeightKg > PORTON_MAX_WEIGHT_KG}
          />
          <ComputedCard label="Piernas estimadas" value={preview.legsLabel} />
        </div>
        {/* Tope de peso desactivado a pedido (revertido en main, no borrado por si hay que
        reactivarlo). Descomentar para volver a mostrar el cartel de aviso.
        {preview.estimatedWeightKg > PORTON_MAX_WEIGHT_KG ? (
          <div style={{ marginTop: 8, fontSize: 13, color: "#b91c1c", fontWeight: 700, padding: "9px 12px", borderRadius: 10, border: "1px solid #fca5a5", background: "#fef2f2" }}>
            El peso estimado supera el máximo permitido de {PORTON_MAX_WEIGHT_KG} kg para un portón. Ajustá el revestimiento (kg/m2) o las medidas antes de guardar.
          </div>
        ) : null}
        */}
        <div className="muted" style={{ marginTop: 8 }}>Estas medidas se guardan dentro del presupuesto para usarlas despues en medicion, calculo de peso y comparacion de superficie.</div>
      </>) : null}

      <IpanelDivisionsSketchModal
        open={ipanelSketchOpen}
        onClose={() => setIpanelSketchOpen(false)}
        orientation={ipanelLamasOrientation}
        widthMm={Math.max(0, roundMm(width * 1000))}
        heightMm={Math.max(0, roundMm(height * 1000))}
        dividerMm={IPANEL_DIVIDER_LINE_MM}
        sectionSizes={ipanelSectionMetrics.parsed}
        dividersIncludedInSectionSizes={isIpanelClassicDistribution}
      />

      <ParantesSketchModal
        open={parantesSketchOpen}
        onClose={() => setParantesSketchOpen(false)}
        orientation={effectiveParantesOrientation}
        parantesCount={sketchParantesCount}
        baseDimensionMm={baseParantesDimensionMm || getBaseParantesDimensionMm({ orientation: effectiveParantesOrientation, widthM: width, heightM: height })}
        distances={sketchParantesDistances}
        distributeUniformly={false}
        tubeDiscountMm={tubeDiscountMm}
        portonWidthMm={Math.max(0, Number(preview?.anchoHojaMm || preview?.anchoPasoMm || 0))}
        portonHeightMm={Math.max(0, Number(preview?.altoHojaMm || preview?.altoPasoMm || 0))}
        hasFixedVerticalReference={effectiveFixedReference}
        fixedReferenceSide={effectiveFixedReferenceSide}
        fixedReferenceDistanceMm={effectiveFixedReferenceDistanceMm}
        doorLabel={detectedDoorLabel}
      />
      </div>
    </>
  );
}

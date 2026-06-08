import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import Input from "../../../ui/Input";

const WIDTH_MIN_M = 2.4;
const WIDTH_MAX_M = 7;
const HEIGHT_MIN_M = 2;
const HEIGHT_MAX_M = 3;
const IPANEL_WIDTH_MAX_M = 1.13;
const IPANEL_HEIGHT_MAX_M = 2.45;
const IPANEL_LAMAS_22_PRODUCT_IDS = new Set([4061, 3590]);
const IPANEL_DIVIDER_LINE_MM = 10;
const PARANTES_SPECIAL_PRODUCT_ID = 3006;
const APTOS_PARA_REVESTIR_TYPE = "para_revestir_con_al_pvc_otros";
const DEFAULT_PARANTES_TUBE_DISCOUNT_MM = 40;
const DOOR_FIXED_PARANTE_DISTANCE_MM = 825;
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
function computeIpanelSectionMetrics({ values, count, axisDimensionMm, dividerMm = IPANEL_DIVIDER_LINE_MM }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  const safeDivider = Math.max(0, Number(dividerMm || 0));
  const safeValues = sanitizeIpanelSectionSizes(values, safeCount);
  const parsed = safeValues.map((item) => parseMmNumber(item) || 0);
  const sectionsTotalMm = roundMm(parsed.reduce((acc, item) => acc + item, 0));
  const dividersTotalMm = roundMm(Math.max(0, safeCount - 1) * safeDivider);
  const totalUsedMm = roundMm(sectionsTotalMm + dividersTotalMm);
  const availableMm = roundMm(Math.max(0, Number(axisDimensionMm || 0)));
  const remainingMm = roundMm(availableMm - totalUsedMm);
  return {
    parsed,
    sectionsTotalMm,
    dividersTotalMm,
    totalUsedMm,
    availableMm,
    remainingMm,
    exceeds: remainingMm < -0.01,
    matchesExactly: Math.abs(remainingMm) <= 0.5,
  };
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
function getRulesParams(rulesData) {
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
function detectNoCladdingByProducts(lines, params) {
  const ids = getBudgetProductIdSetFromLines(lines);
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
function buildCalculatedPreview({ widthM, heightM, lines, params, portonType, dimensions }) {
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
function inputStateStyle(hasError) {
  return hasError
    ? { width: "100%", borderColor: "#dc2626", boxShadow: "0 0 0 3px rgba(220, 38, 38, 0.12)", background: "#fff7f7" }
    : { width: "100%" };
}
function disabledComputedInputStyle(extra = {}) {
  return { width: "100%", background: "#f3f4f6", color: "#475569", borderColor: "#d1d5db", ...extra };
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
function ComputedCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: 10, background: "#f3f4f6" }}>
      <div className="muted">{label}</div>
      <div style={{ fontWeight: 800, color: "#334155" }}>{value || "-"}</div>
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
function ParantesSketchModal({
  open,
  onClose,
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
}) {
  if (!open) return null;
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Esquema de parantes</div>
            <div className="muted">
              Orientación {isHorizontal ? "horizontal" : "vertical"} - {count || 0} parantes internos + 2 laterales - base exterior {formatMm(baseDimensionMm)} - ancho caño {formatMm(tube)} - luz para repartir {formatMm(effectiveSpan)}{showFixedVerticalReference ? ` - parante fijo ${fixedSide} a ${formatNumberForInput(fixedDistance)} mm` : ""}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 12px", background: "#fff", cursor: "pointer" }}>
            Cerrar
          </button>
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
    if (index < count - 1) {
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
            <svg width="100%" viewBox={`0 0 ${panelWidthPx + 40} ${panelHeightPx + 40}`} role="img" aria-label="Esquema del Ipanel con divisiones">
              <rect x="20" y="20" width={panelWidthPx} height={panelHeightPx} rx="14" fill="#ffffff" stroke="#0f172a" strokeWidth="2.2" />
              {bands.map((band) => {
                const startPx = (axisDimensionMm > 0 ? band.startMm / axisDimensionMm : 0) * mainAxisPx;
                const sizePx = (axisDimensionMm > 0 ? band.sizeMm / axisDimensionMm : 0) * mainAxisPx;
                if (band.type === "section") {
                  const x = isVertical ? 20 + startPx : 20;
                  const y = isVertical ? 20 : 20 + startPx;
                  const width = isVertical ? sizePx : panelWidthPx;
                  const height = isVertical ? panelHeightPx : sizePx;
                  const cx = x + width / 2;
                  const cy = y + height / 2;
                  return (
                    <g key={`band-${band.type}-${band.index}`}>
                      <rect x={x} y={y} width={Math.max(0, width)} height={Math.max(0, height)} fill={band.index % 2 === 0 ? "#dff3f6" : "#eef2f7"} />
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill="#0f172a">
                        {formatNumberForInput(band.rawSizeMm)} mm
                      </text>
                    </g>
                  );
                }
                const rectX = isVertical ? 20 + startPx : 20;
                const rectY = isVertical ? 20 : 20 + startPx;
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
            <div className="muted" style={{ marginBottom: 8 }}>
              Las medidas cargadas corresponden al tamaño útil de cada sección. Cada división incluye un listón de {formatMm(dividerMm)} entre paneles, representado como una franja con bordes marcados y línea punteada.
            </div>
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

export default function PortonDimensions({ kind = "porton" }) {
  const normalizedKind = normalizeKind(kind);
  const isPorton = normalizedKind === "porton";
  const isIpanel = normalizedKind === "ipanel";
  const isPlegados = normalizedKind === "plegados";
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);
  const lines = useQuoteStore((s) => s.lines);
  const [parantesSketchOpen, setParantesSketchOpen] = useState(false);
  const [ipanelSketchOpen, setIpanelSketchOpen] = useState(false);
  const rulesQ = useQuery({ queryKey: ["technical-rules-dimensions-preview"], queryFn: () => adminGetTechnicalMeasurementRules("porton"), staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true, enabled: isPorton });

  const widthRaw = String(dimensions?.width ?? "");
  const heightRaw = String(dimensions?.height ?? "");
  const width = useMemo(() => toNumber(widthRaw), [widthRaw]);
  const height = useMemo(() => toNumber(heightRaw), [heightRaw]);
  const widthValue = useMemo(() => parseOptionalNumber(normalizeDecimalWithDot(widthRaw)), [widthRaw]);
  const heightValue = useMemo(() => parseOptionalNumber(normalizeDecimalWithDot(heightRaw)), [heightRaw]);
  const widthOutOfBounds = widthValue !== null && (isPorton ? (widthValue < WIDTH_MIN_M || widthValue > WIDTH_MAX_M) : (isIpanel ? widthValue > IPANEL_WIDTH_MAX_M : false));
  const heightOutOfBounds = heightValue !== null && (isPorton ? (heightValue < HEIGHT_MIN_M || heightValue > HEIGHT_MAX_M) : (isIpanel ? heightValue > IPANEL_HEIGHT_MAX_M : false));
  const hasSizeError = (isPorton || isIpanel) && (widthOutOfBounds || heightOutOfBounds);
  const widthHelper = isPorton ? "Minimo 2.4 m - Maximo 7 m" : (isIpanel ? "Maximo 1.13 m (113 cm)" : "");
  const heightHelper = isPorton ? "Minimo 2 m - Maximo 3 m" : (isIpanel ? "Maximo 2.45 m (245 cm)" : "");
  const widthPlaceholder = isIpanel ? "Ej: 1.13" : "Ej: 3.2";
  const heightPlaceholder = isIpanel ? "Ej: 2.45" : "Ej: 2.1";
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);
  const selectedProductIdsForIpanel = useMemo(() => getBudgetProductIdSetFromLines(lines), [lines]);
  const hasIpanelLamas22Panel = isIpanel && [...IPANEL_LAMAS_22_PRODUCT_IDS].some((id) => selectedProductIdsForIpanel.has(id));
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
  const ipanelAxisDimensionMm = useMemo(() => getIpanelAxisDimensionMm({ orientation: ipanelLamasOrientation, widthM: width, heightM: height }), [ipanelLamasOrientation, width, height]);
  const rawIpanelSectionSizes = useMemo(
    () => sanitizeIpanelSectionSizes(dimensions?.ipanel_divisiones_medidas_mm ?? dimensions?.medidas_divisiones_ipanel_mm ?? dimensions?.ipanel_section_sizes_mm ?? [], ipanelDivisionsCount),
    [dimensions?.ipanel_divisiones_medidas_mm, dimensions?.medidas_divisiones_ipanel_mm, dimensions?.ipanel_section_sizes_mm, ipanelDivisionsCount],
  );
  const ipanelSectionMetrics = useMemo(
    () => computeIpanelSectionMetrics({ values: rawIpanelSectionSizes, count: ipanelDivisionsCount, axisDimensionMm: ipanelAxisDimensionMm, dividerMm: IPANEL_DIVIDER_LINE_MM }),
    [rawIpanelSectionSizes, ipanelDivisionsCount, ipanelAxisDimensionMm],
  );
  const ipanelDivisionsHasError = hasIpanelLamas22Panel && isIpanelDivisionsOutOfBounds(ipanelDivisionsValue, ipanelDivisionsMax);

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
    if (!String(dimensions?.ipanel_divisor_mm ?? dimensions?.linea_division_ipanel_mm ?? "").trim()) {
      patch.ipanel_divisor_mm = String(IPANEL_DIVIDER_LINE_MM);
      patch.linea_division_ipanel_mm = String(IPANEL_DIVIDER_LINE_MM);
    }
    if (Object.keys(patch).length) setDimensions(patch);
  }, [hasIpanelLamas22Panel, ipanelDivisionsValue, ipanelDivisionsCount, ipanelDivisionsMax, ipanelAxisDimensionMm, dimensions?.ipanel_lamas_orientacion, dimensions?.orientacion_ipanel_lamas, dimensions?.ipanel_orientacion_lamas, dimensions?.ipanel_lamas_orientation, dimensions?.ipanel_divisiones_medidas_mm, dimensions?.medidas_divisiones_ipanel_mm, dimensions?.ipanel_section_sizes_mm, dimensions?.ipanel_divisor_mm, dimensions?.linea_division_ipanel_mm, setDimensions]);

  const params = useMemo(() => getRulesParams(rulesQ.data), [rulesQ.data]);
  const preview = useMemo(() => buildCalculatedPreview({ widthM: width, heightM: height, lines, params, portonType, dimensions }), [width, height, lines, params, portonType, dimensions]);
  const aptoParaRevestir = isAptoDerivedType(portonType);
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
  const distributeUniformly = dimensions?.distribuir_parantes_uniformemente === true || String(dimensions?.distribuir_parantes_uniformemente || "").trim().toLowerCase() === "true";
  const showSpecialParantesDistances = isPorton && aptoParaRevestir && distribution === "especial";
  const showAptoFixedFirstParanteOption = showSpecialParantesDistances;
  const aptoSimulaHorizontalReferencia = showAptoFixedFirstParanteOption && (
    dimensions?.parantes_primer_parante_distancia_fija === true ||
    String(dimensions?.parantes_primer_parante_distancia_fija || "").trim().toLowerCase() === "true" ||
    dimensions?.parantes_simular_referencia_horizontal === true ||
    String(dimensions?.parantes_simular_referencia_horizontal || "").trim().toLowerCase() === "true"
  );
  const aptoReferenciaLado = String(dimensions?.parantes_referencia_lado || "izquierdo").trim().toLowerCase() === "derecho" ? "derecho" : "izquierdo";
  const aptoReferenciaDistancia = String(dimensions?.parantes_referencia_distancia_mm ?? dimensions?.parantes_primer_parante_distancia_mm ?? "");
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
  }, [rawParantesDistances, showSpecialParantesDistances, distributeUniformly, aptoParantesRestantesCount, parantesCount, effectiveFixedReference, effectiveParantesRestantesCount, effectiveDistributionBaseDimensionMm, tubeDiscountMm]);
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
    const patch = {};
    if (!fixedEnabled) {
      patch.parantes_primer_parante_distancia_fija = true;
      patch.parantes_simular_referencia_horizontal = true;
    }
    if (!fixedEnabled || !String(dimensions?.parantes_referencia_lado || "").trim()) {
      patch.parantes_referencia_lado = detectedDoorSide;
    }
    const currentDistance = String(dimensions?.parantes_referencia_distancia_mm ?? dimensions?.parantes_primer_parante_distancia_mm ?? "").trim();
    if (!fixedEnabled && !currentDistance) {
      patch.parantes_referencia_distancia_mm = String(DOOR_FIXED_PARANTE_DISTANCE_MM);
    }
    if (parantesCount <= 0) patch.cantidad_parantes = "1";
    if (Object.keys(patch).length) setDimensions(patch);
  }, [
    isPorton,
    aptoParaRevestir,
    hasDoorParantesConfig,
    detectedDoorSide,
    dimensions?.parantes_primer_parante_distancia_fija,
    dimensions?.parantes_simular_referencia_horizontal,
    dimensions?.parantes_referencia_lado,
    dimensions?.parantes_referencia_distancia_mm,
    dimensions?.parantes_primer_parante_distancia_mm,
    parantesCount,
    setDimensions,
  ]);

  useEffect(() => {
    if (!isPorton) return;
    const patch = {};
    const currentOrientationRaw = String(dimensions?.orientacion_parantes || "").trim();
    if (isNonAptoPorton && nonAptoConfiguredOrientation && orientation !== nonAptoConfiguredOrientation) patch.orientacion_parantes = nonAptoConfiguredOrientation;
    else if (!currentOrientationRaw) patch.orientacion_parantes = "verticales";
    if (isNonAptoPorton && distribution !== "repartido") patch.distribucion_parantes = "repartido";
    else if (!String(dimensions?.distribucion_parantes || "").trim()) patch.distribucion_parantes = "repartido";
    const nextCount = String(autoParantesCount);
    const currentCount = String(dimensions?.cantidad_parantes ?? "").trim();
    if ((isNonAptoPorton || !currentCount) && currentCount !== nextCount) patch.cantidad_parantes = nextCount;
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
  const title = isPlegados ? "Medidas del plegado" : (isPorton ? "Medidas del porton" : "Medidas del Ipanel");
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
    });
  }
  function redistributeIpanelSections() {
    if (ipanelDivisionsCount < 2) return;
    const next = buildUniformIpanelSectionSizes({ count: ipanelDivisionsCount, axisDimensionMm: ipanelAxisDimensionMm, dividerMm: IPANEL_DIVIDER_LINE_MM });
    setDimensions({
      ipanel_divisiones_medidas_mm: next,
      medidas_divisiones_ipanel_mm: next,
      ipanel_section_sizes_mm: next,
    });
  }

  function setAptoFixedFirstParante(checked) {
    const nextChecked = !!checked;
    const patch = {
      parantes_primer_parante_distancia_fija: nextChecked,
      parantes_simular_referencia_horizontal: nextChecked,
      parantes_referencia_lado: nextChecked ? (dimensions?.parantes_referencia_lado || "izquierdo") : "",
      parantes_referencia_distancia_mm: nextChecked ? normalizeDecimalMmInput(aptoReferenciaDistancia || String(DOOR_FIXED_PARANTE_DISTANCE_MM)) : "",
    };
    if (nextChecked && parantesCount <= 0) patch.cantidad_parantes = "1";
    setDimensions(patch);
  }

  return (
    <div style={{ border: `1px solid ${hasSizeError ? "#fca5a5" : "transparent"}`, borderRadius: 14, padding: 4, background: hasSizeError ? "#fff7f7" : "transparent" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      {hasSizeError ? <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}>Se encuentra fuera de los limites de tamano.</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start" }}>
        <FieldBox label="Ancho (m)" helper={widthHelper} helperColor={widthOutOfBounds ? "#b91c1c" : undefined}><Input type="text" inputMode="decimal" value={widthRaw} onChange={(v) => setDimensions({ width: normalizeDecimal(v) })} onBlur={(e) => setDimensions({ width: normalizeDecimal(e?.target?.value) })} placeholder={isIpanel ? "Ej: 1.13" : "Ej: 3.2"} style={inputStateStyle(widthOutOfBounds)} /></FieldBox>
        <FieldBox label="Alto (m)" helper={heightHelper} helperColor={heightOutOfBounds ? "#b91c1c" : undefined}><Input type="text" inputMode="decimal" value={heightRaw} onChange={(v) => setDimensions({ height: normalizeDecimal(v) })} onBlur={(e) => setDimensions({ height: normalizeDecimal(e?.target?.value) })} placeholder={heightPlaceholder} style={inputStateStyle(heightOutOfBounds)} /></FieldBox>
        {hasIpanelLamas22Panel ? (<>
          <FieldBox label="Orientación de lamas" helper="Define el máximo permitido de divisiones.">
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
                setDimensions({ ipanel_divisiones: next, cantidad_divisiones_ipanel: next });
              }}
              onBlur={(e) => {
                const next = clampIpanelDivisions(e?.target?.value, ipanelDivisionsMax);
                setDimensions({ ipanel_divisiones: next, cantidad_divisiones_ipanel: next });
              }}
              placeholder="Ej: 4"
              style={inputStateStyle(ipanelDivisionsHasError)}
            />
          </FieldBox>
        </>) : null}
        {isPlegados ? (<>
          <FieldBox label="Superficie del plegado"><div style={{ fontWeight: 800, fontSize: 16, minHeight: 40, display: "flex", alignItems: "center", padding: "9px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#334155" }}>{area ? `${area.toFixed(2)} m2` : "-"}</div></FieldBox>
          <FieldBox label="Descripción del plegado" helper="Información técnica o detalle que verá Comercial y Técnica."><textarea value={String(dimensions?.plegado_descripcion ?? dimensions?.descripcion_plegado ?? dimensions?.description ?? "")} onChange={(e) => setDimensions({ plegado_descripcion: e.target.value, descripcion_plegado: e.target.value })} rows={3} style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: "10px 12px", resize: "vertical", fontFamily: "inherit" }} placeholder="Describí el plegado, material, observaciones o cualquier dato técnico necesario..." /></FieldBox>
        </>) : null}
        {isPorton ? (<>
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
            <ComputedCard label="Espesor total de líneas" value={ipanelSectionMetrics.dividersTotalMm > 0 ? formatMm(ipanelSectionMetrics.dividersTotalMm) : "-"} />
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
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={aptoSimulaHorizontalReferencia} onChange={(e) => setAptoFixedFirstParante(e.target.checked)} />¿Desea fijar un parante?</label>
          {aptoSimulaHorizontalReferencia ? <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <FieldBox label="Lado del primer parante fijo" helper="Se usa como referencia para distribuir el resto."><select value={aptoReferenciaLado} onChange={(e) => setDimensions({ parantes_referencia_lado: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}><option value="izquierdo">Izquierdo</option><option value="derecho">Derecho</option></select></FieldBox>
            <FieldBox label="Distancia del primer parante fijo" helper="Numero en mm desde el lado elegido. Puede tener decimales."><Input type="text" inputMode="decimal" value={aptoReferenciaDistancia} onChange={(v) => setDimensions({ parantes_referencia_distancia_mm: normalizeDecimalMmInput(v) })} onBlur={(e) => setDimensions({ parantes_referencia_distancia_mm: normalizeDecimalMmInput(e?.target?.value) || String(DOOR_FIXED_PARANTE_DISTANCE_MM) })} placeholder="Ej: 825" style={{ width: "100%" }} /></FieldBox>
          </div> : null}
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
          <ComputedCard label="Peso estimado" value={preview.estimatedWeightKg > 0 ? `${preview.estimatedWeightKg.toFixed(2)} kg` : "-"} />
          <ComputedCard label="Piernas estimadas" value={preview.legsLabel} />
        </div>
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
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
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
const PARANTES_SPECIAL_PRODUCT_ID = 3006;
const APTOS_PARA_REVESTIR_TYPE = "para_revestir_con_al_pvc_otros";
const DEFAULT_PARANTES_TUBE_DISCOUNT_MM = 40;
const ORDINAL_LABELS = ["primer", "segundo", "tercer", "cuarto", "quinto", "sexto", "septimo", "octavo", "noveno", "decimo"];
const SURFACE_PARAMETERS_STORAGE_KEY = "presupuestador:technical_surface_parameters:porton";

function readStoredSurfaceParameters() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    const raw = window.localStorage.getItem(SURFACE_PARAMETERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function parseOptionalNumber(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toNumber(v) {
  const n = parseOptionalNumber(v);
  return Number.isFinite(n) ? n : 0;
}
function normalizeDecimal(v) {
  return String(v ?? "").replace(/[^0-9.,]/g, "");
}
function normalizeDecimalWithDot(v) {
  return normalizeDecimal(v).replace(",", ".");
}
function normalizeIntegerInput(v) {
  return String(v ?? "").replace(/\D+/g, "");
}
function norm(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, "_");
}
function normalizeKind(value) {
  return String(value || "porton").trim().toLowerCase();
}
function hasSurfaceParamContent(value) {
  return !!(value && typeof value === "object" && Object.keys(value).length);
}
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
function formatNumberForInput(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
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
function normalizeDecimalMmInput(v) {
  return String(v ?? "").replace(/[^0-9.,]/g, "");
}
const LINE_ID_KEYS_FOR_PARANTES = [
  "product_id",
  "id",
  "presupuestador_id",
  "presupuestador_product_id",
  "productId",
  "productID",
  "catalog_product_id",
  "catalogProductId",
  "odoo_external_id",
  "odoo_id",
  "odoo_template_id",
  "odoo_variant_id",
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
  for (const line of Array.isArray(lines) ? lines : []) {
    ids.push(...collectLineProductIdsForParantes(line));
  }
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}
function getBudgetProductIdSetFromLines(lines) {
  return new Set(getBudgetProductIdsFromLines(lines));
}
function detectInstallationModeByProducts(lines, params) {
  const ids = getBudgetProductIdSetFromLines(lines);
  const insideId = Number(params?.installation_inside_product_id || 0);
  const behindId = Number(params?.installation_behind_product_id || 0);
  if (insideId && ids.has(insideId)) return "dentro_vano";
  if (behindId && ids.has(behindId)) return "detras_vano";
  return "sin_instalacion";
}
function detectNoCladdingByProducts(lines, params) {
  const ids = getBudgetProductIdSetFromLines(lines);
  const noCladdingId = Number(params?.no_cladding_product_id || 0);
  return !!(noCladdingId && ids.has(noCladdingId));
}
function inferKgM2FromType(portonType) {
  const t = norm(portonType);
  if (!t) return 0;
  if (t.includes("para_revestir")) return 0;
  if (
    t.includes("inyect") ||
    t.includes("doble_iny") ||
    t.endsWith("_iny") ||
    t.includes("_iny_")
  ) return 25;
  if (t.includes("clas") || t.includes("estandar")) return 15;
  return 0;
}
function isAptoDerivedType(portonType) {
  return norm(portonType) === APTOS_PARA_REVESTIR_TYPE;
}
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
  for (const rule of rules) {
    if (ids.has(rule.product_id)) return rule.kg_m2;
  }
  return 0;
}
function getByCleanPath(source, path) {
  const parts = String(path || "")
    .replace(/^payload\./, "")
    .replace(/^dimensions\./, "")
    .split(".")
    .filter(Boolean);
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
  candidates.push(
    "dimensions.kg_m2",
    "kg_m2",
    "kg_m2_entry",
    "entry_kg_m2",
    "custom_kg_m2",
    "peso_m2",
    "payload.kg_m2_entry",
  );
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
  const limitAngostas = getNumberParam(
    params,
    [
      isApto ? "no_cladding_angostas_max_kg" : "legs_angostas_max_kg",
      isApto ? "limit_angostas_apto_kg" : "limit_angostas_kg",
      "piernas_angostas_hasta_kg",
    ],
    isApto ? 80 : 140,
  );
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
function getPasoWidthDeductionMm(legsKey, params) {
  const key = String(legsKey || "").trim().toLowerCase();
  const map = {
    angostas: Number(params?.legs_angostas_add_width_mm || 140),
    comunes: Number(params?.legs_comunes_add_width_mm || 200),
    anchas: Number(params?.legs_anchas_add_width_mm || 280),
    superanchas: Number(params?.legs_superanchas_add_width_mm || 380),
    especiales: Number(params?.legs_especiales_add_width_mm || params?.legs_superanchas_add_width_mm || 380),
  };
  return Number(map[key] || 0);
}
function getParantesTubeDiscountMm(params) {
  return getNumberParam(
    params,
    [
      "parantes_tube_discount_mm",
      "parantes_cano_discount_mm",
      "descuento_cano_parantes_mm",
      "descuento_tubo_parantes_mm",
      "parantes_tube_width_mm",
    ],
    DEFAULT_PARANTES_TUBE_DISCOUNT_MM,
  );
}

function parseProductIdList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
  }
  return String(value || "")
    .split(/[^0-9]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}
function uniqueProductIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0))];
}
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
  if (Array.isArray(value)) {
    return value.map((rule) => normalizeProductRuleObject(rule)).filter((rule) => rule.active && rule.product_ids.length);
  }

  const rules = [];
  const chunks = String(value || "").split(/[;\n]+/).map((chunk) => chunk.trim()).filter(Boolean);
  for (const chunk of chunks) {
    if (/[+&]/.test(chunk)) {
      const productIds = uniqueProductIds(parseProductIdList(chunk));
      if (productIds.length) rules.push({ product_ids: productIds, match_mode: "all", active: true });
      continue;
    }
    const productIds = uniqueProductIds(parseProductIdList(chunk));
    for (const productId of productIds) {
      rules.push({ product_ids: [productId], match_mode: "any", active: true });
    }
  }
  return rules;
}
function productRuleMatches(rule, lines) {
  const ids = getBudgetProductIdSetFromLines(lines);
  const required = Array.isArray(rule?.product_ids) ? rule.product_ids : [];
  if (!required.length) return false;
  if (String(rule?.match_mode || "all").toLowerCase() === "any") {
    return required.some((productId) => ids.has(Number(productId)));
  }
  return required.every((productId) => ids.has(Number(productId)));
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

  return "";
}
function hasDoorForParantes(lines, params) {
  const doorRules = [
    ...parseProductCombinationRules(params?.parantes_door_product_ids),
    ...parseProductCombinationRules(params?.door_product_ids),
    ...parseProductCombinationRules(params?.puerta_product_ids),
    ...parseProductCombinationRules(params?.con_puerta_product_ids),
    ...parseProductCombinationRules(params?.porton_door_product_ids),
    ...parseProductCombinationRules(params?.parantes_right_door_product_ids),
    ...parseProductCombinationRules(params?.right_door_product_ids),
    ...parseProductCombinationRules(params?.puerta_derecha_product_ids),
    ...parseProductCombinationRules(params?.door_right_product_ids),
    ...parseProductCombinationRules(params?.parantes_left_door_product_ids),
    ...parseProductCombinationRules(params?.left_door_product_ids),
    ...parseProductCombinationRules(params?.puerta_izquierda_product_ids),
    ...parseProductCombinationRules(params?.door_left_product_ids),
  ];
  if (doorRules.some((rule) => productRuleMatches(rule, lines))) return true;
  const text = (Array.isArray(lines) ? lines : [])
    .map((line) => [line?.name, line?.raw_name, line?.display_name, line?.alias, line?.code].filter(Boolean).join(" "))
    .map(normalizeSearchText)
    .join(" | ");
  return text.includes("puerta ");
}
function hasLeftDoorForParantes(lines, params) {
  const leftDoorRules = [
    ...parseProductCombinationRules(params?.parantes_left_door_product_ids),
    ...parseProductCombinationRules(params?.left_door_product_ids),
    ...parseProductCombinationRules(params?.puerta_izquierda_product_ids),
    ...parseProductCombinationRules(params?.door_left_product_ids),
  ];
  if (leftDoorRules.some((rule) => productRuleMatches(rule, lines))) return true;
  const text = (Array.isArray(lines) ? lines : [])
    .map((line) => [line?.name, line?.raw_name, line?.display_name, line?.alias, line?.code].filter(Boolean).join(" "))
    .map(normalizeSearchText)
    .join(" | ");
  return text.includes("puerta izquierda");
}
function hasRightDoorForParantes(lines, params) {
  if (hasLeftDoorForParantes(lines, params)) return false;
  const rightDoorRules = [
    ...parseProductCombinationRules(params?.parantes_right_door_product_ids),
    ...parseProductCombinationRules(params?.right_door_product_ids),
    ...parseProductCombinationRules(params?.puerta_derecha_product_ids),
    ...parseProductCombinationRules(params?.door_right_product_ids),
  ];
  if (rightDoorRules.some((rule) => productRuleMatches(rule, lines))) return true;
  const text = (Array.isArray(lines) ? lines : [])
    .map((line) => [line?.name, line?.raw_name, line?.display_name, line?.alias, line?.code].filter(Boolean).join(" "))
    .map(normalizeSearchText)
    .join(" | ");
  return text.includes("puerta derecha");
}
function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
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
function resolveNonAptoParantesOrientationDebug(lines, params) {
  const selectedIds = getBudgetProductIdsFromLines(lines);
  const configuredHorizontal = String(params?.non_apto_parantes_horizontal_product_ids || params?.parantes_horizontal_product_ids || params?.horizontal_parantes_product_ids || "").trim();
  const configuredVertical = String(params?.non_apto_parantes_vertical_product_ids || params?.parantes_vertical_product_ids || params?.vertical_parantes_product_ids || "").trim();
  const orientation = resolveNonAptoParantesOrientation(lines, params) || resolveOrientationFromLineNames(lines);
  return {
    selectedIds,
    orientation,
    configuredHorizontal,
    configuredVertical,
  };
}
function getDoorFirstParanteDistanceMm(params) {
  return getNumberParam(
    params,
    [
      "parantes_door_first_distance_mm",
      "door_first_parante_distance_mm",
      "puerta_distancia_primer_parante_mm",
      "distancia_primer_parante_puerta_mm",
    ],
    800,
  );
}
function sameArrayValues(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((item, index) => String(item ?? "") === String(b[index] ?? ""));
}
function buildCalculatedPreview({ widthM, heightM, lines, params, portonType, dimensions }) {
  const widthMm = Math.round((Number(widthM || 0) || 0) * 1000);
  const heightMm = Math.round((Number(heightM || 0) || 0) * 1000);
  const areaM2 = (Number(widthM || 0) || 0) * (Number(heightM || 0) || 0);

  const installationMode = detectInstallationModeByProducts(lines, params);
  const aptoParaRevestir = isAptoDerivedType(portonType) || detectNoCladdingByProducts(lines, params);
  const aptoKg = aptoParaRevestir ? resolveAptoKgM2ByProducts(lines, params) : 0;
  const sellerKgM2 = resolveSellerKgM2Entry(dimensions, params);
  const inferredKg = inferKgM2FromType(portonType);
  const defaultKgM2 = resolveDefaultKgM2FromType(portonType, params);
  const effectiveKgM2 = aptoParaRevestir
    ? (aptoKg || sellerKgM2 || defaultKgM2 || inferredKg)
    : (sellerKgM2 || inferredKg || defaultKgM2);

  const weightHeightDiscountMm = Number(params?.weight_height_discount_mm || 10);
  const weightWidthDiscountMm = Number(params?.weight_width_discount_mm || 14);
  const discountedHeightMm = Math.max(0, heightMm - weightHeightDiscountMm);
  const discountedWidthMm = Math.max(0, widthMm - weightWidthDiscountMm);
  const estimatedWeightKg = areaM2 > 0 && effectiveKgM2 > 0
    ? Number((discountedHeightMm / 1000 * discountedWidthMm / 1000 * effectiveKgM2).toFixed(2))
    : 0;

  const legsLabel = legsTypeForWeight(estimatedWeightKg, aptoParaRevestir, params);
  const legsKey = mapLegsKeyForWidth(legsLabel);

  let altoPasoMm = discountedHeightMm;
  let anchoPasoMm = discountedWidthMm;

  if (installationMode === "detras_vano") {
    const addMap = {
      angostas: Number(params?.legs_angostas_add_width_mm || 140),
      comunes: Number(params?.legs_comunes_add_width_mm || 200),
      anchas: Number(params?.legs_anchas_add_width_mm || 280),
      superanchas: Number(params?.legs_superanchas_add_width_mm || 380),
      especiales: Number(params?.legs_especiales_add_width_mm || params?.legs_superanchas_add_width_mm || 380),
    };
    altoPasoMm = Math.max(0, heightMm + Number(params?.behind_vano_add_height_mm || 100));
    anchoPasoMm = Math.max(0, widthMm + Number(addMap[legsKey] || 0));
  } else if (installationMode === "dentro_vano") {
    altoPasoMm = Math.max(0, heightMm - Number(params?.inside_vano_subtract_height_mm || 10));
    const anchoCalculadoMm = Math.max(0, widthMm - Number(params?.inside_vano_subtract_width_mm || 20));
    anchoPasoMm = Math.max(0, anchoCalculadoMm - getPasoWidthDeductionMm(legsKey, params));
  }

  return {
    effectiveKgM2,
    estimatedWeightKg,
    legsLabel,
    altoPasoMm,
    anchoPasoMm,
  };
}
function inputStateStyle(hasError) {
  return hasError
    ? {
        width: "100%",
        borderColor: "#dc2626",
        boxShadow: "0 0 0 3px rgba(220, 38, 38, 0.12)",
        background: "#fff7f7",
      }
    : { width: "100%" };
}
function disabledComputedInputStyle(extra = {}) {
  return {
    width: "100%",
    background: "#f3f4f6",
    color: "#475569",
    borderColor: "#d1d5db",
    ...extra,
  };
}
function FieldBox({ label, helper, helperColor, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div className="muted">{label}</div>
      {children}
      {helper ? (
        <div className="muted" style={{ lineHeight: 1.3, minHeight: 32, color: helperColor || undefined }}>
          {helper}
        </div>
      ) : (
        <div style={{ minHeight: 32 }} />
      )}
    </div>
  );
}
function ComputedCard({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: 10,
        background: "#f3f4f6",
      }}
    >
      <div className="muted">{label}</div>
      <div style={{ fontWeight: 800, color: "#334155" }}>{value || "-"}</div>
    </div>
  );
}
function normalizeOrientation(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "horizontal" || raw === "horizontales") return "horizontal";
  return "verticales";
}
function normalizeDistribution(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "especial" ? "especial" : "repartido";
}
function hasSpecialParantesProduct(lines) {
  return getBudgetProductIdSetFromLines(lines).has(PARANTES_SPECIAL_PRODUCT_ID);
}
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
function getBaseParantesDimensionMm({ orientation, widthM, heightM }) {
  const baseM = orientation === "horizontal" ? Number(heightM || 0) : Number(widthM || 0);
  return Math.max(0, Math.round((Number.isFinite(baseM) ? baseM : 0) * 1000));
}
function getParantesEffectiveSpanMm(baseDimensionMm, tubeDiscountMm) {
  const base = Math.max(0, Number(baseDimensionMm || 0));
  const tube = Math.max(0, Number(tubeDiscountMm || 0) || DEFAULT_PARANTES_TUBE_DISCOUNT_MM);
  return Math.max(0, base - tube);
}
function buildUniformParantesDistances({ firstDistanceMm, parantesCount, baseDimensionMm, tubeDiscountMm }) {
  const count = Math.max(0, Math.trunc(Number(parantesCount || 0)));
  if (!count) return [];
  const tube = Math.max(0, Number(tubeDiscountMm || 0) || DEFAULT_PARANTES_TUBE_DISCOUNT_MM);
  const span = getParantesEffectiveSpanMm(baseDimensionMm, tube);
  const next = Array(count).fill("");
  const rawFirst = Number(firstDistanceMm || 0);
  const hasFixedFirst = Number.isFinite(rawFirst) && rawFirst > 0;

  if (hasFixedFirst) {
    const maxFirst = Math.max(0, span - (count * tube));
    const first = Math.min(rawFirst, maxFirst || rawFirst);
    next[0] = formatNumberForInput(first);
    if (count === 1) return next;
    const remainingClear = Math.max(0, span - first - (count * tube));
    const step = remainingClear / count;
    for (let i = 1; i < count; i += 1) next[i] = formatNumberForInput(step);
    return next;
  }

  const uniformGap = Math.max(0, (span - (count * tube)) / (count + 1));
  for (let i = 0; i < count; i += 1) next[i] = formatNumberForInput(uniformGap);
  return next;
}
function buildResolvedParantesDistances({ distanceList, distributeUniformly, parantesCount, baseDimensionMm, tubeDiscountMm }) {
  const current = padDistanceList(distanceList, parantesCount);
  if (!distributeUniformly) return current;
  const first = parseMmNumber(current[0]);
  return buildUniformParantesDistances({ firstDistanceMm: first, parantesCount, baseDimensionMm, tubeDiscountMm });
}
function buildParantesPayload({ distances, tubeDiscountMm }) {
  return {
    distancias_parantes_mm: distances,
    distancia_primer_parante_mm: distances?.[0] || "",
    descuento_cano_parantes_mm: tubeDiscountMm,
  };
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
  let cursor = 0;

  for (let index = 0; index < count; index += 1) {
    const distance = distanceInputs[index];
    const gap = Number.isFinite(distance) && distance > 0 ? distance : 0;
    cursor += gap;
    const maxPosition = Math.max(0, span - tube);
    const position = Math.max(0, Math.min(maxPosition, cursor));
    positions.push(position);
    cursor = position + tube;
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
  const gap = span - Number(last?.position || 0) - Number(last?.widthMm || tube);
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
    return {
      ...marker,
      drawPositionMm,
      centerMm,
      distanceFromActiveLateralMm,
    };
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
    segments.push({
      index,
      startMm,
      endMm,
      lengthMm: Math.max(0, endMm - startMm),
    });
  }
  return { displayed, segments };
}
function ParantesSketchModal({ open, onClose, orientation, parantesCount, baseDimensionMm, distances, distributeUniformly, tubeDiscountMm, hasDoor = false, isRightDoor = false, doorFirstDistanceMm = 800, portonWidthMm = 0, portonHeightMm = 0 }) {
  if (!open) return null;
  const isHorizontal = orientation === "horizontal";
  const tube = Math.max(0, Number(tubeDiscountMm || 0) || DEFAULT_PARANTES_TUBE_DISCOUNT_MM);
  const effectiveSpan = Math.max(1, getParantesEffectiveSpanMm(baseDimensionMm, tube));
  const drawingSpan = Math.max(1, Number(baseDimensionMm || 0) || effectiveSpan);
  const markers = buildSketchParanteMarkers({ distances, parantesCount, baseDimensionMm, tubeDiscountMm: tube });
  const reverseAxis = !isHorizontal && hasDoor && isRightDoor;
  const { displayed: displayMarkers, segments: dimensionSegments } = buildDimensionSegments(markers, drawingSpan, reverseAxis);
  const finalLateralGapMm = getFinalLateralGapMm(markers, baseDimensionMm, tube);
  const effectivePortonWidthMm = Math.max(1, Number(portonWidthMm || 0) || getParantesEffectiveSpanMm(portonWidthMm, tube));
  const horizontalDoorBoundaryMm = hasDoor
    ? Math.max(0, Math.min(effectivePortonWidthMm, isRightDoor ? (effectivePortonWidthMm - Math.max(0, Number(doorFirstDistanceMm || 0))) : Math.max(0, Number(doorFirstDistanceMm || 0))))
    : 0;
  const width = 720;
  const height = 360;
  const rectX = 70;
  const rectY = 55;
  const rectW = 560;
  const rectH = 220;
  const axisLength = isHorizontal ? rectH : rectW;
  const scale = axisLength / drawingSpan;
  const axisStart = isHorizontal ? rectY : rectX;
  const crossStart = isHorizontal ? rectX : rectY;
  const crossSize = isHorizontal ? rectW : rectH;

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
          width: "min(920px, 96vw)",
          maxHeight: "92vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 20px 60px rgba(15,23,42,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Esquema de parantes</div>
            <div className="muted">
              Orientacion {isHorizontal ? "horizontal" : "vertical"}{reverseAxis ? " (lectura de derecha a izquierda)" : ""} - {parantesCount || 0} parantes internos + 2 laterales - base exterior {formatMm(baseDimensionMm)} - ancho cano {formatMm(tube)} - luz para repartir {formatMm(effectiveSpan)}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 12px", background: "#fff", cursor: "pointer" }}>
            Cerrar
          </button>
        </div>
        <div className="spacer" />
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", border: "1px solid #e5e7eb", borderRadius: 14, background: "#f8fafc" }}>
          <rect x={rectX} y={rectY} width={rectW} height={rectH} rx="10" fill="#ffffff" stroke="#334155" strokeWidth="3" />
          <line x1={rectX} y1={rectY + rectH / 2} x2={rectX + rectW} y2={rectY + rectH / 2} stroke="#e2e8f0" strokeWidth="1" />
          <line x1={rectX + rectW / 2} y1={rectY} x2={rectX + rectW / 2} y2={rectY + rectH} stroke="#e2e8f0" strokeWidth="1" />
          {isHorizontal ? (
            <>
              <rect x={rectX} y={rectY} width={rectW} height="12" rx="2" fill="#0f172a" />
              <rect x={rectX} y={rectY + rectH - 12} width={rectW} height="12" rx="2" fill="#0f172a" />
              <text x={rectX - 8} y={rectY + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Lateral</text>
              <text x={rectX - 8} y={rectY + rectH + 5} textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">Lateral</text>
            </>
          ) : (
            <>
              <rect x={rectX} y={rectY} width="12" height={rectH} rx="2" fill="#0f172a" />
              <rect x={rectX + rectW - 12} y={rectY} width="12" height={rectH} rx="2" fill="#0f172a" />
              <text x={rectX} y={rectY - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">Lateral</text>
              <text x={rectX + rectW} y={rectY - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">Lateral</text>
            </>
          )}
          {isHorizontal && hasDoor ? (() => {
            const doorX = rectX + horizontalDoorBoundaryMm * (rectW / Math.max(1, effectivePortonWidthMm));
            return (
              <g>
                <line x1={doorX} y1={rectY} x2={doorX} y2={rectY + rectH} stroke="#0f172a" strokeWidth="5" strokeDasharray="6 4" />
                <text x={doorX} y={rectY - 24} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">Parante puerta</text>
              </g>
            );
          })() : null}
          {displayMarkers.map((marker) => {
            const rawPos = axisStart + marker.drawPositionMm * scale;
            const paranteSize = Math.max(4, Math.min(26, (marker.widthMm || tube) * scale));
            const cappedPos = Math.max(axisStart, Math.min(axisStart + axisLength - paranteSize, rawPos));
            const markerCenter = cappedPos + paranteSize / 2;
            const markerNumber = marker.index + 1;
            if (isHorizontal) {
              const doorX = rectX + horizontalDoorBoundaryMm * (rectW / Math.max(1, effectivePortonWidthMm));
              const barX = hasDoor ? (isRightDoor ? rectX : doorX) : crossStart;
              const barWidth = hasDoor ? (isRightDoor ? Math.max(12, doorX - rectX) : Math.max(12, rectX + rectW - doorX)) : crossSize;
              return (
                <g key={`parante-${marker.index}`}>
                  <rect x={barX} y={cappedPos} width={barWidth} height={paranteSize} rx="2" fill="#2563eb" />
                  <circle cx={rectX + rectW + 18} cy={markerCenter} r="11" fill="#2563eb" />
                  <text x={rectX + rectW + 18} y={markerCenter + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{markerNumber}</text>
                </g>
              );
            }
            return (
              <g key={`parante-${marker.index}`}>
                <rect x={cappedPos} y={crossStart} width={paranteSize} height={crossSize} rx="2" fill="#2563eb" />
                <circle cx={markerCenter} cy={crossStart + crossSize + 18} r="11" fill="#2563eb" />
                <text x={markerCenter} y={crossStart + crossSize + 22} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{markerNumber}</text>
              </g>
            );
          })}
          {isHorizontal ? (
            <g>
              {dimensionSegments.map((segment) => {
                const y1 = rectY + (segment.startMm * scale);
                const y2 = rectY + (segment.endMm * scale);
                const midY = (y1 + y2) / 2;
                const dimX = rectX + rectW + 52;
                return (
                  <g key={`segment-h-${segment.index}`}>
                    <line x1={dimX} y1={y1} x2={dimX} y2={y2} stroke="#dc2626" strokeWidth="2" />
                    <line x1={dimX - 6} y1={y1} x2={dimX + 6} y2={y1} stroke="#dc2626" strokeWidth="2" />
                    <line x1={dimX - 6} y1={y2} x2={dimX + 6} y2={y2} stroke="#dc2626" strokeWidth="2" />
                    <text x={dimX + 10} y={midY + 4} fontSize="11" fontWeight="700" fill="#dc2626">{formatNumberForInput(segment.lengthMm)} mm</text>
                  </g>
                );
              })}
            </g>
          ) : (
            <g>
              {dimensionSegments.map((segment) => {
                const toX = (mm) => rectX + (mm * scale);
                const x1 = toX(segment.startMm);
                const x2 = toX(segment.endMm);
                const midX = (x1 + x2) / 2;
                const dimY = rectY + rectH + 8;
                return (
                  <g key={`segment-v-${segment.index}`}>
                    <line x1={x1} y1={dimY} x2={x2} y2={dimY} stroke="#dc2626" strokeWidth="2" />
                    <line x1={x1} y1={dimY - 6} x2={x1} y2={dimY + 6} stroke="#dc2626" strokeWidth="2" />
                    <line x1={x2} y1={dimY - 6} x2={x2} y2={dimY + 6} stroke="#dc2626" strokeWidth="2" />
                    <text x={midX} y={dimY - 10} fontSize="11" fontWeight="700" fill="#dc2626" textAnchor="middle">{formatNumberForInput(segment.lengthMm)} mm</text>
                  </g>
                );
              })}
            </g>
          )}
          <text x={rectX + rectW / 2} y="28" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">
            {isHorizontal ? "Distribucion sobre el alto del porton" : "Distribucion sobre el ancho del porton"}
          </text>
          <text x={rectX + rectW / 2} y={rectY + rectH + 76} textAnchor="middle" fontSize="13" fill="#475569">
            {distributeUniformly ? "Resto distribuido uniformemente" : "Distancias cargadas manualmente"}
          </text>
        </svg>
        <div className="spacer" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div className="muted">Parante lateral inicial</div>
            <div style={{ fontWeight: 800 }}>0 mm</div>
          </div>
          {displayMarkers.map((marker) => (
            <div key={`distance-summary-${marker.index}`} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
              <div className="muted">{marker.index === 0 ? "Primer parante interno" : `Parante interno ${marker.index + 1}`}</div>
              <div style={{ fontWeight: 800 }}>{formatNumberForInput(marker.distanceFromActiveLateralMm)} mm desde {reverseAxis ? "lateral derecho" : "lateral"}</div>
            </div>
          ))}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div className="muted">Parante lateral final</div>
            <div style={{ fontWeight: 800 }}>{formatMm(drawingSpan) || "-"}</div>
            <div className="muted" style={{ marginTop: 4 }}>Base total: {formatMm(baseDimensionMm) || "-"}</div>
            {finalLateralGapMm !== null ? (
              <div className="muted" style={{ marginTop: 4 }}>
                {formatNumberForInput(finalLateralGapMm)} mm libres desde parante interno {markers.length}
              </div>
            ) : null}
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

  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);
  const lines = useQuoteStore((s) => s.lines);
  const lastAutoParantesRef = useRef("");
  const [parantesSketchOpen, setParantesSketchOpen] = useState(false);

  const rulesQ = useQuery({
    queryKey: ["technical-rules-dimensions-preview"],
    queryFn: () => adminGetTechnicalMeasurementRules("porton"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled: isPorton,
  });

  const widthRaw = String(dimensions?.width ?? "");
  const heightRaw = String(dimensions?.height ?? "");
  const width = useMemo(() => toNumber(widthRaw), [widthRaw]);
  const height = useMemo(() => toNumber(heightRaw), [heightRaw]);
  const widthValue = useMemo(() => parseOptionalNumber(normalizeDecimalWithDot(widthRaw)), [widthRaw]);
  const heightValue = useMemo(() => parseOptionalNumber(normalizeDecimalWithDot(heightRaw)), [heightRaw]);
  const widthOutOfBounds = widthValue !== null && (
    isPorton
      ? (widthValue < WIDTH_MIN_M || widthValue > WIDTH_MAX_M)
      : (isIpanel ? widthValue > IPANEL_WIDTH_MAX_M : false)
  );
  const heightOutOfBounds = heightValue !== null && (
    isPorton
      ? (heightValue < HEIGHT_MIN_M || heightValue > HEIGHT_MAX_M)
      : (isIpanel ? heightValue > IPANEL_HEIGHT_MAX_M : false)
  );
  const hasSizeError = (isPorton || isIpanel) && (widthOutOfBounds || heightOutOfBounds);
  const widthHelper = isPorton
    ? "Minimo 2.4 m - Maximo 7 m"
    : (isIpanel ? "Maximo 1.13 m (113 cm)" : "");
  const heightHelper = isPorton
    ? "Minimo 2 m - Maximo 3 m"
    : (isIpanel ? "Maximo 2.45 m (245 cm)" : "");
  const widthPlaceholder = isIpanel ? "Ej: 1.13" : "Ej: 3.2";
  const heightPlaceholder = isIpanel ? "Ej: 2.45" : "Ej: 2.1";
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);

  const orientation = useMemo(
    () => normalizeOrientation(dimensions?.orientacion_parantes),
    [dimensions?.orientacion_parantes],
  );
  const distribution = useMemo(
    () => normalizeDistribution(dimensions?.distribucion_parantes),
    [dimensions?.distribucion_parantes],
  );
  const params = useMemo(() => getRulesParams(rulesQ.data), [rulesQ.data]);
  const preview = useMemo(
    () => buildCalculatedPreview({ widthM: width, heightM: height, lines, params, portonType, dimensions }),
    [width, height, lines, params, portonType, dimensions],
  );
  const aptoParaRevestir = isAptoDerivedType(portonType);
  const isNonAptoPorton = isPorton && !aptoParaRevestir;
  const nonAptoOrientationDebug = useMemo(
    () => isNonAptoPorton ? resolveNonAptoParantesOrientationDebug(lines, params) : { selectedIds: [], orientation: "", configuredHorizontal: "", configuredVertical: "" },
    [isNonAptoPorton, lines, params],
  );
  const nonAptoConfiguredOrientation = nonAptoOrientationDebug.orientation || "";
  const effectiveParantesOrientation = isNonAptoPorton && nonAptoConfiguredOrientation
    ? nonAptoConfiguredOrientation
    : orientation;
  const autoParantesCount = useMemo(
    () => computeAutomaticParantesCount({ orientation: effectiveParantesOrientation, widthM: width, heightM: height, lines }),
    [effectiveParantesOrientation, width, height, lines],
  );
  const parantesFieldsReadOnly = isNonAptoPorton;
  const hasDoorParantesConfig = useMemo(
    () => isNonAptoPorton ? hasDoorForParantes(lines, params) : false,
    [isNonAptoPorton, lines, params],
  );
  const isLeftDoorParantes = useMemo(
    () => (isNonAptoPorton && hasDoorParantesConfig) ? hasLeftDoorForParantes(lines, params) : false,
    [isNonAptoPorton, hasDoorParantesConfig, lines, params],
  );
  const isRightDoorParantes = useMemo(
    () => (isNonAptoPorton && hasDoorParantesConfig && !isLeftDoorParantes) ? hasRightDoorForParantes(lines, params) : false,
    [isNonAptoPorton, hasDoorParantesConfig, isLeftDoorParantes, lines, params],
  );
  const doorFirstParanteDistanceMm = useMemo(() => getDoorFirstParanteDistanceMm(params), [params]);
  const parantesCount = getParantesCount(dimensions?.cantidad_parantes);
  const tubeDiscountMm = useMemo(() => getParantesTubeDiscountMm(params), [params]);
  const baseParantesDimensionMm = useMemo(
    () => getBaseParantesDimensionMm({ orientation: effectiveParantesOrientation, widthM: width, heightM: height }),
    [effectiveParantesOrientation, width, height],
  );
  const rawParantesDistances = dimensions?.distancias_parantes_mm ?? dimensions?.distancias_parantes ?? [];
  const firstParanteDistance = String(dimensions?.distancia_primer_parante_mm || normalizeDistanceList(rawParantesDistances)[0] || "");
  const distributeUniformly = dimensions?.distribuir_parantes_uniformemente === true || String(dimensions?.distribuir_parantes_uniformemente || "").trim().toLowerCase() === "true";
  const showSpecialParantesDistances = isPorton && aptoParaRevestir && distribution === "especial";
  const resolvedParantesDistances = useMemo(() => buildResolvedParantesDistances({
    distanceList: firstParanteDistance ? [firstParanteDistance, ...normalizeDistanceList(rawParantesDistances).slice(1)] : rawParantesDistances,
    distributeUniformly,
    parantesCount,
    baseDimensionMm: baseParantesDimensionMm,
    tubeDiscountMm,
  }), [rawParantesDistances, distributeUniformly, parantesCount, baseParantesDimensionMm, tubeDiscountMm, firstParanteDistance]);
  const nonAptoDoorParantesDistances = useMemo(() => {
    if (!isNonAptoPorton || !hasDoorParantesConfig || parantesCount <= 0 || baseParantesDimensionMm <= 0) return null;
    const useDoorFirstDistance = normalizeOrientation(effectiveParantesOrientation) !== "horizontal";
    return buildUniformParantesDistances({
      firstDistanceMm: useDoorFirstDistance ? doorFirstParanteDistanceMm : 0,
      parantesCount,
      baseDimensionMm: baseParantesDimensionMm,
      tubeDiscountMm,
    });
  }, [isNonAptoPorton, hasDoorParantesConfig, parantesCount, baseParantesDimensionMm, doorFirstParanteDistanceMm, tubeDiscountMm, effectiveParantesOrientation]);
  const sketchParantesDistances = nonAptoDoorParantesDistances || resolvedParantesDistances;
  const sketchDistributeUniformly = isNonAptoPorton ? true : distributeUniformly;

  useEffect(() => {
    if (!isPorton) return;
    if (!isAptoDerivedType(portonType)) {
      if (String(dimensions?.kg_m2 || "").trim()) setDimensions({ kg_m2: "" });
      return;
    }
    const nextKgM2 = resolveAptoKgM2ByProducts(lines, params) || preview.effectiveKgM2;
    if (nextKgM2 > 0) {
      const nextValue = formatNumberForInput(nextKgM2);
      if (String(dimensions?.kg_m2 || "").trim() !== nextValue) {
        setDimensions({ kg_m2: nextValue });
      }
    }
  }, [isPorton, portonType, dimensions?.kg_m2, lines, params, preview.effectiveKgM2, setDimensions]);

  useEffect(() => {
    if (!isPorton) return;
    const patch = {};
    const currentOrientationRaw = String(dimensions?.orientacion_parantes || "").trim();
    const forcedNonAptoOrientation = isNonAptoPorton ? (nonAptoConfiguredOrientation || "verticales") : "";
    if (forcedNonAptoOrientation) {
      if (orientation !== forcedNonAptoOrientation) patch.orientacion_parantes = forcedNonAptoOrientation;
    } else if (!currentOrientationRaw) {
      patch.orientacion_parantes = "verticales";
    }

    if (isNonAptoPorton) {
      if (distribution !== "repartido") patch.distribucion_parantes = "repartido";
    } else if (!String(dimensions?.distribucion_parantes || "").trim()) {
      patch.distribucion_parantes = "repartido";
    }

    const nextCount = String(autoParantesCount);
    const currentCount = String(dimensions?.cantidad_parantes ?? "").trim();
    if (isNonAptoPorton) {
      if (currentCount !== nextCount) patch.cantidad_parantes = nextCount;
      lastAutoParantesRef.current = nextCount;
    } else {
      const nextOrientation = normalizeOrientation(patch.orientacion_parantes || orientation);
      if (nextOrientation === "verticales") {
        if (!currentCount || currentCount === String(lastAutoParantesRef.current || "").trim()) {
          if (currentCount !== nextCount) {
            patch.cantidad_parantes = nextCount;
          }
        }
        lastAutoParantesRef.current = nextCount;
      } else {
        lastAutoParantesRef.current = nextCount;
      }
    }

    if (Object.keys(patch).length) {
      setDimensions(patch);
    }
  }, [
    isPorton,
    isNonAptoPorton,
    nonAptoConfiguredOrientation,
    orientation,
    distribution,
    autoParantesCount,
    dimensions?.orientacion_parantes,
    dimensions?.distribucion_parantes,
    dimensions?.cantidad_parantes,
    setDimensions,
  ]);

  useEffect(() => {
    if (!isNonAptoPorton || !hasDoorParantesConfig || parantesCount <= 0 || baseParantesDimensionMm <= 0) return;
    const useDoorFirstDistance = normalizeOrientation(effectiveParantesOrientation) !== "horizontal";
    const nextDistances = buildUniformParantesDistances({
      firstDistanceMm: useDoorFirstDistance ? doorFirstParanteDistanceMm : 0,
      parantesCount,
      baseDimensionMm: baseParantesDimensionMm,
      tubeDiscountMm,
    });
    const current = normalizeDistanceList(rawParantesDistances);
    const patch = {};
    if (distribution !== "repartido") patch.distribucion_parantes = "repartido";
    if (String(dimensions?.distancia_primer_parante_mm || "") !== String(nextDistances[0] || "")) {
      patch.distancia_primer_parante_mm = nextDistances[0] || "";
    }
    if (!sameArrayValues(current, nextDistances)) {
      patch.distancias_parantes_mm = nextDistances;
    }
    if (dimensions?.distribuir_parantes_uniformemente !== true) {
      patch.distribuir_parantes_uniformemente = true;
    }
    if (dimensions?.parantes_door_auto_applied !== true) {
      patch.parantes_door_auto_applied = true;
    }
    if (Object.keys(patch).length) setDimensions(patch);
  }, [
    isNonAptoPorton,
    hasDoorParantesConfig,
    parantesCount,
    baseParantesDimensionMm,
    doorFirstParanteDistanceMm,
    tubeDiscountMm,
    rawParantesDistances,
    distribution,
    dimensions?.distancia_primer_parante_mm,
    dimensions?.distribuir_parantes_uniformemente,
    dimensions?.parantes_door_auto_applied,
    effectiveParantesOrientation,
    setDimensions,
  ]);

  useEffect(() => {
    if (!isNonAptoPorton || hasDoorParantesConfig || dimensions?.parantes_door_auto_applied !== true) return;
    setDimensions({
      distancia_primer_parante_mm: "",
      distancias_parantes_mm: [],
      distribuir_parantes_uniformemente: false,
      parantes_door_auto_applied: false,
    });
  }, [
    isNonAptoPorton,
    hasDoorParantesConfig,
    dimensions?.parantes_door_auto_applied,
    setDimensions,
  ]);

  useEffect(() => {
    if (!showSpecialParantesDistances || parantesCount <= 0) return;
    const current = normalizeDistanceList(rawParantesDistances);
    const next = distributeUniformly
      ? resolvedParantesDistances
      : padDistanceList(current.length ? current : [firstParanteDistance], parantesCount);
    const currentSignature = current.join("|");
    const nextSignature = next.join("|");
    if (currentSignature !== nextSignature || String(dimensions?.distancia_primer_parante_mm || "") !== String(next[0] || "") || Number(dimensions?.descuento_cano_parantes_mm || 0) !== Number(tubeDiscountMm || 0)) {
      setDimensions({
        ...buildParantesPayload({ distances: next, tubeDiscountMm }),
        distribuir_parantes_uniformemente: distributeUniformly,
      });
    }
  }, [
    showSpecialParantesDistances,
    parantesCount,
    rawParantesDistances,
    firstParanteDistance,
    distributeUniformly,
    resolvedParantesDistances,
    tubeDiscountMm,
    dimensions?.distancia_primer_parante_mm,
    dimensions?.descuento_cano_parantes_mm,
    setDimensions,
  ]);

  if (!isPorton && !isIpanel) return null;

  const title = isPorton ? "Medidas del porton" : "Medidas del Ipanel";

  const parantesHelper =
    isNonAptoPorton && hasDoorParantesConfig
      ? `Solo lectura. Con puerta: primer parante a ${formatNumberForInput(doorFirstParanteDistanceMm)} mm y el resto repartido.`
      : isNonAptoPorton
        ? "Solo lectura. Se calcula automaticamente segun reglas tecnicas, orientacion y medidas cargadas."
        : orientation === "verticales"
          ? (
              hasSpecialParantesProduct(lines)
                ? "Se sugiere automaticamente usando el ancho completo. Si queres, podes cambiar el valor manualmente."
                : "Se sugiere automaticamente restando 0.80 m al ancho. Si queres, podes cambiar el valor manualmente."
            )
          : "En horizontal podes ajustar manualmente la cantidad de parantes.";
  const orientationReadOnlyHelper = parantesFieldsReadOnly
    ? "Solo lectura. Definida automaticamente por reglas tecnicas segun los IDs del presupuesto."
    : "";

  function setParantesDistanceAt(index, value) {
    if (parantesFieldsReadOnly) return;
    const next = padDistanceList(rawParantesDistances, Math.max(parantesCount, index + 1));
    next[index] = normalizeDecimalMmInput(value);
    setDimensions(buildParantesPayload({ distances: next, tubeDiscountMm }));
  }

  function addParanteDistance() {
    if (parantesFieldsReadOnly) return;
    const nextCount = Math.max(0, parantesCount) + 1;
    const nextDistances = padDistanceList(rawParantesDistances, nextCount);
    const finalDistances = distributeUniformly
      ? buildResolvedParantesDistances({
          distanceList: nextDistances,
          distributeUniformly: true,
          parantesCount: nextCount,
          baseDimensionMm: baseParantesDimensionMm,
          tubeDiscountMm,
        })
      : nextDistances;
    setDimensions({
      cantidad_parantes: String(nextCount),
      ...buildParantesPayload({ distances: finalDistances, tubeDiscountMm }),
    });
  }

  return (
    <div
      style={{
        border: `1px solid ${hasSizeError ? "#fca5a5" : "transparent"}`,
        borderRadius: 14,
        padding: 4,
        background: hasSizeError ? "#fff7f7" : "transparent",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>

      {hasSizeError ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#fee2e2",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          Se encuentra fuera de los limites de tamano.
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        <FieldBox label="Ancho (m)" helper={widthHelper} helperColor={widthOutOfBounds ? "#b91c1c" : undefined}>
          <Input type="text" inputMode="decimal" value={widthRaw} onChange={(v) => setDimensions({ width: normalizeDecimal(v) })} onBlur={(e) => setDimensions({ width: normalizeDecimal(e?.target?.value) })} placeholder={widthPlaceholder} style={inputStateStyle(widthOutOfBounds)} />
        </FieldBox>
        <FieldBox label="Alto (m)" helper={heightHelper} helperColor={heightOutOfBounds ? "#b91c1c" : undefined}>
          <Input type="text" inputMode="decimal" value={heightRaw} onChange={(v) => setDimensions({ height: normalizeDecimal(v) })} onBlur={(e) => setDimensions({ height: normalizeDecimal(e?.target?.value) })} placeholder={heightPlaceholder} style={inputStateStyle(heightOutOfBounds)} />
        </FieldBox>
        {isPorton ? (<>
          <FieldBox label="Tipo / Sistema derivado"><Input value={portonType || ""} disabled placeholder="Se completa segun la combinacion de productos" style={disabledComputedInputStyle()} /></FieldBox>
          <FieldBox label="Kg por m2"><Input value={formatNumberForInput(preview.effectiveKgM2)} placeholder="Se calcula automaticamente segun el sistema" style={disabledComputedInputStyle()} disabled /></FieldBox>
          <FieldBox label="Superficie"><div style={{ fontWeight: 800, fontSize: 16, minHeight: 40, display: "flex", alignItems: "center", padding: "9px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#334155" }}>{area ? `${area.toFixed(2)} m2` : "-"}</div></FieldBox>
          <FieldBox label="Orientacion de los parantes" helper={orientationReadOnlyHelper}><select value={parantesFieldsReadOnly ? effectiveParantesOrientation : orientation} onChange={(e) => { if (!parantesFieldsReadOnly) setDimensions({ orientacion_parantes: e.target.value }); }} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: parantesFieldsReadOnly ? "#f3f4f6" : "#fff", color: parantesFieldsReadOnly ? "#475569" : undefined }} disabled={parantesFieldsReadOnly}><option value="verticales">Verticales</option><option value="horizontal">Horizontal</option></select></FieldBox>
          <FieldBox label="Cantidad de parantes" helper={parantesHelper}><Input type="text" inputMode="numeric" value={String(dimensions?.cantidad_parantes ?? "")} disabled={parantesFieldsReadOnly} onChange={(v) => { if (!parantesFieldsReadOnly) setDimensions({ cantidad_parantes: normalizeIntegerInput(v) }); }} onBlur={(e) => { if (!parantesFieldsReadOnly) setDimensions({ cantidad_parantes: normalizeIntegerInput(e?.target?.value) }); }} style={parantesFieldsReadOnly ? disabledComputedInputStyle() : { width: "100%" }} placeholder="Ej: 3" /></FieldBox>
          <FieldBox label="Distribucion de los parantes" helper={parantesFieldsReadOnly ? "Solo lectura. Para no aptos se usa repartido automaticamente." : ""}><select value={distribution} onChange={(e) => { if (!parantesFieldsReadOnly) setDimensions({ distribucion_parantes: e.target.value }); }} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: parantesFieldsReadOnly ? "#f3f4f6" : "#fff", color: parantesFieldsReadOnly ? "#475569" : undefined }} disabled={parantesFieldsReadOnly}><option value="repartido">Repartido</option><option value="especial">Especial</option></select></FieldBox>
        </>) : null}
      </div>

      {showSpecialParantesDistances ? (
        <>
          <div className="spacer" />
          <FieldBox label="Observaciones de distribucion especial">
            <textarea value={String(dimensions?.observaciones_parantes ?? "")} onChange={(e) => setDimensions({ observaciones_parantes: e.target.value })} rows={3} style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: "10px 12px", resize: "vertical", fontFamily: "inherit" }} placeholder="Indica como debe ser la distribucion especial de los parantes." />
          </FieldBox>
        </>
      ) : null}

      {isPorton ? (
        <>
          <div className="spacer" />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
            <div>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Esquema de hoja y parantes</div>
              <div className="muted">Disponible para todos los portones. Los parantes laterales se muestran aparte y no se cuentan dentro de la cantidad ingresada.</div>
            </div>
            <button type="button" onClick={() => setParantesSketchOpen(true)} style={{ border: "1px solid #c7d2fe", borderRadius: 10, background: "#eef2ff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>
              Ver esquema de parantes
            </button>
          </div>
        </>
      ) : null}

      {showSpecialParantesDistances ? (
        <>
          <div className="spacer" />
          <div style={{ border: "1px solid #e0e7ff", background: "#f8fbff", borderRadius: 14, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 4 }}>Distancias dentro a dentro de parantes</div>
                <div className="muted">
                  Base usada: {effectiveParantesOrientation === "horizontal" ? "Alto" : "Ancho"} {formatMm(baseParantesDimensionMm) || "-"}. Descuento de cano desde reglas tecnicas: {formatMm(tubeDiscountMm)}.
                </div>
              </div>
            </div>
            <div className="spacer" />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={distributeUniformly}
                onChange={(e) => setDimensions({ distribuir_parantes_uniformemente: e.target.checked })}
              />
              Distribuir uniformemente
            </label>
            <div className="muted" style={{ marginTop: 6 }}>
              Si esta tildado, el sistema usa el lateral final como limite: resta la distancia del primer parante y reparte el tramo restante hasta el lateral final.
            </div>
            <div className="spacer" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
              {padDistanceList(resolvedParantesDistances, parantesCount).map((distance, index) => (
                <FieldBox key={`distance-${index}`} label={paranteDistanceLabel(index)} helper={index > 0 && distributeUniformly ? "Calculado automaticamente por reparto uniforme." : "Numero en mm. Puede tener decimales."}>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={String(distance ?? "")}
                    disabled={index > 0 && distributeUniformly}
                    onChange={(v) => setParantesDistanceAt(index, v)}
                    onBlur={(e) => setParantesDistanceAt(index, e?.target?.value)}
                    placeholder={index === 0 ? "Ej: 800" : "Ej: 720"}
                    style={index > 0 && distributeUniformly ? disabledComputedInputStyle() : { width: "100%" }}
                  />
                </FieldBox>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button type="button" onClick={addParanteDistance} style={{ border: "1px solid #ddd", borderRadius: 10, background: "#fff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>
                + Agregar parante
              </button>
            </div>
          </div>
        </>
      ) : null}

      {isPorton ? (<>
        <div className="spacer" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <ComputedCard label="Medidas de paso" value={preview.altoPasoMm > 0 && preview.anchoPasoMm > 0 ? `${formatMetersFromMm(preview.altoPasoMm)} x ${formatMetersFromMm(preview.anchoPasoMm)}` : "-"} />
          <ComputedCard label="Kg/m2 efectivo" value={preview.effectiveKgM2 > 0 ? `${preview.effectiveKgM2.toFixed(2)} kg/m2` : "-"} />
          <ComputedCard label="Peso estimado" value={preview.estimatedWeightKg > 0 ? `${preview.estimatedWeightKg.toFixed(2)} kg` : "-"} />
          <ComputedCard label="Piernas estimadas" value={preview.legsLabel} />
        </div>
        <div className="muted" style={{ marginTop: 8 }}>Estas medidas se guardan dentro del presupuesto para usarlas despues en medicion, calculo de peso y comparacion de superficie.</div>
      </>) : null}

      <ParantesSketchModal
        open={parantesSketchOpen}
        onClose={() => setParantesSketchOpen(false)}
        orientation={effectiveParantesOrientation}
        parantesCount={parantesCount}
        baseDimensionMm={baseParantesDimensionMm}
        distances={sketchParantesDistances}
        distributeUniformly={sketchDistributeUniformly}
        tubeDiscountMm={tubeDiscountMm}
        hasDoor={hasDoorParantesConfig}
        isRightDoor={isRightDoorParantes}
        doorFirstDistanceMm={doorFirstParanteDistanceMm}
        portonWidthMm={Math.round((Number(width || 0) || 0) * 1000)}
        portonHeightMm={Math.round((Number(height || 0) || 0) * 1000)}
      />
    </div>
  );
}

import { getTechnicalMeasurementRules } from "./settingsDb.js";

// Port fiel de cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
// (computePortonFromVano + buildCalculatedPreview y sus dependencias). Misma logica, mismos
// nombres, para que "medidas de paso/hoja" post-medicion salgan con la MISMA formula que usa
// el presupuesto al principio, ahora alimentada con el vano final medido en vez del presupuestado.
//
// Unica divergencia intencional: getRulesParams() en el front tambien mergea una capa de
// localStorage (respaldo de sesion del navegador); el server no tiene eso, solo usa lo guardado
// en la base (catalog_rules.porton, con fallback a los parametros de nivel raiz).

const VANO_BEHIND_PRODUCT_ID = 3022;
const VANO_INSIDE_PRODUCT_ID = 3023;
const VANO_PLACEMENT_PRODUCT_IDS = new Set([VANO_BEHIND_PRODUCT_ID, VANO_INSIDE_PRODUCT_ID]);
const VANO_WIDTH_ADD_BY_LEGS_MM_DEFAULT = { angostas: 140, comunes: 200, anchas: 280, superanchas: 380 };
const VANO_HEIGHT_ADD_MM_DEFAULT = 100;
const APTOS_PARA_REVESTIR_TYPE = "para_revestir_con_al_pvc_otros";
const REVESTIMIENTO_ESPECIAL_PRODUCT_ID = 4176;
const LINE_ID_KEYS_FOR_PARANTES = [
  "product_id", "id", "presupuestador_id", "presupuestador_product_id", "productId", "productID",
  "catalog_product_id", "catalogProductId", "odoo_product_id", "odoo_external_id", "odoo_id", "odoo_template_id", "odoo_variant_id",
];

function round4(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
}
const DIACRITICS_RE = /[̀-ͯ]/g;
function norm(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function parseOptionalNumber(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function hasSurfaceParamContent(value) {
  return !!(value && typeof value === "object" && Object.keys(value).length);
}
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
function getBudgetProductIdSetFromLines(lines) {
  return new Set(getBudgetProductIdsFromLines(lines));
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

function getSelectedVanoPlacementProductId(lines) {
  const ids = getBudgetProductIdSetFromLines(lines);
  for (const id of VANO_PLACEMENT_PRODUCT_IDS) {
    if (ids.has(id)) return id;
  }
  return 0;
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

const LEGS_KEY_TO_LABEL = { angostas: "Angostas", comunes: "Comunes", anchas: "Anchas", superanchas: "Superanchas", especiales: "Especiales" };

function buildCalculatedPreview({ widthM, heightM, lines, params, portonType, dimensions, legsLabelOverride }) {
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
  // legsLabelOverride: permite que una "pierna" cargada a mano por tecnica (measurement_form.piernas)
  // reemplace el calculo automatico por peso, para que medidas de paso/hoja salgan con esa pierna.
  const legsLabel = legsLabelOverride || legsTypeForWeight(estimatedWeightKg, aptoParaRevestir, params);
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
  return { effectiveKgM2, estimatedWeightKg, legsLabel, altoPasoMm, anchoPasoMm, altoHojaMm, anchoHojaMm, hasRebajeLateral, areaM2 };
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
  // A diferencia del front, no hay capa de localStorage server-side: solo lo guardado en la base.
  return params;
}

function formatMetersFromMm(mm) {
  const n = Number(mm || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 1000) * 100) / 100;
}

// Calcula ancho/alto del porton (post ajuste por modo de instalacion) y las medidas de paso/hoja,
// a partir del vano final (medido), replicando exactamente lo que hace el presupuesto. legsKey
// para el ajuste "por detras del vano" se resuelve con un pequeno punto fijo (2-3 iteraciones),
// igual que converge la UI entre renders sucesivos del efecto en PortonDimensions.jsx.
export async function computeOfficialPortonMeasurements({ vanoWidthM, vanoHeightM, lines, portonType, dimensions, legsKeyOverride }) {
  const rulesData = await getTechnicalMeasurementRules("porton");
  const params = getRulesParams(rulesData);
  const placementProductId = getSelectedVanoPlacementProductId(lines);
  const legsLabelOverride = legsKeyOverride ? LEGS_KEY_TO_LABEL[mapLegsKeyForWidth(String(legsKeyOverride))] : null;

  let legsLabelGuess = legsLabelOverride || buildCalculatedPreview({ widthM: vanoWidthM, heightM: vanoHeightM, lines, params, portonType, dimensions }).legsLabel;
  let portonFromVano = { widthM: 0, heightM: 0 };
  let preview = null;

  for (let i = 0; i < 4; i += 1) {
    const vanoLegsKey = normalizeLegsKeyForVano(legsLabelGuess);
    portonFromVano = computePortonFromVano({ vanoWidthM, vanoHeightM, placementProductId, legsKey: vanoLegsKey, params });
    const portonWidthM = portonFromVano.widthM > 0 ? portonFromVano.widthM : vanoWidthM;
    const portonHeightM = portonFromVano.heightM > 0 ? portonFromVano.heightM : vanoHeightM;
    preview = buildCalculatedPreview({ widthM: portonWidthM, heightM: portonHeightM, lines, params, portonType, dimensions, legsLabelOverride });
    if (preview.legsLabel === legsLabelGuess) break;
    legsLabelGuess = preview.legsLabel;
  }

  const portonWidthM = portonFromVano.widthM > 0 ? portonFromVano.widthM : vanoWidthM;
  const portonHeightM = portonFromVano.heightM > 0 ? portonFromVano.heightM : vanoHeightM;

  const anchoPasoM = formatMetersFromMm(preview.anchoPasoMm);
  const altoPasoM = formatMetersFromMm(preview.altoPasoMm);
  const anchoHojaM = formatMetersFromMm(preview.anchoHojaMm);
  const altoHojaM = formatMetersFromMm(preview.altoHojaMm);

  const dimensionsPatch = {
    width: portonWidthM > 0 ? String(portonWidthM) : undefined,
    height: portonHeightM > 0 ? String(portonHeightM) : undefined,
    vano_width: vanoWidthM > 0 ? String(vanoWidthM) : undefined,
    vano_height: vanoHeightM > 0 ? String(vanoHeightM) : undefined,
    area_m2: portonWidthM > 0 && portonHeightM > 0 ? round4(portonWidthM * portonHeightM) : undefined,
    calculated_effective_kg_m2: preview.effectiveKgM2 || undefined,
    calculated_estimated_weight_kg: preview.estimatedWeightKg || undefined,
    calculated_legs_label: preview.legsLabel && preview.legsLabel !== "-" ? preview.legsLabel : undefined,
    paso_ancho_mm: preview.anchoPasoMm || undefined,
    paso_alto_mm: preview.altoPasoMm || undefined,
    paso_ancho_m: anchoPasoM ?? undefined,
    paso_alto_m: altoPasoM ?? undefined,
    medidas_paso_ancho_mm: preview.anchoPasoMm || undefined,
    medidas_paso_alto_mm: preview.altoPasoMm || undefined,
    medidas_paso_ancho_m: anchoPasoM ?? undefined,
    medidas_paso_alto_m: altoPasoM ?? undefined,
    hoja_ancho_mm: preview.anchoHojaMm || undefined,
    hoja_alto_mm: preview.altoHojaMm || undefined,
    hoja_ancho_m: anchoHojaM ?? undefined,
    hoja_alto_m: altoHojaM ?? undefined,
    medidas_hoja_text: anchoHojaM && altoHojaM ? `${anchoHojaM.toFixed(2)} m x ${altoHojaM.toFixed(2)} m` : undefined,
    medidas_paso_text: anchoPasoM && altoPasoM ? `${anchoPasoM.toFixed(2)} m x ${altoPasoM.toFixed(2)} m` : undefined,
    medidas_paso: anchoPasoM && altoPasoM
      ? { text: `${anchoPasoM.toFixed(2)} m x ${altoPasoM.toFixed(2)} m`, ancho_m: anchoPasoM, ancho_mm: preview.anchoPasoMm, alto_m: altoPasoM, alto_mm: preview.altoPasoMm }
      : undefined,
  };
  Object.keys(dimensionsPatch).forEach((key) => dimensionsPatch[key] === undefined && delete dimensionsPatch[key]);

  return { vanoWidthM, vanoHeightM, portonWidthM, portonHeightM, placementProductId, preview, dimensionsPatch };
}

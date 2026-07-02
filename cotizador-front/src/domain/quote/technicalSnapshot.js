const TECHNICAL_RULES_STORAGE_PREFIX = "presupuestador:technical_measurement_rules";
const SURFACE_PARAMETERS_STORAGE_KEY = "presupuestador:technical_surface_parameters:porton";
const APTOS_PARA_REVESTIR_TYPE = "para_revestir_con_al_pvc_otros";

function safeLocalStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function rulesStorageKey(kind = "porton") {
  return `${TECHNICAL_RULES_STORAGE_PREFIX}:${String(kind || "porton").trim().toLowerCase()}`;
}

export function storeTechnicalRulesForKind(kind = "porton", rules = {}) {
  const storage = safeLocalStorage();
  if (!storage) return;
  const normalizedKind = String(kind || "porton").trim().toLowerCase();
  try {
    storage.setItem(rulesStorageKey(normalizedKind), JSON.stringify(rules || {}));
  } catch {}
}

function readTechnicalRulesForKind(kind = "porton") {
  const storage = safeLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(rulesStorageKey(kind));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readStoredSurfaceParameters() {
  const storage = safeLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(SURFACE_PARAMETERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hasObjectContent(value) {
  return !!(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
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
    ...(hasObjectContent(root.measurement_surface_params) ? root.measurement_surface_params : {}),
    ...(hasObjectContent(root.surface_params) ? root.surface_params : {}),
    ...(hasObjectContent(root.surface_calc_params) ? root.surface_calc_params : {}),
    ...(hasObjectContent(root.surface_parameters) ? root.surface_parameters : {}),
    ...(hasObjectContent(root.parantes_config) ? root.parantes_config : {}),
    ...(hasObjectContent(portonRules.measurement_surface_params) ? portonRules.measurement_surface_params : {}),
    ...(hasObjectContent(portonRules.surface_params) ? portonRules.surface_params : {}),
    ...(hasObjectContent(portonRules.surface_calc_params) ? portonRules.surface_calc_params : {}),
    ...(hasObjectContent(portonRules.surface_parameters) ? portonRules.surface_parameters : {}),
    ...(hasObjectContent(portonRules.parantes_config) ? portonRules.parantes_config : {}),
  };
  const stored = readStoredSurfaceParameters();
  for (const [key, value] of Object.entries(stored)) {
    if (!isEmptyParamValue(value) && isEmptyParamValue(params[key])) params[key] = value;
  }
  return params;
}

function parseNumber(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseOptionalNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getNumberParam(params, keys, fallback) {
  for (const key of keys) {
    const n = parseOptionalNumber(params?.[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function getOptionalNumberParam(params, keys) {
  for (const key of keys) {
    const raw = params?.[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const n = parseOptionalNumber(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

const LINE_ID_KEYS = [
  "product_id", "id", "presupuestador_id", "presupuestador_product_id", "productId", "productID",
  "catalog_product_id", "catalogProductId", "odoo_external_id", "odoo_id", "odoo_template_id", "odoo_variant_id",
];

function collectLineProductIds(line) {
  const ids = [];
  for (const key of LINE_ID_KEYS) {
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

function getLineIdSet(lines) {
  const ids = [];
  for (const line of Array.isArray(lines) ? lines : []) ids.push(...collectLineProductIds(line));
  return new Set([...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]);
}

function parseProductIdList(value) {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
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
  const ids = getLineIdSet(lines);
  const required = Array.isArray(rule?.product_ids) ? rule.product_ids : [];
  if (!required.length) return false;
  if (String(rule?.match_mode || "all").toLowerCase() === "any") return required.some((productId) => ids.has(Number(productId)));
  return required.every((productId) => ids.has(Number(productId)));
}

const REVESTIMIENTO_ESPECIAL_PRODUCT_ID = 4176;
function detectNoCladdingByProducts(lines, params) {
  const ids = getLineIdSet(lines);
  if (ids.has(REVESTIMIENTO_ESPECIAL_PRODUCT_ID)) return true;
  const noCladdingId = Number(params?.no_cladding_product_id || 0);
  return !!(noCladdingId && ids.has(noCladdingId));
}

function isAptoDerivedType(portonType) {
  return norm(portonType) === APTOS_PARA_REVESTIR_TYPE;
}

function inferKgM2FromType(portonType) {
  const t = norm(portonType);
  if (!t) return 0;
  if (t.includes("para_revestir")) return 0;
  if (t.includes("inyect") || t.includes("doble_iny") || t.endsWith("_iny") || t.includes("_iny_")) return 25;
  if (t.includes("clas") || t.includes("estandar")) return 15;
  return 0;
}

function resolveDefaultKgM2FromType(portonType, params) {
  const t = norm(portonType);
  if (t.includes("inyect") || t.includes("doble_iny") || t.endsWith("_iny") || t.includes("_iny_")) return getNumberParam(params, ["injected_kg_m2", "kg_m2_inyectado"], 25);
  return getNumberParam(params, ["classic_kg_m2", "kg_m2_clasico", "kg_m2_clasico_estandar"], 15);
}

function normalizeAptoKgRules(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => ({ product_id: Number(item?.product_id || 0), kg_m2: parseOptionalNumber(item?.kg_m2) }))
    .filter((item) => item.product_id > 0 && Number.isFinite(item.kg_m2) && item.kg_m2 > 0);
}

function resolveAptoKgM2ByProducts(lines, params) {
  const rules = normalizeAptoKgRules(params?.apto_revestir_kg_m2_rules);
  const ids = getLineIdSet(lines);
  for (const rule of rules) if (ids.has(rule.product_id)) return Number(rule.kg_m2 || 0);
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

function legsTypeForWeight(weightKg, isApto, params) {
  const limitAngostas = getNumberParam(params, [isApto ? "no_cladding_angostas_max_kg" : "legs_angostas_max_kg", isApto ? "limit_angostas_apto_kg" : "limit_angostas_kg", "piernas_angostas_hasta_kg"], isApto ? 80 : 140);
  const limitComunes = getNumberParam(params, ["legs_comunes_max_kg", "limit_comunes_kg", "piernas_comunes_hasta_kg"], 175);
  const limitAnchas = getNumberParam(params, ["legs_anchas_max_kg", "limit_anchas_kg", "piernas_anchas_hasta_kg"], 240);
  const limitSuper = getNumberParam(params, ["legs_superanchas_max_kg", "limit_superanchas_kg", "piernas_superanchas_hasta_kg"], 300);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return "";
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

function hasHojaRebajeLateral(lines, params) {
  const rules = [
    ...parseProductCombinationRules(params?.hoja_rebaje_lateral_product_ids),
    ...parseProductCombinationRules(params?.rebaje_lateral_product_ids),
    ...parseProductCombinationRules(params?.leaf_lateral_rebaje_product_ids),
    ...parseProductCombinationRules(params?.lateral_rebate_product_ids),
  ];
  return rules.some((rule) => productRuleMatches(rule, lines));
}

function buildTechnicalSnapshot({ payload }) {
  const source = payload || {};
  const nestedPayload = source.payload && typeof source.payload === "object" ? source.payload : {};
  const dimensions = nestedPayload.dimensions && typeof nestedPayload.dimensions === "object" ? nestedPayload.dimensions : {};
  const lines = Array.isArray(source.lines) ? source.lines : [];
  const widthM = parseNumber(dimensions?.width ?? dimensions?.ancho ?? source?.width ?? source?.ancho);
  const heightM = parseNumber(dimensions?.height ?? dimensions?.alto ?? source?.height ?? source?.alto);
  const widthMm = Math.round(widthM * 1000);
  const heightMm = Math.round(heightM * 1000);
  if (!(widthMm > 0) || !(heightMm > 0)) return null;

  const rules = readTechnicalRulesForKind("porton");
  const params = getRulesParams(rules);
  const portonType = nestedPayload?.porton_type || nestedPayload?.tipo_porton || nestedPayload?.tipo_sistema || nestedPayload?.system_type || "";
  const areaM2 = widthM * heightM;
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
  const estimatedWeightKg = areaM2 > 0 && effectiveKgM2 > 0 ? round2((discountedHeightMm / 1000) * (discountedWidthMm / 1000) * effectiveKgM2) : 0;

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

  return {
    width_m: round2(widthM),
    height_m: round2(heightM),
    area_m2: round2(areaM2),
    effective_kg_m2: round2(effectiveKgM2),
    estimated_weight_kg: round2(estimatedWeightKg),
    legs_label: legsLabel,
    paso_ancho_mm: Math.round(anchoPasoMm),
    paso_alto_mm: Math.round(altoPasoMm),
    paso_ancho_m: round2(anchoPasoMm / 1000),
    paso_alto_m: round2(altoPasoMm / 1000),
    hoja_ancho_mm: Math.round(anchoHojaMm),
    hoja_alto_mm: Math.round(altoHojaMm),
    hoja_ancho_m: round2(anchoHojaMm / 1000),
    hoja_alto_m: round2(altoHojaMm / 1000),
    has_rebaje_lateral: !!hasRebajeLateral,
  };
}

function formatMeters(valueM) {
  const n = Number(valueM || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

export function attachTechnicalSnapshot(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const kind = String(source.catalog_kind || source.payload?.catalog_kind || source.payload?.quote_subkind || "porton").trim().toLowerCase();
  if (kind !== "porton") return source;

  const next = {
    ...source,
    payload: {
      ...(source.payload || {}),
      dimensions: {
        ...((source.payload && typeof source.payload === "object" && source.payload.dimensions && typeof source.payload.dimensions === "object") ? source.payload.dimensions : {}),
      },
    },
  };

  const snapshot = buildTechnicalSnapshot({ payload: next });
  if (!snapshot || !(snapshot.paso_ancho_mm > 0) || !(snapshot.paso_alto_mm > 0)) return next;

  const medidasPasoText = `${formatMeters(snapshot.paso_ancho_m)} x ${formatMeters(snapshot.paso_alto_m)}`;
  const medidasHojaText = `${formatMeters(snapshot.hoja_ancho_m)} x ${formatMeters(snapshot.hoja_alto_m)}`;

  next.payload.dimensions = {
    ...next.payload.dimensions,
    paso_ancho_mm: snapshot.paso_ancho_mm,
    paso_alto_mm: snapshot.paso_alto_mm,
    paso_ancho_m: snapshot.paso_ancho_m,
    paso_alto_m: snapshot.paso_alto_m,
    medidas_paso_ancho_mm: snapshot.paso_ancho_mm,
    medidas_paso_alto_mm: snapshot.paso_alto_mm,
    medidas_paso_ancho_m: snapshot.paso_ancho_m,
    medidas_paso_alto_m: snapshot.paso_alto_m,
    medidas_paso_text: medidasPasoText,
    medidas_paso: {
      ancho_mm: snapshot.paso_ancho_mm,
      alto_mm: snapshot.paso_alto_mm,
      ancho_m: snapshot.paso_ancho_m,
      alto_m: snapshot.paso_alto_m,
      text: medidasPasoText,
    },
    hoja_ancho_mm: snapshot.hoja_ancho_mm,
    hoja_alto_mm: snapshot.hoja_alto_mm,
    hoja_ancho_m: snapshot.hoja_ancho_m,
    hoja_alto_m: snapshot.hoja_alto_m,
    medidas_hoja_text: medidasHojaText,
    calculated_effective_kg_m2: snapshot.effective_kg_m2,
    calculated_estimated_weight_kg: snapshot.estimated_weight_kg,
    calculated_legs_label: snapshot.legs_label,
  };
  next.payload.technical_snapshot = {
    ...(next.payload.technical_snapshot || {}),
    ...snapshot,
    medidas_paso_text: medidasPasoText,
    medidas_hoja_text: medidasHojaText,
    source: "frontend_saved_on_quote_payload",
  };
  return next;
}

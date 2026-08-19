import { dbQuery } from "./db.js";
import { getTechnicalMeasurementRules } from "./settingsDb.js";

const PORTON_TYPE_LABELS = {
  acero_simil_aluminio_clasico: "Portón Acero Simil Aluminio Clásico",
  coplanar_acero_simil_aluminio_clasico: "Coplanar Acero Simil Aluminio Clásico",
  acero_simil_aluminio_doble_iny: "Portón Acero Simil Aluminio Doble Iny.",
  coplanar_acero_simil_aluminio_doble_iny: "Coplanar Acero Simil Aluminio Doble Iny.",
  para_revestir_con_al_pvc_otros: "Para Revestir con AL-PVC-Otros",
  estandar_acero_simil_aluminio: "Estándar Acero Simil Aluminio",
  estandar_acero_simil_madera: "Estándar Acero Simil Madera",
  acero_simil_madera_clasico: "Portón Acero Simil Madera Clásico",
  coplanar_acero_simil_madera_clasico: "Coplanar Acero Simil Madera Clásico",
  acero_simil_madera_doble_iny: "Portón Acero Simil Madera Doble Iny.",
  coplanar_acero_simil_madera_doble_iny: "Coplanar Acero Simil Madera Doble Iny.",
  revestimiento_wpc: "Revestimiento WPC",
  corredizo_simil_madera: "Corredizo Simil Madera",
  corredizo_simil_aluminio_doble: "Corredizo Simil Aluminio Doble",
  corredizo_simil_madera_doble: "Corredizo Simil Madera Doble",
  corredizo_simil_aluminio: "Corredizo Simil Aluminio",
};
function getPortonTypeLabelFromQuote(quote) {
  const key = safeStr(quote?.payload?.porton_type || quote?.payload?.tipo_porton || "");
  return PORTON_TYPE_LABELS[key] || "";
}

function safeStr(v) { return String(v ?? "").trim(); }
function isUuid(v) { return /^[0-9a-fA-F-]{36}$/.test(String(v || "").trim()); }
function toNumberLike(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; }
function round4(n) { return Math.round(Number(n || 0) * 10000) / 10000; }
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
function minMm(values = []) { const list = (Array.isArray(values) ? values : []).map((v) => Number(String(v || "").replace(",", "."))).filter((n) => Number.isFinite(n) && n > 0); return list.length ? Math.min(...list) : 0; }
function extractBudgetDimensionMm(quote, key) { const dims = quote?.payload?.dimensions || {}; const raw = key === "ancho" ? dims?.width : dims?.height; const n = toNumberLike(raw); if (!Number.isFinite(n) || n <= 0) return null; return Math.round(n * 1000); }
function normalizeFormulaText(v) { return String(v || "").trim().toLowerCase().replace(/\s+/g, "_"); }
function getByPath(obj, path) { const parts = String(path || "").split(".").filter(Boolean); let cur = obj; for (const p of parts) { if (!cur || typeof cur !== "object") return undefined; cur = cur[p]; } return cur; }
function getBudgetProductIdSet(quote) { const lines = Array.isArray(quote?.lines) ? quote.lines : []; return new Set(lines.map((line) => Number(line?.product_id || 0)).filter(Boolean)); }
function detectInstallationModeByProducts(quote, surfaceParameters) {
  const ids = getBudgetProductIdSet(quote);
  const insideId = Number(surfaceParameters?.installation_inside_product_id || 0);
  const behindId = Number(surfaceParameters?.installation_behind_product_id || 0);
  if (insideId && ids.has(insideId)) return "dentro_vano";
  if (behindId && ids.has(behindId)) return "detras_vano";
  return "sin_instalacion";
}
// "Revestimiento especial x m2": el vendedor carga los kg/m2 a mano (ver SectionCatalog.jsx del
// front) en quote.payload.dimensions.kg_m2, y ese valor debe reemplazar el peso calculado.
const REVESTIMIENTO_ESPECIAL_PRODUCT_ID = 4176;
function detectNoCladding(quote, surfaceParameters) {
  const ids = getBudgetProductIdSet(quote);
  if (ids.has(REVESTIMIENTO_ESPECIAL_PRODUCT_ID)) return true;
  const noCladdingId = Number(surfaceParameters?.no_cladding_product_id || 0);
  return !!(noCladdingId && ids.has(noCladdingId));
}
function normalizeAptoKgM2Rules(surfaceParameters) {
  return (Array.isArray(surfaceParameters?.apto_revestir_kg_m2_rules) ? surfaceParameters.apto_revestir_kg_m2_rules : [])
    .map((rule) => ({ product_id: Number(rule?.product_id || 0), kg_m2: toNumberLike(rule?.kg_m2) }))
    .filter((rule) => rule.product_id > 0 && Number.isFinite(rule.kg_m2) && rule.kg_m2 > 0);
}
function resolveAptoKgM2ByProducts(quote, surfaceParameters) {
  const ids = getBudgetProductIdSet(quote);
  for (const rule of normalizeAptoKgM2Rules(surfaceParameters)) {
    if (ids.has(rule.product_id)) return Number(rule.kg_m2 || 0);
  }
  return 0;
}
function resolveSellerKgM2Entry(quote, surfaceParameters) {
  const payload = quote?.payload || {};
  const candidates = [];
  if (surfaceParameters?.seller_kg_m2_field_path) candidates.push(surfaceParameters.seller_kg_m2_field_path);
  candidates.push("kg_m2_entry", "kg_m2", "entry_kg_m2", "custom_kg_m2", "peso_m2", "payload.kg_m2_entry");
  for (const path of candidates) {
    const value = path.includes(".") ? getByPath(payload, path.replace(/^payload\./, "")) : payload?.[path];
    const n = toNumberLike(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
function detectDoorType(quote) {
  const payloadType = normalizeFormulaText(quote?.payload?.porton_type || quote?.payload?.tipo_porton || "");
  if (payloadType.includes("inyect") || payloadType.includes("doble_iny") || /(^|_)iny($|_)/.test(payloadType)) return "inyectado";
  if (payloadType.includes("clas")) return "clasico";
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const hay = lines.map((l) => normalizeFormulaText(l?.name || l?.raw_name || "")).join(" ");
  if (hay.includes("inyect") || hay.includes("doble_iny") || /(^|_)iny($|_)/.test(hay)) return "inyectado";
  return "clasico";
}
function getLegWidthMmByType(piernasTipo) {
  const key = String(piernasTipo || "").trim().toLowerCase();
  const map = { angostas: 230, comunes: 270, anchas: 370, superanchas: 370, especiales: 370 };
  return Number(map[key] || 0);
}
function getPasoWidthDeductionMm(piernasTipo, surfaceParameters) {
  const key = String(piernasTipo || "").trim().toLowerCase();
  const map = {
    angostas: Number(surfaceParameters?.legs_angostas_add_width_mm || 140),
    comunes: Number(surfaceParameters?.legs_comunes_add_width_mm || 200),
    anchas: Number(surfaceParameters?.legs_anchas_add_width_mm || 280),
    superanchas: Number(surfaceParameters?.legs_superanchas_add_width_mm || 380),
    especiales: Number(surfaceParameters?.legs_especiales_add_width_mm || surfaceParameters?.legs_superanchas_add_width_mm || 380),
  };
  return Number(map[key] || 0);
}
function computeSurfaceAutomaticContext({ quote, form, surfaceParameters }) {
  const budgetHeightMm = extractBudgetDimensionMm(quote, "alto") || 0;
  const budgetWidthMm = extractBudgetDimensionMm(quote, "ancho") || 0;
  const altos = Array.isArray(form?.esquema?.alto) ? form.esquema.alto : [];
  const anchos = Array.isArray(form?.esquema?.ancho) ? form.esquema.ancho : [];
  const altoMinMm = minMm(altos) || budgetHeightMm;
  const anchoMinMm = minMm(anchos) || budgetWidthMm;

  const installationMode = detectInstallationModeByProducts(quote, surfaceParameters);
  const noCladding = detectNoCladding(quote, surfaceParameters);
  const tipoPorton = detectDoorType(quote);
  const sellerKgM2Entry = resolveSellerKgM2Entry(quote, surfaceParameters);
  const aptoKgM2RuleValue = noCladding ? resolveAptoKgM2ByProducts(quote, surfaceParameters) : 0;
  const defaultKgM2Porton = tipoPorton === "inyectado" ? Number(surfaceParameters?.injected_kg_m2 || 25) : Number(surfaceParameters?.classic_kg_m2 || 15);
  const kgM2Porton = noCladding
    ? (aptoKgM2RuleValue > 0 ? aptoKgM2RuleValue : (sellerKgM2Entry > 0 ? sellerKgM2Entry : defaultKgM2Porton))
    : (installationMode === "sin_instalacion" ? (sellerKgM2Entry > 0 ? sellerKgM2Entry : defaultKgM2Porton) : defaultKgM2Porton);

  const heightDiscountMm = Number(surfaceParameters?.weight_height_discount_mm || 10);
  const widthDiscountMm = Number(surfaceParameters?.weight_width_discount_mm || 14);
  const baseHeightForWeightMm = installationMode === "sin_instalacion" ? budgetHeightMm : altoMinMm;
  const baseWidthForWeightMm = installationMode === "sin_instalacion" ? budgetWidthMm : anchoMinMm;
  const discountedHeightMm = Math.max(0, baseHeightForWeightMm - heightDiscountMm);
  const discountedWidthMm = Math.max(0, baseWidthForWeightMm - widthDiscountMm);
  const pesoEstimadoKg = round2((discountedHeightMm / 1000) * (discountedWidthMm / 1000) * kgM2Porton);

  const limitAngostas = noCladding ? Number(surfaceParameters?.no_cladding_angostas_max_kg || 80) : Number(surfaceParameters?.legs_angostas_max_kg || 140);
  const limitComunes = Number(surfaceParameters?.legs_comunes_max_kg || 175);
  const limitAnchas = Number(surfaceParameters?.legs_anchas_max_kg || 240);
  const limitSuperanchas = Number(surfaceParameters?.legs_superanchas_max_kg || 300);

  let piernasTipo = "angostas";
  if (pesoEstimadoKg > limitSuperanchas) piernasTipo = "especiales";
  else if (pesoEstimadoKg > limitAnchas) piernasTipo = "superanchas";
  else if (pesoEstimadoKg > limitComunes) piernasTipo = "anchas";
  else if (pesoEstimadoKg > limitAngostas) piernasTipo = "comunes";

  let altoCalculadoMm = discountedHeightMm;
  let anchoCalculadoMm = discountedWidthMm;
  if (installationMode === "detras_vano") {
    altoCalculadoMm = Math.max(0, altoMinMm + Number(surfaceParameters?.behind_vano_add_height_mm || 100));
    const addMap = {
      angostas: Number(surfaceParameters?.legs_angostas_add_width_mm || 140),
      comunes: Number(surfaceParameters?.legs_comunes_add_width_mm || 200),
      anchas: Number(surfaceParameters?.legs_anchas_add_width_mm || 280),
      superanchas: Number(surfaceParameters?.legs_superanchas_add_width_mm || 380),
      especiales: Number(surfaceParameters?.legs_especiales_add_width_mm || surfaceParameters?.legs_superanchas_add_width_mm || 380),
    };
    anchoCalculadoMm = Math.max(0, anchoMinMm + (addMap[piernasTipo] || 0));
  } else if (installationMode === "dentro_vano") {
    // Presupuestos nuevos (con dimensions.vano_size_auto_calc): el porton debe quedar igual al vano.
    // Presupuestos previos a este cambio: se mantiene el descuento historico para no alterar mediciones ya confirmadas.
    const usesNewVanoCalc = quote?.payload?.dimensions?.vano_size_auto_calc === true;
    const subtractHeightMm = usesNewVanoCalc ? 0 : Number(surfaceParameters?.inside_vano_subtract_height_mm || 10);
    const subtractWidthMm = usesNewVanoCalc ? 0 : Number(surfaceParameters?.inside_vano_subtract_width_mm || 20);
    altoCalculadoMm = Math.max(0, altoMinMm - subtractHeightMm);
    anchoCalculadoMm = Math.max(0, anchoMinMm - subtractWidthMm);
  }

  const legWidthMm = getLegWidthMmByType(piernasTipo);
  const pasoWidthDeductionMm = installationMode === "dentro_vano" ? getPasoWidthDeductionMm(piernasTipo, surfaceParameters) : legWidthMm * 2;
  const altoPasoMm = Math.max(0, Math.round(altoCalculadoMm - 200));
  const anchoPasoMm = Math.max(0, Math.round(anchoCalculadoMm - pasoWidthDeductionMm));

  return {
    peso_estimado_kg: pesoEstimadoKg,
    piernas_tipo: piernasTipo,
    alto_calculado_mm: Math.round(altoCalculadoMm),
    ancho_calculado_mm: Math.round(anchoCalculadoMm),
    alto_paso_mm: altoPasoMm,
    ancho_paso_mm: anchoPasoMm,
    ancho_pierna_mm: legWidthMm,
    kg_m2_apto_regla: round4(aptoKgM2RuleValue),
    kg_m2_porton: round4(kgM2Porton),
  };
}
function formatMm(value) { const n = Number(value || 0); return Number.isFinite(n) && n > 0 ? `${Math.round(n)} mm` : ""; }
function formatKg(value) { const n = Number(value || 0); return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)} kg` : ""; }
function formatPiernas(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = { angostas: "angostas", comunes: "comunes", anchas: "anchas", superanchas: "superanchas", especiales: "especiales" };
  return map[key] || "";
}
function normalizeSellerDimensionMm(value) {
  const n = toNumberLike(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n > 100 ? n : n * 1000);
}
// payload.final_calculated_dimensions normalmente esta vacio: la medicion es solo tomar la
// medida del vano para que la vendedora la aplique al presupuesto (pedido explicito
// 2026-08-19), nada se calcula/persiste solo. Este campo solo tiene datos si un superusuario
// corrio el resync manual puntual (resyncPortonMeasurements en measurementFinalization.js) -
// ahi si conviene mostrarlo en vez del presupuesto. Merge para no perder campos que ese resync
// no toca (parantes, colocacion, etc.).
function resolveProductionDimensions(quote) {
  const base = quote?.payload?.dimensions || {};
  const final = quote?.payload?.final_calculated_dimensions;
  if (final && typeof final === "object" && Object.keys(final).length) {
    return { ...base, ...final };
  }
  return base;
}
function buildSellerDimensionsLine(quote) {
  const dims = resolveProductionDimensions(quote);
  const widthMm = normalizeSellerDimensionMm(dims?.width);
  const heightMm = normalizeSellerDimensionMm(dims?.height);
  if (!widthMm && !heightMm) return "";
  return `Ancho: ${widthMm || "-"} mm - Alto: ${heightMm || "-"} mm`;
}
async function resolveQuoteSource(payload) {
  const maybeId = safeStr(payload?.quote_id || payload?.quoteId || payload?.id);
  if (maybeId && isUuid(maybeId)) {
    const r = await dbQuery(`select id, payload, lines, measurement_form, catalog_kind from public.presupuestador_quotes where id=$1 limit 1`, [maybeId]);
    const quote = r.rows?.[0];
    if (quote) return quote;
  }
  return {
    payload: payload?.payload || {},
    lines: Array.isArray(payload?.lines) ? payload.lines : [],
    measurement_form: payload?.measurement_form || {},
    catalog_kind: payload?.catalog_kind || payload?.payload?.catalog_kind || "porton",
  };
}
// Usar las medidas de paso guardadas por el frontend (que el usuario ve), con
// fallback al cálculo propio. Factoreado aparte de buildBudgetExtraSummaryLines
// para que getBudgetLuzDimensionsMm (marca Duret, mismo dato con otro nombre)
// no tenga que duplicar la logica de fallback.
function resolvePasoDimensionsMm(quote, calculated) {
  const dims = resolveProductionDimensions(quote);
  const storedAnchoMm = Number(dims?.paso_ancho_mm || dims?.medidas_paso_ancho_mm || 0);
  const storedAltoMm = Number(dims?.paso_alto_mm || dims?.medidas_paso_alto_mm || 0);
  const anchoMm = storedAnchoMm > 0 ? storedAnchoMm : (calculated?.ancho_paso_mm || calculated?.ancho_calculado_mm || 0);
  const altoMm = storedAltoMm > 0 ? storedAltoMm : (calculated?.alto_paso_mm || calculated?.alto_calculado_mm || 0);
  return { anchoMm: Math.round(Number(anchoMm) || 0), altoMm: Math.round(Number(altoMm) || 0) };
}
export async function buildBudgetExtraSummaryLines(payload) {
  const quote = await resolveQuoteSource(payload || {});
  if (String(quote?.catalog_kind || "porton").toLowerCase().trim() !== "porton") return [];

  const technicalSettings = await getTechnicalMeasurementRules();
  const surfaceParameters = technicalSettings?.surface_parameters || {};
  const calculated = computeSurfaceAutomaticContext({ quote, form: quote?.measurement_form || {}, surfaceParameters });

  const lines = [];
  const portonTypeLabel = getPortonTypeLabelFromQuote(quote);
  if (portonTypeLabel) lines.push(`Sistema: ${portonTypeLabel}`);
  const sellerDimensionsLine = buildSellerDimensionsLine(quote);
  const { anchoMm, altoMm } = resolvePasoDimensionsMm(quote, calculated);
  const ancho = formatMm(anchoMm);
  const alto = formatMm(altoMm);
  const peso = formatKg(calculated?.peso_estimado_kg);
  const piernas = formatPiernas(calculated?.piernas_tipo);

  if (sellerDimensionsLine) lines.push(sellerDimensionsLine);
  if (alto && ancho) lines.push(`Medidas de paso: ${ancho} x ${alto}`);
  else if (alto || ancho) lines.push(`Medidas de paso: ${ancho || "-"} x ${alto || "-"}`);
  if (peso) lines.push(`Peso calculado: ${peso}`);
  if (piernas) lines.push(`Piernas: ${piernas}`);

  return lines;
}

// Mismo dato que "Medidas de paso" de arriba, pero devuelto crudo (sin armar el
// texto) para que un branding distinto (ej. Duret) lo pueda mostrar con otro
// nombre ("Medidas de luz") sin duplicar el calculo de piernas/instalacion/etc.
export async function getBudgetLuzDimensionsMm(payload) {
  const quote = await resolveQuoteSource(payload || {});
  if (String(quote?.catalog_kind || "porton").toLowerCase().trim() !== "porton") return { anchoMm: 0, altoMm: 0 };
  const technicalSettings = await getTechnicalMeasurementRules();
  const surfaceParameters = technicalSettings?.surface_parameters || {};
  const calculated = computeSurfaceAutomaticContext({ quote, form: quote?.measurement_form || {}, surfaceParameters });
  return resolvePasoDimensionsMm(quote, calculated);
}

// Membrete tecnico de la primera hoja (resumen por sector): a diferencia de
// buildBudgetExtraSummaryLines, separa vano medido vs porton calculado (post
// ajuste por modo de instalacion), y devuelve dos columnas para que el PDF
// las dibuje una al lado de la otra (izquierda: sistema/dimensiones,
// derecha: paso/peso/piernas).
export async function buildBudgetVanoTechnicalLines(payload) {
  const quote = await resolveQuoteSource(payload || {});
  if (String(quote?.catalog_kind || "porton").toLowerCase().trim() !== "porton") return { left: [], right: [] };

  const technicalSettings = await getTechnicalMeasurementRules();
  const surfaceParameters = technicalSettings?.surface_parameters || {};
  const calculated = computeSurfaceAutomaticContext({ quote, form: quote?.measurement_form || {}, surfaceParameters });
  const dims = resolveProductionDimensions(quote);

  const left = [];
  const portonTypeLabel = getPortonTypeLabelFromQuote(quote);
  if (portonTypeLabel) left.push(`Sistema: ${portonTypeLabel}`);

  const vanoWidthMm = normalizeSellerDimensionMm(dims?.vano_width);
  const vanoHeightMm = normalizeSellerDimensionMm(dims?.vano_height);
  if (vanoWidthMm || vanoHeightMm) left.push(`Dimensiones del Vano: Ancho ${vanoWidthMm || "-"}mm - Alto ${vanoHeightMm || "-"}mm`);

  const portonWidthMm = normalizeSellerDimensionMm(dims?.width);
  const portonHeightMm = normalizeSellerDimensionMm(dims?.height);
  if (portonWidthMm || portonHeightMm) left.push(`Dimensiones del portón: Ancho ${portonWidthMm || "-"}mm - Alto ${portonHeightMm || "-"}mm`);

  const right = [];
  const storedAnchoMm = Number(dims?.paso_ancho_mm || dims?.medidas_paso_ancho_mm || 0);
  const storedAltoMm = Number(dims?.paso_alto_mm || dims?.medidas_paso_alto_mm || 0);
  const anchoPasoMm = Math.round(storedAnchoMm > 0 ? storedAnchoMm : (calculated?.ancho_paso_mm || calculated?.ancho_calculado_mm || 0));
  const altoPasoMm = Math.round(storedAltoMm > 0 ? storedAltoMm : (calculated?.alto_paso_mm || calculated?.alto_calculado_mm || 0));
  if (anchoPasoMm || altoPasoMm) right.push(`Medidas de paso: ${anchoPasoMm || "-"}mm x ${altoPasoMm || "-"}mm`);

  const peso = formatKg(calculated?.peso_estimado_kg);
  if (peso) right.push(`Peso Calculado: ${peso}`);

  const piernas = formatPiernas(calculated?.piernas_tipo);
  if (piernas) right.push(`Piernas: ${piernas}`);

  return { left, right };
}

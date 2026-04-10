import { dbQuery } from "./db.js";
import { getTechnicalMeasurementRules } from "./settingsDb.js";

function safeStr(v) {
  return String(v ?? "").trim();
}

function isUuid(v) {
  return /^[0-9a-fA-F-]{36}$/.test(String(v || "").trim());
}

function toNumberLike(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function round4(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function minMm(values = []) {
  const list = (Array.isArray(values) ? values : [])
    .map((v) => Number(String(v || "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return list.length ? Math.min(...list) : 0;
}

function extractBudgetDimensionMm(quote, key) {
  const dims = quote?.payload?.dimensions || {};
  const raw = key === "ancho" ? dims?.width : dims?.height;
  const n = toNumberLike(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizeFormulaText(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function getBudgetProductIdSet(quote) {
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  return new Set(lines.map((line) => Number(line?.product_id || 0)).filter(Boolean));
}

function detectInstallationModeByProducts(quote, surfaceParameters) {
  const ids = getBudgetProductIdSet(quote);
  const insideId = Number(surfaceParameters?.installation_inside_product_id || 0);
  const behindId = Number(surfaceParameters?.installation_behind_product_id || 0);
  if (insideId && ids.has(insideId)) return "dentro_vano";
  if (behindId && ids.has(behindId)) return "detras_vano";
  return "sin_instalacion";
}

function detectNoCladding(quote, surfaceParameters) {
  const ids = getBudgetProductIdSet(quote);
  const noCladdingId = Number(surfaceParameters?.no_cladding_product_id || 0);
  return !!(noCladdingId && ids.has(noCladdingId));
}

function resolveSellerKgM2Entry(quote, surfaceParameters) {
  const payload = quote?.payload || {};
  const candidates = [];
  if (surfaceParameters?.seller_kg_m2_field_path) {
    candidates.push(surfaceParameters.seller_kg_m2_field_path);
  }
  candidates.push(
    "kg_m2_entry",
    "kg_m2",
    "entry_kg_m2",
    "custom_kg_m2",
    "peso_m2",
    "payload.kg_m2_entry",
  );
  for (const path of candidates) {
    const value = path.includes(".")
      ? getByPath(payload, path.replace(/^payload\./, ""))
      : payload?.[path];
    const n = toNumberLike(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function detectDoorType(quote) {
  const payloadType = normalizeFormulaText(
    quote?.payload?.porton_type || quote?.payload?.tipo_porton || "",
  );
  if (payloadType.includes("inyect")) return "inyectado";
  if (payloadType.includes("clas")) return "clasico";
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const hay = lines
    .map((l) => normalizeFormulaText(l?.name || l?.raw_name || ""))
    .join(" ");
  if (hay.includes("inyect")) return "inyectado";
  return "clasico";
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

  const kgM2Porton =
    installationMode === "sin_instalacion"
      ? sellerKgM2Entry > 0
        ? sellerKgM2Entry
        : tipoPorton === "inyectado"
          ? Number(surfaceParameters?.injected_kg_m2 || 25)
          : Number(surfaceParameters?.classic_kg_m2 || 15)
      : tipoPorton === "inyectado"
        ? Number(surfaceParameters?.injected_kg_m2 || 25)
        : Number(surfaceParameters?.classic_kg_m2 || 15);

  const baseHeightForWeightMm =
    installationMode === "sin_instalacion" ? budgetHeightMm : altoMinMm;
  const baseWidthForWeightMm =
    installationMode === "sin_instalacion" ? budgetWidthMm : anchoMinMm;
  const discountedHeightM = Math.max(
    0,
    (baseHeightForWeightMm - Number(surfaceParameters?.weight_height_discount_mm || 10)) / 1000,
  );
  const discountedWidthM = Math.max(
    0,
    (baseWidthForWeightMm - Number(surfaceParameters?.weight_width_discount_mm || 14)) / 1000,
  );
  const pesoEstimadoKg = round2(discountedHeightM * discountedWidthM * kgM2Porton);

  const limitAngostas = noCladding
    ? Number(surfaceParameters?.no_cladding_angostas_max_kg || 80)
    : Number(surfaceParameters?.legs_angostas_max_kg || 140);
  const limitComunes = Number(surfaceParameters?.legs_comunes_max_kg || 175);
  const limitAnchas = Number(surfaceParameters?.legs_anchas_max_kg || 240);
  const limitSuperanchas = Number(surfaceParameters?.legs_superanchas_max_kg || 300);

  let piernasTipo = "angostas";
  if (pesoEstimadoKg > limitSuperanchas) piernasTipo = "especiales";
  else if (pesoEstimadoKg > limitAnchas) piernasTipo = "superanchas";
  else if (pesoEstimadoKg > limitComunes) piernasTipo = "anchas";
  else if (pesoEstimadoKg > limitAngostas) piernasTipo = "comunes";

  let altoCalculadoMm = budgetHeightMm;
  let anchoCalculadoMm = budgetWidthMm;
  if (installationMode === "detras_vano") {
    altoCalculadoMm = Math.max(
      0,
      altoMinMm + Number(surfaceParameters?.behind_vano_add_height_mm || 100),
    );
    const addMap = {
      angostas: Number(surfaceParameters?.legs_angostas_add_width_mm || 140),
      comunes: Number(surfaceParameters?.legs_comunes_add_width_mm || 200),
      anchas: Number(surfaceParameters?.legs_anchas_add_width_mm || 280),
      superanchas: Number(surfaceParameters?.legs_superanchas_add_width_mm || 380),
      especiales: Number(
        surfaceParameters?.legs_especiales_add_width_mm ||
          surfaceParameters?.legs_superanchas_add_width_mm ||
          380,
      ),
    };
    anchoCalculadoMm = Math.max(0, anchoMinMm + (addMap[piernasTipo] || 0));
  } else if (installationMode === "dentro_vano") {
    altoCalculadoMm = Math.max(
      0,
      altoMinMm - Number(surfaceParameters?.inside_vano_subtract_height_mm || 10),
    );
    anchoCalculadoMm = Math.max(
      0,
      anchoMinMm - Number(surfaceParameters?.inside_vano_subtract_width_mm || 20),
    );
  }

  return {
    peso_estimado_kg: pesoEstimadoKg,
    piernas_tipo: piernasTipo,
    alto_calculado_mm: Math.round(altoCalculadoMm),
    ancho_calculado_mm: Math.round(anchoCalculadoMm),
    kg_m2_porton: round4(kgM2Porton),
  };
}

function formatMm(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} mm` : "";
}

function formatKg(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)} kg` : "";
}

function formatPiernas(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    angostas: "angostas",
    comunes: "comunes",
    anchas: "anchas",
    superanchas: "superanchas",
    especiales: "especiales",
  };
  return map[key] || "";
}

async function resolveQuoteSource(payload) {
  const maybeId = safeStr(payload?.quote_id || payload?.quoteId || payload?.id);
  if (maybeId && isUuid(maybeId)) {
    const r = await dbQuery(
      `select id, payload, lines, measurement_form, catalog_kind
         from public.presupuestador_quotes
        where id=$1
        limit 1`,
      [maybeId],
    );
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

export async function buildBudgetExtraSummaryLines(payload) {
  const quote = await resolveQuoteSource(payload || {});
  if (String(quote?.catalog_kind || "porton").toLowerCase().trim() !== "porton") return [];

  const technicalSettings = await getTechnicalMeasurementRules();
  const surfaceParameters = technicalSettings?.surface_parameters || {};
  const calculated = computeSurfaceAutomaticContext({
    quote,
    form: quote?.measurement_form || {},
    surfaceParameters,
  });

  const lines = [];
  const largo = formatMm(calculated?.alto_calculado_mm);
  const ancho = formatMm(calculated?.ancho_calculado_mm);
  const peso = formatKg(calculated?.peso_estimado_kg);
  const piernas = formatPiernas(calculated?.piernas_tipo);

  if (ancho) lines.push(`Ancho calculado: ${ancho}`);
  if (largo) lines.push(`Largo calculado: ${largo}`);
  if (peso) lines.push(`Peso calculado: ${peso}`);
  if (piernas) lines.push(`Piernas: ${piernas}`);

  return lines;
}

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  getPublicMeasurementAcceptance,
  submitPublicMeasurementAcceptance,
} from "../../api/measurements.js";
import { getCatalogBootstrap } from "../../api/catalog.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

function text(v) {
  return String(v ?? "").trim();
}
function toNumberLike(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function normalizeTriple(values = []) {
  const arr = Array.isArray(values) ? values.slice(0, 3).map((v) => text(v)) : [];
  while (arr.length < 3) arr.push("");
  return arr;
}
const SCHEME_RECT_PCTS = {
  alto: [
    { left: 9.22, top: 43.73, width: 14.4, height: 14.24 },
    { left: 27.02, top: 43.73, width: 14.4, height: 14.24 },
    { left: 44.5, top: 43.73, width: 14.24, height: 14.24 },
  ],
  ancho: [
    { left: 71.36, top: 22.71, width: 14.4, height: 14.24 },
    { left: 71.36, top: 48.14, width: 14.4, height: 13.9 },
    { left: 71.36, top: 82.71, width: 14.4, height: 14.24 },
  ],
};
const schemeOverlayBaseStyle = {
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  color: "#111",
  textShadow: "0 1px 0 rgba(255,255,255,0.9)",
  background: "rgba(255,255,255,0.65)",
  borderRadius: 6,
  pointerEvents: "none",
  border: "1px solid rgba(15,23,42,0.12)",
};

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
function normalizeAptoKgM2Rules(surfaceParameters) {
  return (Array.isArray(surfaceParameters?.apto_revestir_kg_m2_rules)
    ? surfaceParameters.apto_revestir_kg_m2_rules
    : [])
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
    const cleanPath = String(path || "").replace(/^payload\./, "");
    const value = cleanPath.includes(".")
      ? cleanPath.split(".").filter(Boolean).reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), payload)
      : payload?.[cleanPath];
    const n = toNumberLike(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
function detectDoorType(quote) {
  const payloadType = String(quote?.payload?.porton_type || quote?.payload?.tipo_porton || "").trim().toLowerCase();
  if (payloadType.includes("inyect") || payloadType.includes("doble_iny") || payloadType.includes("iny")) return "inyectado";
  if (payloadType.includes("clas")) return "clasico";
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const hay = lines.map((l) => String(l?.name || l?.raw_name || "").toLowerCase()).join(" ");
  if (hay.includes("inyect") || hay.includes("doble_iny") || hay.includes("iny")) return "inyectado";
  return "clasico";
}
function getLegWidthMmByType(piernasTipo) {
  const map = { angostas: 230, comunes: 270, anchas: 370, superanchas: 370, especiales: 370 };
  return Number(map[String(piernasTipo || "").trim().toLowerCase()] || 0);
}
function minMm(values = []) {
  const nums = (Array.isArray(values) ? values : []).map((v) => toNumberLike(v)).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.min(...nums) : 0;
}
function mapPiernasLabelToKey(label) {
  const t = String(label || "").trim().toLowerCase();
  if (t.includes("super")) return "superanchas";
  if (t.includes("especial")) return "especiales";
  if (t.includes("ancha")) return "anchas";
  if (t.includes("comun")) return "comunes";
  if (t.includes("angosta")) return "angostas";
  return "";
}
// Corte: los presupuestos confirmados/creados a partir de esta fecha ya usan la formula
// oficial del backend (portonVanoMeasurements.js) en vez del calculo local obsoleto de mas
// abajo. Los anteriores mantienen el comportamiento historico salvo que se habiliten a mano
// desde Superusuario > Admin presupuestos ("Usar formula nueva"), para no arriesgar
// presupuestos ya confirmados sin que alguien lo decida puntualmente.
const NEW_TECHNICAL_FORMULA_CUTOFF_MS = new Date("2026-07-15T20:00:00-03:00").getTime();
function quoteUsesNewTechnicalFormula(quote) {
  if (quote?.payload?.use_new_technical_formula === true) return true;
  const createdMs = new Date(quote?.created_at || 0).getTime();
  return Number.isFinite(createdMs) && createdMs >= NEW_TECHNICAL_FORMULA_CUTOFF_MS;
}
// El calculo local de mas abajo usa una formula obsoleta (descuenta el ancho de pierna x2
// en vez del descuento oficial por tipo de pierna) y puede no coincidir con lo que el
// backend ya recalculo con la medicion final (portonVanoMeasurements.js). Para los
// presupuestos habilitados (ver quoteUsesNewTechnicalFormula), prioriza ese valor oficial
// ya guardado en payload.dimensions; para el resto no cambia nada.
function resolveTechnicalSummary({ quote, form, surfaceParameters = {} }) {
  const local = computeAutomaticSummary({ quote, form, surfaceParameters });
  if (!quoteUsesNewTechnicalFormula(quote)) return local;
  const dims = quote?.payload?.dimensions || {};
  const anchoCalculadoMm = Math.round((toNumberLike(dims?.width) || 0) * 1000);
  const altoCalculadoMm = Math.round((toNumberLike(dims?.height) || 0) * 1000);
  const anchoPasoMm = Number(dims?.paso_ancho_mm || dims?.medidas_paso_ancho_mm || 0);
  const altoPasoMm = Number(dims?.paso_alto_mm || dims?.medidas_paso_alto_mm || 0);
  const pesoEstimadoKg = Number(dims?.calculated_estimated_weight_kg || 0);
  const piernasTipo = mapPiernasLabelToKey(dims?.calculated_legs_label);
  return {
    ...local,
    ancho_calculado_mm: anchoCalculadoMm || local.ancho_calculado_mm,
    alto_calculado_mm: altoCalculadoMm || local.alto_calculado_mm,
    ancho_paso_mm: anchoPasoMm || local.ancho_paso_mm,
    alto_paso_mm: altoPasoMm || local.alto_paso_mm,
    peso_estimado_kg: pesoEstimadoKg || local.peso_estimado_kg,
    piernas_tipo: piernasTipo || local.piernas_tipo,
  };
}
function computeAutomaticSummary({ quote, form, surfaceParameters = {} }) {
  const budgetHeightMm = Math.round(toNumberLike(quote?.payload?.dimensions?.height) * 1000) || 0;
  const budgetWidthMm = Math.round(toNumberLike(quote?.payload?.dimensions?.width) * 1000) || 0;
  const altos = Array.isArray(form?.esquema?.alto) ? form.esquema.alto : [];
  const anchos = Array.isArray(form?.esquema?.ancho) ? form.esquema.ancho : [];
  const altoMinMm = minMm(altos) || budgetHeightMm;
  const anchoMinMm = minMm(anchos) || budgetWidthMm;
  const installationMode = detectInstallationModeByProducts(quote, surfaceParameters);
  const noCladding = detectNoCladding(quote, surfaceParameters);
  const tipoPorton = detectDoorType(quote);
  const sellerKgM2Entry = resolveSellerKgM2Entry(quote, surfaceParameters);
  const aptoKgM2RuleValue = noCladding ? resolveAptoKgM2ByProducts(quote, surfaceParameters) : 0;
  const defaultKgM2Porton = tipoPorton === "inyectado"
    ? Number(surfaceParameters?.injected_kg_m2 || 25)
    : Number(surfaceParameters?.classic_kg_m2 || 15);
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
    altoCalculadoMm = Math.max(0, altoMinMm - Number(surfaceParameters?.inside_vano_subtract_height_mm || 10));
    anchoCalculadoMm = Math.max(0, anchoMinMm - Number(surfaceParameters?.inside_vano_subtract_width_mm || 20));
  }

  const legWidthMm = getLegWidthMmByType(piernasTipo);
  return {
    alto_calculado_mm: Math.round(altoCalculadoMm || 0),
    ancho_calculado_mm: Math.round(anchoCalculadoMm || 0),
    alto_paso_mm: Math.max(0, Math.round(altoCalculadoMm - 200)),
    ancho_paso_mm: Math.max(0, Math.round(anchoCalculadoMm - legWidthMm * 2)),
    peso_estimado_kg: round2(pesoEstimadoKg || 0),
    piernas_tipo: piernasTipo,
    ancho_pierna_mm: legWidthMm,
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
  const map = { angostas: "angostas", comunes: "comunes", anchas: "anchas", superanchas: "superanchas", especiales: "especiales" };
  return map[key] || "";
}

function Card({ title, children }) {
  return (
    <div className="card" style={{ background: "#fff", marginBottom: 12, border: "1px solid #eee" }}>
      {title ? <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div> : null}
      {children}
    </div>
  );
}
function StaticField({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid #e3e3e3", background: "#fff", whiteSpace: "pre-wrap" }}>
        {value || <span className="muted">—</span>}
      </div>
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}

function normalizeTechnicalKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}
function isFilledTechnicalValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}
function formatTechnicalScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("es-AR") : "";
  return String(value || "").trim();
}
function formatTechnicalObject(value) {
  if (!value || typeof value !== "object") return "";
  for (const key of ["name", "label", "display_name", "displayName", "title", "value", "description", "alias"]) {
    const direct = value?.[key];
    if (isFilledTechnicalValue(direct)) return formatTechnicalScalar(direct);
  }
  return "";
}
function formatTechnicalValue(value) {
  if (Array.isArray(value)) return value.map(formatTechnicalValue).filter(Boolean).slice(0, 8).join(" · ");
  if (value && typeof value === "object") return formatTechnicalObject(value);
  return formatTechnicalScalar(value);
}
function findFirstTechnicalEntry(source, keyCandidates, maxDepth = 6) {
  const wanted = new Set((keyCandidates || []).map(normalizeTechnicalKey).filter(Boolean));
  const seen = new WeakSet();
  function walk(value, depth) {
    if (!value || typeof value !== "object" || depth > maxDepth) return null;
    if (seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const [key, raw] of Object.entries(value)) {
      if (wanted.has(normalizeTechnicalKey(key)) && isFilledTechnicalValue(raw)) return { key, value: raw };
    }
    for (const raw of Object.values(value)) {
      const found = walk(raw, depth + 1);
      if (found) return found;
    }
    return null;
  }
  return walk(source, 0);
}
function firstTechnicalEntry(sources, keyCandidates) {
  for (const source of sources || []) {
    const found = findFirstTechnicalEntry(source, keyCandidates);
    if (found) return found;
  }
  return null;
}
function pushTechnicalDetailRow(rows, label, value) {
  const formatted = formatTechnicalValue(value);
  if (!formatted) return;
  if (rows.some((row) => row.label === label)) return;
  rows.push({ label, value: formatted });
}
function pushTechnicalDetailEntry(rows, label, entry) {
  if (!entry) return;
  pushTechnicalDetailRow(rows, label, entry.value);
}
function buildBudgetTechnicalDetailRows(quote, form, technicalSummary = {}, stored = {}) {
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  const dimensions = payload?.dimensions && typeof payload.dimensions === "object" ? payload.dimensions : {};
  const measurementForm = form && typeof form === "object" ? form : {};
  const sources = [
    quote,
    payload,
    dimensions,
    payload?.technical_summary,
    payload?.technical,
    payload?.datos_tecnicos,
    payload?.production_planning,
    payload?.surface_context,
    payload?.automatic_context,
    measurementForm,
    measurementForm?.computed,
    measurementForm?.surface_context,
    measurementForm?.automatic_context,
  ].filter(Boolean);
  const rows = [];
  // Medidas del PORTON calculado (vano + ajuste "detras del vano" si corresponde) - no confundir
  // con el vano en si, que se muestra aparte en la tarjeta "Esquema de medidas".
  pushTechnicalDetailRow(
    rows,
    "Medidas del Portón (calculadas)",
    stored?.portonMm
      ? `${formatMm(stored.portonMm.anchoMm)} x ${formatMm(stored.portonMm.altoMm)}`
      : technicalSummary.ancho_calculado_mm && technicalSummary.alto_calculado_mm
        ? `${formatMm(technicalSummary.ancho_calculado_mm)} x ${formatMm(technicalSummary.alto_calculado_mm)}`
        : "",
  );
  pushTechnicalDetailEntry(rows, "Tipología / sistema", firstTechnicalEntry(sources, ["tipologia_sistema", "tipologia", "tipología", "sistema", "system", "system_type", "tipo_sistema", "porton_type", "tipo_porton", "levadizo"]));
  pushTechnicalDetailEntry(rows, "Color", firstTechnicalEntry(sources, ["color", "color_porton", "color_portón", "color_chapa", "color_revestimiento", "color_pintura", "pintura_color", "ral", "color_ral"]));
  pushTechnicalDetailEntry(rows, "Tipo de revestimiento", firstTechnicalEntry(sources, ["tipo_revestimiento", "revestimiento", "revestimiento_tipo", "material_revestimiento", "cladding", "cladding_type", "apto_revestimiento", "apto_para_revestir"]));
  pushTechnicalDetailEntry(rows, "Terminación", firstTechnicalEntry(sources, ["terminacion", "terminación", "terminacion_porton", "terminación_portón", "acabado", "finish", "acabado_porton"]));
  pushTechnicalDetailEntry(rows, "Tipo de colocación", firstTechnicalEntry(sources, ["tipo_colocacion", "tipo_colocación", "colocacion", "colocación", "tipo_instalacion", "tipo_instalación", "installation_mode", "modo_instalacion", "modo_instalación"]));
  pushTechnicalDetailEntry(rows, "Lado del motor", firstTechnicalEntry(sources, ["lado_motor", "motor_lado", "lado_del_motor"]));
  pushTechnicalDetailEntry(rows, "Lado del soporte", firstTechnicalEntry(sources, ["lado_soporte", "soporte_lado", "lado_del_soporte"]));
  pushTechnicalDetailEntry(rows, "Kg/m² efectivo", firstTechnicalEntry(sources, ["kg_m2", "kg_m2_entry", "peso_m2", "custom_kg_m2"]));
  pushTechnicalDetailRow(
    rows,
    "Medidas de Paso (calculadas)",
    stored?.pasoText || (technicalSummary.alto_paso_mm && technicalSummary.ancho_paso_mm ? `${formatMm(technicalSummary.ancho_paso_mm)} x ${formatMm(technicalSummary.alto_paso_mm)}` : ""),
  );
  pushTechnicalDetailRow(rows, "Medidas de Hoja (calculada)", stored?.hojaText || "");
  pushTechnicalDetailRow(rows, "Peso aproximado", formatKg(technicalSummary.peso_estimado_kg));
  pushTechnicalDetailRow(rows, "Tipo de piernas", formatPiernas(technicalSummary.piernas_tipo));
  pushTechnicalDetailRow(rows, "Ancho de pierna", formatMm(technicalSummary.ancho_pierna_mm));
  // El esquema de parantes lo define siempre el presupuesto (dimensions); solo si no
  // tiene nada cargado se busca en el resto de las fuentes (medicion, etc).
  pushTechnicalDetailEntry(rows, "Orientación de parantes", dimensions?.orientacion_parantes ? { value: dimensions.orientacion_parantes } : firstTechnicalEntry(sources, ["orientacion_parantes", "orientación_parantes", "parantes_orientacion", "parantes_orientación"]));
  pushTechnicalDetailEntry(rows, "Cantidad de parantes", dimensions?.cantidad_parantes ? { value: dimensions.cantidad_parantes } : firstTechnicalEntry(sources, ["cantidad_parantes", "parantes_cantidad", "cant_parantes", "parantes_cant"]));
  pushTechnicalDetailEntry(rows, "Distribución de parantes", dimensions?.distribucion_parantes ? { value: dimensions.distribucion_parantes } : firstTechnicalEntry(sources, ["distribucion_parantes", "distribución_parantes", "parantes_distribucion", "parantes_distribución"]));
  return rows;
}
function DetailGrid({ rows }) {
  if (!Array.isArray(rows) || !rows.length) return <div className="muted">Sin datos técnicos adicionales.</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
      {rows.map((item) => (
        <div key={item.label} style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: "8px 10px", background: "#fff" }}>
          <div className="muted" style={{ fontSize: 12 }}>{item.label}</div>
          <div style={{ fontWeight: 800, marginTop: 4 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
function isCommercialBudgetLine(line = {}) {
  const haystack = `${line?.raw_name || ""} ${line?.name || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ["recargo", "financiacion", "financiación", "forma de pago", "iva", "coeficiente", "descuento", "$", "monto"].some((word) => haystack.includes(word));
}
function budgetLineDisplayName(line = {}, catalogProduct = null) {
  return text(
    line?.raw_name ||
      line?.name ||
      line?.display_name ||
      line?.alias ||
      catalogProduct?.alias ||
      catalogProduct?.display_name ||
      catalogProduct?.name ||
      `Producto ${line?.product_id || ""}`,
  );
}
function buildCatalogSectionHelpers(catalog = {}) {
  const sections = Array.isArray(catalog?.sections) ? catalog.sections : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const sectionNameById = new Map();
  const productById = new Map();
  for (const section of sections) {
    const id = Number(section?.id || 0);
    const name = text(section?.name || section?.display_name || section?.label);
    if (id && name) sectionNameById.set(id, name);
  }
  for (const product of products) {
    const id = Number(product?.id || product?.product_id || 0);
    if (id) productById.set(id, product);
  }
  return { sectionNameById, productById };
}
function lineExplicitSectionNames(line = {}) {
  const direct = [
    line?.section_name,
    line?.sectionName,
    line?.budget_section_name,
    line?.budgetSectionName,
    line?.category_name,
    line?.category,
  ]
    .map(text)
    .filter(Boolean);
  return Array.from(new Set(direct));
}
function sectionNamesForBudgetLine(line = {}, catalogProduct = null, sectionNameById = new Map()) {
  const names = lineExplicitSectionNames(line);
  const sectionIds = [
    ...(Array.isArray(line?.section_ids) ? line.section_ids : []),
    ...(Array.isArray(catalogProduct?.section_ids) ? catalogProduct.section_ids : []),
  ];
  for (const rawId of sectionIds) {
    const sectionName = sectionNameById.get(Number(rawId || 0));
    if (sectionName) names.push(sectionName);
  }
  const unique = Array.from(new Set(names.map(text).filter(Boolean)));
  return unique.length ? unique : ["Detalle del presupuesto"];
}
function buildBudgetDetailLines(lines = [], catalog = {}) {
  const { sectionNameById, productById } = buildCatalogSectionHelpers(catalog);
  const grouped = new Map();
  const sourceLines = Array.isArray(lines) ? lines : [];
  for (let idx = 0; idx < sourceLines.length; idx += 1) {
    const line = sourceLines[idx];
    if (Number(line?.qty || 0) <= 0) continue;
    if (isCommercialBudgetLine(line)) continue;
    const catalogProduct = productById.get(Number(line?.product_id || 0)) || null;
    const name = budgetLineDisplayName(line, catalogProduct);
    if (!name) continue;
    const qty = Number(line?.qty || 1) || 1;
    const code = text(line?.code || catalogProduct?.code);
    for (const sectionName of sectionNamesForBudgetLine(line, catalogProduct, sectionNameById)) {
      const key = `${sectionName}::${name}::${code}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.qty += qty;
        continue;
      }
      grouped.set(key, {
        key: `${line?.product_id || "line"}-${idx}-${sectionName}`,
        sectionName,
        name,
        qty,
        code,
      });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => {
    const sectionCmp = String(a.sectionName || "").localeCompare(String(b.sectionName || ""), "es");
    if (sectionCmp) return sectionCmp;
    return String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
}
function MeasurementSchemeVisual({ form }) {
  const altos = normalizeTriple(form?.esquema?.alto || []);
  const anchos = normalizeTriple(form?.esquema?.ancho || []);
  return (
    <div style={{ border: "1px dashed #cbd5e1", borderRadius: 14, background: "#ffffff", padding: 16 }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 780, margin: "0 auto" }}>
        <img src="/measurement_scheme.png" alt="Esquema de medición" style={{ width: "100%", height: "auto", display: "block" }} />
        {SCHEME_RECT_PCTS.alto.map((rect, idx) => (
          <div key={`overlay-alto-${idx}`} style={{ ...schemeOverlayBaseStyle, left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}>
            {altos[idx] || "—"}
          </div>
        ))}
        {SCHEME_RECT_PCTS.ancho.map((rect, idx) => (
          <div key={`overlay-ancho-${idx}`} style={{ ...schemeOverlayBaseStyle, left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}>
            {anchos[idx] || "—"}
          </div>
        ))}
      </div>
    </div>
  );
}

const TERMINOS = [
  {
    title: "1. Formas de Pago:",
    text: "Aceptamos pagos en efectivo (pesos o dólares billete), transferencia bancaria, cheques o tarjeta de crédito (consultar por planes vigentes). Para confirmar el pedido se requiere una seña del 70% del valor total. El saldo restante deberá abonarse en su totalidad antes de la fecha del despacho del mismo. Los productos con saldos pendientes o deuda no serán liberados para su retiro.",
  },
  {
    title: "2. Plazos de Entrega:",
    text: "La fecha estimada de entrega será la estipulada una vez que el cliente confirme las medidas, especificaciones y demás características del pedido. El plazo de entrega comenzará a computarse a partir de la confirmación técnica del pedido y de la recepción del pago de la seña correspondiente.",
  },
  {
    title: "",
    text: "Los plazos indicados son estimativos y podrán variar por causas ajenas al proveedor, tales como demoras en el suministro de materiales, inconvenientes logísticos, fuerza mayor u otras circunstancias imprevistas, las cuales serán comunicadas oportunamente al cliente.",
  },
  {
    title: "3. Garantía:",
    text: "Nuestros productos cuentan con una garantía de 60 meses contra defectos de fabricación. Esta garantía no cubre daños causados por uso inadecuado o negligencia del cliente.",
  },
  {
    title: "4. Responsabilidad del Cliente:",
    text: "El cliente es responsable de proporcionar información completa y precisa al momento de realizar el pedido. Cualquier error u omisión en los datos brindados será responsabilidad exclusiva del cliente, pudiendo afectar la correcta producción y entrega del portón. Asimismo, el cliente deberá garantizar que el lugar de instalación se encuentre limpio, ordenado y con libre acceso. No deben existir escombros, montículos de arena u otros obstáculos que dificulten el ingreso del personal o la manipulación del producto. En caso de ser necesario se deberá contar con personas disponibles al momento de la entrega para colaborar con la descarga del portón, desde el área de logística se dispondrá esta información.",
  },
  {
    title: "5. Derechos de Propiedad:",
    text: "Todos los derechos de propiedad intelectual y derechos de autor de los productos y diseños son propiedad de DE GRANDIS PORTONES. Está prohibida la reproducción o distribución no autorizada.",
  },
  {
    title: "6. Ajustes y Variaciones:",
    text: "En caso de existir diferencias entre el presupuesto confirmado y las características finales del pedido (como medidas, diseño, materiales, entre otros), que generen costos adicionales, nos reservamos el derecho de facturar dichos montos sin previo aviso. El cliente deberá abonar estos importes adicionales antes de que se inicie la producción del portón.",
  },
];

function TermsModal({ onClose, onAccept }) {
  const isAcceptMode = typeof onAccept === "function";
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      onClick={isAcceptMode ? undefined : onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          padding: "28px 28px 20px", width: "100%", maxWidth: 640,
          maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 18, color: "#111" }}>
          Términos y Condiciones de Venta
        </div>
        <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
          {TERMINOS.map((p, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              {p.title ? (
                <span style={{ fontWeight: 700 }}>{p.title} </span>
              ) : null}
              <span style={{ fontSize: 13.5, color: "#333", lineHeight: 1.6 }}>{p.text}</span>
            </div>
          ))}
        </div>

        {isAcceptMode ? (
          <>
            <label
              style={{
                display: "flex", alignItems: "center", gap: 10,
                marginTop: 20, cursor: "pointer", userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
              />
              <span style={{ fontSize: 14, color: "#111", fontWeight: 600 }}>
                Acepto los términos y condiciones
              </span>
            </label>
            <button
              disabled={!accepted}
              onClick={() => { if (accepted) onAccept(); }}
              style={{
                marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 8,
                border: "none",
                background: accepted ? "#111" : "#d1d5db",
                cursor: accepted ? "pointer" : "not-allowed",
                fontSize: 14, fontWeight: 700,
                color: accepted ? "#fff" : "#9ca3af",
                flexShrink: 0, transition: "background 0.15s",
              }}
            >
              Aceptar y continuar
            </button>
          </>
        ) : (
          <button
            onClick={onClose}
            style={{
              marginTop: 20, width: "100%", padding: "10px 0", borderRadius: 8,
              border: "1px solid #e0e0e0", background: "#f5f5f5", cursor: "pointer",
              fontSize: 14, fontWeight: 600, color: "#555", flexShrink: 0,
            }}
          >
            Cerrar
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClientAcceptancePage() {
  const { token } = useParams();
  const [step, setStep] = useState("initial");
  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const acceptanceQ = useQuery({
    queryKey: ["client-acceptance", token],
    queryFn: () => getPublicMeasurementAcceptance(token),
    enabled: !!token,
  });

  const acceptM = useMutation({
    mutationFn: () => submitPublicMeasurementAcceptance(token, { fullName, dni }),
    onSuccess: () => {
      setStep("done");
      acceptanceQ.refetch();
    },
  });

  const quote = acceptanceQ.data?.quote || null;
  const accepted = acceptanceQ.data?.acceptance || null;
  const form = quote?.measurement_form || {};
  const catalogKind = String(quote?.payload?.quote_subkind || quote?.catalog_kind || "porton").toLowerCase();
  const catalogQ = useQuery({
    queryKey: ["catalogBootstrapForClientAcceptance", catalogKind],
    queryFn: () => getCatalogBootstrap(catalogKind),
    enabled: !!quote,
    staleTime: 60 * 1000,
  });
  const technicalSummary = useMemo(() => resolveTechnicalSummary({
    quote,
    form,
    surfaceParameters: quote?.technical_rules?.surface_parameters || {},
  }), [quote, form]);
  // Medidas de paso ya calculadas por el backend con la medida final (ver measurementFinalization.js /
  // portonVanoMeasurements.js). Se prefieren sobre technicalSummary (aproximacion local, puede no
  // coincidir con la formula oficial para presupuestos viejos sin esta medida recalculada todavia).
  const storedMedidasPasoText = useMemo(() => {
    const dims = quote?.payload?.dimensions || {};
    if (dims?.medidas_paso_text) return String(dims.medidas_paso_text).trim();
    const anchoM = toNumberLike(dims?.paso_ancho_m ?? dims?.medidas_paso_ancho_m);
    const altoM = toNumberLike(dims?.paso_alto_m ?? dims?.medidas_paso_alto_m);
    if (anchoM > 0 && altoM > 0) return `${anchoM.toFixed(2)} m x ${altoM.toFixed(2)} m`;
    return "";
  }, [quote]);
  // Medidas del porton CALCULADO (vano + ajuste "detras del vano" si corresponde), distinto
  // del vano en si (dato duro medido). Mismo criterio que storedMedidasPasoText: preferir lo
  // que ya calculo el backend con la formula oficial antes que la aproximacion local.
  const storedMedidasPortonMm = useMemo(() => {
    const dims = quote?.payload?.dimensions || {};
    const anchoM = toNumberLike(dims?.width);
    const altoM = toNumberLike(dims?.height);
    if (anchoM > 0 && altoM > 0) return { anchoMm: Math.round(anchoM * 1000), altoMm: Math.round(altoM * 1000) };
    return null;
  }, [quote]);
  const storedMedidasHojaText = useMemo(() => {
    const dims = quote?.payload?.dimensions || {};
    if (dims?.medidas_hoja_text) return String(dims.medidas_hoja_text).trim();
    const anchoM = toNumberLike(dims?.hoja_ancho_m);
    const altoM = toNumberLike(dims?.hoja_alto_m);
    if (anchoM > 0 && altoM > 0) return `${anchoM.toFixed(2)} m x ${altoM.toFixed(2)} m`;
    return "";
  }, [quote]);
  const budgetTechnicalRows = useMemo(
    () => buildBudgetTechnicalDetailRows(quote, form, technicalSummary, {
      portonMm: storedMedidasPortonMm,
      pasoText: storedMedidasPasoText,
      hojaText: storedMedidasHojaText,
    }),
    [quote, form, technicalSummary, storedMedidasPortonMm, storedMedidasPasoText, storedMedidasHojaText],
  );
  const budgetDetailLines = useMemo(
    () => buildBudgetDetailLines(quote?.lines || [], catalogQ.data || {}),
    [quote?.lines, catalogQ.data],
  );

  if (acceptanceQ.isLoading) {
    return <div className="container"><div className="card"><div className="muted">Cargando datos técnicos del portón...</div></div></div>;
  }
  if (acceptanceQ.isError) {
    return <div className="container"><div className="card"><div style={{ color: "#d93025", fontSize: 13 }}>{acceptanceQ.error?.message || "No se pudo cargar la aceptación del cliente"}</div></div></div>;
  }
  if (!quote) {
    return <div className="container"><div className="card"><div className="muted">No se encontraron datos para esta aceptación.</div></div></div>;
  }

  const canAccept = !accepted?.accepted_at;
  const submitError = acceptM.error?.message || "";

  return (
    <div className="container" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 12px" }}>
      <Card>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Aceptación del cliente</h2>
        <div className="muted">
          Revisá los datos técnicos del portón y confirmá la aceptación al final de la página.
        </div>
      </Card>

      <Card title="Datos del portón">
        <Row>
          <StaticField label="Referencia" value={quote?.final_sale_order_name || quote?.odoo_sale_order_name || quote?.quote_number} />
          <StaticField label="Cliente" value={quote?.end_customer?.name} />
          <StaticField label="Teléfono" value={quote?.end_customer?.phone} />
        </Row>
        <div className="spacer" />
        <Row>
          <StaticField label="Dirección" value={quote?.end_customer?.address} />
          <StaticField label="Localidad" value={quote?.end_customer?.city} />
          <StaticField label="Google Maps" value={quote?.end_customer?.maps_url} />
        </Row>
      </Card>

      <Card title="Esquema de medidas">
        <MeasurementSchemeVisual form={form} />
        <div className="spacer" />
        <Row>
          <StaticField label="Ancho de Vano" value={formatMm(form?.ancho_final_mm || technicalSummary.ancho_calculado_mm)} />
          <StaticField label="Alto de Vano" value={formatMm(form?.alto_final_mm || technicalSummary.alto_calculado_mm)} />
          <StaticField label="Cantidad de parantes" value={text(form?.cantidad_parantes)} />
        </Row>
      </Card>

      <Card title="Resumen técnico del presupuesto">
        <DetailGrid rows={budgetTechnicalRows} />
      </Card>

      <Card title="Detalle del presupuesto">
        <div className="muted" style={{ marginBottom: 10 }}>
          Detalle informativo sin montos, precios, forma de pago ni condiciones comerciales.
        </div>
        {!budgetDetailLines.length ? <div className="muted">Sin productos informados.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {budgetDetailLines.map((line) => (
              <div key={line.key} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  {line.sectionName || "Detalle del presupuesto"}
                </div>
                <b>{line.name}</b>
                <div className="muted">
                  Cantidad: {line.qty}{line.code ? ` · Código: ${line.code}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Observaciones">
        <div>{text(form?.observaciones_medicion) || <span className="muted">Sin observaciones.</span>}</div>
      </Card>

      <Card title="Aceptación del cliente">
        {accepted?.accepted_at ? (
          <>
            <div style={{ color: "#065f46", fontWeight: 800, marginBottom: 12 }}>
              La aceptación ya fue registrada correctamente.
            </div>
            <Row>
              <StaticField label="Nombre completo" value={accepted?.full_name} />
              <StaticField label="DNI" value={accepted?.dni} />
              <StaticField label="Fecha de aceptación" value={accepted?.accepted_at ? new Date(accepted.accepted_at).toLocaleString("es-AR") : ""} />
            </Row>
          </>
        ) : (
          <>
            {step === "initial" ? (
              <Button onClick={() => setShowTerms(true)}>Acepto los datos técnicos del portón</Button>
            ) : null}

            {step === "name" ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>Nombre completo</div>
                  <Input value={fullName} onChange={setFullName} style={{ width: "100%" }} />
                </div>
                <Button
                  onClick={() => {
                    if (!text(fullName)) {
                      window.alert("Ingresá tu nombre completo.");
                      return;
                    }
                    setStep("dni");
                  }}
                >
                  Continuar
                </Button>
              </div>
            ) : null}

            {step === "dni" ? (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>DNI</div>
                    <Input value={dni} onChange={setDni} style={{ width: "100%" }} />
                  </div>
                  <Button
                    disabled={acceptM.isPending}
                    onClick={() => {
                      const cleanDni = String(dni || "").replace(/\D/g, "");
                      if (!cleanDni || cleanDni.length < 7) {
                        window.alert("Ingresá un DNI válido.");
                        return;
                      }
                      acceptM.mutate();
                    }}
                  >
                    {acceptM.isPending ? "Registrando..." : "Confirmar aceptación"}
                  </Button>
                </div>
                {submitError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 12 }}>{submitError}</div> : null}
              </>
            ) : null}

            {step === "done" && accepted?.accepted_at ? (
              <div style={{ color: "#065f46", fontWeight: 800 }}>La aceptación fue registrada correctamente.</div>
            ) : null}
          </>
        )}
      </Card>

      <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
        <button
          onClick={() => setShowTerms(true)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#6b7280", fontSize: 13, textDecoration: "underline",
          }}
        >
          Ver términos y condiciones
        </button>
      </div>

      {showTerms && (
        <TermsModal
          onClose={() => setShowTerms(false)}
          onAccept={step === "initial" ? () => { setShowTerms(false); setStep("name"); } : undefined}
        />
      )}
    </div>
  );
}

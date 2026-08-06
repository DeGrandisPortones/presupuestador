import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";

import { getEffectivePricelists, getPrices, getFinancingPreview, ensurePricesReadyForPricelist } from "../../api/odoo";
import {
  createQuote,
  getProductionPlanningEstimate,
  getQuote,
  confirmQuote,
  submitFinalQuote,
  updateQuote,
  listQuotes,
} from "../../api/quotes";
import { confirmReturnedMeasurementQuote, resetReturnedMeasurementQuote } from "../../api/measurements";
import { downloadPresupuestoPdf, downloadProformaPdf } from "../../api/pdf";
import toast from "react-hot-toast";

import { useQuoteStore } from "../../domain/quote/store";
import { IVA_RATE_DEFAULT } from "../../domain/quote/defaults";
import { calcTotals, resolveQuoteAdjustmentPercent, resolveQuoteIvaRate } from "../../domain/quote/pricing";
import { validateArgentinaPhone, validateEmailAddress, validateGoogleMapsUrl } from "../../utils/contactValidation.js";
import { hasPlegadoAttachment } from "../../utils/plegadoAttachment.js";
import {
  buildQuoteAutosaveKey,
  canRemoteAutosaveQuote,
  clearAutosaveDraft,
  clearAllAutosaveDrafts,
  formatAutosaveTime,
  hasAutosaveCustomerMinimum,
  readAutosaveDraft,
  serializeAutosavePayload,
  writeAutosaveDraft,
} from "../../domain/quote/autosave.js";

import Button from "../../ui/Button.jsx";

import HeaderBar from "./components/HeaderBar";
import PortonDimensions from "./components/PortonDimensions";
import SectionCatalog from "./components/SectionCatalog";
import LinesTable from "./components/LinesTable";
import SummaryBox from "./components/SummaryBox";

const WIDTH_MIN_M = 2.3;
const WIDTH_MAX_M = 7;
const HEIGHT_MIN_M = 2;
const HEIGHT_MAX_M = 3;
const PORTON_MAX_WEIGHT_KG = 350;
const IPANEL_WIDTH_MAX_M = 1.16;
const IPANEL_HEIGHT_MAX_M = 2.45;
// Panel en lamas/varillado: no tiene un maximo cuadrado fijo. Alcanza con que uno de
// los dos lados quede por debajo de este valor; el otro lado puede tomar la medida
// que se necesite.
const IPANEL_EXTENDED_MAX_M = 4;
const IPANEL_LAMAS_PRODUCT_ID = 4061;
const IPANEL_LAMAS_ODOO_ID = 3590;
const IPANEL_NON_LAMAS_PLEGADO_PRODUCT_IDS = [4036, 3565];
const PREVIOUSLY_BILLED_PRODUCT_ID = -900001;
function normalizeCatalogKind(kind) { return String(kind || "porton").toLowerCase().trim(); }

function catalogKindDisplayName(kind) {
  const normalized = normalizeCatalogKind(kind);
  if (normalized === "ipanel") return "Ipanel";
  if (normalized === "plegados") return "Plegados";
  if (normalized === "otros") return "Otros";
  if (normalized === "puerta") return "Puerta";
  return "Portón";
}
function catalogKindLinkedObjectLabel(kind) {
  const normalized = normalizeCatalogKind(kind);
  if (normalized === "ipanel") return "el Ipanel";
  if (normalized === "plegados") return "Plegados";
  if (normalized === "otros") return "Otros";
  if (normalized === "puerta") return "la puerta";
  return "el portón";
}
function catalogKindShortReferencePrefix(kind) {
  const normalized = normalizeCatalogKind(kind);
  if (normalized === "ipanel") return "I";
  if (normalized === "plegados") return "PL";
  if (normalized === "otros") return "O";
  if (normalized === "puerta") return "P";
  return "";
}
function catalogKindOdooReferenceLabel(kind) {
  const normalized = normalizeCatalogKind(kind);
  if (normalized === "ipanel") return "INP/INV";
  if (normalized === "plegados") return "PLNP/PLNV";
  if (normalized === "otros") return "ONP/ONV";
  if (normalized === "puerta") return "PNP/PNV";
  return "NP/NV";
}
function readBudgetObservationFromPayload(payloadLike) {
  const p = payloadLike?.payload && typeof payloadLike.payload === "object" ? payloadLike.payload : payloadLike || {};
  return String(p?.budget_observation || p?.presupuesto_observacion || p?.quote_observation || "").trim();
}
function applyBudgetObservationToPayload(payload, observation) {
  const next = payload && typeof payload === "object" ? { ...payload } : {};
  const value = String(observation || "").trim();
  if (value) {
    next.budget_observation = value;
    next.presupuesto_observacion = value;
  } else {
    delete next.budget_observation;
    delete next.presupuesto_observacion;
  }
  return next;
}
function normalizeUrl(value) { return String(value || "").trim().replace(/\/+$/, "").toLowerCase(); }
function editorRouteForKind(kind, id, search = "") { const safeId = String(id || "").trim(); const suffix = search || ""; const normalizedKind = normalizeCatalogKind(kind); if (normalizedKind === "ipanel") return `/cotizador/ipanel/${safeId}${suffix}`; if (normalizedKind === "plegados") return `/cotizador/plegados/${safeId}${suffix}`; if (normalizedKind === "otros") return `/cotizador/otros/${safeId}${suffix}`; if (normalizedKind === "puerta") return `/cotizador/puerta/${safeId}${suffix}`; return `/cotizador/${safeId}${suffix}`; }
function newEditorRouteForKind(kind, search = "") { const suffix = search || ""; const normalizedKind = normalizeCatalogKind(kind); if (normalizedKind === "ipanel") return `/cotizador/ipanel${suffix}`; if (normalizedKind === "plegados") return `/cotizador/plegados${suffix}`; if (normalizedKind === "otros") return `/cotizador/otros${suffix}`; if (normalizedKind === "puerta") return `/cotizador/puerta${suffix}`; return `/cotizador${suffix}`; }
function parseNum(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function parseOptionalDimensionForUiPatch(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function normalizeUiText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function lineMatchesAnyProductId(line, productIds = []) {
  const ids = new Set((Array.isArray(productIds) ? productIds : []).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0));
  if (!ids.size || !line) return false;
  const candidates = [
    line?.product_id,
    line?.id,
    line?.odoo_id,
    line?.odoo_template_id,
    line?.odoo_variant_id,
    line?.odoo_external_id,
    line?.odoo_product_id,
  ];
  return candidates.some((value) => ids.has(Number(value || 0)));
}
function hasIpanelLamasProduct(payload) {
  return (Array.isArray(payload?.lines) ? payload.lines : []).some((line) => lineMatchesAnyProductId(line, [IPANEL_LAMAS_PRODUCT_ID, IPANEL_LAMAS_ODOO_ID]));
}
function lineTextMatchesIpanelVarillado(line = {}) {
  const text = normalizeUiText([
    line?.name,
    line?.raw_name,
    line?.display_name,
    line?.alias,
    line?.code,
  ].filter(Boolean).join(" "));
  return text.includes("varillado") || text.includes("varill");
}
function hasIpanelVarilladoProduct(payload) {
  return (Array.isArray(payload?.lines) ? payload.lines : []).some((line) => lineTextMatchesIpanelVarillado(line));
}
function hasIpanelPlainPanelProduct(payload) {
  return (Array.isArray(payload?.lines) ? payload.lines : []).some((line) => lineMatchesAnyProductId(line, IPANEL_NON_LAMAS_PLEGADO_PRODUCT_IDS));
}
function normalizeIpanelLamasOrientation(value) {
  const raw = normalizeUiText(value);
  if (raw.includes("vert")) return "vertical";
  if (raw.includes("horiz")) return "horizontal";
  return "horizontal";
}
function getIpanelDivisionsMaxByOrientation(value) {
  return normalizeIpanelLamasOrientation(value) === "vertical" ? 7 : 18;
}
function sanitizeIpanelSectionSizes(value, count = 0) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, safeCount).map((item) => String(item ?? "").replace(/[^0-9.,]/g, ""));
}
function getIpanelAxisDimensionMm(dimensions = {}, orientation = "horizontal") {
  const width = parseNum(dimensions?.width);
  const height = parseNum(dimensions?.height);
  const axisMeters = normalizeIpanelLamasOrientation(orientation) === "vertical" ? width : height;
  return axisMeters > 0 ? axisMeters * 1000 : 0;
}
function validateIpanelSectionSizes(dimensions = {}, orientation = "horizontal", count = 0) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (safeCount < 2) return;
  const values = sanitizeIpanelSectionSizes(
    dimensions?.ipanel_divisiones_medidas_mm ?? dimensions?.medidas_divisiones_ipanel_mm ?? dimensions?.ipanel_section_sizes_mm ?? [],
    safeCount,
  );
  if (values.length !== safeCount || values.some((item) => !String(item || "").trim())) {
    throw new Error(`Completá las medidas de las ${safeCount} secciones del Ipanel.`);
  }
  const parsed = values.map((item) => Number(String(item).replace(",", ".")));
  if (parsed.some((item) => !Number.isFinite(item) || item <= 0)) {
    throw new Error("Las medidas de las divisiones del Ipanel deben ser números positivos en mm.");
  }
  const axisDimensionMm = getIpanelAxisDimensionMm(dimensions, orientation);
  const dividersIncluded = dimensions?.ipanel_divisiones_incluyen_liston === true || String(dimensions?.ipanel_divisiones_incluyen_liston || "").trim().toLowerCase() === "true" || String(dimensions?.ipanel_distribucion_divisiones || dimensions?.ipanel_divisiones_distribucion || "").trim().toLowerCase() === "clasica";
  const dividersTotalMm = dividersIncluded ? 0 : Math.max(0, safeCount - 1) * 10;
  const sectionsTotalMm = parsed.reduce((acc, item) => acc + item, 0);
  const totalUsedMm = sectionsTotalMm + dividersTotalMm;
  if (!(axisDimensionMm > 0)) return;
  if (totalUsedMm - axisDimensionMm > 0.5) {
    throw new Error(`Las divisiones del Ipanel superan la medida disponible. Sobran ${Math.round((totalUsedMm - axisDimensionMm) * 100) / 100} mm.`);
  }
  if (axisDimensionMm - totalUsedMm > 0.5) {
    throw new Error(`Las divisiones del Ipanel no completan la medida disponible. Faltan ${Math.round((axisDimensionMm - totalUsedMm) * 100) / 100} mm.`);
  }
}
function isIpanelExtendedLamasDimensions(dimensions = {}) {
  const width = parseNum(dimensions?.width);
  const height = parseNum(dimensions?.height);
  if (!(width > 0) || !(height > 0)) return false;
  const exceedsNormalLimit = width > IPANEL_WIDTH_MAX_M || height > IPANEL_HEIGHT_MAX_M;
  const withinExtendedLimit = width < IPANEL_EXTENDED_MAX_M || height < IPANEL_EXTENDED_MAX_M;
  return exceedsNormalLimit && withinExtendedLimit;
}
function isIpanelSizeAllowed(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!(w > 0) || !(h > 0)) return true;
  const withinNormalLimit = w <= IPANEL_WIDTH_MAX_M && h <= IPANEL_HEIGHT_MAX_M;
  const withinExtendedLimit = w < IPANEL_EXTENDED_MAX_M || h < IPANEL_EXTENDED_MAX_M;
  return withinNormalLimit || withinExtendedLimit;
}
function patchIpanelLamasOnlyUi(enabled) {
  if (typeof document === "undefined") return;
  const accordionItems = Array.from(document.querySelectorAll(".dg-acc-item"));
  for (const item of accordionItems) {
    const title = normalizeUiText(item.querySelector(".dg-acc-title")?.textContent);
    if (title !== "tipo de plegado") continue;

    const cards = Array.from(item.querySelectorAll(".dg-product-card"));
    for (const card of cards) {
      const text = String(card.textContent || "");
      const isBlockedPlegado = /ID Presupuestador:\s*4036\b/i.test(text) || /ID Odoo:\s*3565\b/i.test(text);
      card.style.display = enabled && isBlockedPlegado ? "none" : "";
    }
  }
}
function getAssignedPricelistIdFromUser(user) {
  const n = Number(user?.odoo_pricelist_id || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
function getFirstPricelistId(pricelists) {
  const first = Array.isArray(pricelists) ? pricelists[0] : null;
  const n = Number(first?.id || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
function resolveExpectedPricelist({ user, pricelists, currentQuotePricelistId = null }) {
  const quoteId = Number(currentQuotePricelistId || 0);
  if (Number.isFinite(quoteId) && quoteId > 0) {
    const found = (Array.isArray(pricelists) ? pricelists : []).find((pl) => Number(pl?.id) === quoteId);
    return found || { id: quoteId, name: `Lista guardada ${quoteId}` };
  }
  const assignedId = getAssignedPricelistIdFromUser(user);
  if (assignedId) {
    const found = (Array.isArray(pricelists) ? pricelists : []).find((pl) => Number(pl?.id) === assignedId);
    return found || { id: assignedId, name: `Lista asignada ${assignedId}` };
  }
  return (Array.isArray(pricelists) ? pricelists : [])[0] || null;
}
function isSamePricelistId(currentId, expectedId) {
  const current = Number(currentId || 0);
  const expected = Number(expectedId || 0);
  return Number.isFinite(current) && current > 0 && Number.isFinite(expected) && expected > 0 && current === expected;
}
function resolveLinePricingProductId(line) {
  const candidates = [
    line?.odoo_variant_id,
    line?.odoo_external_id,
    line?.odoo_product_id,
    line?.odoo_id,
    line?.odoo_template_id,
    line?.product_id,
  ];
  for (const value of candidates) {
    const n = Number(value || 0);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return 0;
}
// 4230 = "Servicio de Traslado a destino" de Puertas (duplicado dedicado, antes
// compartia el 2842 con Portones).
const SHIPPING_PRODUCT_IDS = new Set([2842, 4230]);
// Productos que el distribuidor puede cotizar al cliente, pero que en proforma/Odoo
// se informan a $0 porque los provee/cobra directamente el distribuidor. Envio (2842/4230) no va a $0.
const DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS = new Set([3956, 3957, 3961, 3962, 3963, 3966, 4037, 3991, 3992, 3993, 3994, 3995, 3996, 3485, 3486, 3490, 3491, 3492, 3495, 3566, 3520, 3521, 3522, 3523, 3524, 3525]);
const STABLE_EDITABLE_QTY_PRODUCT_IDS = new Set([2842, 2927, 4230]);

function dflexCotizadorDebugEnabled() {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("DFLEX_DEBUG_COTIZADOR") === "1";
  } catch (_err) {
    return false;
  }
}
function dflexCotizadorDebug(action, payload = {}) {
  if (!dflexCotizadorDebugEnabled()) return;
  try {
    console.groupCollapsed(`[DFLEX COTIZADOR PAGE] ${action}`);
    console.log(payload);
    if (payload?.includeStack) console.trace(`[DFLEX COTIZADOR PAGE] ${action} stack`);
    console.groupEnd();
  } catch (_err) {}
}
function isStableEditableQtyLine(line = {}) {
  const ids = [line?.product_id, line?.odoo_id, line?.odoo_template_id, line?.odoo_variant_id, line?.odoo_external_id];
  return ids.some((value) => STABLE_EDITABLE_QTY_PRODUCT_IDS.has(Number(value || 0)));
}
function lineMatchesProductSet(line = {}, productSet) {
  const ids = [line?.product_id, line?.odoo_id, line?.odoo_template_id, line?.odoo_variant_id, line?.odoo_external_id];
  return ids.some((value) => productSet.has(Number(value || 0)));
}
function isShippingLine(line = {}) {
  return lineMatchesProductSet(line, SHIPPING_PRODUCT_IDS);
}
function isDistributorOwnSupplyLine(line = {}) {
  return lineMatchesProductSet(line, DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS);
}
function zeroDistributorOwnSupplyLinePrice(line = {}) {
  if (!isDistributorOwnSupplyLine(line)) return line;
  return { ...line, basePrice: 0, base_price: 0, price: 0, price_unit: 0, unit_price: 0, distributor_proforma_zero_price: true };
}

function buildPriceRefreshLines(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .filter((line) => !line?.previously_billed_line)
    .map((line) => ({
      product_id: resolveLinePricingProductId(line),
      source_product_id: line?.product_id,
      odoo_template_id: line?.odoo_template_id || null,
      qty: line?.qty,
    }))
    .filter((line) => Number(line.product_id || 0) > 0);
}

function hasUsableLineBasePrice(line = {}) {
  const value = line?.basePrice ?? line?.base_price ?? line?.price;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}
function lineNeedsPriceRefresh(line = {}) {
  if (!line || line.previously_billed_line) return false;
  return !hasUsableLineBasePrice(line);
}
function getSavedQuoteAdjustmentPercent(quote) {
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  const candidates = [
    payload.quote_adjustment_percent_snapshot,
    payload.financing_percent_snapshot,
    payload.financing_percent,
    payload.payment_adjustment_percent,
  ];
  for (const value of candidates) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const n = Number(String(value).replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function mergeUpdatedBasePrices(lines = [], pricesResponse = {}) {
  const prices = Array.isArray(pricesResponse?.prices) ? pricesResponse.prices : [];
  const bySourceProductId = new Map();
  const byOdooProductId = new Map();

  for (const item of prices) {
    const sourceId = Number(item?.product_id || 0);
    const odooId = Number(item?.odoo_product_id || item?.odoo_template_id || 0);
    if (Number.isFinite(sourceId) && sourceId > 0) bySourceProductId.set(sourceId, item);
    if (Number.isFinite(odooId) && odooId > 0) byOdooProductId.set(odooId, item);
  }

  return (Array.isArray(lines) ? lines : []).map((line) => {
    if (!line || line.previously_billed_line) return line;
    const sourceId = Number(line?.product_id || 0);
    const odooId = Number(resolveLinePricingProductId(line) || 0);
    const next = bySourceProductId.get(sourceId) || byOdooProductId.get(odooId);
    if (!next || line?.manual_price) return line;
    const nextPrice = Number(next.price ?? line.basePrice ?? 0);
    return {
      ...line,
      basePrice: Number.isFinite(nextPrice) ? nextPrice : line.basePrice,
      code: next.code ?? line.code,
      raw_name: line.raw_name,
      name: line.name || next.name || line.raw_name,
    };
  });
}
function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
function patchPortonDimensionValidationUi(dimensions) {
  if (typeof document === "undefined") return;
  const title = Array.from(document.querySelectorAll("div")).find((node) => node.textContent?.trim() === "Medidas del porton" || node.textContent?.trim() === "Medidas del Vano");
  const root = title?.parentElement || null;
  if (!root) return;

  const width = parseOptionalDimensionForUiPatch(dimensions?.width);
  const height = parseOptionalDimensionForUiPatch(dimensions?.height);
  const widthOk = width === null || (width >= WIDTH_MIN_M && width <= WIDTH_MAX_M);
  const heightOk = height === null || (height >= HEIGHT_MIN_M && height <= HEIGHT_MAX_M);
  const allOk = widthOk && heightOk;

  const helperNodes = Array.from(root.querySelectorAll("*"));
  for (const node of helperNodes) {
    const text = String(node.textContent || "").trim();
    if (/^Minimo\s+2\.4\s*m\s*-\s*Maximo\s+7\s*m$/i.test(text) || /^Minimo\s+2\.30?\s*m\s*-\s*Maximo\s+7\s*m$/i.test(text)) {
      node.textContent = `Minimo ${WIDTH_MIN_M.toFixed(2)} m - Maximo ${WIDTH_MAX_M} m`;
      if (widthOk) node.style.color = "#6b7280";
    }
  }

  const banner = Array.from(root.querySelectorAll("div")).find((node) => node.textContent?.trim() === "Se encuentra fuera de los limites de tamano.");
  if (allOk) {
    root.style.border = "1px solid transparent";
    root.style.background = "transparent";
    if (banner) banner.style.display = "none";
  } else {
    if (banner) banner.style.display = "";
  }

  const inputs = Array.from(root.querySelectorAll("input"));
  if (widthOk && inputs[0]) {
    inputs[0].style.borderColor = "#d1d5db";
    inputs[0].style.boxShadow = "none";
    inputs[0].style.background = "#fff";
  }
  if (heightOk && inputs[1]) {
    inputs[1].style.borderColor = "#d1d5db";
    inputs[1].style.boxShadow = "none";
    inputs[1].style.background = "#fff";
  }
}
function patchIpanelDimensionValidationUi(dimensions) {
  if (typeof document === "undefined") return;
  const title = Array.from(document.querySelectorAll("div")).find((node) => node.textContent?.trim() === "Medidas del Ipanel");
  const root = title?.parentElement || null;
  if (!root) return;

  const width = parseOptionalDimensionForUiPatch(dimensions?.width);
  const height = parseOptionalDimensionForUiPatch(dimensions?.height);
  const allOk = isIpanelSizeAllowed(width, height);
  const widthOk = allOk;
  const heightOk = allOk;

  const helperNodes = Array.from(root.querySelectorAll("*"));
  for (const node of helperNodes) {
    const text = String(node.textContent || "").trim();
    if (/^(?:Maximo\s+1\.(?:13|16)\s*m|Panel\s+simple\s+max\s+1\.(?:13|16)\s*m)/i.test(text)) {
      node.textContent = "Panel simple max 1.16 m. Lamas y varillado: sin límite si el otro lado es menor a 4.00 m";
      if (widthOk) node.style.color = "#6b7280";
    }
    if (/^Maximo\s+2\.45\s*m/i.test(text)) {
      node.textContent = "Panel simple max 2.45 m. Lamas y varillado: sin límite si el otro lado es menor a 4.00 m";
      if (heightOk) node.style.color = "#6b7280";
    }
  }

  const banner = Array.from(root.querySelectorAll("div")).find((node) => node.textContent?.trim() === "Se encuentra fuera de los limites de tamano.");
  if (allOk) {
    root.style.border = "1px solid transparent";
    root.style.background = "transparent";
    if (banner) banner.style.display = "none";
  } else if (banner) {
    banner.style.display = "";
  }

  const inputs = Array.from(root.querySelectorAll("input"));
  if (widthOk && inputs[0]) {
    inputs[0].style.borderColor = "#d1d5db";
    inputs[0].style.boxShadow = "none";
    inputs[0].style.background = "#fff";
  }
  if (heightOk && inputs[1]) {
    inputs[1].style.borderColor = "#d1d5db";
    inputs[1].style.boxShadow = "none";
    inputs[1].style.background = "#fff";
  }
}
function formatMetric(v) { const n = Number(v || 0); return Number.isFinite(n) && n > 0 ? String(n).replace(/\.00$/, "") : ""; }
function buildPortonMetricsText(payload) {
  const dims = payload?.payload?.dimensions || payload?.dimensions || {};
  const width = parseNum(dims?.width);
  const height = parseNum(dims?.height);
  const kgM2 = parseNum(dims?.kg_m2);
  const rows = [];
  if (width > 0) rows.push(`Ancho: ${formatMetric(width)} m`);
  if (height > 0) rows.push(`Alto: ${formatMetric(height)} m`);
  if (kgM2 > 0) rows.push(`Kg/m²: ${formatMetric(kgM2)}`);
  return rows.join(" · ");
}
function appendMetricsToNote(note, payload) {
  const metrics = buildPortonMetricsText(payload);
  if (!metrics) return String(note || "").trim();
  const rows = String(note || "").split(/\r?\n/).filter(Boolean);
  const filtered = rows.filter((line) => !/^alto:\s/i.test(line) && !/^ancho:\s/i.test(line) && !/^kg\/m²:\s/i.test(line) && !/^peso estimado:\s/i.test(line));
  filtered.push(metrics);
  return filtered.join("\n").trim();
}
function buildPdfPayloadForDownload(payload, financingPercent, extras = {}, options = {}) {
  const percent = Number(financingPercent || 0) || 0;
  const factor = 1 + percent / 100;
  const nextLines = Array.isArray(payload?.lines)
    ? payload.lines.map((line) => {
        // "Facturado previamente" (deposito ya cobrado): dato duro, no se le aplica
        // recargo por forma de pago ni ningun otro ajuste.
        if (line?.previously_billed_line) return line;
        const rawBase = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
        const financedBase = Math.round(rawBase * factor * 100) / 100;
        const nextLine = { ...line, basePrice: financedBase, base_price: financedBase, price: financedBase };
        return options?.zeroShippingForDistributor ? zeroDistributorOwnSupplyLinePrice(nextLine) : nextLine;
      })
    : [];
  const nextPayload = { ...(payload || {}), ...extras, lines: nextLines, payload: { ...(payload?.payload || {}), ...(extras.payload || {}) } };
  if (options?.stripMarginPercent) {
    nextPayload.margin_percent_ui = 0;
    nextPayload.marginPercent = 0;
    nextPayload.payload = {
      ...(nextPayload.payload || {}),
      margin_percent_ui: 0,
      marginPercent: 0,
    };
  }
  if (normalizeCatalogKind(nextPayload.catalog_kind || nextPayload.payload?.catalog_kind) !== "otros") {
    nextPayload.note = appendMetricsToNote(nextPayload.note, nextPayload);
  } else {
    nextPayload.note = String(nextPayload.note || "").trim();
  }
  return nextPayload;
}
function formatProductionDeliveryDisplay(planning) {
  if (!planning || typeof planning !== "object") return "";
  const weekNumber = String(planning.week_number || planning.week || "").trim();
  const startLabel = String(planning.start_date_label || "").trim();
  const endLabel = String(planning.end_date_label || "").trim();
  if (!weekNumber && !startLabel && !endLabel) return "";
  const weekPart = weekNumber ? `Semana ${weekNumber}` : "Semana estimada";
  if (startLabel || endLabel) return `${weekPart}, entre ${startLabel || "—"} y ${endLabel || "—"}`;
  return weekPart;
}
function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
function validateDimensionsRequired(payload, kind = "porton") {
  const normalizedKind = normalizeCatalogKind(kind);
  if (normalizedKind === "otros") return;

  const dims = payload?.payload?.dimensions || {};
  const width = parseNum(dims?.width);
  const height = parseNum(dims?.height);
  const itemLabel = normalizedKind === "ipanel" ? "Ipanel" : (normalizedKind === "plegados" ? "plegado" : (normalizedKind === "puerta" ? "puerta" : "portón"));

  if (!(width > 0)) throw new Error(`Completá el ancho del ${itemLabel}.`);
  if (!(height > 0)) throw new Error(`Completá el alto del ${itemLabel}.`);
  if (normalizedKind === "plegados" && !hasPlegadoAttachment({ payload: payload?.payload || {} })) {
    const wantsToContinue = window.confirm("No se adjuntó ningún plano, ¿desea continuar?");
    if (!wantsToContinue) throw new Error("Adjuntá el plano del plegado.");
  }

  if (normalizedKind === "porton") {
    if (width < WIDTH_MIN_M || width > WIDTH_MAX_M) throw new Error("El ancho debe estar entre 2.3 m y 7 m.");
    if (height < HEIGHT_MIN_M || height > HEIGHT_MAX_M) throw new Error("El alto debe estar entre 2 m y 3 m.");
    // Tope de peso desactivado a pedido (revertido en main, no borrado por si hay que
    // reactivarlo). Descomentar para volver a bloquear el guardado por encima de 350kg.
    // const estimatedWeightKg = parseNum(dims?.porton_estimated_weight_kg);
    // if (estimatedWeightKg > PORTON_MAX_WEIGHT_KG) {
    //   throw new Error(`El portón supera el peso máximo permitido (${PORTON_MAX_WEIGHT_KG} kg). Ajustá el revestimiento (kg/m2) o las medidas.`);
    // }
  }

  if (normalizedKind === "ipanel") {
    if (!(width < IPANEL_EXTENDED_MAX_M || height < IPANEL_EXTENDED_MAX_M)) {
      throw new Error(`El ${itemLabel} no puede tener el ancho y el alto en 4.00 m o más al mismo tiempo. Al menos uno de los dos lados tiene que ser menor a 4.00 m; el otro no tiene límite.`);
    }

    if (hasIpanelLamasProduct(payload)) {
      const lamasSetupCompleted = dims?.ipanel_lamas_popup_completed === true
        || dims?.ipanel_lamas_setup_completed === true
        || String(dims?.ipanel_lamas_popup_completed || "").trim().toLowerCase() === "true"
        || String(dims?.ipanel_lamas_setup_completed || "").trim().toLowerCase() === "true";
      if (!lamasSetupCompleted) {
        throw new Error("Completá los datos obligatorios del Panel en Lamas 22mm para continuar.");
      }
      const orientation = normalizeIpanelLamasOrientation(
        dims?.ipanel_lamas_orientacion ??
        dims?.orientacion_ipanel_lamas ??
        dims?.ipanel_orientacion_lamas ??
        dims?.ipanel_lamas_orientation ??
        "horizontal"
      );
      const maxDivisions = getIpanelDivisionsMaxByOrientation(orientation);
      const divisionsRaw = dims?.ipanel_divisiones ?? dims?.cantidad_divisiones_ipanel;
      const divisions = Number(String(divisionsRaw ?? "").trim());
      if (!Number.isInteger(divisions) || divisions < 2 || divisions > maxDivisions) {
        throw new Error(`Completá la cantidad de divisiones del Ipanel con un número entero entre 2 y ${maxDivisions} para orientación ${orientation === "vertical" ? "vertical" : "horizontal"}.`);
      }
      validateIpanelSectionSizes(dims, orientation, divisions);
    }

    if (isIpanelExtendedLamasDimensions(dims)) {
      if (hasIpanelPlainPanelProduct(payload)) {
        throw new Error("El Panel liso sólo puede usarse hasta 1.16 m de ancho y 2.45 m de alto. Para medidas mayores usá lamas o varillado.");
      }
      return;
    }

    if (width > IPANEL_WIDTH_MAX_M) throw new Error(`El ancho del ${itemLabel} no puede superar 1.16 m (116 cm), salvo en Revestimiento en lamas o varillado hasta 2.00 m.`);
    if (height > IPANEL_HEIGHT_MAX_M) throw new Error(`El alto del ${itemLabel} no puede superar 2.45 m (245 cm), salvo en Revestimiento en lamas o varillado hasta 3.00 m.`);
  }
}
function formatVisibleStatus(rawStatus, hasPersistedQuote) {
  const normalized = String(rawStatus || "").trim().toLowerCase();
  if (normalized === "draft") return hasPersistedQuote ? "Guardado" : "Draft";
  if (!normalized) return hasPersistedQuote ? "Guardado" : "Draft";
  return String(rawStatus || "");
}

function extractReferenceCore(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/^[A-Za-z]+/, "").trim() || raw;
}
function linkedPortonReferenceLabel(quote) {
  if (!quote) return "";
  return String(quote.odoo_sale_order_name || quote.final_sale_order_name || quote.quote_number || "").trim();
}
function quoteDisplayReference(quote) {
  return String(quote?.odoo_sale_order_name || quote?.final_sale_order_name || quote?.quote_number || quote?.id || "").trim();
}
function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function buildPortonSearchText(quote = {}) {
  const c = quote?.end_customer || {};
  return normalizeSearchText([
    quoteDisplayReference(quote),
    quote?.quote_number,
    quote?.odoo_sale_order_name,
    quote?.final_sale_order_name,
    quote?.status,
    c?.name,
    c?.first_name,
    c?.last_name,
    c?.phone,
    c?.email,
    c?.address,
    c?.city,
  ].filter(Boolean).join(" "));
}
function isPortonQuoteForLink(quote = {}) {
  const rawKind = String(quote?.catalog_kind ?? "").trim().toLowerCase();
  return !rawKind || rawKind === "porton";
}
function buildLinkedPortonPayload(linkedPorton, linkedPortonId) {
  if (!linkedPortonId) return null;
  // Solo guardamos referencia NP/NV (no el número de presupuesto) para que la lógica
  // de bloqueo del backend funcione correctamente cuando el portón aún no tiene NP/NV.
  const npNvReference = linkedPorton?.odoo_sale_order_name || linkedPorton?.final_sale_order_name || "";
  return {
    linked_porton_quote_id: linkedPorton?.id || linkedPortonId,
    linked_porton_quote_number: linkedPorton?.quote_number || "",
    linked_porton_reference: npNvReference,
    linked_porton_odoo_sale_order_name: linkedPorton?.odoo_sale_order_name || "",
    linked_porton_final_sale_order_name: linkedPorton?.final_sale_order_name || "",
    linked_porton_reference_core: extractReferenceCore(npNvReference),
  };
}

function extractLinkedPortonPayloadFromQuote(quote) {
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  const out = {};
  [
    "linked_porton_quote_id",
    "linked_porton_quote_number",
    "linked_porton_reference",
    "linked_porton_odoo_sale_order_name",
    "linked_porton_final_sale_order_name",
    "linked_porton_reference_core",
  ].forEach((key) => {
    if (payload[key] !== undefined && payload[key] !== null && String(payload[key]).trim() !== "") out[key] = payload[key];
  });
  return Object.keys(out).length ? out : null;
}
function buildSubQuoteDisplayReferenceFromPayload(kind, payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  // Solo usamos campos que contienen referencia NP/NV real (no quote_number ni reference que pueden ser n° de presupuesto).
  const core = extractReferenceCore(p.linked_porton_odoo_sale_order_name || p.linked_porton_final_sale_order_name || p.linked_porton_reference_core || "");
  if (!core) return "";
  const normalizedKind = normalizeCatalogKind(kind);
  if (normalizedKind === "ipanel") return `INP${core}`;
  if (normalizedKind === "plegados") return `PLNP${core}`;
  if (normalizedKind === "otros") return `ONP${core}`;
  if (normalizedKind === "puerta") return `PNP${core}`;
  return `NP${core}`;
}

function buildSubQuoteDisplayReference(kind, linkedPorton) {
  const normalizedKind = normalizeCatalogKind(kind);
  // Solo tomamos la NP/NV del portón, nunca el número de presupuesto.
  const reference = linkedPorton?.odoo_sale_order_name || linkedPorton?.final_sale_order_name || "";
  const core = extractReferenceCore(reference);
  if (!core) return "";
  if (normalizedKind === "ipanel") return `INP${core}`;
  if (normalizedKind === "plegados") return `PLNP${core}`;
  if (normalizedKind === "otros") return `ONP${core}`;
  if (normalizedKind === "puerta") return `PNP${core}`;
  return `NP${core}`;
}

function displayQuoteNumberForKind(kind, quote, fallback = "") {
  return buildSubQuoteDisplayReferenceFromPayload(kind, extractLinkedPortonPayloadFromQuote(quote)) || fallback;
}

function quoteLooksLikeReturnedMeasurement(quote) {
  if (!quote || typeof quote !== "object") return false;
  if (String(quote?.measurement_status || "").trim().toLowerCase() === "returned_to_seller") return true;
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  if (payload?.measurement_return_context) return true;
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  return lines.some((line) => line?.previously_billed_line === true || Number(line?.product_id) === PREVIOUSLY_BILLED_PRODUCT_ID);
}

function summarizeLinesForDebug(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    product_id: line?.product_id,
    odoo_id: line?.odoo_id,
    odoo_template_id: line?.odoo_template_id,
    odoo_variant_id: line?.odoo_variant_id,
    odoo_external_id: line?.odoo_external_id,
    name: line?.name,
    raw_name: line?.raw_name,
    qty: line?.qty,
  }));
}

export default function CotizadorPage({ catalogKind = "porton" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const params = useParams();
  const qc = useQueryClient();

  const normalizedCatalogKind = normalizeCatalogKind(catalogKind);
  const idParam = params.id ? String(params.id) : null;
  const searchParams = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const isDoorWorkflow = searchParams.get("door_workflow") === "1";
  const workflowStage = String(searchParams.get("workflow_stage") || "").trim();
  const workflowDoorId = String(searchParams.get("door_id") || "").trim();
  const workflowPortonId = String(searchParams.get("porton_id") || "").trim();
  const initialLinkedPortonId = String(searchParams.get("linked_porton_id") || (normalizedCatalogKind !== "porton" ? workflowPortonId : "") || "").trim();
  const canLinkToPorton = ["ipanel", "plegados", "otros"].includes(normalizedCatalogKind);

  const {
    quoteId,
    status,
    pricelistId,
    marginPercent,
    partnerId,
    paymentMethod,
    conditionMode,
    conditionText,
    fulfillmentMode,
    endCustomer,
    note,
    portonType,
    lines,
    dimensions,
    setPricelist,
    setPartnerId,
    setFulfillmentMode,
    setNote,
    applyBasePrices,
    markLinesPriceError,
    loadFromQuote,
    reset,
    setMarginPercent,
    setEndCustomer,
    buildPayloadForBack,
    setQuoteMeta,
    addLine,
    forceRemoveLine,
    extraContact,
    setExtraContact,
    distribuidorVendedorNombre,
    setDistribuidorVendedorNombre,
  } = useQuoteStore();
  const [ivaRate] = useState(IVA_RATE_DEFAULT);
  const [confirmChoiceOpen, setConfirmChoiceOpen] = useState(false);
  const [confirmBudgetObservation, setConfirmBudgetObservation] = useState("");
  const [autosaveState, setAutosaveState] = useState({ status: "idle", message: "", savedAt: "" });
  const autosaveTimerRef = useRef(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveLastRemoteSignatureRef = useRef("");
  const autosaveRestoredLocalRef = useRef(false);
  const ipanelLamasAlertShownRef = useRef(false);
  const [linkedPortonId, setLinkedPortonId] = useState("");
  const [portonSearch, setPortonSearch] = useState("");

  useEffect(() => {
    if (!idParam) {
      reset();
      setLinkedPortonId(initialLinkedPortonId || "");
      setPortonSearch("");
      if (user?.default_maps_url) setEndCustomer({ maps_url: user.default_maps_url });
      if (user?.is_distribuidor && !user?.is_vendedor) setMarginPercent(20);
    }
  }, [idParam, reset, user?.default_maps_url, user?.is_distribuidor, user?.is_vendedor, setEndCustomer, setMarginPercent, initialLinkedPortonId]);

  const quoteQ = useQuery({ queryKey: ["quote", idParam], queryFn: () => getQuote(idParam), enabled: !!idParam });
  const pricelistsQ = useQuery({ queryKey: ["effective-pricelist", user?.user_id || user?.id || "current"], queryFn: getEffectivePricelists, enabled: !!user, staleTime: 60 * 1000 });
  const expectedPricelist = useMemo(
    () => resolveExpectedPricelist({
      user,
      pricelists: pricelistsQ.data,
      currentQuotePricelistId: quoteQ.data?.pricelist_id,
    }),
    [user, user?.odoo_pricelist_id, pricelistsQ.data, quoteQ.data?.pricelist_id],
  );
  const expectedPricelistId = Number(expectedPricelist?.id || 0) || null;

  // Precarga bloqueante de TODOS los precios de la lista del usuario antes de dejar
  // cotizar. Sin esto, agregar un producto antes de que termine la precarga (o justo
  // cuando se corta internet) dejaba la linea en $0 sin ningun aviso.
  const [pricesReady, setPricesReady] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState("");
  const pricesReadyForPricelistRef = useRef(null);
  useEffect(() => {
    if (!isSamePricelistId(pricelistId, expectedPricelistId) || !pricelistId) return;
    if (pricesReadyForPricelistRef.current === pricelistId) return;
    let cancelled = false;
    setPricesLoading(true);
    setPricesError("");
    ensurePricesReadyForPricelist(pricelistId).then((result) => {
      if (cancelled) return;
      setPricesLoading(false);
      if (result.ok) {
        pricesReadyForPricelistRef.current = pricelistId;
        setPricesReady(true);
      } else {
        setPricesReady(false);
        setPricesError(result.error || "No se pudieron cargar los precios de Odoo.");
      }
    });
    return () => { cancelled = true; };
  }, [pricelistId, expectedPricelistId]);
  function retryLoadPrices() {
    pricesReadyForPricelistRef.current = null;
    setPricesError("");
    setPricesReady(false);
  }

  const pricingContextReady = !!user
    && !quoteQ.isLoading
    && !pricelistsQ.isLoading
    && !!expectedPricelistId
    && isSamePricelistId(pricelistId, expectedPricelistId)
    && (!user?.is_distribuidor || !user?.odoo_partner_id || !!partnerId)
    && pricesReady;
  const pricingContextMessage = !user
    ? "Cargando usuario para resolver lista de precios..."
    : quoteQ.isLoading
      ? "Cargando presupuesto guardado..."
      : pricelistsQ.isLoading
        ? "Cargando listas de precios..."
        : !expectedPricelistId
          ? "No se pudo resolver la lista de precios del usuario."
          : !isSamePricelistId(pricelistId, expectedPricelistId)
            ? "Aplicando lista de precios correcta antes de cotizar..."
            : (user?.is_distribuidor && user?.odoo_partner_id && !partnerId)
              ? "Aplicando cliente Odoo del distribuidor antes de cotizar..."
              : pricesError
                ? pricesError
                : pricesLoading || !pricesReady
                  ? "Cargando precios de Odoo..."
                  : "";
  useEffect(() => {
    if (!user || !expectedPricelistId || !expectedPricelist) return;
    if (isSamePricelistId(pricelistId, expectedPricelistId)) return;
    setPricelist(expectedPricelist);
  }, [user, expectedPricelist, expectedPricelistId, pricelistId, setPricelist]);
  useEffect(() => {
    if (!user?.is_distribuidor || !user?.odoo_partner_id || partnerId) return;
    setPartnerId(user.odoo_partner_id);
  }, [partnerId, setPartnerId, user?.is_distribuidor, user?.odoo_partner_id]);
  const portonQuotesQ = useQuery({
    queryKey: ["quotes", "mine", "portones-for-link", user?.user_id || user?.id || "current"],
    queryFn: () => listQuotes({ scope: "mine" }),
    enabled: canLinkToPorton && !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const portonQuotes = useMemo(() => (portonQuotesQ.data || []).filter(isPortonQuoteForLink), [portonQuotesQ.data]);
  const filteredPortonQuotes = useMemo(() => {
    const needle = normalizeSearchText(portonSearch);
    if (!needle) return portonQuotes;
    return portonQuotes.filter((q) => buildPortonSearchText(q).includes(needle));
  }, [portonQuotes, portonSearch]);
  const linkedPorton = useMemo(() => portonQuotes.find((q) => String(q.id) === String(linkedPortonId)) || null, [portonQuotes, linkedPortonId]);

  const isRevisionQuote = (quoteQ.data?.quote_kind || "original") === "copy";
  const finalStatus = String(quoteQ.data?.final_status || "");
  const isAcopioRevision = isRevisionQuote && String(quoteQ.data?.fulfillment_mode || "").trim() === "acopio";
  const isReturnedMeasurementQuote = !isRevisionQuote && quoteLooksLikeReturnedMeasurement(quoteQ.data);
  const returnedMeasurementReason = String(quoteQ.data?.measurement_review_notes || "").trim();
  const returnedMeasurementForced = quoteQ.data?.measurement_return_force_reason === true;
  const persistedLinkedPortonPayload = extractLinkedPortonPayloadFromQuote(quoteQ.data);
  const linkedPortonDisplayReference = buildSubQuoteDisplayReference(normalizedCatalogKind, linkedPorton) || buildSubQuoteDisplayReferenceFromPayload(normalizedCatalogKind, persistedLinkedPortonPayload);
  const visibleQuoteNumber = String(linkedPortonDisplayReference || quoteQ.data?.quote_number || quoteQ.data?.odoo_sale_order_name || "").trim();
  const visibleParentQuoteNumber = String(quoteQ.data?.parent_quote_number || quoteQ.data?.parent_quote_quote_number || quoteQ.data?.parent_odoo_sale_order_name || "").trim();
  const visibleStatusLabel = formatVisibleStatus(isRevisionQuote ? (finalStatus || status) : status, !!(quoteQ.data?.id || quoteId || idParam));

  const productionPlanningQuoteId = useMemo(() => {
    const parentQuoteId = String(quoteQ.data?.parent_quote_id || "").trim() || null;
    if (isRevisionQuote && parentQuoteId) return parentQuoteId;
    return quoteId || idParam || null;
  }, [isRevisionQuote, quoteQ.data?.parent_quote_id, quoteId, idParam]);

  const productionPlanningFromDate = useMemo(() => {
    return productionPlanningQuoteId ? null : getTodayIsoDate();
  }, [productionPlanningQuoteId]);

  const productionDeliveryQ = useQuery({
    queryKey: [
      "production-planning-estimate",
      productionPlanningQuoteId || "draft",
      productionPlanningFromDate || "quote-date",
      normalizedCatalogKind,
    ],
    queryFn: () => getProductionPlanningEstimate({
      quoteId: productionPlanningQuoteId || null,
      fromDate: productionPlanningFromDate || null,
    }),
    enabled: !!user && normalizedCatalogKind === "porton",
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
  const productionDelivery = productionDeliveryQ.data || null;

  useEffect(() => {
    if (!quoteQ.data) return;
    const qKind = normalizeCatalogKind(quoteQ.data.catalog_kind);
    if (qKind !== normalizedCatalogKind) {
      const id = String(quoteQ.data.id);
      navigate(editorRouteForKind(qKind, id), { replace: true });
      return;
    }
    loadFromQuote(quoteQ.data);
    const persistedLinked = extractLinkedPortonPayloadFromQuote(quoteQ.data);
    setLinkedPortonId(String(persistedLinked?.linked_porton_quote_id || "").trim());
  }, [quoteQ.data, loadFromQuote, normalizedCatalogKind, navigate]);

  function applyLinkedPortonData(portonId) {
    const selectedId = String(portonId || "").trim();
    setLinkedPortonId(selectedId);
    if (!selectedId) return;
    const linked = portonQuotes.find((q) => String(q.id) === selectedId);
    if (!linked) return;
    const linkedKind = normalizeCatalogKind(linked.catalog_kind || "porton");
    if (linkedKind !== "porton") {
      toast.error("El presupuesto vinculado debe ser de portón.");
      return;
    }
    if (linked.end_customer) setEndCustomer(linked.end_customer);
    if (linked.fulfillment_mode) setFulfillmentMode(linked.fulfillment_mode);
    if (linked.pricelist_id) setPricelist({ id: linked.pricelist_id, name: linked.pricelist_name || `Lista ${linked.pricelist_id}` });
    if (linked.bill_to_odoo_partner_id) setPartnerId(linked.bill_to_odoo_partner_id);
    const label = buildSubQuoteDisplayReference(normalizedCatalogKind, linked);
    if (label) setNote(`${catalogKindDisplayName(normalizedCatalogKind)} vinculado al portón ${linkedPortonReferenceLabel(linked) || linked.quote_number || linked.id}`);
    toast.success(`${catalogKindDisplayName(normalizedCatalogKind)} vinculado al portón.`);
  }

  useEffect(() => {
    if (!canLinkToPorton || idParam || !initialLinkedPortonId || !linkedPorton) return;
    applyLinkedPortonData(initialLinkedPortonId);
  }, [canLinkToPorton, idParam, initialLinkedPortonId, linkedPorton]);

  useEffect(() => {
    if (normalizedCatalogKind !== "porton") return;
    patchPortonDimensionValidationUi(dimensions);
    const timer = window.setTimeout(() => patchPortonDimensionValidationUi(dimensions), 0);
    return () => window.clearTimeout(timer);
  }, [normalizedCatalogKind, dimensions?.width, dimensions?.height]);

  useEffect(() => {
    if (normalizedCatalogKind !== "ipanel") {
      ipanelLamasAlertShownRef.current = false;
      patchIpanelLamasOnlyUi(false);
      return undefined;
    }

    const mustUseLamas = isIpanelExtendedLamasDimensions(dimensions);
    if (mustUseLamas) {
      const currentLines = useQuoteStore.getState().lines || [];
      const nextLines = currentLines.filter((line) => !lineMatchesAnyProductId(line, IPANEL_NON_LAMAS_PLEGADO_PRODUCT_IDS));
      if (nextLines.length !== currentLines.length) {
        useQuoteStore.setState({ lines: nextLines });
      }

      ipanelLamasAlertShownRef.current = true;
    } else {
      ipanelLamasAlertShownRef.current = false;
    }

    patchIpanelDimensionValidationUi(dimensions);
    patchIpanelLamasOnlyUi(mustUseLamas);
    const timer = window.setTimeout(() => {
      patchIpanelDimensionValidationUi(dimensions);
      patchIpanelLamasOnlyUi(mustUseLamas);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [normalizedCatalogKind, dimensions?.width, dimensions?.height, lines]);

  useEffect(() => {
    const currentLines = useQuoteStore.getState().lines || [];
    const needsShippingPatch = currentLines.some((line) => (
      isShippingLine(line)
      && (line.manual_price || line.price_editable || line.distributor_proforma_zero_price)
      && !line.previously_billed_line
    ));
    if (!needsShippingPatch) return;
    useQuoteStore.setState({
      lines: currentLines.map((line) => {
        if (!isShippingLine(line) || line.previously_billed_line) return line;
        const next = { ...line, price_editable: false, manual_price: false };
        delete next.distributor_proforma_zero_price;
        return next;
      }),
    });
  }, [lines]);

  useEffect(() => {
    if (normalizedCatalogKind !== "otros") return;
    const currentLines = useQuoteStore.getState().lines || [];
    const needsPatch = currentLines.some((line) => (
      line
      && !line.free_quantity
      && !line.quantity_editable
      && !line.auto_system_item
      && !line.surface_quantity
      && !line.previously_billed_line
    ));
    if (!needsPatch) return;
    useQuoteStore.setState({
      lines: currentLines.map((line) => {
        if (!line || line.free_quantity || line.quantity_editable || line.auto_system_item || line.surface_quantity || line.previously_billed_line) return line;
        return { ...line, free_quantity: true, quantity_editable: true };
      }),
    });
  }, [normalizedCatalogKind, lines]);

  const financingQ = useQuery({ queryKey: ["financing-preview", paymentMethod], queryFn: () => getFinancingPreview(paymentMethod), enabled: !!String(paymentMethod || "").trim(), staleTime: 60 * 1000 });
  const financingPercent = Number(financingQ.data?.percent || 0) || 0;
  const savedQuoteAdjustmentPercent = getSavedQuoteAdjustmentPercent(quoteQ.data);
  const persistedQuoteId = quoteQ.data?.id || quoteId || idParam;
  const savedQuotePaymentMethod = String(quoteQ.data?.payload?.payment_method || "").trim();
  const currentPaymentMethod = String(paymentMethod || "").trim();
  const paymentMethodChangedFromSavedQuote = !!persistedQuoteId && currentPaymentMethod !== savedQuotePaymentMethod;
  const quoteAdjustmentPercent = useMemo(() => {
    if (persistedQuoteId && savedQuoteAdjustmentPercent !== null && !paymentMethodChangedFromSavedQuote) return savedQuoteAdjustmentPercent;
    return resolveQuoteAdjustmentPercent(financingPercent, conditionMode);
  }, [persistedQuoteId, savedQuoteAdjustmentPercent, paymentMethodChangedFromSavedQuote, financingPercent, conditionMode]);
  const totals = useMemo(() => calcTotals(lines, marginPercent, ivaRate, quoteAdjustmentPercent, conditionMode), [lines, marginPercent, ivaRate, quoteAdjustmentPercent, conditionMode]);
  const linesKey = useMemo(
    () => lines.map((l) => `${l.product_id}:${resolveLinePricingProductId(l)}:${l.odoo_template_id || ""}:${isStableEditableQtyLine(l) ? "stable-qty" : l.qty}`).join("|"),
    [lines],
  );

  // La planchuela 2903 ya no se agrega automaticamente.
  // Queda disponible para que el usuario la elija manualmente desde su seccion.

  const linesBeingPricedRef = useRef([]);
  useEffect(() => {
    async function run() {
      if (!pricingContextReady || !pricelistId || !lines.length) return;
      const isPersistedQuote = !!(quoteQ.data?.id || quoteId || idParam);
      let linesToPrice = isPersistedQuote
        ? lines.filter(lineNeedsPriceRefresh)
        : lines.filter((line) => !line?.previously_billed_line);
      // El portón Coplanar/Clasico SIEMPRE debe llevar sumada la instalacion (vendedores,
      // desde el corte). Si ya tenia precio de una tanda anterior, "no necesita refresh" y
      // el merge nunca se recalcula - lo forzamos a entrar siempre que aplique la regla.
      if (isPersistedQuote && shouldApplySection37VendorExtra()) {
        const section37TargetLine = lines.find((l) => SECTION_37_PRODUCT_IDS.includes(Number(l.product_id)));
        if (section37TargetLine && !linesToPrice.includes(section37TargetLine)) {
          linesToPrice = [...linesToPrice, section37TargetLine];
        }
      }
      if (!linesToPrice.length) return;
      linesBeingPricedRef.current = linesToPrice.map((l) => Number(l.product_id)).filter(Boolean);
      const payload = {
        pricelist_id: pricelistId,
        partner_id: partnerId,
        lines: linesToPrice
          .filter((line) => !line.previously_billed_line)
          .map((l) => ({
            product_id: resolveLinePricingProductId(l),
            source_product_id: l.product_id,
            odoo_template_id: l.odoo_template_id || null,
            qty: l.qty,
          })),
      };
      if (!payload.lines.length) return;
      payload.lines = withSection37ExtraLine(linesToPrice, payload.lines);
      // Presupuesto nuevo (sin guardar todavia, sin datos de cliente): siempre traemos
      // el precio en vivo de Odoo, sin usar la cache local de 12hs, para no arrastrar
      // precios viejos mientras el usuario todavia no puede usar "Actualizar presupuesto".
      const forcedPayload = { ...payload, force: !isPersistedQuote };
      dflexCotizadorDebug("getPrices:auto", { payload: forcedPayload, linesKey, lines: summarizeLinesForDebug(lines), includeStack: true });
      const data = await getPrices(forcedPayload);
      dflexCotizadorDebug("getPrices:auto:response", { data, includeStack: false });
      applyBasePrices(mergeSection37VendorExtra(data, linesToPrice));
      linesBeingPricedRef.current = [];
    }
    run().catch((e) => {
      console.error(e);
      // Nunca dejamos la linea "resuelta" en $0 en silencio: la marcamos para que se
      // vea en rojo en la tabla y quede bloqueado confirmar hasta que se resuelva.
      const failedIds = linesBeingPricedRef.current;
      linesBeingPricedRef.current = [];
      if (failedIds.length) markLinesPriceError(failedIds);
      toast.error(`No se pudo obtener el precio de Odoo${failedIds.length > 1 ? ` para ${failedIds.length} productos` : ""}. Revisá tu conexión.`);
    });
  }, [pricingContextReady, pricelistId, partnerId, linesKey, lines.length, applyBasePrices, markLinesPriceError, quoteQ.data?.id, quoteId, idParam]);

  function resolveCreatedByRole() {
    if (user?.is_superuser) return "vendedor";
    if (user?.is_vendedor && user?.is_distribuidor) return "vendedor";
    if (user?.is_distribuidor && !user?.is_vendedor) return "distribuidor";
    return "vendedor";
  }
  function withCreatorRole(payload) { return { ...(payload || {}), created_by_role: resolveCreatedByRole() }; }
  // Una vez que el presupuesto ya existe, su rol queda fijo desde que se creo
  // (no debe cambiar segun quien lo este editando ahora); para uno nuevo se usa
  // el rol de la sesion actual.
  function resolveEffectiveRoleForPricing() {
    const savedRole = quoteQ.data?.created_by_role;
    if (savedRole === "vendedor" || savedRole === "distribuidor") return savedRole;
    return resolveCreatedByRole();
  }
  // Solo para Vendedores (nunca Distribuidores) y solo para presupuestos
  // creados desde el corte en adelante: al producto elegido en la seccion
  // "Tipo de portón" (Coplanar 3008 / Clásico 3009) se le suma, sin aparecer
  // como linea aparte, el precio de Odoo del producto 2865 - queda mezclado
  // en el mismo precio por m2 que ya trae ese producto, asi que escala con
  // la superficie del portón igual que el resto del precio.
  // Todo se resuelve dentro del MISMO pedido de precios que ya se hacia
  // (una linea sintetica de mas en el request), sin ningun round-trip ni
  // await extra, para no correr el timing del resto del flujo (secciones
  // dependientes, etc.) ni un pelo respecto de como era antes.
  const SECTION_37_PRODUCT_IDS = [3008, 3009];
  const SECTION_37_EXTRA_PRODUCT_ID = 2865;
  // Corte pedido explicitamente: los presupuestos creados hasta el 14/7/2026
  // (inclusive) tienen que seguir calculando exactamente como en main hoy -
  // esta funcionalidad solo aplica a presupuestos creados desde el 15/7/2026.
  // Para un presupuesto nuevo (sin guardar todavia, sin created_at) se usa la
  // fecha actual, que es la que terminara siendo su created_at real al guardarlo.
  const NEW_PRICING_RULES_CUTOFF_MS = new Date("2026-07-15T00:00:00-03:00").getTime();
  function quoteUsesNewPricingRules() {
    const createdAtRaw = quoteQ.data?.created_at || new Date().toISOString();
    const createdAt = new Date(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) return true;
    return createdAt.getTime() >= NEW_PRICING_RULES_CUTOFF_MS;
  }
  function shouldApplySection37VendorExtra() {
    return resolveEffectiveRoleForPricing() === "vendedor" && quoteUsesNewPricingRules();
  }
  // Red de seguridad: el precio base de Coplanar/Clasico para vendedores tiene que ser
  // SIEMPRE (portón + instalación) para esta lista de precios. Si por lo que sea (cache
  // vieja, race de red, etc) el precio guardado no coincide, bloqueamos guardar/PDF/
  // confirmar en vez de dejar salir un presupuesto mal cotizado en silencio.
  const SECTION_37_EXPECTED_BASE_PRICE = { 3008: 312297.72, 3009: 293211.07 };
  const section37MismatchIds = shouldApplySection37VendorExtra()
    ? new Set(
        lines
          .filter((l) => {
            const expected = SECTION_37_EXPECTED_BASE_PRICE[Number(l.product_id)];
            return expected != null && Math.abs(Number(l.basePrice || 0) - expected) > 0.5;
          })
          .map((l) => Number(l.product_id)),
      )
    : new Set();
  const hasSection37Mismatch = section37MismatchIds.size > 0;
  // sourceLines: lineas reales del presupuesto que se estan pidiendo en esta tanda
  // (siempre tienen product_id, sin importar el formato del pedido de precio de cada
  // llamador) - se usan solo para decidir si corresponde agregar el extra.
  // El precio base de Coplanar/Clasico SIEMPRE lleva sumada la instalacion (vendedores,
  // desde el corte) - si el vendedor TAMBIEN agrega Instalacion como linea propia, esa
  // linea se cobra aparte igual, sin tocarla ni pisarla (es intencional, no un bug).
  // Instalacion (2865) es precio fijo con min_quantity 0 en las 3 listas (verificado por
  // shell de Odoo) - no depende de la cantidad pedida, asi que se pide siempre con qty:1.
  function withSection37ExtraLine(sourceLines, payloadLines) {
    const wireLines = Array.isArray(payloadLines) ? payloadLines : [];
    if (!shouldApplySection37VendorExtra()) return wireLines;
    const srcLines = Array.isArray(sourceLines) ? sourceLines : [];
    const hasSection37Line = srcLines.some((l) => SECTION_37_PRODUCT_IDS.includes(Number(l.product_id)));
    if (!hasSection37Line) return wireLines;
    return [...wireLines, { product_id: SECTION_37_EXTRA_PRODUCT_ID, qty: 1 }];
  }
  function mergeSection37VendorExtra(pricesData) {
    if (!shouldApplySection37VendorExtra()) return pricesData;
    const prices = Array.isArray(pricesData?.prices) ? pricesData.prices : [];
    const extraEntry = prices.find((p) => Number(p.product_id) === SECTION_37_EXTRA_PRODUCT_ID);
    if (!extraEntry) return pricesData;
    const target = prices.find((p) => SECTION_37_PRODUCT_IDS.includes(Number(p.product_id)));
    if (target) target.price = Number(target.price || 0) + Number(extraEntry.price || 0);
    return pricesData;
  }
  function normalizeNoteWithSeller(note) {
    const sellerLabel = String(user?.full_name || user?.username || "").trim();
    const raw = String(note || "").trim();
    if (!sellerLabel) return raw;
    const rows = raw ? raw.split(/\r?\n/).filter(Boolean) : [];
    const filtered = rows.filter((line) => !/^vendedor\s*:/i.test(String(line || "").trim()));
    filtered.push(`Vendedor: ${sellerLabel}`);
    return filtered.join("\n");
  }
  function getDraftPayload(options = {}) {
    const base = buildPayloadForBack() || {};
    const linkedPortonMeta = buildLinkedPortonPayload(linkedPorton, linkedPortonId) || extractLinkedPortonPayloadFromQuote(quoteQ.data);
    let payloadExtra = linkedPortonMeta ? { ...(base.payload || {}), ...linkedPortonMeta } : (base.payload || {});
    if (Object.prototype.hasOwnProperty.call(options, "budgetObservation")) {
      payloadExtra = applyBudgetObservationToPayload(payloadExtra, options.budgetObservation);
    } else {
      const existingBudgetObservation = readBudgetObservationFromPayload(quoteQ.data);
      if (existingBudgetObservation && !readBudgetObservationFromPayload(payloadExtra)) {
        payloadExtra = applyBudgetObservationToPayload(payloadExtra, existingBudgetObservation);
      }
    }
    const nowIso = new Date().toISOString();
    payloadExtra = {
      ...(payloadExtra || {}),
      quote_adjustment_percent_snapshot: quoteAdjustmentPercent,
      financing_percent_snapshot: quoteAdjustmentPercent,
      iva_rate_snapshot: totals.ivaRate,
      pricing_snapshot_at: (payloadExtra || {}).pricing_snapshot_at || nowIso,
    };
    return withCreatorRole({
      ...base,
      catalog_kind: catalogKind,
      linked_porton_quote_id: linkedPortonMeta?.linked_porton_quote_id || undefined,
      fulfillment_mode: base?.fulfillment_mode || linkedPorton?.fulfillment_mode || "acopio",
      payload: payloadExtra,
      note: normalizeNoteWithSeller(base?.note),
    });
  }
  function validateCustomerContact(customer, { requirePhone = false, requireMaps = false, requireCity = false } = {}) {
    const c = customer || {};
    const city = String(c.city || "").trim();
    if (requireCity && !city) throw new Error("Completá la localidad del cliente.");
    const phoneErr = validateArgentinaPhone(c.phone, { required: requirePhone }); if (phoneErr) throw new Error(phoneErr);
    const emailErr = validateEmailAddress(c.email, { required: false }); if (emailErr) throw new Error(emailErr);
    const mapsErr = validateGoogleMapsUrl(c.maps_url, { required: requireMaps }); if (mapsErr) throw new Error(mapsErr);
  }
  function validateDraft(payload) {
    const c = payload?.end_customer || {};
    const errs = [];
    if (!String(c.first_name || "").trim()) errs.push("Completá el nombre del cliente.");
    if (!String(c.last_name || "").trim()) errs.push("Completá el apellido del cliente.");
    if (!String(c.phone || "").trim()) errs.push("Completá el teléfono del cliente.");
    if (!Array.isArray(payload?.lines) || payload.lines.filter((line) => !line.previously_billed_line).length === 0) errs.push("Agregá al menos un producto.");
    if (errs.length) throw new Error(errs[0]);
    validateDimensionsRequired(payload, catalogKind);
    validateCustomerContact(c, { requirePhone: true, requireMaps: false, requireCity: false });
    // Repetido a proposito (tambien esta en validatePricingContextReady): validateDraft
    // es el camino comun de Guardar y de "Actualizar presupuesto", que no siempre pasan
    // por validatePricingContextReady antes de persistir. No puede quedar ninguna via
    // para guardar un precio de Coplanar/Clasico sin la instalacion sumada.
    if (hasSection37Mismatch) throw new Error("El precio de Coplanar/Clásico no tiene la instalación sumada correctamente. Recargá la página (Shift+F5) e intentá de nuevo antes de continuar.");
  }
  function validatePricingContextReady() {
    if (!pricingContextReady) throw new Error(pricingContextMessage || "Esperá a que se aplique la lista de precios correcta antes de continuar.");
    const unresolved = lines.filter((l) => !l.previously_billed_line && !l.manual_price && (l.price_error || l.price_pending));
    if (unresolved.length) throw new Error("Hay productos sin precio confirmado de Odoo. Reintentá antes de confirmar.");
    if (hasSection37Mismatch) throw new Error("El precio de Coplanar/Clásico no tiene la instalación sumada correctamente. Recargá la página (Shift+F5) e intentá de nuevo antes de continuar.");
  }
  function validateConfirm(payload) {
    validatePricingContextReady();
    const c = payload?.end_customer || {};
    const p = payload?.payload || {};
    const errs = [];
    if (!String(c.first_name || "").trim()) errs.push("Completá el nombre del cliente.");
    if (!String(c.last_name || "").trim()) errs.push("Completá el apellido del cliente.");
    if (!String(c.address || "").trim()) errs.push("Completá la dirección del cliente.");
    if (!String(c.city || "").trim()) errs.push("Completá la localidad del cliente.");
    if (!String(p.payment_method || "").trim()) errs.push("Seleccioná la forma de pago.");
    if (normalizedCatalogKind === "porton" && !String(p.porton_type || "").trim()) errs.push("Seleccioná el tipo/sistema del portón.");
    if (String(p.condition_mode || "") === "special" && !String(p.condition_text || "").trim()) errs.push("Completá la condición especial.");
    if (!Array.isArray(payload?.lines) || payload.lines.filter((line) => !line.previously_billed_line).length === 0) errs.push("Agregá al menos un producto.");
    if (errs.length) throw new Error(errs[0]);
    validateDimensionsRequired(payload, catalogKind);
    validateCustomerContact(c, { requirePhone: true, requireMaps: true, requireCity: true });
  }
  function validatePdfDownload(payload) { validateDraft(payload); }

  async function persistDraftForPdf() {
    validatePricingContextReady();
    const payload = getDraftPayload();
    validateDraft(payload);
    if (!quoteId) {
      const created = await createQuote(payload);
      setQuoteMeta({ quoteId: created.id, status: created.status, rejectionNotes: created.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      return { quote: created, payload: { ...payload, id: created.id, quote_id: created.id, quote_number: displayQuoteNumberForKind(catalogKind, created, created.quote_number || ""), seller_name: user?.full_name || user?.username || "", envio_odoo_price_snapshot: created.envio_odoo_price_snapshot } };
    }
    const q = await updateQuote(quoteId, payload);
    setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
    qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
    return { quote: q, payload: { ...payload, id: q.id, quote_id: q.id, quote_number: displayQuoteNumberForKind(catalogKind, q, q.quote_number || ""), seller_name: user?.full_name || user?.username || "", envio_odoo_price_snapshot: q.envio_odoo_price_snapshot } };
  }
  function maybeContinueDoorWorkflow(savedQuote) {
    if (!isDoorWorkflow || !["ipanel", "puerta"].includes(normalizedCatalogKind) || !workflowDoorId) return false;
    const nextUrl = `/puertas/${workflowDoorId}?door_workflow=1&workflow_stage=${encodeURIComponent(workflowStage === "ipanel_first" ? "door_final" : workflowStage)}&ipanel_quote_id=${encodeURIComponent(savedQuote?.id || quoteId || idParam || "")}&porton_id=${encodeURIComponent(workflowPortonId || "")}`;
    navigate(nextUrl);
    return true;
  }
  function handleConfirmIntent() {
    if (isReturnedMeasurementQuote) return;
    try { validatePricingContextReady(); } catch (e) { toast.error(e?.message || "Esperá a que se aplique la lista de precios correcta."); return; }
    if (!isRevisionQuote && user?.is_distribuidor && normalizedCatalogKind === "porton") {
      const currentMapsUrl = normalizeUrl(buildPayloadForBack()?.end_customer?.maps_url);
      const defaultMapsUrl = normalizeUrl(user?.default_maps_url);
      const isUsingDefaultLocation = !!defaultMapsUrl && currentMapsUrl === defaultMapsUrl;
      const alertText = isUsingDefaultLocation ? "Si no actualiza la dirección el producto será entregado en el punto de ubicación predeterminada para su empresa, si no desea cambiarla haga click en aceptar." : "¿Desea cambiar el punto de ubicación donde se entregará el portón?";
      const wantsToContinue = window.confirm(alertText);
      if (!wantsToContinue) { toast("Actualizá dirección, localidad o Maps antes de confirmar."); return; }
    }
    setConfirmBudgetObservation(readBudgetObservationFromPayload(getDraftPayload()));
    setConfirmChoiceOpen(true);
  }

  const autosaveDraftKey = useMemo(() => buildQuoteAutosaveKey({ user, catalogKind: normalizedCatalogKind, quoteId: quoteId || idParam || "new" }), [user, normalizedCatalogKind, quoteId, idParam]);
  const autosaveNewDraftKey = useMemo(() => buildQuoteAutosaveKey({ user, catalogKind: normalizedCatalogKind, quoteId: "new" }), [user, normalizedCatalogKind]);
  const autosaveWatchSignature = useMemo(() => {
    try { return serializeAutosavePayload(getDraftPayload()); } catch (_err) { return ""; }
  }, [catalogKind, normalizedCatalogKind, quoteId, idParam, pricelistId, partnerId, marginPercent, paymentMethod, conditionMode, conditionText, fulfillmentMode, endCustomer, note, portonType, dimensions, lines, linkedPortonId, quoteAdjustmentPercent, totals.ivaRate]);

  useEffect(() => {
    if (idParam || quoteQ.data || autosaveRestoredLocalRef.current) return;
    const local = readAutosaveDraft(autosaveNewDraftKey);
    autosaveRestoredLocalRef.current = true;
    if (!local?.payload) return;
    loadFromQuote({
      id: null,
      status: "draft",
      catalog_kind: normalizedCatalogKind,
      fulfillment_mode: local.payload.fulfillment_mode || "produccion",
      pricelist_id: local.payload.pricelist_id || null,
      end_customer: local.payload.end_customer || {},
      lines: Array.isArray(local.payload.lines) ? local.payload.lines : [],
      payload: local.payload.payload || {},
      note: local.payload.note || null,
    });
    setLinkedPortonId(String(local.extra?.linkedPortonId || local.payload?.payload?.linked_porton_quote_id || "").trim());
    setAutosaveState({ status: "local-restored", message: "Borrador recuperado de este navegador.", savedAt: local.saved_at || "" });
    toast.success("Recuperé un borrador local sin guardar.");
  }, [idParam, quoteQ.data, autosaveNewDraftKey, loadFromQuote, normalizedCatalogKind]);

  async function runAutosaveNow(reason = "auto") {
    let payload;
    try { payload = getDraftPayload(); } catch (_err) { return null; }
    writeAutosaveDraft(autosaveDraftKey, payload, { linkedPortonId, reason });

    if (!hasAutosaveCustomerMinimum(payload)) {
      setAutosaveState({ status: "waiting-minimum", message: "Borrador local. Completá nombre, apellido y teléfono para autoguardar en Mis presupuestos.", savedAt: new Date().toISOString() });
      return null;
    }
    // El autoguardado corre solo, sin pasar por validateDraft - no puede persistir
    // el precio de Coplanar/Clasico sin la instalacion sumada. Se queda como borrador
    // local (ya escrito arriba) hasta que el precio se recalcule bien.
    if (hasSection37Mismatch) {
      setAutosaveState({ status: "waiting-pricing", message: "Borrador local. Verificando el precio de Instalación antes de autoguardar en Mis presupuestos.", savedAt: new Date().toISOString() });
      return null;
    }
    if (!pricingContextReady) {
      setAutosaveState({ status: "waiting-pricing", message: pricingContextMessage || "Borrador local. Esperando lista de precios correcta para autoguardar en Mis presupuestos.", savedAt: new Date().toISOString() });
      return null;
    }
    // pricingContextReady solo indica que la LISTA de precios de Odoo esta lista - los
    // precios de las lineas puntuales del presupuesto se piden aparte (ver el efecto de
    // refresco de precios mas abajo) y puede seguir en curso. Autoguardar en ese momento
    // persistia lineas en $0 al backend; si despues se recargaba la pagina justo en esa
    // ventana, el presupuesto quedaba disponible para imprimir/confirmar con precio $0
    // (ver price_pending en loadFromQuote, domain/quote/store.js).
    const hasLinesAwaitingPrice = lines.some((l) => !l.previously_billed_line && !l.manual_price && (l.price_pending || l.price_error));
    if (hasLinesAwaitingPrice) {
      setAutosaveState({ status: "waiting-pricing", message: "Borrador local. Esperando el precio de Odoo de los productos agregados antes de autoguardar en Mis presupuestos.", savedAt: new Date().toISOString() });
      return null;
    }
    if (!canRemoteAutosaveQuote({ status, fulfillmentMode: payload.fulfillment_mode })) return null;
    if (isRevisionQuote || isReturnedMeasurementQuote || isAcopioRevision || confirmChoiceOpen) return null;

    const signature = serializeAutosavePayload(payload);
    if (autosaveLastRemoteSignatureRef.current === signature || autosaveInFlightRef.current) return null;

    autosaveInFlightRef.current = true;
    setAutosaveState({ status: "saving", message: "Autoguardando...", savedAt: "" });
    try {
      const existingId = quoteId || idParam;
      const saved = existingId ? await updateQuote(existingId, payload) : await createQuote(payload);
      setQuoteMeta({ quoteId: saved.id, status: saved.status, rejectionNotes: saved.rejection_notes });
      autosaveLastRemoteSignatureRef.current = signature;
      const savedAt = new Date().toISOString();
      clearAutosaveDraft(autosaveNewDraftKey);
      writeAutosaveDraft(buildQuoteAutosaveKey({ user, catalogKind: normalizedCatalogKind, quoteId: saved.id }), { ...payload, id: saved.id }, { linkedPortonId, reason: "remote-saved" });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      setAutosaveState({ status: "saved", message: `Autoguardado ${formatAutosaveTime(savedAt)}`, savedAt });
      if (!existingId && saved?.id) navigate(editorRouteForKind(catalogKind, saved.id, location.search || ""), { replace: true });
      return saved;
    } catch (e) {
      const savedAt = new Date().toISOString();
      setAutosaveState({ status: "error", message: `No se pudo autoguardar. Borrador local guardado. ${e?.message || ""}`.trim(), savedAt });
      return null;
    } finally {
      autosaveInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (!autosaveWatchSignature || !user) return undefined;
    let payload = null;
    try { payload = getDraftPayload(); } catch (_err) { return undefined; }
    writeAutosaveDraft(autosaveDraftKey, payload, { linkedPortonId, reason: "local-change" });

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => { runAutosaveNow("debounced"); }, 3000);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    };
  }, [autosaveWatchSignature, autosaveDraftKey, linkedPortonId, user]);

  useEffect(() => {
    function flushAutosave() {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      runAutosaveNow("page-hide");
    }
    function onVisibilityChange() { if (document.visibilityState === "hidden") flushAutosave(); }
    window.addEventListener("pagehide", flushAutosave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushAutosave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [autosaveWatchSignature, autosaveDraftKey, linkedPortonId, quoteId, idParam, status, confirmChoiceOpen]);

  const [priceCheckPending, setPriceCheckPending] = useState(false);
  async function handleSaveClick() {
    if (!pricingContextReady || hasSection37Mismatch || saveM.isPending || priceCheckPending) return;
    const priceLines = lines.filter((l) => (l.catalog_id || l.odoo_template_id) && !l.manual_price && !l.previously_billed_line);
    if (priceLines.length > 0) {
      try {
        setPriceCheckPending(true);
        const pricePayload = {
          pricelist_id: pricelistId,
          partner_id: partnerId,
          lines: withSection37ExtraLine(priceLines, priceLines.map((l) => ({ id: l.id, catalog_id: l.catalog_id, odoo_template_id: l.odoo_template_id, qty: l.qty }))),
        };
        const data = mergeSection37VendorExtra(await getPrices(pricePayload), priceLines);
        const fetchedMap = new Map((data?.prices || []).map((x) => [Number(x.product_id), Number(x.price ?? 0)]));
        const anyChanged = priceLines.some((l) => {
          const fetched = fetchedMap.get(l.product_id);
          return fetched !== undefined && Math.abs(fetched - (l.basePrice || 0)) > 0.001;
        });
        if (anyChanged) {
          applyBasePrices(data);
          toast.error("Los precios se actualizaron porque hubo cambios en la lista desde que abriste la página. Revisá los totales y guardá nuevamente.", { duration: 6000 });
          return;
        }
      } catch {
        // Si falla la verificación, dejamos guardar igual para no bloquear al usuario
      } finally {
        setPriceCheckPending(false);
      }
    }
    saveM.mutate();
  }

  const saveM = useMutation({ mutationFn: async () => { const payload = getDraftPayload(); validateDraft(payload); if (quoteId) return await updateQuote(quoteId, payload); return await createQuote(payload); }, onSuccess: (q) => { setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes }); qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); if (maybeContinueDoorWorkflow(q)) { toast.success("Presupuesto de puerta guardado. Volviendo al panel."); return; } navigate(editorRouteForKind(catalogKind, q.id)); toast.success("Guardado."); }, onError: (e) => toast.error(e?.message || "No se pudo guardar") });

  const confirmM = useMutation({
    mutationFn: async (variables) => {
      const chosenMode = String(variables?.fulfillmentMode || buildPayloadForBack()?.fulfillment_mode || "acopio").trim();
      const payloadOptions = Object.prototype.hasOwnProperty.call(variables || {}, "budgetObservation")
        ? { budgetObservation: variables?.budgetObservation }
        : {};
      const payload = { ...getDraftPayload(payloadOptions), catalog_kind: catalogKind, fulfillment_mode: chosenMode };
      validateConfirm(payload);
      let id = quoteId || idParam;
      if (id) await updateQuote(id, payload); else { const created = await createQuote(payload); id = created.id; setQuoteMeta({ quoteId: created.id, status: created.status, rejectionNotes: created.rejection_notes }); }
      if (isRevisionQuote) return await submitFinalQuote(id);
      return await confirmQuote(id, { fulfillment_mode: chosenMode });
    },
    onSuccess: async (q) => { setConfirmChoiceOpen(false); setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes }); qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); if (maybeContinueDoorWorkflow(q)) { toast.success("Presupuesto de puerta confirmado. Volviendo al panel."); return; } navigate(`/presupuestos/${q.id}`); toast.success(isRevisionQuote ? "Cotización final enviada a Odoo." : "Presupuesto confirmado."); },
    onError: (e) => toast.error(e?.message || (isRevisionQuote ? "No se pudo enviar la cotización final" : "No se pudo confirmar")),
  });

  const resetReturnedM = useMutation({ mutationFn: async () => { if (!quoteId) throw new Error("Quote inválida"); return await resetReturnedMeasurementQuote(quoteId); }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["quote", quoteId] }); toast.success("Se restablecieron los productos originales del presupuesto."); }, onError: (e) => toast.error(e?.message || "No se pudo restablecer") });
  const confirmReturnedM = useMutation({ mutationFn: async () => { const payload = getDraftPayload(); validateConfirm(payload); if (!quoteId) throw new Error("Quote inválida"); await updateQuote(quoteId, payload); return await confirmReturnedMeasurementQuote(quoteId); }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["quote", quoteId] }); await qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); navigate("/menu", { replace: true }); toast.success("Se envió a Comercial para su aprobación."); }, onError: (e) => toast.error(e?.message || "No se pudo enviar a Comercial") });

  function resolveRefreshPricelist() {
    const assignedPricelistId = getAssignedPricelistIdFromUser(user);
    if (assignedPricelistId) {
      const assigned = (pricelistsQ.data || []).find((pl) => Number(pl?.id) === assignedPricelistId);
      return assigned || { id: assignedPricelistId, name: `Lista asignada ${assignedPricelistId}` };
    }
    const currentId = Number(pricelistId || 0);
    if (Number.isFinite(currentId) && currentId > 0) {
      const current = (pricelistsQ.data || []).find((pl) => Number(pl?.id) === currentId);
      return current || { id: currentId, name: `Lista ${currentId}` };
    }
    return (pricelistsQ.data || [])[0] || null;
  }

  const refreshQuoteM = useMutation({
    mutationFn: async () => {
      const ok = window.confirm(
        "Los valores del presupuesto se sobrescribirán con la lista de precios actual. ¿Deseás continuar?",
      );
      if (!ok) return null;

      // Si el presupuesto todavia no se guardo (nuevo, sin id), lo creamos primero para poder
      // actualizarlo despues. Sin esto, un presupuesto nuevo nunca podia forzar el precio en
      // vivo de Odoo y se quedaba con lo que hubiera en la cache local.
      let id = quoteId || idParam;
      if (!id) {
        const draftPayload = getDraftPayload();
        validateDraft(draftPayload);
        const created = await createQuote(draftPayload);
        id = created.id;
        setQuoteMeta({ quoteId: created.id, status: created.status, rejectionNotes: created.rejection_notes });
      }

      // Presupuestos viejos por vano (antes del calculo automatico) pueden haber quedado sin ancho/alto
      // cargado. No los recalculamos solo por abrirlos (ver PortonDimensions.jsx), pero si el usuario pide
      // "Actualizar presupuesto" activamos ahora el flag para que se calculen y no quede bloqueado sin poder
      // guardarse. El await de getPrices de mas abajo le da tiempo a React a aplicar el calculo antes de
      // armar el payload.
      const currentDimensions = useQuoteStore.getState().dimensions || {};
      const hasVanoMeasures = !!(currentDimensions.vano_width || currentDimensions.vano_height || currentDimensions.porton_measure_source === "vano");
      const missingStoredSize = !(Number(currentDimensions.width) > 0) || !(Number(currentDimensions.height) > 0);
      if (catalogKind === "porton" && hasVanoMeasures && missingStoredSize && !currentDimensions.vano_size_auto_calc) {
        useQuoteStore.setState({ dimensions: { ...currentDimensions, vano_size_auto_calc: true } });
      }

      const refreshPricelist = resolveRefreshPricelist();
      const refreshPricelistId = Number(refreshPricelist?.id || 0);
      if (!refreshPricelistId) throw new Error("No se pudo resolver la lista de precios actual.");

      const currentLines = useQuoteStore.getState().lines || [];
      if (!currentLines.filter((line) => !line?.previously_billed_line).length) {
        throw new Error("Agregá al menos un producto para actualizar precios.");
      }

      const pricesPayload = {
        pricelist_id: refreshPricelistId,
        partner_id: partnerId,
        // withSection37ExtraLine agrega la linea sintetica de Instalacion si corresponde
        // (vendedor + Coplanar/Clasico) - sin esto, "Actualizar presupuesto" pisaba el
        // precio base con el del portón solo, sin la instalacion sumada.
        lines: withSection37ExtraLine(currentLines, buildPriceRefreshLines(currentLines)),
        // "Actualizar presupuesto" tiene que traer el precio real de Odoo, no la cache
        // local de precios (dura 12hs) que usa el resto del cotizador.
        force: true,
      };
      const prices = mergeSection37VendorExtra(await getPrices(pricesPayload));
      const refreshedLines = mergeUpdatedBasePrices(currentLines, prices);

      setPricelist(refreshPricelist);
      useQuoteStore.setState({ lines: refreshedLines });

      const issuedAt = new Date().toISOString();
      const currentAdjustmentPercent = resolveQuoteAdjustmentPercent(financingPercent, conditionMode);
      const payload = getDraftPayload();
      payload.pricelist_id = refreshPricelistId;
      payload.refresh_emission_date = true;
      payload.payload = {
        ...(payload.payload || {}),
        quote_issued_at: issuedAt,
        quote_issued_date: todayIsoDate(),
        price_refreshed_at: issuedAt,
        refreshed_pricelist_id: refreshPricelistId,
        quote_adjustment_percent_snapshot: currentAdjustmentPercent,
        financing_percent_snapshot: currentAdjustmentPercent,
        iva_rate_snapshot: resolveQuoteIvaRate(ivaRate, conditionMode),
        pricing_snapshot_at: issuedAt,
      };
      validateDraft(payload);
      return await updateQuote(id, payload);
    },
    onSuccess: async (q) => {
      if (!q) return;
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      loadFromQuote(q);
      await qc.invalidateQueries({ queryKey: ["quote", q.id] });
      await qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      toast.success("Presupuesto actualizado con fecha y lista de precios actual.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo actualizar el presupuesto"),
  });

  async function getLatestProductionPlanning() {
    try {
      return await getProductionPlanningEstimate({
        quoteId: productionPlanningQuoteId || null,
        fromDate: productionPlanningFromDate || null,
      });
    } catch {
      return productionDelivery || null;
    }
  }

  const onDownloadPresupuesto = async () => {
    try {
      const { payload } = await persistDraftForPdf();
      validatePdfDownload(payload);
      const latestProductionPlanning = await getLatestProductionPlanning();
      const pdfPayload = buildPdfPayloadForDownload(
        payload,
        quoteAdjustmentPercent,
        latestProductionPlanning ? { production_planning: latestProductionPlanning } : {},
      );
      console.log("[PDF FRONT] payload completo presupuesto", pdfPayload);
      console.log("[PDF FRONT] lineas presupuesto", summarizeLinesForDebug(pdfPayload?.lines || []));
      await downloadPresupuestoPdf(pdfPayload);
    } catch (e) { toast.error(e?.response?.data?.error || e.message); }
  };
  const onDownloadProforma = async () => {
    try {
      const { payload } = await persistDraftForPdf();
      validatePdfDownload(payload);
      const latestProductionPlanning = await getLatestProductionPlanning();
      const pdfPayload = buildPdfPayloadForDownload(
        payload,
        quoteAdjustmentPercent,
        latestProductionPlanning ? { production_planning: latestProductionPlanning } : {},
        { stripMarginPercent: true, zeroShippingForDistributor: true },
      );
      console.log("[PDF FRONT] payload completo proforma", pdfPayload);
      console.log("[PDF FRONT] lineas proforma", summarizeLinesForDebug(pdfPayload?.lines || []));
      await downloadProformaPdf(pdfPayload);
    } catch (e) { toast.error(e?.response?.data?.error || e.message); }
  };

  function handleClearBudget() {
    const ok = window.confirm(
      "Esto limpia el formulario actual y borra los borradores locales de autoguardado de este navegador. No elimina presupuestos ya guardados en Mis presupuestos. ¿Continuar?",
    );
    if (!ok) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    clearAllAutosaveDrafts();
    autosaveLastRemoteSignatureRef.current = "";
    autosaveInFlightRef.current = false;
    autosaveRestoredLocalRef.current = true;
    reset();
    setLinkedPortonId(initialLinkedPortonId || "");
    setPortonSearch("");
    setConfirmChoiceOpen(false);
    setConfirmBudgetObservation("");
    setAutosaveState({ status: "cleared", message: "Presupuesto limpio. Autoguardado local borrado.", savedAt: new Date().toISOString() });
    toast.success("Presupuesto limpio. Autoguardado local borrado.");

    if (quoteId || idParam) {
      navigate(newEditorRouteForKind(normalizedCatalogKind, location.search || ""), { replace: true });
    }
  }

  const canConfirm = isAcopioRevision ? false : (isReturnedMeasurementQuote ? false : (isRevisionQuote ? ["", "draft", "rejected"].includes(finalStatus || "") : ["draft", "rejected_commercial", "rejected_technical"].includes(status)));
  const canRefreshSavedQuote = !isRevisionQuote
    && !isReturnedMeasurementQuote
    && ["draft", "rejected_commercial", "rejected_technical"].includes(String(status || ""));

  return (
    <div className="container" style={{ maxWidth: "100%", width: "100%" }}>
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img className="product-logo" src={catalogKind === "ipanel" ? "/brands/ipanel.png" : "/brands/degrandis.png"} alt={catalogKindDisplayName(catalogKind)} />
          <div>
            <h2 style={{ margin: 0 }}>{visibleQuoteNumber ? `${isRevisionQuote ? "Ajuste" : "Presupuesto"} #${visibleQuoteNumber}` : "Nuevo presupuesto"}</h2>
            <div className="muted">Estado: <b>{visibleStatusLabel}</b>{isRevisionQuote && quoteQ.data?.parent_quote_id ? <> · Ref. original: <b>{visibleParentQuoteNumber || "—"}</b></> : null}</div>
            {autosaveState.message ? <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{autosaveState.message}</div> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {hasSection37Mismatch ? (
            <div style={{ width: "100%", color: "#b3261e", fontWeight: 700, fontSize: 13, textAlign: "right" }}>
              ⚠ El precio de Coplanar/Clásico no tiene la instalación sumada correctamente. Recargá la página (Shift+F5) antes de guardar, generar PDF o confirmar.
            </div>
          ) : null}
          <Button variant="ghost" onClick={handleClearBudget}>Limpiar presupuesto</Button>
          <Button variant="secondary" onClick={onDownloadPresupuesto} disabled={!pricingContextReady || hasSection37Mismatch}>PDF presupuesto</Button>
          {user?.is_distribuidor ? <Button variant="secondary" onClick={onDownloadProforma} disabled={!pricingContextReady || hasSection37Mismatch}>PDF proforma</Button> : null}
          <Button onClick={handleSaveClick} disabled={saveM.isPending || priceCheckPending || !pricingContextReady || hasSection37Mismatch}>{saveM.isPending ? "Guardando..." : priceCheckPending ? "Verificando precios..." : "Guardar"}</Button>
          {isReturnedMeasurementQuote ? (
            <>
              <Button variant="ghost" onClick={() => resetReturnedM.mutate()} disabled={resetReturnedM.isPending || confirmReturnedM.isPending}>{resetReturnedM.isPending ? "Restableciendo..." : "Restablecer al original"}</Button>
              <Button variant="primary" onClick={() => confirmReturnedM.mutate()} disabled={confirmReturnedM.isPending || resetReturnedM.isPending || !pricingContextReady || hasSection37Mismatch}>{confirmReturnedM.isPending ? "Enviando..." : "Confirmar y enviar a Comercial"}</Button>
            </>
          ) : (!isAcopioRevision ? (<Button variant="primary" onClick={() => { if (isRevisionQuote) { confirmM.mutate({}); return; } handleConfirmIntent(); }} disabled={!canConfirm || confirmM.isPending || !pricingContextReady || hasSection37Mismatch}>{confirmM.isPending ? "Confirmando..." : (isRevisionQuote ? "Enviar cotización final" : "Confirmar presupuesto")}</Button>) : null)}
        </div>
      </div>

      {!pricingContextReady ? (
        <><div className="spacer" /><div className="card" style={{ background: pricesError ? "#fdecea" : "#fff8e1", border: pricesError ? "1px solid #e5a8a1" : "1px solid #f2d08a" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{pricesError ? "No se pudieron cargar los precios" : "Preparando lista de precios"}</div>
          <div className="muted">{pricingContextMessage || "Esperá unos segundos antes de seleccionar productos o confirmar. Esto evita presupuestar con una lista incorrecta."}</div>
          {pricesError ? (
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" onClick={retryLoadPrices}>Reintentar</Button>
            </div>
          ) : null}
        </div></>
      ) : null}

      {isReturnedMeasurementQuote ? (
        <><div className="spacer" /><div className="card" style={{ background: "#fff8f3", border: "1px solid #f2d3bf" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Presupuesto devuelto desde medición / datos técnicos</div>
          <div className="muted" style={{ marginBottom: 8 }}>{returnedMeasurementReason || "El medidor o técnica devolvió este portón para que ajustes el presupuesto antes de continuar."}</div>
          {returnedMeasurementForced ? <div className="muted">Este caso quedó bloqueado por superficie final mayor a la presupuestada fuera de tolerancia. Después de ajustar, usá <b>Confirmar y enviar a Comercial</b>.</div> : <div className="muted">Podés ajustar los ítems del presupuesto. El ítem <b>Facturado previamente</b> queda visible para calcular la diferencia. Cuando termines, usá <b>Confirmar y enviar a Comercial</b>.</div>}
          <div className="muted" style={{ marginTop: 4 }}>Antes de volver a Técnica, Comercial tiene que aprobar el presupuesto ajustado.</div>
        </div></>
      ) : null}

      {isAcopioRevision ? (<><div className="spacer" /><div className="card" style={{ background: "#fff8f3", border: "1px solid #f2d3bf" }}><div style={{ fontWeight: 900, marginBottom: 6 }}>Ajuste de presupuesto en Acopio</div><div className="muted">Este ajuste no se envía desde acá. Guardá los cambios y luego usá <b>Solicitar paso a Producción</b> desde <b>Mis presupuestos</b>. Cuando Comercial y Técnica aprueben ese paso, el sistema enviará la venta final a Odoo.</div></div></>) : null}

      {canLinkToPorton ? (
        <>
          <div className="spacer" />
          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Vincular a portón existente</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              Opcional. Si elegís un portón, {catalogKindLinkedObjectLabel(normalizedCatalogKind)} copia los datos del cliente y usa el mismo número con prefijo <b>{catalogKindShortReferencePrefix(normalizedCatalogKind)}</b>: {catalogKindOdooReferenceLabel(normalizedCatalogKind)}.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(260px, 1.4fr)", gap: 10, alignItems: "end" }}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>Buscar portón</div>
                <input
                  value={portonSearch}
                  onChange={(e) => setPortonSearch(e.target.value)}
                  placeholder="Buscar por presupuesto, NP, NV, cliente, teléfono o localidad..."
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
                />
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Presupuesto / NP / NV de portón {portonSearch ? `(${filteredPortonQuotes.length} resultado${filteredPortonQuotes.length === 1 ? "" : "s"})` : ""}
                </div>
                <select value={linkedPortonId} onChange={(e) => applyLinkedPortonData(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
                  <option value="">Sin portón vinculado</option>
                  {filteredPortonQuotes.map((q) => (
                    <option key={q.id} value={q.id}>{quoteDisplayReference(q)} · {q?.end_customer?.name || [q?.end_customer?.first_name, q?.end_customer?.last_name].filter(Boolean).join(" ") || "Sin cliente"} · {q?.status || "draft"}</option>
                  ))}
                </select>
              </div>
            </div>
            {linkedPortonId ? (
              <div className="muted" style={{ marginTop: 8 }}>
                Número vinculado: <b>{linkedPortonDisplayReference || "—"}</b>. En Odoo saldrá como <b>{catalogKindOdooReferenceLabel(normalizedCatalogKind)}</b>.
              </div>
            ) : null}
            {portonSearch && !filteredPortonQuotes.length ? (
              <div className="muted" style={{ marginTop: 8 }}>No se encontraron portones con esa búsqueda.</div>
            ) : null}
          </div>
        </>
      ) : null}

      {normalizedCatalogKind === "porton" ? (
        <>
          <div className="spacer" />
          <div className="card" style={{ background: "#f7fbff", border: "1px solid #d9e5f7" }}>
            <div style={{ fontWeight: 900, marginBottom: 8, color: "#111827" }}>Entrega estimada</div>
            <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.25, color: "#111827" }}>
              {productionDelivery
                ? formatProductionDeliveryDisplay(productionDelivery)
                : (productionDeliveryQ.isLoading
                  ? "Calculando disponibilidad de producción..."
                  : "No hay planificación de producción cargada para estimar la entrega.")}
            </div>
            {productionDeliveryQ.isError ? (
              <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{productionDeliveryQ.error.message}</div>
            ) : null}
          </div>
        </>
      ) : null}

      {!isRevisionQuote && !isReturnedMeasurementQuote && confirmChoiceOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }} onClick={() => { if (!confirmM.isPending) setConfirmChoiceOpen(false); }}>
          <div className="card" style={{ width: "100%", maxWidth: 880, background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 6 }}>Elegí el destino del presupuesto</div>
            <div className="muted" style={{ marginBottom: 18 }}>Esta decisión cambia cómo sigue el circuito del portón después de confirmar.</div>
            <div style={{ border: "1px solid #f2d08a", background: "#fff8e1", borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Observación del presupuesto / NP / NV</div>
              <div className="muted" style={{ marginBottom: 8 }}>Opcional. Este comentario queda guardado en el presupuesto y visible para Comercial y Técnica.</div>
              <textarea
                value={confirmBudgetObservation}
                onChange={(e) => setConfirmBudgetObservation(e.target.value)}
                placeholder="Escribí una observación para esta confirmación..."
                style={{ width: "100%", minHeight: 78, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", outline: "none", resize: "vertical" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              <div style={{ border: "1px solid #d9e5f7", background: "#f7fbff", borderRadius: 14, padding: 16 }}><div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Acopio</div><div className="muted" style={{ marginBottom: 14 }}>El portón queda en espera. Se podrá seguir gestionando desde <b>Acopio → Producción</b> y mantiene una instancia de edición.</div><Button onClick={() => confirmM.mutate({ fulfillmentMode: "acopio", budgetObservation: confirmBudgetObservation })} disabled={confirmM.isPending || !pricingContextReady || hasSection37Mismatch}>{confirmM.isPending ? "Confirmando..." : "Confirmar en Acopio"}</Button></div>
              <div style={{ border: "1px solid #f2d3bf", background: "#fff8f3", borderRadius: 14, padding: 16 }}><div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Producción</div><div className="muted" style={{ marginBottom: 14 }}>El portón entra directo en circuito productivo. Ya no podrá editarse desde <b>Presupuestos</b>.</div><Button variant="primary" onClick={() => confirmM.mutate({ fulfillmentMode: "produccion", budgetObservation: confirmBudgetObservation })} disabled={confirmM.isPending || !pricingContextReady || hasSection37Mismatch}>{confirmM.isPending ? "Confirmando..." : "Confirmar en Producción"}</Button></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><Button variant="ghost" onClick={() => setConfirmChoiceOpen(false)} disabled={confirmM.isPending}>Cancelar</Button></div>
          </div>
        </div>
      )}

      <div className="spacer" />
      <HeaderBar showMargin />

      {!["otros", "puerta"].includes(normalizedCatalogKind) ? (
        <>
          <div className="spacer" />
          <div className="card">
            <PortonDimensions kind={catalogKind} />
          </div>
        </>
      ) : null}

      <div className="spacer" />
      <div className="row quote-row">
        <div className="card" style={{ flex: 1, minWidth: 340 }}>
          {pricingContextReady ? (
            <SectionCatalog kind={catalogKind} onDownloadPresupuesto={onDownloadPresupuesto} />
          ) : (
            <div style={{ border: "1px dashed #f2d08a", background: "#fffdf2", borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Catálogo bloqueado momentáneamente</div>
              <div className="muted">{pricingContextMessage || "La app está resolviendo la lista de precios correcta."}</div>
            </div>
          )}
        </div>
        <div className="card" style={{ flex: 2, minWidth: 560 }}>
          <LinesTable financingPercent={quoteAdjustmentPercent} section37MismatchIds={section37MismatchIds} />
          <div className="spacer" />
          <SummaryBox totals={totals} paymentMethod={paymentMethod} />
          {canRefreshSavedQuote ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <Button
                variant="secondary"
                disabled={refreshQuoteM.isPending}
                onClick={() => refreshQuoteM.mutate()}
              >
                {refreshQuoteM.isPending ? "Actualizando..." : "Actualizar presupuesto"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {(saveM.isError || confirmM.isError || resetReturnedM.isError || confirmReturnedM.isError) && <div className="spacer" />}
      {saveM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{saveM.error.message}</div>}
      {confirmM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{confirmM.error.message}</div>}
      {resetReturnedM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{resetReturnedM.error.message}</div>}
      {confirmReturnedM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{confirmReturnedM.error.message}</div>}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";

import { getPricelists, getPrices, getFinancingPreview } from "../../api/odoo";
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
import { calcTotals, resolveQuoteAdjustmentPercent } from "../../domain/quote/pricing";
import { validateArgentinaPhone, validateEmailAddress, validateGoogleMapsUrl } from "../../utils/contactValidation.js";

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
const IPANEL_WIDTH_MAX_M = 1.13;
const IPANEL_HEIGHT_MAX_M = 2.45;
const IPANEL_LAMAS_WIDTH_MAX_M = 2;
const IPANEL_LAMAS_HEIGHT_MAX_M = 3;
const IPANEL_LAMAS_PRODUCT_ID = 3974;
const IPANEL_LAMAS_ODOO_ID = 3503;
const IPANEL_NON_LAMAS_PLEGADO_PRODUCT_IDS = [4036, 3973];
const REBAJE_AUTO_PRODUCT_ID = 2903;
const REBAJE_AUTO_PRODUCT_NAME = "PLANCHUELA LATERAL E INFERIOR DE 40MM (Apto aluminio - Otros)";
const REBAJE_AUTO_PRODUCT_BASE_PRICE = 400;
const REBAJE_AUTO_MIN_WIDTH_M = 3.5;
const PREVIOUSLY_BILLED_PRODUCT_ID = -900001;

function normalizeCatalogKind(kind) { return String(kind || "porton").toLowerCase().trim(); }
function normalizeUrl(value) { return String(value || "").trim().replace(/\/+$/, "").toLowerCase(); }
function editorRouteForKind(kind, id, search = "") { const safeId = String(id || "").trim(); const suffix = search || ""; const normalizedKind = normalizeCatalogKind(kind); if (normalizedKind === "ipanel") return `/cotizador/ipanel/${safeId}${suffix}`; if (normalizedKind === "otros") return `/cotizador/otros/${safeId}${suffix}`; if (normalizedKind === "puerta") return `/cotizador/puerta/${safeId}${suffix}`; return `/cotizador/${safeId}${suffix}`; }
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
function isIpanelExtendedLamasDimensions(dimensions = {}) {
  const width = parseNum(dimensions?.width);
  const height = parseNum(dimensions?.height);
  if (!(width > 0) || !(height > 0)) return false;
  const exceedsNormalLimit = width > IPANEL_WIDTH_MAX_M || height > IPANEL_HEIGHT_MAX_M;
  const withinLamasLimit = width <= IPANEL_LAMAS_WIDTH_MAX_M && height <= IPANEL_LAMAS_HEIGHT_MAX_M;
  return exceedsNormalLimit && withinLamasLimit;
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
      const normalized = normalizeUiText(text);
      const isLamas = /ID Presupuestador:\s*3974\b/i.test(text) || /ID Odoo:\s*3503\b/i.test(text) || normalized.includes("revestimiento en lamas");
      card.style.display = enabled && !isLamas ? "none" : "";
    }

    const meta = item.querySelector(".dg-acc-meta");
    if (meta) {
      if (enabled) {
        const selectedPart = String(meta.textContent || "Sin selección").split("·")[0].trim() || "Sin selección";
        meta.textContent = `${selectedPart} · 1`;
      } else {
        meta.textContent = meta.textContent;
      }
    }
  }
}
function getAssignedPricelistIdFromUser(user) {
  const n = Number(user?.odoo_pricelist_id || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
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
    if (!next) return line;
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
  const title = Array.from(document.querySelectorAll("div")).find((node) => node.textContent?.trim() === "Medidas del porton");
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
  const widthOk = width === null || width <= IPANEL_LAMAS_WIDTH_MAX_M;
  const heightOk = height === null || height <= IPANEL_LAMAS_HEIGHT_MAX_M;
  const mustUseLamas = isIpanelExtendedLamasDimensions(dimensions);
  const allOk = widthOk && heightOk;

  const helperNodes = Array.from(root.querySelectorAll("*"));
  for (const node of helperNodes) {
    const text = String(node.textContent || "").trim();
    if (/^Maximo\s+1\.13\s*m/i.test(text)) {
      node.textContent = mustUseLamas ? "Máximo 2.00 m sólo en Revestimiento en lamas" : "Máximo 1.13 m (113 cm). En lamas hasta 2.00 m";
      if (widthOk) node.style.color = "#6b7280";
    }
    if (/^Maximo\s+2\.45\s*m/i.test(text)) {
      node.textContent = mustUseLamas ? "Máximo 3.00 m sólo en Revestimiento en lamas" : "Máximo 2.45 m (245 cm). En lamas hasta 3.00 m";
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
        const rawBase = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
        const financedBase = Math.round(rawBase * factor * 100) / 100;
        return { ...line, basePrice: financedBase, base_price: financedBase, price: financedBase };
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
  const itemLabel = normalizedKind === "ipanel" ? "Ipanel" : (normalizedKind === "puerta" ? "puerta" : "portón");

  if (!(width > 0)) throw new Error(`Completá el ancho del ${itemLabel}.`);
  if (!(height > 0)) throw new Error(`Completá el alto del ${itemLabel}.`);

  if (normalizedKind === "porton") {
    if (width < WIDTH_MIN_M || width > WIDTH_MAX_M) throw new Error("El ancho debe estar entre 2.3 m y 7 m.");
    if (height < HEIGHT_MIN_M || height > HEIGHT_MAX_M) throw new Error("El alto debe estar entre 2 m y 3 m.");
  }

  if (normalizedKind === "ipanel") {
    if (width > IPANEL_LAMAS_WIDTH_MAX_M) throw new Error("El ancho del Ipanel no puede superar 2.00 m. Entre 1.13 m y 2.00 m sólo se puede producir en lamas.");
    if (height > IPANEL_LAMAS_HEIGHT_MAX_M) throw new Error("El alto del Ipanel no puede superar 3.00 m. Entre 2.45 m y 3.00 m sólo se puede producir en lamas.");

    if (isIpanelExtendedLamasDimensions(dims)) {
      if (!hasIpanelLamasProduct(payload)) {
        throw new Error("Las medidas ingresadas sólo son posibles en Revestimiento en lamas. En Tipo de plegado elegí Revestimiento en lamas.");
      }
      return;
    }

    if (width > IPANEL_WIDTH_MAX_M) throw new Error("El ancho del Ipanel no puede superar 1.13 m (113 cm), salvo en Revestimiento en lamas hasta 2.00 m.");
    if (height > IPANEL_HEIGHT_MAX_M) throw new Error("El alto del Ipanel no puede superar 2.45 m (245 cm), salvo en Revestimiento en lamas hasta 3.00 m.");
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
  const reference = linkedPortonReferenceLabel(linkedPorton);
  return {
    linked_porton_quote_id: linkedPorton?.id || linkedPortonId,
    linked_porton_quote_number: linkedPorton?.quote_number || "",
    linked_porton_reference: reference,
    linked_porton_odoo_sale_order_name: linkedPorton?.odoo_sale_order_name || "",
    linked_porton_final_sale_order_name: linkedPorton?.final_sale_order_name || "",
    linked_porton_reference_core: extractReferenceCore(reference || linkedPorton?.quote_number || ""),
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
  const core = extractReferenceCore(p.linked_porton_reference || p.linked_porton_odoo_sale_order_name || p.linked_porton_final_sale_order_name || p.linked_porton_quote_number || p.linked_porton_reference_core || "");
  if (!core) return "";
  const normalizedKind = normalizeCatalogKind(kind);
  if (normalizedKind === "ipanel") return `INP${core}`;
  if (normalizedKind === "otros") return `ONP${core}`;
  if (normalizedKind === "puerta") return `PNP${core}`;
  return `NP${core}`;
}

function buildSubQuoteDisplayReference(kind, linkedPorton) {
  const normalizedKind = normalizeCatalogKind(kind);
  const reference = linkedPortonReferenceLabel(linkedPorton);
  const core = extractReferenceCore(reference || linkedPorton?.quote_number || "");
  if (!core) return "";
  if (normalizedKind === "ipanel") return `INP${core}`;
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
  const canLinkToPorton = ["ipanel", "otros"].includes(normalizedCatalogKind);

  const {
    quoteId,
    status,
    pricelistId,
    marginPercent,
    partnerId,
    paymentMethod,
    conditionMode,
    lines,
    dimensions,
    setPricelist,
    setPartnerId,
    setFulfillmentMode,
    setNote,
    applyBasePrices,
    loadFromQuote,
    reset,
    setEndCustomer,
    buildPayloadForBack,
    setQuoteMeta,
    addLine,
    forceRemoveLine,
  } = useQuoteStore();
  const [ivaRate] = useState(IVA_RATE_DEFAULT);
  const [confirmChoiceOpen, setConfirmChoiceOpen] = useState(false);
  const ipanelLamasAlertShownRef = useRef(false);
  const [linkedPortonId, setLinkedPortonId] = useState("");
  const [portonSearch, setPortonSearch] = useState("");

  useEffect(() => {
    if (!idParam) {
      reset();
      setLinkedPortonId(initialLinkedPortonId || "");
      setPortonSearch("");
      if (user?.default_maps_url) setEndCustomer({ maps_url: user.default_maps_url });
    }
  }, [idParam, reset, user?.default_maps_url, setEndCustomer, initialLinkedPortonId]);

  const pricelistsQ = useQuery({ queryKey: ["pricelists"], queryFn: getPricelists });
  useEffect(() => {
    if (pricelistId || !pricelistsQ.data?.length) return;
    const assignedPricelistId = getAssignedPricelistIdFromUser(user);
    if (user?.is_distribuidor && assignedPricelistId) {
      const assigned = pricelistsQ.data.find((pl) => Number(pl?.id) === assignedPricelistId);
      setPricelist(assigned || { id: assignedPricelistId, name: `Lista asignada ${assignedPricelistId}` });
      return;
    }
    setPricelist(pricelistsQ.data[0]);
  }, [pricelistId, pricelistsQ.data, setPricelist, user?.is_distribuidor, user?.odoo_pricelist_id]);
  useEffect(() => {
    if (!user?.is_distribuidor || !user?.odoo_partner_id || partnerId) return;
    setPartnerId(user.odoo_partner_id);
  }, [partnerId, setPartnerId, user?.is_distribuidor, user?.odoo_partner_id]);

  const quoteQ = useQuery({ queryKey: ["quote", idParam], queryFn: () => getQuote(idParam), enabled: !!idParam });
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
    if (label) setNote((normalizedCatalogKind === "ipanel" ? "Ipanel" : "Otros") + ` vinculado al portón ${linkedPortonReferenceLabel(linked) || linked.quote_number || linked.id}`);
    toast.success(`${normalizedCatalogKind === "ipanel" ? "Ipanel" : "Otros"} vinculado al portón.`);
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

      if (!ipanelLamasAlertShownRef.current) {
        window.alert("Las medidas ingresadas sólo es posible producirlas en lamas. En Tipo de plegado sólo quedará disponible Revestimiento en lamas.");
        ipanelLamasAlertShownRef.current = true;
      }
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
  const quoteAdjustmentPercent = useMemo(
    () => resolveQuoteAdjustmentPercent(financingPercent, conditionMode),
    [financingPercent, conditionMode],
  );
  const totals = useMemo(() => calcTotals(lines, marginPercent, ivaRate, quoteAdjustmentPercent), [lines, marginPercent, ivaRate, quoteAdjustmentPercent]);
  const linesKey = useMemo(
    () => lines.map((l) => `${l.product_id}:${resolveLinePricingProductId(l)}:${l.odoo_template_id || ""}:${l.qty}`).join("|"),
    [lines],
  );

  const currentWidthMeters = parseNum(dimensions?.width);
  const autoRebajeEnabled = normalizedCatalogKind === "porton"
    && !user?.is_distribuidor
    && !!(user?.is_vendedor || user?.is_enc_comercial)
    && currentWidthMeters >= REBAJE_AUTO_MIN_WIDTH_M;
  const rebajeLine = useMemo(
    () => (Array.isArray(lines) ? lines.find((line) => Number(line?.product_id) === REBAJE_AUTO_PRODUCT_ID && !line?.previously_billed_line) : null) || null,
    [lines],
  );

  useEffect(() => {
    const hasRebajeLine = !!rebajeLine;
    if (!autoRebajeEnabled) {
      if (hasRebajeLine) {
        forceRemoveLine(REBAJE_AUTO_PRODUCT_ID);
      }
      return;
    }
    if (rebajeLine?.surface_quantity) return;
    if (hasRebajeLine) {
      forceRemoveLine(REBAJE_AUTO_PRODUCT_ID);
    }
    addLine({
      id: REBAJE_AUTO_PRODUCT_ID,
      name: REBAJE_AUTO_PRODUCT_NAME,
      raw_name: REBAJE_AUTO_PRODUCT_NAME,
      price: REBAJE_AUTO_PRODUCT_BASE_PRICE,
      uses_surface_quantity: true,
    });
  }, [autoRebajeEnabled, rebajeLine, addLine, forceRemoveLine]);

  useEffect(() => {
    async function run() {
      if (!pricelistId || !lines.length) return;
      const payload = {
        pricelist_id: pricelistId,
        partner_id: partnerId,
        lines: lines
          .filter((line) => !line.previously_billed_line)
          .map((l) => ({
            product_id: resolveLinePricingProductId(l),
            source_product_id: l.product_id,
            odoo_template_id: l.odoo_template_id || null,
            qty: l.qty,
          })),
      };
      const data = await getPrices(payload);
      applyBasePrices(data);
    }
    run().catch(console.error);
  }, [pricelistId, partnerId, linesKey, lines.length, applyBasePrices]);

  function resolveCreatedByRole() {
    if (user?.is_superuser) return "vendedor";
    if (user?.is_vendedor && user?.is_distribuidor) return "vendedor";
    if (user?.is_distribuidor && !user?.is_vendedor) return "distribuidor";
    return "vendedor";
  }
  function withCreatorRole(payload) { return { ...(payload || {}), created_by_role: resolveCreatedByRole() }; }
  function normalizeNoteWithSeller(note) {
    const sellerLabel = String(user?.full_name || user?.username || "").trim();
    const raw = String(note || "").trim();
    if (!sellerLabel) return raw;
    const rows = raw ? raw.split(/\r?\n/).filter(Boolean) : [];
    const filtered = rows.filter((line) => !/^vendedor\s*:/i.test(String(line || "").trim()));
    filtered.push(`Vendedor: ${sellerLabel}`);
    return filtered.join("\n");
  }
  function getDraftPayload() {
    const base = buildPayloadForBack() || {};
    const linkedPortonMeta = buildLinkedPortonPayload(linkedPorton, linkedPortonId) || extractLinkedPortonPayloadFromQuote(quoteQ.data);
    const payloadExtra = linkedPortonMeta ? { ...(base.payload || {}), ...linkedPortonMeta } : (base.payload || {});
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
  }
  function validateConfirm(payload) {
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
    const payload = getDraftPayload();
    validateDraft(payload);
    if (!quoteId) {
      const created = await createQuote(payload);
      setQuoteMeta({ quoteId: created.id, status: created.status, rejectionNotes: created.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      return { quote: created, payload: { ...payload, id: created.id, quote_id: created.id, quote_number: displayQuoteNumberForKind(catalogKind, created, created.quote_number || ""), seller_name: user?.full_name || user?.username || "" } };
    }
    const q = await updateQuote(quoteId, payload);
    setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
    qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
    return { quote: q, payload: { ...payload, id: q.id, quote_id: q.id, quote_number: displayQuoteNumberForKind(catalogKind, q, q.quote_number || ""), seller_name: user?.full_name || user?.username || "" } };
  }
  function maybeContinueDoorWorkflow(savedQuote) {
    if (!isDoorWorkflow || !["ipanel", "puerta"].includes(normalizedCatalogKind) || !workflowDoorId) return false;
    const nextUrl = `/puertas/${workflowDoorId}?door_workflow=1&workflow_stage=${encodeURIComponent(workflowStage === "ipanel_first" ? "door_final" : workflowStage)}&ipanel_quote_id=${encodeURIComponent(savedQuote?.id || quoteId || idParam || "")}&porton_id=${encodeURIComponent(workflowPortonId || "")}`;
    navigate(nextUrl);
    return true;
  }
  function handleConfirmIntent() {
    if (isReturnedMeasurementQuote) return;
    if (!isRevisionQuote && user?.is_distribuidor && normalizedCatalogKind === "porton") {
      const currentMapsUrl = normalizeUrl(buildPayloadForBack()?.end_customer?.maps_url);
      const defaultMapsUrl = normalizeUrl(user?.default_maps_url);
      const isUsingDefaultLocation = !!defaultMapsUrl && currentMapsUrl === defaultMapsUrl;
      const alertText = isUsingDefaultLocation ? "Si no actualiza la dirección el producto será entregado en el punto de ubicación predeterminada para su empresa, si no desea cambiarla haga click en aceptar." : "¿Desea cambiar el punto de ubicación donde se entregará el portón?";
      const wantsToContinue = window.confirm(alertText);
      if (!wantsToContinue) { toast("Actualizá dirección, localidad o Maps antes de confirmar."); return; }
    }
    setConfirmChoiceOpen(true);
  }

  const saveM = useMutation({ mutationFn: async () => { const payload = getDraftPayload(); validateDraft(payload); if (quoteId) return await updateQuote(quoteId, payload); return await createQuote(payload); }, onSuccess: (q) => { setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes }); qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); if (maybeContinueDoorWorkflow(q)) { toast.success("Presupuesto de puerta guardado. Volviendo al panel."); return; } navigate(editorRouteForKind(catalogKind, q.id)); toast.success("Guardado."); }, onError: (e) => toast.error(e?.message || "No se pudo guardar") });

  const confirmM = useMutation({
    mutationFn: async (variables) => {
      const chosenMode = String(variables?.fulfillmentMode || buildPayloadForBack()?.fulfillment_mode || "acopio").trim();
      const payload = { ...getDraftPayload(), catalog_kind: catalogKind, fulfillment_mode: chosenMode };
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
  const confirmReturnedM = useMutation({ mutationFn: async () => { const payload = getDraftPayload(); validateConfirm(payload); if (!quoteId) throw new Error("Quote inválida"); await updateQuote(quoteId, payload); return await confirmReturnedMeasurementQuote(quoteId); }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["quote", quoteId] }); await qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); navigate("/menu", { replace: true }); toast.success("Se envió a su aprobación técnica final."); }, onError: (e) => toast.error(e?.message || "No se pudo enviar a técnica") });

  function resolveRefreshPricelist() {
    const assignedPricelistId = getAssignedPricelistIdFromUser(user);
    if (user?.is_distribuidor && assignedPricelistId) {
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
      const id = quoteId || idParam;
      if (!id) throw new Error("Abrí o guardá el presupuesto antes de actualizarlo.");

      const ok = window.confirm(
        "Los valores del presupuesto se sobrescribirán con la lista de precios actual. ¿Deseás continuar?",
      );
      if (!ok) return null;

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
        lines: buildPriceRefreshLines(currentLines),
      };
      const prices = await getPrices(pricesPayload);
      const refreshedLines = mergeUpdatedBasePrices(currentLines, prices);

      setPricelist(refreshPricelist);
      useQuoteStore.setState({ lines: refreshedLines });

      const issuedAt = new Date().toISOString();
      const payload = getDraftPayload();
      payload.pricelist_id = refreshPricelistId;
      payload.refresh_emission_date = true;
      payload.payload = {
        ...(payload.payload || {}),
        quote_issued_at: issuedAt,
        quote_issued_date: todayIsoDate(),
        price_refreshed_at: issuedAt,
        refreshed_pricelist_id: refreshPricelistId,
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
        0,
        latestProductionPlanning ? { production_planning: latestProductionPlanning } : {},
        { stripMarginPercent: true },
      );
      console.log("[PDF FRONT] payload completo proforma", pdfPayload);
      console.log("[PDF FRONT] lineas proforma", summarizeLinesForDebug(pdfPayload?.lines || []));
      await downloadProformaPdf(pdfPayload);
    } catch (e) { toast.error(e?.response?.data?.error || e.message); }
  };

  const canConfirm = isAcopioRevision ? false : (isReturnedMeasurementQuote ? false : (isRevisionQuote ? ["", "draft", "rejected"].includes(finalStatus || "") : ["draft", "rejected_commercial", "rejected_technical"].includes(status)));
  const canRefreshSavedQuote = !!(quoteId || idParam)
    && !isRevisionQuote
    && !isReturnedMeasurementQuote
    && ["draft", "rejected_commercial", "rejected_technical"].includes(String(status || ""));

  return (
    <div className="container" style={{ maxWidth: "100%", width: "100%" }}>
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img className="product-logo" src={catalogKind === "ipanel" ? "/brands/ipanel.png" : "/brands/degrandis.png"} alt={catalogKind === "ipanel" ? "Ipanel" : "DeGrandis Portones"} />
          <div>
            <h2 style={{ margin: 0 }}>{visibleQuoteNumber ? `${isRevisionQuote ? "Ajuste" : "Presupuesto"} #${visibleQuoteNumber}` : "Nuevo presupuesto"}</h2>
            <div className="muted">Estado: <b>{visibleStatusLabel}</b>{isRevisionQuote && quoteQ.data?.parent_quote_id ? <> · Ref. original: <b>{visibleParentQuoteNumber || "—"}</b></> : null}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onDownloadPresupuesto}>PDF presupuesto</Button>
          {user?.is_distribuidor ? <Button variant="secondary" onClick={onDownloadProforma}>PDF proforma</Button> : null}
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? "Guardando..." : "Guardar"}</Button>
          {isReturnedMeasurementQuote ? (
            <>
              <Button variant="ghost" onClick={() => resetReturnedM.mutate()} disabled={resetReturnedM.isPending || confirmReturnedM.isPending}>{resetReturnedM.isPending ? "Restableciendo..." : "Restablecer al original"}</Button>
              <Button variant="primary" onClick={() => confirmReturnedM.mutate()} disabled={confirmReturnedM.isPending || resetReturnedM.isPending}>{confirmReturnedM.isPending ? "Enviando..." : "Confirmar y volver a Técnica"}</Button>
            </>
          ) : (!isAcopioRevision ? (<Button variant="primary" onClick={() => { if (isRevisionQuote) { confirmM.mutate({}); return; } handleConfirmIntent(); }} disabled={!canConfirm || confirmM.isPending}>{confirmM.isPending ? "Confirmando..." : (isRevisionQuote ? "Enviar cotización final" : "Confirmar presupuesto")}</Button>) : null)}
        </div>
      </div>

      {isReturnedMeasurementQuote ? (
        <><div className="spacer" /><div className="card" style={{ background: "#fff8f3", border: "1px solid #f2d3bf" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Presupuesto devuelto desde medición / datos técnicos</div>
          <div className="muted" style={{ marginBottom: 8 }}>{returnedMeasurementReason || "El medidor o técnica devolvió este portón para que ajustes el presupuesto antes de continuar."}</div>
          {returnedMeasurementForced ? <div className="muted">Este caso quedó bloqueado por superficie final mayor a la presupuestada fuera de tolerancia. Después de ajustar, usá <b>Confirmar y volver a Técnica</b>.</div> : <div className="muted">Podés ajustar los ítems del presupuesto. El ítem <b>Facturado previamente</b> queda visible para calcular la diferencia. Cuando termines, usá <b>Confirmar y volver a Técnica</b>.</div>}
        </div></>
      ) : null}

      {isAcopioRevision ? (<><div className="spacer" /><div className="card" style={{ background: "#fff8f3", border: "1px solid #f2d3bf" }}><div style={{ fontWeight: 900, marginBottom: 6 }}>Ajuste de presupuesto en Acopio</div><div className="muted">Este ajuste no se envía desde acá. Guardá los cambios y luego usá <b>Solicitar paso a Producción</b> desde <b>Mis presupuestos</b>. Cuando Comercial y Técnica aprueben ese paso, el sistema enviará la venta final a Odoo.</div></div></>) : null}

      {canLinkToPorton ? (
        <>
          <div className="spacer" />
          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Vincular a portón existente</div>
            <div className="muted" style={{ marginBottom: 8 }}>
              Opcional. Si elegís un portón, {normalizedCatalogKind === "ipanel" ? "el Ipanel" : "Otros"} copia los datos del cliente y usa el mismo número con prefijo <b>{normalizedCatalogKind === "ipanel" ? "I" : "O"}</b>: {normalizedCatalogKind === "ipanel" ? "INP/INV" : "ONP/ONV"}.
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
                Número vinculado: <b>{linkedPortonDisplayReference || "—"}</b>. En Odoo saldrá como <b>{normalizedCatalogKind === "ipanel" ? "INP/INV" : "ONP/ONV"}</b>.
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              <div style={{ border: "1px solid #d9e5f7", background: "#f7fbff", borderRadius: 14, padding: 16 }}><div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Acopio</div><div className="muted" style={{ marginBottom: 14 }}>El portón queda en espera. Se podrá seguir gestionando desde <b>Acopio → Producción</b> y mantiene una instancia de edición.</div><Button onClick={() => confirmM.mutate({ fulfillmentMode: "acopio" })} disabled={confirmM.isPending}>{confirmM.isPending ? "Confirmando..." : "Confirmar en Acopio"}</Button></div>
              <div style={{ border: "1px solid #f2d3bf", background: "#fff8f3", borderRadius: 14, padding: 16 }}><div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Producción</div><div className="muted" style={{ marginBottom: 14 }}>El portón entra directo en circuito productivo. Ya no podrá editarse desde <b>Presupuestos</b>.</div><Button variant="primary" onClick={() => confirmM.mutate({ fulfillmentMode: "produccion" })} disabled={confirmM.isPending}>{confirmM.isPending ? "Confirmando..." : "Confirmar en Producción"}</Button></div>
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
          <SectionCatalog kind={catalogKind} onDownloadPresupuesto={onDownloadPresupuesto} />
        </div>
        <div className="card" style={{ flex: 2, minWidth: 560 }}>
          <LinesTable financingPercent={quoteAdjustmentPercent} />
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

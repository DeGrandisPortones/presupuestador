import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import HeaderBar from "../CotizadorPage/components/HeaderBar.jsx";
import LinesTable from "../CotizadorPage/components/LinesTable.jsx";
import SummaryBox from "../CotizadorPage/components/SummaryBox.jsx";
import PuertaDimensions from "./components/PuertaDimensions.jsx";
import PuertaCatalog from "./components/PuertaCatalog.jsx";

import { useAuthStore } from "../../domain/auth/store.js";
import { useQuoteStore } from "../../domain/quote/store.js";
import { IVA_RATE_DEFAULT } from "../../domain/quote/defaults.js";
import { calcTotals, resolveQuoteAdjustmentPercent, resolveQuoteIvaRate } from "../../domain/quote/pricing.js";
import { getPrices, getEffectivePricelists, getFinancingPreview, ensurePricesReadyForPricelist } from "../../api/odoo.js";
import { createQuote, getQuote, updateQuote, confirmQuote, listQuotes } from "../../api/quotes.js";
import { downloadPresupuestoPdf, downloadProformaPdf } from "../../api/pdf.js";
import { validateArgentinaPhone, validateEmailAddress, validateGoogleMapsUrl } from "../../utils/contactValidation.js";
import {
  buildQuoteAutosaveKey,
  canRemoteAutosaveQuote,
  clearAllAutosaveDrafts,
  clearAutosaveDraft,
  formatAutosaveTime,
  hasAutosaveCustomerMinimum,
  readAutosaveDraft,
  serializeAutosavePayload,
  writeAutosaveDraft,
} from "../../domain/quote/autosave.js";

function parseNum(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalizeUrl(value) { return String(value || "").trim().replace(/\/+$/, "").toLowerCase(); }
function cleanText(value) { return String(value || "").trim(); }
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
function extractReferenceCore(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  return raw.replace(/^(P?NP|NV|NP|S)+/i, "");
}
function quoteDisplayReference(quote) {
  return cleanText(quote?.odoo_sale_order_name || quote?.final_sale_order_name || quote?.quote_number || quote?.id || "");
}
function buildDoorOrderReference({ linkedQuote, savedQuote }) {
  const linkedCore = extractReferenceCore(quoteDisplayReference(linkedQuote));
  if (linkedCore) return `PNP${linkedCore}`;
  const ownCore = extractReferenceCore(savedQuote?.quote_number || savedQuote?.odoo_sale_order_name || savedQuote?.id || "");
  return ownCore ? `PNP${ownCore}` : "";
}
function normalizeNoteWithSeller(note, user) {
  const sellerLabel = cleanText(user?.full_name || user?.username || "");
  const raw = cleanText(note);
  const rows = raw ? raw.split(/\r?\n/).filter(Boolean) : [];
  const filtered = rows.filter((line) => !/^vendedor\s*:/i.test(cleanText(line)) && !/^PRESUPUESTADOR_PUERTA_ORDER_REF\s*:/i.test(cleanText(line)));
  if (sellerLabel) filtered.push(`Vendedor: ${sellerLabel}`);
  return filtered.join("\n");
}
function appendDoorReferenceToNote(note, ref) {
  const rows = String(note || "").split(/\r?\n/).filter((line) => !/^PRESUPUESTADOR_PUERTA_ORDER_REF\s*:/i.test(cleanText(line)));
  if (ref) rows.push(`PRESUPUESTADOR_PUERTA_ORDER_REF:${ref}`);
  return rows.join("\n").trim();
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

function validateCustomerContact(customer, { requirePhone = false, requireMaps = false, requireCity = false } = {}) {
  const c = customer || {};
  if (requireCity && !cleanText(c.city)) throw new Error("Completá la localidad del cliente.");
  const phoneErr = validateArgentinaPhone(c.phone, { required: requirePhone });
  if (phoneErr) throw new Error(phoneErr);
  const emailErr = validateEmailAddress(c.email, { required: false });
  if (emailErr) throw new Error(emailErr);
  const mapsErr = validateGoogleMapsUrl(c.maps_url, { required: requireMaps });
  if (mapsErr) throw new Error(mapsErr);
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
  return nextPayload;
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
  const candidates = [payload.quote_adjustment_percent_snapshot, payload.financing_percent_snapshot, payload.financing_percent, payload.payment_adjustment_percent];
  for (const value of candidates) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const n = Number(String(value).replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function getAssignedPricelistIdFromUser(user) {
  const n = Number(user?.odoo_pricelist_id || 0);
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
    line?.odoo_product_id,
    line?.odoo_id,
    line?.odoo_template_id,
    line?.product_tmpl_id,
    line?.odoo_external_id,
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

export default function PresupuestadorPuertasPage() {
  const navigate = useNavigate();
  const params = useParams();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const idParam = params.id ? String(params.id) : null;

  const {
    quoteId,
    status,
    pricelistId,
    partnerId,
    paymentMethod,
    conditionMode,
    fulfillmentMode,
    endCustomer,
    note,
    lines,
    dimensions,
    marginPercent,
    reset,
    loadFromQuote,
    setEndCustomer,
    setPricelist,
    setPartnerId,
    buildPayloadForBack,
    setQuoteMeta,
    applyBasePrices,
    markLinesPriceError,
  } = useQuoteStore();

  const [confirmChoiceOpen, setConfirmChoiceOpen] = useState(false);
  const [confirmBudgetObservation, setConfirmBudgetObservation] = useState("");
  const [autosaveState, setAutosaveState] = useState({ status: "idle", message: "", savedAt: "" });
  const autosaveTimerRef = useRef(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveLastRemoteSignatureRef = useRef("");
  const autosaveRestoredLocalRef = useRef(false);
  const [linkedPortonId, setLinkedPortonId] = useState("");
  const [portonSearch, setPortonSearch] = useState("");
  const [ivaRate] = useState(IVA_RATE_DEFAULT);

  useEffect(() => {
    if (!idParam) {
      reset();
      setLinkedPortonId("");
      setPortonSearch("");
      if (user?.default_maps_url) setEndCustomer({ maps_url: user.default_maps_url });
    }
  }, [idParam, reset, user?.default_maps_url, setEndCustomer]);

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
  useEffect(() => {
    if (!quoteQ.data) return;
    if (String(quoteQ.data.catalog_kind || "").toLowerCase() !== "puerta") {
      navigate(`/presupuestos/${quoteQ.data.id}`, { replace: true });
      return;
    }
    loadFromQuote(quoteQ.data);
    setLinkedPortonId(cleanText(quoteQ.data?.payload?.linked_porton_quote_id || ""));
  }, [quoteQ.data, loadFromQuote, navigate]);

  const portonQuotesQ = useQuery({ queryKey: ["quotes", "mine", "portones-for-door"], queryFn: () => listQuotes({ scope: "mine" }), enabled: !!user });
  const portonQuotes = useMemo(() => (portonQuotesQ.data || []).filter((q) => String(q?.catalog_kind || "porton").toLowerCase() === "porton"), [portonQuotesQ.data]);
  const filteredPortonQuotes = useMemo(() => {
    const needle = normalizeSearchText(portonSearch);
    if (!needle) return portonQuotes;
    return portonQuotes.filter((q) => buildPortonSearchText(q).includes(needle));
  }, [portonQuotes, portonSearch]);
  const linkedPorton = useMemo(() => portonQuotes.find((q) => String(q.id) === String(linkedPortonId)) || null, [portonQuotes, linkedPortonId]);

  const financingQ = useQuery({ queryKey: ["financing-preview", paymentMethod], queryFn: () => getFinancingPreview(paymentMethod), enabled: !!cleanText(paymentMethod), staleTime: 60 * 1000 });
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
  const linesKey = useMemo(() => lines.map((l) => `${l.product_id}:${resolveLinePricingProductId(l)}:${l.odoo_template_id || ""}:${l.qty}`).join("|"), [lines]);

  const linesBeingPricedRef = useRef([]);
  useEffect(() => {
    async function run() {
      if (!pricingContextReady || !pricelistId || !lines.length) return;
      const isPersistedQuote = !!(quoteQ.data?.id || quoteId || idParam);
      const linesToPrice = isPersistedQuote
        ? lines.filter(lineNeedsPriceRefresh)
        : lines.filter((line) => !line.previously_billed_line);
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
            odoo_variant_id: l.odoo_variant_id || null,
            odoo_id: l.odoo_id || null,
            qty: l.qty,
          }))
          .filter((line) => Number(line.product_id || 0) > 0),
      };
      if (!payload.lines.length) return;
      // Ver el mismo cambio (y su razon) en CotizadorPage/index.jsx: ya no se fuerza el
      // pedido en vivo a Odoo para presupuestos nuevos, la cache precargada en el login
      // alcanza (maximo 1h de antiguedad, ver PRICE_CACHE_TTL_MS en api/odoo.js).
      const data = await getPrices({ ...payload, force: false });
      applyBasePrices(data);
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

  function applyPortonData(portonId) {
    const selected = portonQuotes.find((q) => String(q.id) === String(portonId));
    setLinkedPortonId(portonId || "");
    if (!selected) return;
    const c = selected.end_customer || {};
    setEndCustomer({
      name: c.name || "",
      first_name: c.first_name || String(c.name || "").split(/\s+/)[0] || "",
      last_name: c.last_name || String(c.name || "").split(/\s+/).slice(1).join(" ") || "",
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      city: c.city || "",
      maps_url: c.maps_url || "",
    });
    toast.success("Datos del portón copiados a la puerta.");
  }

  function resolveCreatedByRole() {
    if (user?.is_superuser) return "vendedor";
    if (user?.is_vendedor && user?.is_distribuidor) return "vendedor";
    if (user?.is_distribuidor && !user?.is_vendedor) return "distribuidor";
    return "vendedor";
  }

  function buildDoorPayload({ savedQuote = null, forceDoorRef = "" } = {}) {
    const base = buildPayloadForBack() || {};
    const doorRef = forceDoorRef || cleanText(base?.payload?.door_order_reference || "");
    const sellerNote = normalizeNoteWithSeller(base?.note, user);
    const note = appendDoorReferenceToNote(sellerNote, doorRef);
    return {
      ...base,
      created_by_role: resolveCreatedByRole(),
      catalog_kind: "puerta",
      fulfillment_mode: base?.fulfillment_mode || "acopio",
      note,
      payload: {
        ...(base.payload || {}),
        catalog_kind: "puerta",
        linked_porton_quote_id: linkedPortonId || null,
        linked_porton_reference: linkedPorton ? quoteDisplayReference(linkedPorton) : "",
        door_order_reference: doorRef || buildDoorOrderReference({ linkedQuote: linkedPorton, savedQuote }),
        quote_adjustment_percent_snapshot: quoteAdjustmentPercent,
        financing_percent_snapshot: quoteAdjustmentPercent,
        iva_rate_snapshot: resolveQuoteIvaRate(ivaRate, conditionMode),
        pricing_snapshot_at: (base.payload || {}).pricing_snapshot_at || new Date().toISOString(),
      },
    };
  }

  const autosaveDraftKey = useMemo(() => buildQuoteAutosaveKey({ user, catalogKind: "puerta", quoteId: quoteId || idParam || "new" }), [user, quoteId, idParam]);
  const autosaveNewDraftKey = useMemo(() => buildQuoteAutosaveKey({ user, catalogKind: "puerta", quoteId: "new" }), [user]);
  const autosaveWatchSignature = useMemo(() => {
    try { return serializeAutosavePayload(buildDoorPayload()); } catch (_err) { return ""; }
  }, [quoteId, idParam, pricelistId, partnerId, paymentMethod, conditionMode, fulfillmentMode, endCustomer, note, linkedPortonId, lines, dimensions, marginPercent, quoteAdjustmentPercent]);

  useEffect(() => {
    if (idParam || quoteQ.data || autosaveRestoredLocalRef.current) return;
    const local = readAutosaveDraft(autosaveNewDraftKey);
    autosaveRestoredLocalRef.current = true;
    if (!local?.payload) return;
    loadFromQuote({
      id: null,
      status: "draft",
      catalog_kind: "puerta",
      fulfillment_mode: local.payload.fulfillment_mode || "acopio",
      pricelist_id: local.payload.pricelist_id || null,
      end_customer: local.payload.end_customer || {},
      lines: Array.isArray(local.payload.lines) ? local.payload.lines : [],
      payload: local.payload.payload || {},
      note: local.payload.note || null,
    });
    setLinkedPortonId(String(local.extra?.linkedPortonId || local.payload?.payload?.linked_porton_quote_id || "").trim());
    setAutosaveState({ status: "local-restored", message: "Borrador recuperado de este navegador.", savedAt: local.saved_at || "" });
    toast.success("Recuperé un borrador local sin guardar.");
  }, [idParam, quoteQ.data, autosaveNewDraftKey, loadFromQuote]);

  async function runDoorAutosaveNow(reason = "auto") {
    let payload;
    try { payload = buildDoorPayload(); } catch (_err) { return null; }
    writeAutosaveDraft(autosaveDraftKey, payload, { linkedPortonId, reason });

    if (!hasAutosaveCustomerMinimum(payload)) {
      setAutosaveState({ status: "waiting-minimum", message: "Borrador local. Completá nombre, apellido y teléfono para autoguardar en Mis presupuestos.", savedAt: new Date().toISOString() });
      return null;
    }
    if (!pricingContextReady) {
      setAutosaveState({ status: "waiting-pricing", message: pricingContextMessage || "Borrador local. Esperando lista de precios correcta para autoguardar en Mis presupuestos.", savedAt: new Date().toISOString() });
      return null;
    }
    // pricingContextReady solo indica que la LISTA de precios de Odoo esta lista - los
    // precios de las lineas puntuales se piden aparte (ver el efecto de refresco de
    // precios mas abajo) y puede seguir en curso. Autoguardar en ese momento persistia
    // lineas en $0 al backend (ver el mismo fix en CotizadorPage/index.jsx y en
    // loadFromQuote, domain/quote/store.js).
    const hasLinesAwaitingPrice = lines.some((l) => !l.previously_billed_line && !l.manual_price && (l.price_pending || l.price_error));
    if (hasLinesAwaitingPrice) {
      setAutosaveState({ status: "waiting-pricing", message: "Borrador local. Esperando el precio de Odoo de los productos agregados antes de autoguardar en Mis presupuestos.", savedAt: new Date().toISOString() });
      return null;
    }
    if (!canRemoteAutosaveQuote({ status, fulfillmentMode: payload.fulfillment_mode })) return null;
    if (confirmChoiceOpen) return null;

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
      writeAutosaveDraft(buildQuoteAutosaveKey({ user, catalogKind: "puerta", quoteId: saved.id }), { ...payload, id: saved.id }, { linkedPortonId, reason: "remote-saved" });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      setAutosaveState({ status: "saved", message: `Autoguardado ${formatAutosaveTime(savedAt)}`, savedAt });
      if (!existingId && saved?.id) navigate(`/cotizador/puerta/${saved.id}`, { replace: true });
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
    try { payload = buildDoorPayload(); } catch (_err) { return undefined; }
    writeAutosaveDraft(autosaveDraftKey, payload, { linkedPortonId, reason: "local-change" });

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => { runDoorAutosaveNow("debounced"); }, 3000);
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
      runDoorAutosaveNow("page-hide");
    }
    function onVisibilityChange() { if (document.visibilityState === "hidden") flushAutosave(); }
    window.addEventListener("pagehide", flushAutosave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushAutosave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [autosaveWatchSignature, autosaveDraftKey, linkedPortonId, quoteId, idParam, status, confirmChoiceOpen]);

  function validateDraft(payload) {
    const c = payload?.end_customer || {};
    if (!cleanText(c.first_name)) throw new Error("Completá el nombre del cliente.");
    if (!cleanText(c.last_name)) throw new Error("Completá el apellido del cliente.");
    if (!cleanText(c.phone)) throw new Error("Completá el teléfono del cliente.");
    if (parseNum(dimensions?.width) <= 0) throw new Error("Completá el ancho de la puerta.");
    if (parseNum(dimensions?.height) <= 0) throw new Error("Completá el alto de la puerta.");
    if (!Array.isArray(payload?.lines) || payload.lines.filter((line) => !line.previously_billed_line).length === 0) throw new Error("Agregá al menos un producto.");
    validateCustomerContact(c, { requirePhone: true, requireMaps: false, requireCity: false });
  }
  function validatePricingContextReady() {
    if (!pricingContextReady) throw new Error(pricingContextMessage || "Esperá a que se aplique la lista de precios correcta antes de continuar.");
    const unresolved = lines.filter((l) => !l.previously_billed_line && !l.manual_price && (l.price_error || l.price_pending));
    if (unresolved.length) throw new Error("Hay productos sin precio confirmado de Odoo. Reintentá antes de confirmar.");
  }
  function validateConfirm(payload) {
    validatePricingContextReady();
    validateDraft(payload);
    const c = payload?.end_customer || {};
    const p = payload?.payload || {};
    if (!cleanText(c.address)) throw new Error("Completá la dirección del cliente.");
    if (!cleanText(c.city)) throw new Error("Completá la localidad del cliente.");
    if (!cleanText(p.payment_method)) throw new Error("Seleccioná la forma de pago.");
    if (String(p.condition_mode || "") === "special" && !cleanText(p.condition_text)) throw new Error("Completá la condición especial.");
    validateCustomerContact(c, { requirePhone: true, requireMaps: true, requireCity: true });
  }

  async function saveDoorQuote({ fulfillmentMode = null, forConfirm = false, budgetObservation } = {}) {
    let payload = buildDoorPayload();
    if (Object.prototype.hasOwnProperty.call(arguments[0] || {}, "budgetObservation")) {
      payload.payload = applyBudgetObservationToPayload(payload.payload, budgetObservation);
    } else {
      const existingBudgetObservation = readBudgetObservationFromPayload(quoteQ.data);
      if (existingBudgetObservation && !readBudgetObservationFromPayload(payload.payload)) {
        payload.payload = applyBudgetObservationToPayload(payload.payload, existingBudgetObservation);
      }
    }
    if (fulfillmentMode) payload.fulfillment_mode = fulfillmentMode;
    if (forConfirm) validateConfirm(payload);
    else validateDraft(payload);

    let saved = null;
    const id = quoteId || idParam;
    if (id) saved = await updateQuote(id, payload);
    else saved = await createQuote(payload);

    const doorRef = buildDoorOrderReference({ linkedQuote: linkedPorton, savedQuote: saved });
    const payloadWithReference = buildDoorPayload({ savedQuote: saved, forceDoorRef: doorRef });
    if (Object.prototype.hasOwnProperty.call(arguments[0] || {}, "budgetObservation")) {
      payloadWithReference.payload = applyBudgetObservationToPayload(payloadWithReference.payload, budgetObservation);
    } else {
      const existingBudgetObservation = readBudgetObservationFromPayload(quoteQ.data);
      if (existingBudgetObservation && !readBudgetObservationFromPayload(payloadWithReference.payload)) {
        payloadWithReference.payload = applyBudgetObservationToPayload(payloadWithReference.payload, existingBudgetObservation);
      }
    }
    if (fulfillmentMode) payloadWithReference.fulfillment_mode = fulfillmentMode;
    saved = await updateQuote(saved.id, payloadWithReference);

    setQuoteMeta({ quoteId: saved.id, status: saved.status, rejectionNotes: saved.rejection_notes });
    qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
    return saved;
  }

  const saveM = useMutation({
    mutationFn: () => saveDoorQuote({ forConfirm: false }),
    onSuccess: (q) => { navigate(`/cotizador/puerta/${q.id}`); toast.success("Puerta guardada."); },
    onError: (e) => toast.error(e?.message || "No se pudo guardar la puerta"),
  });

  const confirmM = useMutation({
    mutationFn: async ({ fulfillmentMode, budgetObservation }) => {
      const saved = await saveDoorQuote({ fulfillmentMode, forConfirm: true, budgetObservation });
      return await confirmQuote(saved.id, { fulfillment_mode: fulfillmentMode });
    },
    onSuccess: (q) => { setConfirmChoiceOpen(false); setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes }); qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); navigate(`/presupuestos/${q.id}`); toast.success("Presupuesto de puerta enviado a aprobación."); },
    onError: (e) => toast.error(e?.message || "No se pudo confirmar la puerta"),
  });

  const refreshQuoteM = useMutation({
    mutationFn: async () => {
      const ok = window.confirm(
        "Los valores del presupuesto se sobrescribirán con la lista de precios actual. ¿Deseás continuar?",
      );
      if (!ok) return null;

      // Si el presupuesto todavia no se guardo (nuevo, sin id), lo guardamos primero para
      // poder actualizarlo despues. Sin esto, un presupuesto nuevo nunca podia forzar el
      // precio en vivo de Odoo y se quedaba con lo que hubiera en la cache local.
      let id = quoteId || idParam;
      if (!id) {
        const created = await saveDoorQuote({ forConfirm: false });
        id = created.id;
        setQuoteMeta({ quoteId: created.id, status: created.status, rejectionNotes: created.rejection_notes });
      }

      const refreshPricelistId = Number(expectedPricelistId || 0);
      if (!refreshPricelistId) throw new Error("No se pudo resolver la lista de precios actual.");

      const currentLines = useQuoteStore.getState().lines || [];
      if (!currentLines.filter((line) => !line?.previously_billed_line).length) {
        throw new Error("Agregá al menos un producto para actualizar precios.");
      }

      const pricesPayload = {
        pricelist_id: refreshPricelistId,
        partner_id: partnerId,
        lines: buildPriceRefreshLines(currentLines),
        // "Actualizar presupuesto" tiene que traer el precio real de Odoo, no la cache
        // local de precios (dura 12hs) que usa el resto del cotizador.
        force: true,
      };
      const prices = await getPrices(pricesPayload);
      const refreshedLines = mergeUpdatedBasePrices(currentLines, prices);

      setPricelist(expectedPricelist);
      useQuoteStore.setState({ lines: refreshedLines });

      const issuedAt = new Date().toISOString();
      const currentAdjustmentPercent = resolveQuoteAdjustmentPercent(financingPercent, conditionMode);
      const payload = buildDoorPayload();
      payload.pricelist_id = refreshPricelistId;
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
    onSuccess: (q) => {
      if (!q) return;
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      loadFromQuote(q);
      qc.invalidateQueries({ queryKey: ["quote", q.id] });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      toast.success("Presupuesto actualizado con la lista de precios actual.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo actualizar el presupuesto"),
  });

  function confirmDoorWithOptionalPortonWarning(fulfillmentMode) {
    if (!cleanText(linkedPortonId)) {
      const ok = window.confirm(
        "Esta puerta no está vinculada a ningún portón. ¿Deseás continuar igual?",
      );
      if (!ok) {
        setConfirmChoiceOpen(false);
        return;
      }
    }
    confirmM.mutate({ fulfillmentMode, budgetObservation: confirmBudgetObservation });
  }

  async function onDownloadPdf(mode = "presupuesto") {
    try {
      validatePricingContextReady();
      const saved = await saveDoorQuote({ forConfirm: false });
      const payload = buildDoorPayload({ savedQuote: saved, forceDoorRef: buildDoorOrderReference({ linkedQuote: linkedPorton, savedQuote: saved }) });
      const pdfPayload = buildPdfPayloadForDownload(
        payload,
        quoteAdjustmentPercent,
        {
          id: saved.id,
          quote_id: saved.id,
          quote_number: saved.quote_number || "",
          seller_name: user?.full_name || user?.username || "",
        },
        mode === "proforma" ? { stripMarginPercent: true } : {},
      );
      if (mode === "proforma") await downloadProformaPdf(pdfPayload);
      else await downloadPresupuestoPdf(pdfPayload);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "No se pudo generar el PDF");
    }
  }

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
    setLinkedPortonId("");
    setPortonSearch("");
    setConfirmChoiceOpen(false);
    setConfirmBudgetObservation("");
    setAutosaveState({ status: "cleared", message: "Presupuesto limpio. Autoguardado local borrado.", savedAt: new Date().toISOString() });
    toast.success("Presupuesto limpio. Autoguardado local borrado.");

    if (quoteId || idParam) {
      navigate("/cotizador/puerta", { replace: true });
    }
  }

  const canConfirm = ["draft", "rejected_commercial", "rejected_technical"].includes(status);
  const canRefreshSavedQuote = ["draft", "rejected_commercial", "rejected_technical"].includes(String(status || ""));
  const visibleQuoteNumber = cleanText(quoteQ.data?.quote_number || quoteQ.data?.odoo_sale_order_name || "");

  return (
    <div className="container" style={{ maxWidth: "100%", width: "100%" }}>
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="menu-card-icon" style={{ width: 52, height: 52 }}>🚪</div>
          <div>
            <h2 style={{ margin: 0 }}>{visibleQuoteNumber ? `Presupuesto Puerta #${visibleQuoteNumber}` : "Presupuestador Puertas"}</h2>
            <div className="muted">Cotizador de puertas con catálogo propio y flujo de aprobación Comercial + Técnica.</div>
            {autosaveState.message ? <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{autosaveState.message}</div> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => onDownloadPdf("presupuesto")} disabled={!pricingContextReady}>PDF presupuesto</Button>
          {user?.is_distribuidor ? <Button variant="secondary" onClick={() => onDownloadPdf("proforma")} disabled={!pricingContextReady}>PDF proforma</Button> : null}
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !pricingContextReady}>{saveM.isPending ? "Guardando..." : "Guardar"}</Button>
          {canRefreshSavedQuote ? (
            <Button variant="secondary" disabled={refreshQuoteM.isPending || !pricingContextReady} onClick={() => refreshQuoteM.mutate()}>
              {refreshQuoteM.isPending ? "Actualizando..." : "Actualizar presupuesto"}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => { setConfirmBudgetObservation(readBudgetObservationFromPayload(buildDoorPayload())); setConfirmChoiceOpen(true); }} disabled={!canConfirm || confirmM.isPending || !pricingContextReady}>{confirmM.isPending ? "Confirmando..." : "Confirmar presupuesto"}</Button>
          <Button variant="ghost" onClick={handleClearBudget}>Limpiar presupuesto</Button>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>

      {quoteQ.isLoading ? <><div className="spacer" /><div className="card"><div className="muted">Cargando puerta...</div></div></> : null}
      {quoteQ.isError ? <><div className="spacer" /><div className="card"><div style={{ color: "#d93025" }}>{quoteQ.error.message}</div></div></> : null}
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

      {confirmChoiceOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }} onClick={() => { if (!confirmM.isPending) setConfirmChoiceOpen(false); }}>
          <div className="card" style={{ width: "100%", maxWidth: 880, background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 6 }}>Elegí el destino de la puerta</div>
            <div className="muted" style={{ marginBottom: 18 }}>La puerta usa el mismo circuito de aprobación que un portón.</div>
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
              <div style={{ border: "1px solid #d9e5f7", background: "#f7fbff", borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Acopio</div>
                <div className="muted" style={{ marginBottom: 14 }}>La puerta queda en espera y genera Nota de Pedido PNP al aprobarse.</div>
                <Button onClick={() => confirmDoorWithOptionalPortonWarning("acopio")} disabled={confirmM.isPending || !pricingContextReady}>Confirmar en Acopio</Button>
              </div>
              <div style={{ border: "1px solid #f2d3bf", background: "#fff8f3", borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Producción</div>
                <div className="muted" style={{ marginBottom: 14 }}>La puerta entra al circuito productivo y genera Nota de Pedido PNP al aprobarse.</div>
                <Button variant="primary" onClick={() => confirmDoorWithOptionalPortonWarning("produccion")} disabled={confirmM.isPending || !pricingContextReady}>Confirmar en Producción</Button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><Button variant="ghost" onClick={() => setConfirmChoiceOpen(false)} disabled={confirmM.isPending}>Cancelar</Button></div>
          </div>
        </div>
      ) : null}

      <div className="spacer" />
      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Vincular a portón existente</div>
        <div className="muted" style={{ marginBottom: 8 }}>Opcional. Si elegís un portón, la puerta copia los datos del cliente y al aprobarse usa PNP con el mismo número de NP del portón.</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(260px, 1.4fr)", gap: 10, alignItems: "end" }}>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Buscar portón</div>
            <input
              value={portonSearch}
              onChange={(e) => setPortonSearch(e.target.value)}
              placeholder="Buscar por NP/NV, nombre, apellido, teléfono, email o localidad..."
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
            />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              Presupuesto de portón {portonSearch ? `(${filteredPortonQuotes.length} resultado${filteredPortonQuotes.length === 1 ? "" : "s"})` : ""}
            </div>
            <select value={linkedPortonId} onChange={(e) => applyPortonData(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
              <option value="">Sin portón vinculado</option>
              {filteredPortonQuotes.map((q) => (
                <option key={q.id} value={q.id}>{quoteDisplayReference(q)} · {q?.end_customer?.name || [q?.end_customer?.first_name, q?.end_customer?.last_name].filter(Boolean).join(" ") || "Sin cliente"} · {q?.status || "draft"}</option>
              ))}
            </select>
          </div>
        </div>
        {portonSearch && !filteredPortonQuotes.length ? (
          <div className="muted" style={{ marginTop: 8 }}>No se encontraron portones con esa búsqueda.</div>
        ) : null}
      </div>

      <div className="spacer" />
      <HeaderBar showMargin />

      <div className="spacer" />
      <div className="card"><PuertaDimensions /></div>

      <div className="spacer" />
      <div className="row quote-row">
        <div className="card" style={{ flex: 1, minWidth: 340 }}>
          {pricingContextReady ? (
            <PuertaCatalog />
          ) : (
            <div style={{ border: "1px dashed #f2d08a", background: "#fffdf2", borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Catálogo bloqueado momentáneamente</div>
              <div className="muted">{pricingContextMessage || "La app está resolviendo la lista de precios correcta."}</div>
            </div>
          )}
        </div>
        <div className="card" style={{ flex: 2, minWidth: 560 }}>
          <LinesTable financingPercent={quoteAdjustmentPercent} />
          <div className="spacer" />
          <SummaryBox totals={totals} paymentMethod={paymentMethod} />
        </div>
      </div>

      {(saveM.isError || confirmM.isError) ? <div className="spacer" /> : null}
      {saveM.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{saveM.error.message}</div> : null}
      {confirmM.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{confirmM.error.message}</div> : null}
    </div>
  );
}

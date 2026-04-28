import { useEffect, useMemo, useState } from "react";
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
} from "../../api/quotes";
import { confirmReturnedMeasurementQuote, resetReturnedMeasurementQuote } from "../../api/measurements";
import { downloadPresupuestoPdf, downloadProformaPdf } from "../../api/pdf";
import toast from "react-hot-toast";

import { useQuoteStore } from "../../domain/quote/store";
import { IVA_RATE_DEFAULT } from "../../domain/quote/defaults";
import { calcTotals } from "../../domain/quote/pricing";
import { validateArgentinaPhone, validateEmailAddress, validateGoogleMapsUrl } from "../../utils/contactValidation.js";

import Button from "../../ui/Button.jsx";

import HeaderBar from "./components/HeaderBar";
import PortonDimensions from "./components/PortonDimensions";
import SectionCatalog from "./components/SectionCatalog";
import LinesTable from "./components/LinesTable";
import SummaryBox from "./components/SummaryBox";

const WIDTH_MIN_M = 2;
const WIDTH_MAX_M = 7;
const HEIGHT_MIN_M = 2;
const HEIGHT_MAX_M = 3;
const REBAJE_AUTO_PRODUCT_ID = 2903;
const REBAJE_AUTO_PRODUCT_NAME = "PLANCHUELA LATERAL E INFERIOR DE 40MM (Apto aluminio - Otros)";
const REBAJE_AUTO_PRODUCT_BASE_PRICE = 400;
const REBAJE_AUTO_MIN_WIDTH_M = 3.5;
const PREVIOUSLY_BILLED_PRODUCT_ID = -900001;

function normalizeCatalogKind(kind) { return String(kind || "porton").toLowerCase().trim(); }
function normalizeUrl(value) { return String(value || "").trim().replace(/\/+$/, "").toLowerCase(); }
function editorRouteForKind(kind, id, search = "") { const safeId = String(id || "").trim(); const suffix = search || ""; const normalizedKind = normalizeCatalogKind(kind); if (normalizedKind === "ipanel") return `/cotizador/ipanel/${safeId}${suffix}`; if (normalizedKind === "otros") return `/cotizador/otros/${safeId}${suffix}`; return `/cotizador/${safeId}${suffix}`; }
function parseNum(v) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
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
function buildPdfPayloadForDownload(payload, financingPercent, extras = {}) {
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
  if (startLabel || endLabel) {
    return `${weekPart}, entre ${startLabel || "—"} y ${endLabel || "—"}`;
  }
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
  const itemLabel = normalizedKind === "ipanel" ? "Ipanel" : "portón";

  if (!(width > 0)) throw new Error(`Completá el ancho del ${itemLabel}.`);
  if (!(height > 0)) throw new Error(`Completá el alto del ${itemLabel}.`);

  if (normalizedKind === "porton") {
    if (width < WIDTH_MIN_M || width > WIDTH_MAX_M) throw new Error("El ancho debe estar entre 2 m y 7 m.");
    if (height < HEIGHT_MIN_M || height > HEIGHT_MAX_M) throw new Error("El alto debe estar entre 2 m y 3 m.");
  }
}
function formatVisibleStatus(rawStatus, hasPersistedQuote) {
  const normalized = String(rawStatus || "").trim().toLowerCase();
  if (normalized === "draft") return hasPersistedQuote ? "Guardado" : "Draft";
  if (!normalized) return hasPersistedQuote ? "Guardado" : "Draft";
  return String(rawStatus || "");
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

  const {
    quoteId,
    status,
    pricelistId,
    marginPercent,
    partnerId,
    paymentMethod,
    lines,
    dimensions,
    setPricelist,
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

  useEffect(() => { if (!idParam) { reset(); if (user?.default_maps_url) setEndCustomer({ maps_url: user.default_maps_url }); } }, [idParam, reset, user?.default_maps_url, setEndCustomer]);

  const pricelistsQ = useQuery({ queryKey: ["pricelists"], queryFn: getPricelists });
  useEffect(() => { if (!pricelistId && pricelistsQ.data?.length) setPricelist(pricelistsQ.data[0]); }, [pricelistId, pricelistsQ.data, setPricelist]);

  const quoteQ = useQuery({ queryKey: ["quote", idParam], queryFn: () => getQuote(idParam), enabled: !!idParam });

  const isRevisionQuote = (quoteQ.data?.quote_kind || "original") === "copy";
  const finalStatus = String(quoteQ.data?.final_status || "");
  const isAcopioRevision = isRevisionQuote && String(quoteQ.data?.fulfillment_mode || "").trim() === "acopio";
  const isReturnedMeasurementQuote = !isRevisionQuote && quoteLooksLikeReturnedMeasurement(quoteQ.data);
  const returnedMeasurementReason = String(quoteQ.data?.measurement_review_notes || "").trim();
  const returnedMeasurementForced = quoteQ.data?.measurement_return_force_reason === true;
  const visibleQuoteNumber = String(quoteQ.data?.quote_number || quoteQ.data?.odoo_sale_order_name || "").trim();
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
  }, [quoteQ.data, loadFromQuote, normalizedCatalogKind, navigate]);

  const financingQ = useQuery({ queryKey: ["financing-preview", paymentMethod], queryFn: () => getFinancingPreview(paymentMethod), enabled: !!String(paymentMethod || "").trim(), staleTime: 60 * 1000 });
  const financingPercent = Number(financingQ.data?.percent || 0) || 0;
  const totals = useMemo(() => calcTotals(lines, marginPercent, ivaRate, financingPercent), [lines, marginPercent, ivaRate, financingPercent]);
  const linesKey = useMemo(() => lines.map((l) => `${l.product_id}:${l.qty}`).join("|"), [lines]);

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
      const payload = { pricelist_id: pricelistId, partner_id: partnerId, lines: lines.filter((line) => !line.previously_billed_line).map((l) => ({ product_id: l.product_id, qty: l.qty })) };
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
    return withCreatorRole({ ...base, catalog_kind: catalogKind, fulfillment_mode: base?.fulfillment_mode || "acopio", note: normalizeNoteWithSeller(base?.note) });
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
      return { quote: created, payload: { ...payload, id: created.id, quote_id: created.id, quote_number: created.quote_number || "", seller_name: user?.full_name || user?.username || "" } };
    }
    const q = await updateQuote(quoteId, payload);
    setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
    qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
    return { quote: q, payload: { ...payload, id: q.id, quote_id: q.id, quote_number: q.quote_number || "", seller_name: user?.full_name || user?.username || "" } };
  }
  function maybeContinueDoorWorkflow(savedQuote) {
    if (!isDoorWorkflow || normalizedCatalogKind !== "ipanel" || !workflowDoorId) return false;
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

  const saveM = useMutation({ mutationFn: async () => { const payload = getDraftPayload(); validateDraft(payload); if (quoteId) return await updateQuote(quoteId, payload); return await createQuote(payload); }, onSuccess: (q) => { setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes }); qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); if (maybeContinueDoorWorkflow(q)) { toast.success("Ipanel guardado. Seguimos con el marco de puerta."); return; } navigate(editorRouteForKind(catalogKind, q.id)); toast.success("Guardado."); }, onError: (e) => toast.error(e?.message || "No se pudo guardar") });

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
    onSuccess: async (q) => { setConfirmChoiceOpen(false); setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes }); qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); if (maybeContinueDoorWorkflow(q)) { toast.success("Ipanel confirmado. Seguimos con el marco de puerta."); return; } navigate(`/presupuestos/${q.id}`); toast.success(isRevisionQuote ? "Cotización final enviada a Odoo." : "Presupuesto confirmado."); },
    onError: (e) => toast.error(e?.message || (isRevisionQuote ? "No se pudo enviar la cotización final" : "No se pudo confirmar")),
  });

  const resetReturnedM = useMutation({ mutationFn: async () => { if (!quoteId) throw new Error("Quote inválida"); return await resetReturnedMeasurementQuote(quoteId); }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["quote", quoteId] }); toast.success("Se restablecieron los productos originales del presupuesto."); }, onError: (e) => toast.error(e?.message || "No se pudo restablecer") });
  const confirmReturnedM = useMutation({ mutationFn: async () => { const payload = getDraftPayload(); validateConfirm(payload); if (!quoteId) throw new Error("Quote inválida"); await updateQuote(quoteId, payload); return await confirmReturnedMeasurementQuote(quoteId); }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["quote", quoteId] }); await qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); navigate("/menu", { replace: true }); toast.success("Se envió a su aprobación técnica final."); }, onError: (e) => toast.error(e?.message || "No se pudo enviar a técnica") });

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
        financingPercent,
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
        financingPercent,
        latestProductionPlanning ? { production_planning: latestProductionPlanning } : {},
      );
      console.log("[PDF FRONT] payload completo proforma", pdfPayload);
      console.log("[PDF FRONT] lineas proforma", summarizeLinesForDebug(pdfPayload?.lines || []));
      await downloadProformaPdf(pdfPayload);
    } catch (e) { toast.error(e?.response?.data?.error || e.message); }
  };

  const canConfirm = isAcopioRevision ? false : (isReturnedMeasurementQuote ? false : (isRevisionQuote ? ["", "draft", "rejected"].includes(finalStatus || "") : ["draft", "rejected_commercial", "rejected_technical"].includes(status)));

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

      {normalizedCatalogKind !== "otros" ? (
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
          <LinesTable />
          <div className="spacer" />
          <SummaryBox totals={totals} paymentMethod={paymentMethod} />
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

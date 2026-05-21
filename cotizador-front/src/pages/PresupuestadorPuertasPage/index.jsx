import { useEffect, useMemo, useState } from "react";
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
import { calcTotals } from "../../domain/quote/pricing.js";
import { getPrices, getPricelists, getFinancingPreview } from "../../api/odoo.js";
import { createQuote, getQuote, updateQuote, confirmQuote, listQuotes } from "../../api/quotes.js";
import { downloadPresupuestoPdf, downloadProformaPdf } from "../../api/pdf.js";
import { validateArgentinaPhone, validateEmailAddress, validateGoogleMapsUrl } from "../../utils/contactValidation.js";

function parseNum(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalizeUrl(value) { return String(value || "").trim().replace(/\/+$/, "").toLowerCase(); }
function cleanText(value) { return String(value || "").trim(); }
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
  return { ...(payload || {}), ...extras, lines: nextLines, payload: { ...(payload?.payload || {}), ...(extras.payload || {}) } };
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
    lines,
    dimensions,
    marginPercent,
    reset,
    loadFromQuote,
    setEndCustomer,
    setPricelist,
    buildPayloadForBack,
    setQuoteMeta,
    applyBasePrices,
  } = useQuoteStore();

  const [confirmChoiceOpen, setConfirmChoiceOpen] = useState(false);
  const [linkedPortonId, setLinkedPortonId] = useState("");
  const [ivaRate] = useState(IVA_RATE_DEFAULT);

  useEffect(() => {
    if (!idParam) {
      reset();
      setLinkedPortonId("");
      if (user?.default_maps_url) setEndCustomer({ maps_url: user.default_maps_url });
    }
  }, [idParam, reset, user?.default_maps_url, setEndCustomer]);

  const pricelistsQ = useQuery({ queryKey: ["pricelists"], queryFn: getPricelists });
  useEffect(() => { if (!pricelistId && pricelistsQ.data?.length) setPricelist(pricelistsQ.data[0]); }, [pricelistId, pricelistsQ.data, setPricelist]);

  const quoteQ = useQuery({ queryKey: ["quote", idParam], queryFn: () => getQuote(idParam), enabled: !!idParam });
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
  const linkedPorton = useMemo(() => portonQuotes.find((q) => String(q.id) === String(linkedPortonId)) || null, [portonQuotes, linkedPortonId]);

  const financingQ = useQuery({ queryKey: ["financing-preview", paymentMethod], queryFn: () => getFinancingPreview(paymentMethod), enabled: !!cleanText(paymentMethod), staleTime: 60 * 1000 });
  const financingPercent = Number(financingQ.data?.percent || 0) || 0;
  const totals = useMemo(() => calcTotals(lines, marginPercent, ivaRate, financingPercent), [lines, marginPercent, ivaRate, financingPercent]);
  const linesKey = useMemo(() => lines.map((l) => `${l.product_id}:${l.qty}`).join("|"), [lines]);

  useEffect(() => {
    async function run() {
      if (!pricelistId || !lines.length) return;
      const payload = { pricelist_id: pricelistId, partner_id: partnerId, lines: lines.filter((line) => !line.previously_billed_line).map((l) => ({ product_id: l.product_id, qty: l.qty })) };
      const data = await getPrices(payload);
      applyBasePrices(data);
    }
    run().catch(console.error);
  }, [pricelistId, partnerId, linesKey, lines.length, applyBasePrices]);

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
      },
    };
  }

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
  function validateConfirm(payload) {
    validateDraft(payload);
    const c = payload?.end_customer || {};
    const p = payload?.payload || {};
    if (!cleanText(c.address)) throw new Error("Completá la dirección del cliente.");
    if (!cleanText(c.city)) throw new Error("Completá la localidad del cliente.");
    if (!cleanText(p.payment_method)) throw new Error("Seleccioná la forma de pago.");
    if (String(p.condition_mode || "") === "special" && !cleanText(p.condition_text)) throw new Error("Completá la condición especial.");
    validateCustomerContact(c, { requirePhone: true, requireMaps: true, requireCity: true });
  }

  async function saveDoorQuote({ fulfillmentMode = null, forConfirm = false } = {}) {
    let payload = buildDoorPayload();
    if (fulfillmentMode) payload.fulfillment_mode = fulfillmentMode;
    if (forConfirm) validateConfirm(payload);
    else validateDraft(payload);

    let saved = null;
    const id = quoteId || idParam;
    if (id) saved = await updateQuote(id, payload);
    else saved = await createQuote(payload);

    const doorRef = buildDoorOrderReference({ linkedQuote: linkedPorton, savedQuote: saved });
    const payloadWithReference = buildDoorPayload({ savedQuote: saved, forceDoorRef: doorRef });
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
    mutationFn: async ({ fulfillmentMode }) => {
      const saved = await saveDoorQuote({ fulfillmentMode, forConfirm: true });
      return await confirmQuote(saved.id, { fulfillment_mode: fulfillmentMode });
    },
    onSuccess: (q) => { setConfirmChoiceOpen(false); setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes }); qc.invalidateQueries({ queryKey: ["quotes", "mine"] }); navigate(`/presupuestos/${q.id}`); toast.success("Presupuesto de puerta enviado a aprobación."); },
    onError: (e) => toast.error(e?.message || "No se pudo confirmar la puerta"),
  });

  async function onDownloadPdf(mode = "presupuesto") {
    try {
      const saved = await saveDoorQuote({ forConfirm: false });
      const payload = buildDoorPayload({ savedQuote: saved, forceDoorRef: buildDoorOrderReference({ linkedQuote: linkedPorton, savedQuote: saved }) });
      const pdfPayload = buildPdfPayloadForDownload(payload, financingPercent, {
        id: saved.id,
        quote_id: saved.id,
        quote_number: saved.quote_number || "",
        seller_name: user?.full_name || user?.username || "",
      });
      if (mode === "proforma") await downloadProformaPdf(pdfPayload);
      else await downloadPresupuestoPdf(pdfPayload);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "No se pudo generar el PDF");
    }
  }

  const canConfirm = ["draft", "rejected_commercial", "rejected_technical"].includes(status);
  const visibleQuoteNumber = cleanText(quoteQ.data?.quote_number || quoteQ.data?.odoo_sale_order_name || "");

  return (
    <div className="container" style={{ maxWidth: "100%", width: "100%" }}>
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="menu-card-icon" style={{ width: 52, height: 52 }}>🚪</div>
          <div>
            <h2 style={{ margin: 0 }}>{visibleQuoteNumber ? `Presupuesto Puerta #${visibleQuoteNumber}` : "Presupuestador Puertas"}</h2>
            <div className="muted">Cotizador de puertas con catálogo propio y flujo de aprobación Comercial + Técnica.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => onDownloadPdf("presupuesto")}>PDF presupuesto</Button>
          {user?.is_distribuidor ? <Button variant="secondary" onClick={() => onDownloadPdf("proforma")}>PDF proforma</Button> : null}
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? "Guardando..." : "Guardar"}</Button>
          <Button variant="primary" onClick={() => setConfirmChoiceOpen(true)} disabled={!canConfirm || confirmM.isPending}>{confirmM.isPending ? "Confirmando..." : "Confirmar presupuesto"}</Button>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>

      {quoteQ.isLoading ? <><div className="spacer" /><div className="card"><div className="muted">Cargando puerta...</div></div></> : null}
      {quoteQ.isError ? <><div className="spacer" /><div className="card"><div style={{ color: "#d93025" }}>{quoteQ.error.message}</div></div></> : null}

      {confirmChoiceOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }} onClick={() => { if (!confirmM.isPending) setConfirmChoiceOpen(false); }}>
          <div className="card" style={{ width: "100%", maxWidth: 880, background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 6 }}>Elegí el destino de la puerta</div>
            <div className="muted" style={{ marginBottom: 18 }}>La puerta usa el mismo circuito de aprobación que un portón.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              <div style={{ border: "1px solid #d9e5f7", background: "#f7fbff", borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Acopio</div>
                <div className="muted" style={{ marginBottom: 14 }}>La puerta queda en espera y genera Nota de Pedido PNP al aprobarse.</div>
                <Button onClick={() => confirmM.mutate({ fulfillmentMode: "acopio" })} disabled={confirmM.isPending}>Confirmar en Acopio</Button>
              </div>
              <div style={{ border: "1px solid #f2d3bf", background: "#fff8f3", borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Producción</div>
                <div className="muted" style={{ marginBottom: 14 }}>La puerta entra al circuito productivo y genera Nota de Pedido PNP al aprobarse.</div>
                <Button variant="primary" onClick={() => confirmM.mutate({ fulfillmentMode: "produccion" })} disabled={confirmM.isPending}>Confirmar en Producción</Button>
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
        <select value={linkedPortonId} onChange={(e) => applyPortonData(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", width: "100%", maxWidth: 720 }}>
          <option value="">Sin portón vinculado</option>
          {portonQuotes.map((q) => (
            <option key={q.id} value={q.id}>{quoteDisplayReference(q)} · {q?.end_customer?.name || "Sin cliente"} · {q?.status || "draft"}</option>
          ))}
        </select>
      </div>

      <div className="spacer" />
      <HeaderBar showMargin />

      <div className="spacer" />
      <div className="card"><PuertaDimensions /></div>

      <div className="spacer" />
      <div className="row quote-row">
        <div className="card" style={{ flex: 1, minWidth: 340 }}><PuertaCatalog /></div>
        <div className="card" style={{ flex: 2, minWidth: 560 }}>
          <LinesTable />
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

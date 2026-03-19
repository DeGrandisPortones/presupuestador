import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";

import { getPricelists, getPrices } from "../../api/odoo";
import { createQuote, getQuote, confirmQuote, submitFinalQuote, updateQuote } from "../../api/quotes";
import { syncDoorSaleByQuote } from "../../api/doors.js";
import { downloadPresupuestoPdf, downloadProformaPdf } from "../../api/pdf";
import toast from "react-hot-toast";

import { useQuoteStore } from "../../domain/quote/store";
import { IVA_RATE_DEFAULT } from "../../domain/quote/defaults";
import { calcTotals } from "../../domain/quote/pricing";
import {
  validateArgentinaPhone,
  validateEmailAddress,
  validateGoogleMapsUrl,
} from "../../utils/contactValidation.js";

import Button from "../../ui/Button.jsx";

import HeaderBar from "./components/HeaderBar";
import PortonDimensions from "./components/PortonDimensions";
import SectionCatalog from "./components/SectionCatalog";
import LinesTable from "./components/LinesTable";
import SummaryBox from "./components/SummaryBox";

export default function CotizadorPage({ catalogKind = "porton" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const params = useParams();
  const qc = useQueryClient();

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
    lines,
    setPricelist,
    applyBasePrices,
    loadFromQuote,
    reset,
    setEndCustomer,
    buildPayloadForBack,
    setQuoteMeta,
  } = useQuoteStore();

  const [ivaRate] = useState(IVA_RATE_DEFAULT);
  const [confirmChoiceOpen, setConfirmChoiceOpen] = useState(false);

  useEffect(() => {
    if (!idParam) {
      reset();
      if (user?.default_maps_url) setEndCustomer({ maps_url: user.default_maps_url });
    }
  }, [idParam, reset, user?.default_maps_url, setEndCustomer]);

  const pricelistsQ = useQuery({ queryKey: ["pricelists"], queryFn: getPricelists });

  useEffect(() => {
    if (!pricelistId && pricelistsQ.data?.length) setPricelist(pricelistsQ.data[0]);
  }, [pricelistId, pricelistsQ.data, setPricelist]);

  const quoteQ = useQuery({
    queryKey: ["quote", idParam],
    queryFn: () => getQuote(idParam),
    enabled: !!idParam,
  });

  useEffect(() => {
    if (!quoteQ.data) return;
    const qKind = (quoteQ.data.catalog_kind || "porton").toString().toLowerCase();
    if (qKind !== (catalogKind || "porton")) {
      const id = String(quoteQ.data.id);
      navigate(qKind === "ipanel" ? `/cotizador/ipanel/${id}` : `/cotizador/${id}`, { replace: true });
      return;
    }
    loadFromQuote(quoteQ.data);
  }, [quoteQ.data, loadFromQuote, catalogKind, navigate]);

  const totals = useMemo(() => calcTotals(lines, marginPercent, ivaRate), [lines, marginPercent, ivaRate]);
  const linesKey = useMemo(() => lines.map((l) => `${l.product_id}:${l.qty}`).join("|"), [lines]);
  const isRevisionQuote = (quoteQ.data?.quote_kind || "original") === "copy";
  const finalStatus = String(quoteQ.data?.final_status || "");
  const visibleQuoteNumber = String(
    quoteQ.data?.quote_number ||
    quoteQ.data?.odoo_sale_order_name ||
    quoteId ||
    idParam ||
    ""
  ).trim();
  const visibleParentQuoteNumber = String(
    quoteQ.data?.parent_quote_number ||
    quoteQ.data?.parent_quote_quote_number ||
    quoteQ.data?.parent_odoo_sale_order_name ||
    quoteQ.data?.parent_quote_id ||
    ""
  ).trim();

  useEffect(() => {
    async function run() {
      if (!pricelistId || !lines.length) return;
      const payload = {
        pricelist_id: pricelistId,
        partner_id: partnerId,
        lines: lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
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

  function withCreatorRole(payload) {
    return {
      ...(payload || {}),
      created_by_role: resolveCreatedByRole(),
    };
  }

  function normalizeNoteWithSeller(note) {
    const sellerLabel = String(user?.full_name || user?.username || "").trim();
    const raw = String(note || "").trim();
    if (!sellerLabel) return raw;
    const lines = raw ? raw.split(/\r?\n/).filter(Boolean) : [];
    const filtered = lines.filter((line) => !/^vendedor\s*:/i.test(String(line || "").trim()));
    filtered.push(`Vendedor: ${sellerLabel}`);
    return filtered.join("\n");
  }

  function getDraftPayload() {
    const base = buildPayloadForBack() || {};
    return withCreatorRole({
      ...base,
      catalog_kind: catalogKind,
      fulfillment_mode: base?.fulfillment_mode || "acopio",
      note: normalizeNoteWithSeller(base?.note),
    });
  }

  function validateCustomerContact(customer, { requirePhone = false, requireMaps = false, requireCity = false } = {}) {
    const c = customer || {};
    const city = String(c.city || "").trim();
    if (requireCity && !city) throw new Error("Completá la localidad del cliente.");
    const phoneErr = validateArgentinaPhone(c.phone, { required: requirePhone });
    if (phoneErr) throw new Error(phoneErr);
    const emailErr = validateEmailAddress(c.email, { required: false });
    if (emailErr) throw new Error(emailErr);
    const mapsErr = validateGoogleMapsUrl(c.maps_url, { required: requireMaps });
    if (mapsErr) throw new Error(mapsErr);
  }

  function validateDraft(payload) {
    const c = payload?.end_customer || {};
    const errs = [];
    if (!String(c.name || "").trim()) errs.push("Completá el nombre del cliente.");
    if (!String(c.phone || "").trim()) errs.push("Completá el teléfono del cliente.");
    if (!Array.isArray(payload?.lines) || payload.lines.length === 0) errs.push("Agregá al menos un producto.");
    if (errs.length) throw new Error(errs[0]);
    validateCustomerContact(c, { requirePhone: true, requireMaps: false, requireCity: false });
  }

  function validateConfirm(payload) {
    const c = payload?.end_customer || {};
    const p = payload?.payload || {};
    const errs = [];
    if (!String(c.name || "").trim()) errs.push("Completá el nombre del cliente.");
    if (!String(c.address || "").trim()) errs.push("Completá la dirección del cliente.");
    if (!String(c.city || "").trim()) errs.push("Completá la localidad del cliente.");
    if (!String(p.payment_method || "").trim()) errs.push("Seleccioná la forma de pago.");
    if ((catalogKind || "porton") === "porton" && !String(p.porton_type || "").trim()) errs.push("Seleccioná el tipo/sistema del portón.");
    if (String(p.condition_mode || "") === "special" && !String(p.condition_text || "").trim()) errs.push("Completá la condición especial.");
    if (!Array.isArray(payload?.lines) || payload.lines.length === 0) errs.push("Agregá al menos un producto.");
    if (errs.length) throw new Error(errs[0]);
    validateCustomerContact(c, { requirePhone: true, requireMaps: true, requireCity: true });
  }

  function validatePdfDownload(payload) {
    const c = payload?.end_customer || {};
    const errs = [];
    if (!String(c.name || "").trim()) errs.push("Completá el nombre del cliente.");
    if (!String(c.phone || "").trim()) errs.push("Completá el teléfono del cliente.");
    if (!Array.isArray(payload?.lines) || payload.lines.length === 0) errs.push("Agregá al menos un producto.");
    if (errs.length) throw new Error(errs[0]);
    validateCustomerContact(c, { requirePhone: true, requireMaps: false, requireCity: false });
  }

  async function persistDraftForPdf() {
    const payload = getDraftPayload();
    validateDraft(payload);
    let q = null;
    if (quoteId) q = await updateQuote(quoteId, payload);
    else q = await createQuote(payload);
    setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
    qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
    if (!quoteId) {
      navigate(catalogKind === "ipanel" ? `/cotizador/ipanel/${q.id}${location.search || ""}` : `/cotizador/${q.id}${location.search || ""}`, { replace: true });
    }
    return {
      quote: q,
      payload: {
        ...payload,
        id: q.id,
        quote_id: q.id,
        quote_number: q.quote_number || q.id,
        seller_name: user?.full_name || user?.username || "",
      },
    };
  }

  function maybeContinueDoorWorkflow(savedQuote) {
    if (!isDoorWorkflow || (catalogKind || "") !== "ipanel" || !workflowDoorId) return false;
    const nextUrl = `/puertas/${workflowDoorId}?door_workflow=1&workflow_stage=${encodeURIComponent(workflowStage === "ipanel_first" ? "door_final" : workflowStage)}&ipanel_quote_id=${encodeURIComponent(savedQuote?.id || quoteId || idParam || "")}&porton_id=${encodeURIComponent(workflowPortonId || "")}`;
    navigate(nextUrl);
    return true;
  }

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = getDraftPayload();
      validateDraft(payload);
      if (quoteId) return await updateQuote(quoteId, payload);
      return await createQuote(payload);
    },
    onSuccess: (q) => {
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      if (maybeContinueDoorWorkflow(q)) {
        toast.success("Ipanel guardado. Seguimos con el marco de puerta.");
        return;
      }
      navigate(catalogKind === "ipanel" ? `/cotizador/ipanel/${q.id}` : `/cotizador/${q.id}`);
      toast.success("Guardado.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar"),
  });

  const confirmM = useMutation({
    mutationFn: async (variables) => {
      const chosenMode = String(variables?.fulfillmentMode || buildPayloadForBack()?.fulfillment_mode || "acopio").trim();
      const payload = {
        ...getDraftPayload(),
        catalog_kind: catalogKind,
        fulfillment_mode: chosenMode,
      };
      validateConfirm(payload);
      let id = quoteId || idParam;
      if (id) {
        await updateQuote(id, payload);
      } else {
        const created = await createQuote(payload);
        id = created.id;
        setQuoteMeta({ quoteId: created.id, status: created.status, rejectionNotes: created.rejection_notes });
      }
      if (isRevisionQuote) return await submitFinalQuote(id);
      return await confirmQuote(id, { fulfillment_mode: chosenMode });
    },
    onSuccess: async (q) => {
      setConfirmChoiceOpen(false);
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      if (maybeContinueDoorWorkflow(q)) {
        toast.success("Ipanel confirmado. Seguimos con el marco de puerta.");
        return;
      }
      if (!isRevisionQuote && (catalogKind || "porton") === "porton") {
        try {
          const syncedDoor = await syncDoorSaleByQuote(q.id);
          if (syncedDoor?.odoo_sale_order_name) {
            toast.success(`Venta de puerta enviada a Odoo (${syncedDoor.odoo_sale_order_name}).`);
          }
        } catch (e) {
          toast.error(e?.message || "No se pudo sincronizar la venta de la puerta.");
        }
      }
      navigate(`/presupuestos/${q.id}`);
      toast.success(isRevisionQuote ? "Cotización final enviada a Odoo." : "Presupuesto confirmado.");
    },
    onError: (e) => toast.error(e?.message || (isRevisionQuote ? "No se pudo enviar la cotización final" : "No se pudo confirmar")),
  });

  const onDownloadPresupuesto = async () => {
    try {
      const { payload } = await persistDraftForPdf();
      validatePdfDownload(payload);
      await downloadPresupuestoPdf(payload);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const onDownloadProforma = async () => {
    try {
      const { payload } = await persistDraftForPdf();
      validatePdfDownload(payload);
      await downloadProformaPdf(payload);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const canConfirm = isRevisionQuote ? ["", "draft", "rejected"].includes(finalStatus || "") : ["draft", "rejected_commercial", "rejected_technical"].includes(status);

  return (
    <div className="container">
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img className="product-logo" src={catalogKind === "ipanel" ? "/brands/ipanel.png" : "/brands/degrandis.png"} alt={catalogKind === "ipanel" ? "Ipanel" : "DeGrandis Portones"} />
          <div>
            <h2 style={{ margin: 0 }}>{visibleQuoteNumber ? `${isRevisionQuote ? "Ajuste" : "Presupuesto"} #${visibleQuoteNumber}` : "Nuevo presupuesto"}</h2>
            <div className="muted">Estado: <b>{isRevisionQuote ? (finalStatus || status) : status}</b>{isRevisionQuote && quoteQ.data?.parent_quote_id ? <> · Ref. original: <b>{visibleParentQuoteNumber || String(quoteQ.data.parent_quote_id).slice(0, 8)}</b></> : null}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onDownloadPresupuesto}>PDF presupuesto</Button>
          {user?.is_distribuidor ? <Button variant="secondary" onClick={onDownloadProforma}>PDF proforma</Button> : null}
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? "Guardando..." : "Guardar"}</Button>
          <Button variant="primary" onClick={() => { if (isRevisionQuote) { confirmM.mutate({}); return; } setConfirmChoiceOpen(true); }} disabled={!canConfirm || confirmM.isPending}>{confirmM.isPending ? "Confirmando..." : (isRevisionQuote ? "Enviar cotización final" : "Confirmar presupuesto")}</Button>
        </div>
      </div>

      {!isRevisionQuote && confirmChoiceOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }} onClick={() => { if (!confirmM.isPending) setConfirmChoiceOpen(false); }}>
          <div className="card" style={{ width: "100%", maxWidth: 880, background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 6 }}>Elegí el destino del presupuesto</div>
            <div className="muted" style={{ marginBottom: 18 }}>Esta decisión cambia cómo sigue el circuito del portón después de confirmar.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              <div style={{ border: "1px solid #d9e5f7", background: "#f7fbff", borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Acopio</div>
                <div className="muted" style={{ marginBottom: 14 }}>El portón queda en espera. Se podrá seguir gestionando desde <b>Acopio → Producción</b> y mantiene una instancia de edición.</div>
                <Button onClick={() => confirmM.mutate({ fulfillmentMode: "acopio" })} disabled={confirmM.isPending}>{confirmM.isPending ? "Confirmando..." : "Confirmar en Acopio"}</Button>
              </div>
              <div style={{ border: "1px solid #f2d3bf", background: "#fff8f3", borderRadius: 14, padding: 16 }}>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Producción</div>
                <div className="muted" style={{ marginBottom: 14 }}>El portón entra directo en circuito productivo. Ya no podrá editarse desde <b>Presupuestos</b>.</div>
                <Button variant="primary" onClick={() => confirmM.mutate({ fulfillmentMode: "produccion" })} disabled={confirmM.isPending}>{confirmM.isPending ? "Confirmando..." : "Confirmar en Producción"}</Button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><Button variant="ghost" onClick={() => setConfirmChoiceOpen(false)} disabled={confirmM.isPending}>Cancelar</Button></div>
          </div>
        </div>
      )}

      <div className="spacer" />
      <HeaderBar pricelists={pricelistsQ.data || []} loadingPricelists={pricelistsQ.isLoading} showMargin />
      <div className="spacer" />
      <div className="row quote-row">
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <PortonDimensions />
          <div className="spacer" />
          <SectionCatalog kind={catalogKind} />
        </div>
        <div className="card" style={{ flex: 2, minWidth: 520 }}>
          <LinesTable />
          <div className="spacer" />
          <SummaryBox totals={totals} />
        </div>
      </div>
      {(saveM.isError || confirmM.isError) && <div className="spacer" />}
      {saveM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{saveM.error.message}</div>}
      {confirmM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{confirmM.error.message}</div>}
    </div>
  );
}

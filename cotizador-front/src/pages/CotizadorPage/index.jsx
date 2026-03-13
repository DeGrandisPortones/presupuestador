import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";

import { getPricelists, getPrices } from "../../api/odoo";
import { createQuote, getQuote, confirmQuote, submitFinalQuote, updateQuote } from "../../api/quotes";
import { createOrGetDoorFromQuote, createStandaloneDoor, updateDoor } from "../../api/doors.js";
import { downloadPresupuestoPdf, downloadProformaPdf } from "../../api/pdf";
import toast from "react-hot-toast";

import { useQuoteStore } from "../../domain/quote/store";
import { IVA_RATE_DEFAULT } from "../../domain/quote/defaults";
import { calcTotals } from "../../domain/quote/pricing";

import Button from "../../ui/Button.jsx";

import HeaderBar from "./components/HeaderBar";
import PortonDimensions from "./components/PortonDimensions";
import SectionCatalog from "./components/SectionCatalog";
import LinesTable from "./components/LinesTable";
import SummaryBox from "./components/SummaryBox";

export default function CotizadorPage({ catalogKind = "porton" }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const params = useParams();
  const qc = useQueryClient();

  const idParam = params.id ? String(params.id) : null;

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
  const [destinationPickerOpen, setDestinationPickerOpen] = useState(false);

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

  function getDraftPayload() {
    return {
      ...buildPayloadForBack(),
      catalog_kind: catalogKind,
      fulfillment_mode: buildPayloadForBack()?.fulfillment_mode || "acopio",
    };
  }

  function validateDraft(payload) {
    const c = payload?.end_customer || {};
    const errs = [];
    if (!String(c.name || "").trim()) errs.push("Completá el nombre del cliente.");
    if (!Array.isArray(payload?.lines) || payload.lines.length === 0) errs.push("Agregá al menos un producto.");
    if (errs.length) throw new Error(errs[0]);
  }

  function validateConfirm(payload) {
    const c = payload?.end_customer || {};
    const p = payload?.payload || {};
    const errs = [];
    if (!String(c.name || "").trim()) errs.push("Completá el nombre del cliente.");
    if (!String(c.phone || "").trim()) errs.push("Completá el teléfono del cliente.");
    if (!String(c.address || "").trim()) errs.push("Completá la dirección del cliente.");
    if (!String(c.maps_url || "").trim()) errs.push("Completá el URL de Google Maps del cliente.");
    if (!String(p.payment_method || "").trim()) errs.push("Seleccioná la forma de pago.");
    if ((catalogKind || "porton") === "porton" && !String(p.porton_type || "").trim()) errs.push("Seleccioná el tipo/sistema del portón.");
    if (String(p.condition_mode || "") === "special" && !String(p.condition_text || "").trim()) errs.push("Completá la condición especial.");
    if (!Array.isArray(payload?.lines) || payload.lines.length === 0) errs.push("Agregá al menos un producto.");
    if (errs.length) throw new Error(errs[0]);
  }

  function buildStandaloneDoorRecordSeed(baseRecord, payload) {
    const record = baseRecord && typeof baseRecord === "object" ? { ...baseRecord } : {};
    const currentCustomer = record.end_customer && typeof record.end_customer === "object" ? record.end_customer : {};
    const payloadCustomer = payload?.end_customer && typeof payload.end_customer === "object" ? payload.end_customer : {};

    record.end_customer = {
      ...currentCustomer,
      name: String(payloadCustomer.name || currentCustomer.name || "").trim(),
      phone: String(payloadCustomer.phone || currentCustomer.phone || "").trim(),
      email: String(payloadCustomer.email || currentCustomer.email || "").trim(),
      address: String(payloadCustomer.address || currentCustomer.address || "").trim(),
      maps_url: String(payloadCustomer.maps_url || currentCustomer.maps_url || "").trim(),
    };
    record.obra_cliente = String(record.end_customer.name || record.obra_cliente || "").trim();
    return record;
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
      navigate(catalogKind === "ipanel" ? `/cotizador/ipanel/${q.id}` : `/cotizador/${q.id}`);
      toast.success("Guardado.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar"),
  });

  const confirmM = useMutation({
    mutationFn: async ({ fulfillment_mode } = {}) => {
      const nextMode = String(fulfillment_mode || buildPayloadForBack()?.fulfillment_mode || "acopio").trim();
      const payload = {
        ...buildPayloadForBack(),
        catalog_kind: catalogKind,
        fulfillment_mode: nextMode,
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

      if (isRevisionQuote) {
        return await submitFinalQuote(id);
      }

      if (nextMode === "acopio") {
        window.alert("Tendrá una instancia para poder aplicar cambios al presupuesto.");
      } else if (nextMode === "produccion") {
        const ok = window.confirm("No podrá realizar cambio alguno al presupuesto, ¿desea continuar?");
        if (!ok) throw new Error("Confirmación cancelada.");
      } else {
        throw new Error("Destino inválido.");
      }

      return await confirmQuote(id, { fulfillment_mode: nextMode });
    },
    onSuccess: (q) => {
      setDestinationPickerOpen(false);
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      navigate(`/presupuestos/${q.id}`);
      toast.success(isRevisionQuote ? "Cotización final enviada a Odoo." : "Presupuesto confirmado.");
    },
    onError: (e) => toast.error(e?.message || (isRevisionQuote ? "No se pudo enviar la cotización final" : "No se pudo confirmar")),
  });

  const doorM = useMutation({
    mutationFn: async () => {
      if ((catalogKind || "porton") !== "porton") throw new Error("La puerta sólo se habilita desde el cotizador de portones.");
      const payload = getDraftPayload();
      const customerName = String(payload?.end_customer?.name || "").trim();
      if (!customerName) throw new Error("Completá al menos el nombre del cliente para abrir la puerta.");

      if (Array.isArray(payload?.lines) && payload.lines.length > 0) {
        validateDraft(payload);
        let id = quoteId || idParam;
        if (id) {
          await updateQuote(id, payload);
        } else {
          const created = await createQuote(payload);
          id = created.id;
          setQuoteMeta({ quoteId: created.id, status: created.status, rejectionNotes: created.rejection_notes });
          qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
        }
        return await createOrGetDoorFromQuote(id);
      }

      const standaloneDoor = await createStandaloneDoor();
      const nextRecord = buildStandaloneDoorRecordSeed(standaloneDoor?.record, payload);
      return await updateDoor(standaloneDoor.id, { record: nextRecord });
    },
    onSuccess: (door) => {
      navigate(`/puertas/${door.id}`);
      toast.success(door?.linked_quote_id ? "Puerta vinculada lista." : "Puerta aislada lista.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo abrir la puerta"),
  });

  const onDownloadPresupuesto = async () => {
    try {
      const payload = { ...buildPayloadForBack(), catalog_kind: catalogKind };
      validateConfirm(payload);
      await downloadPresupuestoPdf(payload);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const onDownloadProforma = async () => {
    try {
      const payload = { ...buildPayloadForBack(), catalog_kind: catalogKind };
      validateConfirm(payload);
      await downloadProformaPdf(payload);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const canConfirm = isRevisionQuote
    ? ["", "draft", "rejected"].includes(finalStatus || "")
    : ["draft", "rejected_commercial", "rejected_technical"].includes(status);
  const canOpenDoor = !!(user?.is_vendedor && (catalogKind || "porton") === "porton" && !isRevisionQuote);

  return (
    <div className="container">
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            className="product-logo"
            src={catalogKind === "ipanel" ? "/brands/ipanel.png" : "/brands/degrandis.png"}
            alt={catalogKind === "ipanel" ? "Ipanel" : "DeGrandis Portones"}
          />
          <div>
            <h2 style={{ margin: 0 }}>
              {quoteId ? `${isRevisionQuote ? "Ajuste" : "Presupuesto"} #${quoteId}` : "Nuevo presupuesto"}
            </h2>
            <div className="muted">
              Estado: <b>{isRevisionQuote ? (finalStatus || status) : status}</b>
              {isRevisionQuote && quoteQ.data?.parent_quote_id ? <> · Ref. original: <b>{String(quoteQ.data.parent_quote_id).slice(0, 8)}</b></> : null}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onDownloadPresupuesto}>PDF presupuesto</Button>
          {user?.is_distribuidor ? <Button variant="secondary" onClick={onDownloadProforma}>PDF proforma</Button> : null}
          {canOpenDoor ? <Button variant="ghost" onClick={() => doorM.mutate()} disabled={doorM.isPending}>{doorM.isPending ? "Abriendo puerta..." : "Puerta"}</Button> : null}
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? "Guardando..." : "Guardar"}</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (isRevisionQuote) {
                confirmM.mutate({ fulfillment_mode: buildPayloadForBack()?.fulfillment_mode || "acopio" });
                return;
              }
              setDestinationPickerOpen(true);
            }}
            disabled={!canConfirm || confirmM.isPending}
          >
            {confirmM.isPending ? "Confirmando..." : (isRevisionQuote ? "Enviar cotización final" : "Confirmar presupuesto")}
          </Button>
        </div>
      </div>

      {isRevisionQuote && (
        <>
          <div className="spacer" />
          <div className="card" style={{ background: "#fafafa" }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Cotización final a Odoo</div>
            <div className="muted">
              Esta instancia editable genera la nueva cotización detallada en Odoo y descuenta la seña ya enviada del presupuesto original.
            </div>
          </div>
        </>
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

      {(saveM.isError || confirmM.isError || doorM.isError) && <div className="spacer" />}
      {saveM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{saveM.error.message}</div>}
      {confirmM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{confirmM.error.message}</div>}
      {doorM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{doorM.error.message}</div>}

      {destinationPickerOpen && !isRevisionQuote && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17, 24, 39, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 560 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Confirmar presupuesto</h3>
            <div className="muted">Elegí si el portón queda en Acopio o pasa directamente a Producción.</div>

            <div className="spacer" />

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Acopio</div>
                <div className="muted">El presupuesto queda editable y después vas a poder solicitar su paso a Producción.</div>
                <div className="spacer" />
                <Button
                  onClick={() => {
                    setDestinationPickerOpen(false);
                    confirmM.mutate({ fulfillment_mode: "acopio" });
                  }}
                  disabled={confirmM.isPending}
                >
                  Confirmar Acopio
                </Button>
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Producción</div>
                <div className="muted">El presupuesto sigue su circuito sin instancia de cambios posteriores.</div>
                <div className="spacer" />
                <Button
                  variant="primary"
                  onClick={() => {
                    setDestinationPickerOpen(false);
                    confirmM.mutate({ fulfillment_mode: "produccion" });
                  }}
                  disabled={confirmM.isPending}
                >
                  Confirmar Producción
                </Button>
              </div>
            </div>

            <div className="spacer" />
            <Button variant="ghost" onClick={() => setDestinationPickerOpen(false)} disabled={confirmM.isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

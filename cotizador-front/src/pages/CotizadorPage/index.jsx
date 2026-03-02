import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";

import { getPricelists, getPrices } from "../../api/odoo";
import { createQuote, getQuote, confirmQuote, updateQuote } from "../../api/quotes";
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

  useEffect(() => {
    if (!idParam) {
      reset();
      if (user?.default_maps_url) {
        setEndCustomer({ maps_url: user.default_maps_url });
      }
    }
  }, [idParam, reset, user?.default_maps_url, setEndCustomer]);

  const pricelistsQ = useQuery({
    queryKey: ["pricelists"],
    queryFn: getPricelists,
  });

  useEffect(() => {
    if (!pricelistId && pricelistsQ.data?.length) {
      setPricelist(pricelistsQ.data[0]);
    }
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

  const totals = useMemo(
    () => calcTotals(lines, marginPercent, ivaRate),
    [lines, marginPercent, ivaRate]
  );

  const linesKey = useMemo(
    () => lines.map((l) => `${l.product_id}:${l.qty}`).join("|"),
    [lines]
  );

  useEffect(() => {
    async function run() {
      if (!pricelistId) return;
      if (!lines.length) return;

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

  // =============================
  // Validaciones (nuevo flujo)
  // =============================
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
    if ((catalogKind || "porton") === "porton" && !String(p.porton_type || "").trim()) {
      errs.push("Seleccioná el tipo/sistema del portón.");
    }
    if (String(p.condition_mode || "") === "special" && !String(p.condition_text || "").trim()) {
      errs.push("Completá la condición especial.");
    }
    if (!Array.isArray(payload?.lines) || payload.lines.length === 0) errs.push("Agregá al menos un producto.");

    if (errs.length) throw new Error(errs[0]);
  }

  // =============================
  // Guardar (create/update)
  // =============================
  const saveM = useMutation({
    mutationFn: async () => {
      const payload = {
        ...buildPayloadForBack(),
        catalog_kind: catalogKind,
        // Draft: si todavía no se eligió destino, default acopio
        fulfillment_mode: (buildPayloadForBack()?.fulfillment_mode || "acopio"),
      };
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

  // =============================
  // Confirmar presupuesto
  // =============================
  const confirmM = useMutation({
    mutationFn: async () => {
      const payload = {
        ...buildPayloadForBack(),
        catalog_kind: catalogKind,
        fulfillment_mode: (buildPayloadForBack()?.fulfillment_mode || "acopio"),
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

      // Elegir destino
      const raw = window.prompt("Confirmar presupuesto.\nEscribí 'A' para Acopio o 'P' para Producción:", "A");
      if (!raw) throw new Error("Confirmación cancelada.");
      const v = raw.trim().toUpperCase();
      let dest = "acopio";

      if (v === "A") {
        dest = "acopio";
        window.alert("Tendrá una instancia para poder aplicar cambios al presupuesto.");
      } else if (v === "P") {
        dest = "produccion";
        const ok = window.confirm("No podrá realizar cambio alguno al presupuesto, ¿desea continuar?");
        if (!ok) throw new Error("Confirmación cancelada.");
      } else {
        throw new Error("Opción inválida. Usá 'A' o 'P'.");
      }

      return await confirmQuote(id, { fulfillment_mode: dest });
    },
    onSuccess: (q) => {
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });
      navigate(`/presupuestos/${q.id}`);
      toast.success("Presupuesto confirmado.");
    },
    onError: (e) => toast.error(e?.message || "No se pudo confirmar"),
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

  const canConfirm = ["draft", "rejected_commercial", "rejected_technical"].includes(status);

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
              {quoteId ? `Presupuesto #${quoteId}` : "Nuevo presupuesto"}
            </h2>
            <div className="muted">Estado: <b>{status}</b></div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={onDownloadPresupuesto}>
            PDF presupuesto
          </Button>
          {user?.is_distribuidor ? (
            <Button variant="secondary" onClick={onDownloadProforma}>
              PDF proforma
            </Button>
          ) : null}

          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {saveM.isPending ? "Guardando..." : "Guardar"}
          </Button>

          <Button
            variant="primary"
            onClick={() => confirmM.mutate()}
            disabled={!canConfirm || confirmM.isPending}
            title={!canConfirm ? "Sólo se confirma desde borrador o rechazados" : ""}
          >
            {confirmM.isPending ? "Confirmando..." : "Confirmar presupuesto"}
          </Button>
        </div>
      </div>

      <div className="spacer" />

      <HeaderBar
        pricelists={pricelistsQ.data || []}
        loadingPricelists={pricelistsQ.isLoading}
        showMargin
      />

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

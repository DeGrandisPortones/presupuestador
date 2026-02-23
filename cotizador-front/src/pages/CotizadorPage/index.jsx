import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";

import { getPricelists, getPrices } from "../../api/odoo";
import { createQuote, getQuote, submitQuote, updateQuote } from "../../api/quotes";
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

  // ✅ UUID como string (NO Number)
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
    buildPayloadForBack,
    setQuoteMeta,
  } = useQuoteStore();

  const [ivaRate] = useState(IVA_RATE_DEFAULT);

  // si no hay id en URL, es “nuevo”
  useEffect(() => {
    if (!idParam) reset();
  }, [idParam, reset]);

  // 1) Pricelists
  const pricelistsQ = useQuery({
    queryKey: ["pricelists"],
    queryFn: getPricelists,
  });

  // default pricelist
  useEffect(() => {
    if (!pricelistId && pricelistsQ.data?.length) {
      setPricelist(pricelistsQ.data[0]);
    }
  }, [pricelistId, pricelistsQ.data, setPricelist]);

  // 2) Si estamos editando (URL con id), cargamos desde back
  const quoteQ = useQuery({
    queryKey: ["quote", idParam],
    queryFn: () => getQuote(idParam),
    enabled: !!idParam,
  });

  useEffect(() => {
    if (!quoteQ.data) return;

    // Si abrieron una quote del tipo incorrecto, redirigimos al cotizador correcto.
    const qKind = (quoteQ.data.catalog_kind || "porton").toString().toLowerCase();
    if (qKind !== (catalogKind || "porton")) {
      const id = String(quoteQ.data.id);
      navigate(qKind === "ipanel" ? `/cotizador/ipanel/${id}` : `/cotizador/${id}`, { replace: true });
      return;
    }

    loadFromQuote(quoteQ.data);
  }, [quoteQ.data, loadFromQuote, catalogKind, navigate]);

  // 3) Totales (margen sólo UI)
  const totals = useMemo(
    () => calcTotals(lines, marginPercent, ivaRate),
    [lines, marginPercent, ivaRate]
  );

  // 4) Recalcular precios base cuando cambian líneas o pricelist
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

  // 5) Guardar (create/update)
  const saveM = useMutation({
    mutationFn: async () => {
      const payload = { ...buildPayloadForBack(), catalog_kind: catalogKind };

      // ✅ si hay quoteId => update; si no => create
      if (quoteId) return await updateQuote(quoteId, payload);
      return await createQuote(payload);
    },
    onSuccess: (q) => {
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });

      // ✅ nos quedamos editando el MISMO presupuesto (con UUID)
      navigate(catalogKind === "ipanel" ? `/cotizador/ipanel/${q.id}` : `/cotizador/${q.id}`);
    },
  });

  // 6) Enviar a aprobación
  const submitM = useMutation({
    mutationFn: async () => {
      // ✅ submit también guarda (create/update) para evitar que el usuario tenga que hacer 2 pasos.
      const payload = { ...buildPayloadForBack(), catalog_kind: catalogKind };

      // Validaciones mínimas para evitar rechazos del back y que el usuario "no vea" el error.
      if (!String(payload?.end_customer?.name || "").trim()) {
        throw new Error("Completá el nombre del cliente.");
      }
      if (!String(payload?.end_customer?.address || "").trim()) {
        throw new Error("Completá la dirección del cliente.");
      }

      let id = quoteId || idParam;
      if (id) {
        // guardamos cambios antes de enviar
        await updateQuote(id, payload);
      } else {
        const created = await createQuote(payload);
        id = created.id;
        // dejamos meta para que el estado local quede consistente
        setQuoteMeta({ quoteId: created.id, status: created.status, rejectionNotes: created.rejection_notes });
      }

      return await submitQuote(id);
    },
    onSuccess: (q) => {
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });

      // opcional: ir a “Mis presupuestos”
      navigate(`/presupuestos/${q.id}`);
      toast.success("Enviado a aprobación.");
    },
    onError: (e) => {
      toast.error(e?.message || "No se pudo enviar a aprobación");
    },
  });

  const onDownloadPresupuesto = async () => {
    try {
      const payload = { ...buildPayloadForBack(), catalog_kind: catalogKind };
      await downloadPresupuestoPdf(payload);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const onDownloadProforma = async () => {
    try {
      const payload = { ...buildPayloadForBack(), catalog_kind: catalogKind };
      await downloadProformaPdf(payload);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    }
  };

  const canSubmit = ["draft", "rejected_commercial", "rejected_technical"].includes(status);

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
            {quoteId ? `Presupuesto #${String(quoteId).slice(0, 8)}` : "Nuevo presupuesto"}
          </h2>
          <div className="muted">
            Estado: <b>{status}</b>
          </div>
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
          <Button
            onClick={() => saveM.mutate()}
            disabled={saveM.isPending}
          >
            {saveM.isPending ? "Guardando..." : "Guardar"}
          </Button>

          <Button
            variant="primary"
            onClick={() => submitM.mutate()}
            disabled={!canSubmit || submitM.isPending}
            title={!canSubmit ? "Sólo se envía desde borrador o rechazados" : ""}
          >
            {submitM.isPending ? "Enviando..." : "Enviar a aprobación"}
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

      {saveM.isError && <div className="spacer" />}
      {saveM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{saveM.error.message}</div>}

      {submitM.isError && <div className="spacer" />}
      {submitM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{submitM.error.message}</div>}
    </div>
  );
}

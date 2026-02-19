import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../domain/auth/store.js";

import { getPricelists, getPrices } from "../../api/odoo";
import { createQuote, getQuote, submitQuote, updateQuote } from "../../api/quotes";

import { useQuoteStore } from "../../domain/quote/store";
import { IVA_RATE_DEFAULT } from "../../domain/quote/defaults";
import { calcTotals } from "../../domain/quote/pricing";

import Button from "../../ui/Button.jsx";

import HeaderBar from "./components/HeaderBar";
import SectionCatalog from "./components/SectionCatalog";
import LinesTable from "./components/LinesTable";
import SummaryBox from "./components/SummaryBox";

export default function CotizadorPage() {
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
    if (quoteQ.data) loadFromQuote(quoteQ.data);
  }, [quoteQ.data, loadFromQuote]);

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
      const payload = buildPayloadForBack();

      // ✅ si hay quoteId => update; si no => create
      if (quoteId) return await updateQuote(quoteId, payload);
      return await createQuote(payload);
    },
    onSuccess: (q) => {
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });

      // ✅ nos quedamos editando el MISMO presupuesto (con UUID)
      navigate(`/cotizador/${q.id}`);
    },
  });

  // 6) Enviar a aprobación
  const submitM = useMutation({
    mutationFn: async () => {
      const id = quoteId || idParam;
      if (!id) throw new Error("Primero guardá el presupuesto.");
      return await submitQuote(id);
    },
    onSuccess: (q) => {
      setQuoteMeta({ quoteId: q.id, status: q.status, rejectionNotes: q.rejection_notes });
      qc.invalidateQueries({ queryKey: ["quotes", "mine"] });

      // opcional: ir a “Mis presupuestos”
      navigate(`/presupuestos/${q.id}`);
    },
  });

  const canSubmit = ["draft", "rejected_commercial", "rejected_technical"].includes(status);

  return (
    <div className="container">
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {quoteId ? `Presupuesto #${String(quoteId).slice(0, 8)}` : "Nuevo presupuesto"}
          </h2>
          <div className="muted">
            Estado: <b>{status}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
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

      <HeaderBar pricelists={pricelistsQ.data || []} loadingPricelists={pricelistsQ.isLoading} />

      <div className="spacer" />

      <div className="row">
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <SectionCatalog />
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

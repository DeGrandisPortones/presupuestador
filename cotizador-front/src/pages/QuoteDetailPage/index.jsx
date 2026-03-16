import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import { getQuote, reviewCommercial, reviewTechnical, createRevisionQuote } from "../../api/quotes.js";
import { listDoorsByQuote } from "../../api/doors.js";
import { downloadMedicionPdf } from "../../api/pdf.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { formatARS } from "../../domain/quote/pricing.js";
import MeasurementReadOnlyView from "../../components/MeasurementReadOnlyView.jsx";

function pillStyle(bg, border) {
  return { padding: "2px 8px", borderRadius: 999, background: bg, border: `1px solid ${border}`, fontSize: 12, fontWeight: 800 };
}
function measurementStatusLabel(s) {
  if (s === "pending") return "Pendiente";
  if (s === "submitted") return "Enviada";
  if (s === "needs_fix") return "A corregir";
  if (s === "approved") return "Aprobada";
  if (s === "none" || !s) return "Pendiente";
  return s;
}
function hasMeasurementForPdf(q) {
  return !!q?.measurement_form || ["submitted", "needs_fix", "approved"].includes(q?.measurement_status);
}
function decisionLabel(d) {
  if (d === "approved") return "Aprobado";
  if (d === "rejected") return "Rechazado";
  return "Pendiente";
}

export default function QuoteDetailPage() {
  const params = useParams();
  const quoteId = params.id ? String(params.id) : null;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [notes, setNotes] = useState("");

  const q = useQuery({ queryKey: ["quote", quoteId], queryFn: () => getQuote(quoteId), enabled: !!quoteId });
  const linkedDoorsQ = useQuery({ queryKey: ["doors", "by-quote", quoteId], queryFn: () => listDoorsByQuote(quoteId), enabled: !!quoteId });
  const quote = q.data;
  const isRevision = (quote?.quote_kind || "original") === "copy";
  const canCommercial = !!user?.is_enc_comercial && quote?.created_by_role === "vendedor" && !isRevision;
  const canTech = !!user?.is_rev_tecnica && !isRevision;
  const canCommercialAct = canCommercial && quote?.status === "pending_approvals" && quote?.commercial_decision === "pending";
  const canTechAct = canTech && quote?.status === "pending_approvals" && quote?.technical_decision === "pending";
  const showMeasurement = !!quote?.requires_measurement || (quote?.catalog_kind === "porton" && quote?.status === "synced_odoo" && quote?.fulfillment_mode === "produccion");

  const commercialM = useMutation({ mutationFn: ({ action }) => reviewCommercial(quoteId, { action, notes }), onSuccess: () => q.refetch() });
  const techM = useMutation({ mutationFn: ({ action }) => reviewTechnical(quoteId, { action, notes }), onSuccess: () => q.refetch() });
  const revisionM = useMutation({
    mutationFn: () => createRevisionQuote(quoteId),
    onSuccess: (newQuote) => {
      if (!newQuote?.id) return;
      navigate(newQuote.catalog_kind === "ipanel" ? `/cotizador/ipanel/${newQuote.id}` : `/cotizador/${newQuote.id}`);
    },
  });

  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const rejectionBoxes = useMemo(() => {
    if (!quote) return [];
    const arr = [];
    if (quote.commercial_decision === "rejected") arr.push({ title: "Rechazo Comercial", body: quote.commercial_notes || "(sin motivo)" });
    if (quote.technical_decision === "rejected") arr.push({ title: "Rechazo Técnica", body: quote.technical_notes || "(sin motivo)" });
    return arr;
  }, [quote]);

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>{isRevision ? "Ajuste" : "Presupuesto"} #{quoteId ? String(quoteId).slice(0, 8) : "—"}</h2>
        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
        {quote && (
          <>
            <div className="spacer" />
            <div className="muted" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span>Estado: <b>{isRevision ? (quote.final_status || quote.status) : quote.status}</b></span>
              <span>· Creado por: <b>{quote.created_by_role}</b></span>
              <span>· Destino: <b>{quote.fulfillment_mode === "acopio" ? "Acopio" : "Producción"}</b></span>
              {!isRevision && quote.status === "synced_odoo" && <span style={pillStyle("#e7f7ed", "#bfe6c8")}>En Odoo: {quote.odoo_sale_order_name || `SO#${quote.odoo_sale_order_id}`}</span>}
              {isRevision && quote.final_sale_order_name && <span style={pillStyle("#e7f7ed", "#bfe6c8")}>Odoo final: {quote.final_sale_order_name}</span>}
              {quote.status === "syncing_odoo" && <span style={pillStyle("#fff7e6", "#ffd9a8")}>Sincronizando a Odoo…</span>}
            </div>
            {!!rejectionBoxes.length && <><div className="spacer" />{rejectionBoxes.map((b) => <div key={b.title} style={{ padding: 10, borderRadius: 10, border: "1px solid #f2c1be", background: "#fff5f5", marginBottom: 10 }}><div style={{ fontWeight: 900, marginBottom: 6 }}>{b.title}</div><div>{b.body}</div></div>)}</>}
            <div className="spacer" />
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="muted">Cliente</div>
                <div style={{ fontWeight: 700 }}>{quote.end_customer?.name || "(sin nombre)"}</div>
                <div className="muted">{quote.end_customer?.phone || ""}</div>
                <div className="muted">{quote.end_customer?.address || ""}</div>
                {isRevision && quote.parent_quote_id ? <div className="muted">Ref. original: <b>{String(quote.parent_quote_id).slice(0, 8)}</b></div> : null}
              </div>
              <div style={{ flex: 1 }}>
                <div className="muted">Observaciones</div>
                <div>{quote.note || <span className="muted">(sin notas)</span>}</div>
                {isRevision && typeof quote.final_difference_amount === "number" ? <div className="muted" style={{ marginTop: 8 }}>Diferencia final: <b>{formatARS(quote.final_difference_amount)}</b></div> : null}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                {((!isRevision && quote.status === "draft") || (isRevision && !["syncing_odoo", "synced_odoo"].includes(quote.final_status || ""))) && <Button onClick={() => navigate((quote.catalog_kind || "porton") === "ipanel" ? `/cotizador/ipanel/${quote.id}` : `/cotizador/${quote.id}`)}>Editar</Button>}
                {((user?.is_vendedor || user?.is_distribuidor) && String(quote.created_by_user_id) === String(user.user_id) && !isRevision && quote.status === "synced_odoo") && <Button variant="ghost" disabled={revisionM.isPending} onClick={() => revisionM.mutate()}>{revisionM.isPending ? "Abriendo…" : "Ver / editar final"}</Button>}
                {isRevision && quote.parent_quote_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${quote.parent_quote_id}`)}>Ver original</Button> : null}
                <Button variant="ghost" onClick={() => navigate("/presupuestos")}>Volver</Button>
              </div>
            </div>
            {!!linkedDoorsQ.data?.length && !isRevision && <><div className="spacer" /><div className="card" style={{ background: "#fafafa" }}><div style={{ fontWeight: 900, marginBottom: 8 }}>Puertas vinculadas</div><table><thead><tr><th>Código</th><th>Cliente</th><th>Estado</th><th>Venta Odoo</th><th>Compra Odoo</th><th></th></tr></thead><tbody>{linkedDoorsQ.data.map((d) => <tr key={d.id}><td>{d.door_code}</td><td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td><td>{d.status}</td><td>{d.odoo_sale_order_name || "—"}</td><td>{d.odoo_purchase_order_name || "—"}</td><td className="right"><Button variant="ghost" onClick={() => navigate(`/puertas/${d.id}`)}>Abrir puerta</Button></td></tr>)}</tbody></table></div></>}
            {!isRevision && <><div className="spacer" /><div className="card" style={{ background: "#fafafa" }}><div style={{ fontWeight: 900, marginBottom: 6 }}>Aprobaciones</div><div className="muted" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><span>Comercial: <b>{decisionLabel(quote.commercial_decision)}</b>{quote.commercial_decision === "rejected" && quote.commercial_notes ? ` · ${quote.commercial_notes}` : ""}</span><span>Técnica: <b>{decisionLabel(quote.technical_decision)}</b>{quote.technical_decision === "rejected" && quote.technical_notes ? ` · ${quote.technical_notes}` : ""}</span></div></div></>}
            {showMeasurement && !isRevision && <><div className="spacer" /><div className="card" style={{ background: "#fafafa" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><div style={{ fontWeight: 900 }}>Planilla de medición</div><div className="muted">Estado: <b>{measurementStatusLabel(quote.measurement_status)}</b></div></div>{hasMeasurementForPdf(quote) && <Button variant="secondary" onClick={() => downloadMedicionPdf(quote.id)}>Descargar PDF</Button>}</div><div className="spacer" />{quote.measurement_form && <MeasurementReadOnlyView quote={quote} />}</div></>}
            <h3 style={{ marginTop: 0 }}>Ítems</h3>
            {!lines.length && <div className="muted">Sin ítems</div>}
            {!!lines.length && <table><thead><tr><th>Producto</th><th className="right">Cant.</th><th className="right">Base</th><th className="right">Total</th></tr></thead><tbody>{lines.map((l, idx) => { const qty = Number(l.qty || 0); const base = Number(l.basePrice ?? l.price ?? 0); const total = qty * base; return <tr key={idx}><td><div style={{ fontWeight: 700 }}>{l.name || `Producto ${l.product_id}`}</div><div className="muted">ID: {l.product_id} {l.code ? `| ${l.code}` : ""}</div></td><td className="right">{qty}</td><td className="right">{formatARS(base)}</td><td className="right" style={{ fontWeight: 800 }}>{formatARS(total)}</td></tr>; })}</tbody></table>}
            {(canCommercial || canTech) && <><div className="spacer" /><div className="card" style={{ background: "#fafafa" }}><div style={{ fontWeight: 900 }}>Acciones de revisión</div><div className="muted">Solo si está en <b>pending_approvals</b> y tu decisión está en <b>pending</b>.</div><div className="spacer" /><div className="muted">Observaciones del revisor</div><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo si rechaza / notas si aprueba…" style={{ width: "100%", minHeight: 60, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", outline: "none", resize: "vertical" }} /><div className="spacer" /><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{canCommercial && <><Button disabled={!canCommercialAct || commercialM.isPending} onClick={() => commercialM.mutate({ action: "approve" })}>{commercialM.isPending ? "Procesando..." : "Aprobar Comercial"}</Button><Button variant="danger" disabled={!canCommercialAct || commercialM.isPending} onClick={() => commercialM.mutate({ action: "reject" })}>Rechazar Comercial</Button></>}{canTech && <><Button disabled={!canTechAct || techM.isPending} onClick={() => techM.mutate({ action: "approve" })}>{techM.isPending ? "Procesando..." : "Aprobar Técnica"}</Button><Button variant="danger" disabled={!canTechAct || techM.isPending} onClick={() => techM.mutate({ action: "reject" })}>Rechazar Técnica</Button></>}</div></div></>}
          </>
        )}
      </div>
    </div>
  );
}

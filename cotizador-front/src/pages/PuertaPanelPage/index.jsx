import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { getDoor, submitDoor, updateDoor } from "../../api/doors.js";
import { getQuote, listQuotes } from "../../api/quotes.js";

function safe(v) { return String(v || "").trim(); }
function numberOrDash(v) { return safe(v) || "-"; }
function quoteLabel(q) { return safe(q?.odoo_sale_order_name || q?.final_sale_order_name || q?.quote_number || q?.id); }
function isQuoteComplete(q) { return !!q && Array.isArray(q.lines) && q.lines.length > 0; }
function isDoorLinked(door) { return !!safe(door?.linked_quote_id); }
function isCustomerComplete(door) { return !!safe(door?.record?.end_customer?.name || door?.record?.obra_cliente) && !!safe(door?.record?.end_customer?.phone); }
function structureEditorKind(quote, door) {
  const kind = safe(quote?.catalog_kind || door?.record?.structure_catalog_kind || "puerta").toLowerCase();
  return kind === "puerta" ? "puerta" : "otros";
}
function panelStatus({ door, structureQuote, ipanelQuote }) {
  const pending = [];
  if (!isDoorLinked(door)) pending.push("porton vinculado");
  if (!isCustomerComplete(door)) pending.push("cliente");
  if (!isQuoteComplete(structureQuote)) pending.push("estructura");
  if (!isQuoteComplete(ipanelQuote)) pending.push("Ipanel");
  return pending.length ? `Falta ${pending.join(", ")}` : "Puerta completa";
}

export default function PuertaPanelPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [selectedPortonId, setSelectedPortonId] = useState("");

  const q = useQuery({ queryKey: ["door", "panel", id], queryFn: () => getDoor(id), enabled: !!id });
  const door = q.data;
  const authUserId = String(user?.user_id ?? user?.id ?? "");
  const canSellerEdit = !!user?.is_vendedor && String(door?.created_by_user_id ?? "") === authUserId;

  const structureQuoteId = safe(door?.record?.structure_quote_id || door?.structure_quote_id);
  const ipanelQuoteId = safe(door?.record?.ipanel_quote_id);
  const structureQ = useQuery({ queryKey: ["quote", "door-structure", structureQuoteId], queryFn: () => getQuote(structureQuoteId), enabled: !!structureQuoteId });
  const ipanelQ = useQuery({ queryKey: ["quote", "door-ipanel", ipanelQuoteId], queryFn: () => getQuote(ipanelQuoteId), enabled: !!ipanelQuoteId });
  const quotesQ = useQuery({ queryKey: ["quotes", "mine", "door-link"], queryFn: () => listQuotes({ scope: "mine" }), enabled: !!canSellerEdit && !isDoorLinked(door) });

  const portonOptions = useMemo(() => (quotesQ.data || []).filter((q) => String(q?.catalog_kind || "porton").toLowerCase() === "porton"), [quotesQ.data]);
  const selectedMode = safe(door?.record?.fulfillment_mode || door?.linked_quote_fulfillment_mode);
  const statusLabel = useMemo(() => panelStatus({ door, structureQuote: structureQ.data, ipanelQuote: ipanelQ.data }), [door, structureQ.data, ipanelQ.data]);
  const canSubmitDoor = canSellerEdit && isDoorLinked(door) && isCustomerComplete(door) && isQuoteComplete(structureQ.data) && isQuoteComplete(ipanelQ.data) && door?.status === "draft";

  const linkM = useMutation({
    mutationFn: async () => {
      if (!selectedPortonId) throw new Error("Selecciona un presupuesto de porton.");
      return await updateDoor(id, { record: door?.record || {}, linked_quote_id: selectedPortonId });
    },
    onSuccess: async () => { toast.success("Porton vinculado a la puerta."); await q.refetch(); },
    onError: (e) => toast.error(e?.message || "No se pudo vincular el porton"),
  });

  const submitM = useMutation({
    mutationFn: async () => await submitDoor(id),
    onSuccess: async () => { await q.refetch(); toast.success("Puerta enviada a aprobacion."); },
    onError: (e) => toast.error(e?.message || "No se pudo enviar la puerta"),
  });

  if (q.isLoading) return <div className="container"><div className="card">Cargando...</div></div>;
  if (q.isError) return <div className="container"><div className="card" style={{ color: "#d93025" }}>{q.error.message}</div></div>;

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Puerta · {door?.door_code || "-"}</h2>
            <div className="muted">Presupuesto unico de puerta compuesto por <b>Estructura</b> + <b>Ipanel</b>.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {door?.linked_quote_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>Ver porton</Button> : null}
            <Button variant="ghost" onClick={() => navigate("/puertas")}>Volver</Button>
          </div>
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div><span className="muted">Estado:</span> <b>{statusLabel}</b></div>
          <div><span className="muted">Porton:</span> <b>{door?.linked_quote_odoo_name || door?.linked_quote_number || door?.record?.asociado_porton || "Sin vincular"}</b></div>
          <div><span className="muted">Estructura:</span> <b>{isQuoteComplete(structureQ.data) ? "Completa" : "Falta completar"}</b></div>
          <div><span className="muted">Ipanel:</span> <b>{isQuoteComplete(ipanelQ.data) ? "Completo" : "Falta completar"}</b></div>
          <div><span className="muted">Destino:</span> <b>{selectedMode ? (selectedMode === "acopio" ? "Acopio" : "Produccion") : "Sin definir"}</b></div>
        </div>
      </div>

      {!isDoorLinked(door) && canSellerEdit ? (
        <>
          <div className="spacer" />
          <div className="card" style={{ border: "1px solid #f2c1be", background: "#fff5f5" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Vincular a porton</div>
            <div className="muted" style={{ marginBottom: 10 }}>La puerta puede guardarse como borrador, pero para confirmarla debe estar vinculada a un presupuesto de porton.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={selectedPortonId} onChange={(e) => setSelectedPortonId(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 320 }}>
                <option value="">Seleccionar presupuesto de porton</option>
                {portonOptions.map((p) => <option key={p.id} value={p.id}>{quoteLabel(p)} · {p?.end_customer?.name || "Sin cliente"}</option>)}
              </select>
              <Button onClick={() => linkM.mutate()} disabled={linkM.isPending || !selectedPortonId}>{linkM.isPending ? "Vinculando..." : "Vincular"}</Button>
            </div>
            {quotesQ.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{quotesQ.error.message}</div> : null}
          </div>
        </>
      ) : null}

      <div className="spacer" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <div className="card" style={{ border: "1px solid #d9e5f7", background: "#f7fbff" }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Estructura</div>
          <div className="muted" style={{ marginBottom: 14 }}>Cotiza la estructura propia de la puerta en la seccion separada de puertas.</div>
          <div className="muted" style={{ marginBottom: 10 }}>Presupuesto: <b>{numberOrDash(structureQ.data?.quote_number || structureQuoteId)}</b></div>
          <Button variant="primary" onClick={() => navigate(`/cotizador/${structureEditorKind(structureQ.data, door)}/${structureQuoteId}?door_workflow=1&workflow_stage=estructura&door_id=${encodeURIComponent(id)}`)} disabled={!structureQuoteId || structureQ.isLoading}>Completar estructura</Button>
        </div>
        <div className="card" style={{ border: "1px solid #d9e5f7", background: "#f7fbff" }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Ipanel</div>
          <div className="muted" style={{ marginBottom: 14 }}>Revestimiento de la puerta. Las medidas se actualizan automaticamente desde Reglas Tecnicas puertas.</div>
          <div className="muted" style={{ marginBottom: 10 }}>Presupuesto: <b>{numberOrDash(ipanelQ.data?.quote_number || ipanelQuoteId)}</b></div>
          <Button onClick={() => navigate(`/cotizador/ipanel/${ipanelQuoteId}?door_workflow=1&workflow_stage=ipanel&door_id=${encodeURIComponent(id)}`)} disabled={!ipanelQuoteId}>Completar Ipanel</Button>
        </div>
        <div className="card" style={{ border: "1px solid #eee", background: "#fff" }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Datos tecnicos</div>
          <div className="muted" style={{ marginBottom: 14 }}>Carga medidas, sentido, mano, interferencias y observaciones.</div>
          <Button variant="secondary" onClick={() => navigate(`/puertas/${id}/marco?door_workflow=1&return_to_panel=1`)}>Abrir datos tecnicos</Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Confirmar puerta</div>
        <div className="muted" style={{ marginBottom: 12 }}>Al confirmar, la puerta entra a aprobacion y luego genera solo la venta Odoo <b>{door?.door_code}</b>. Ya no genera compra de marco.</div>
        <Button variant="primary" disabled={!canSubmitDoor || submitM.isPending} onClick={() => submitM.mutate()}>{submitM.isPending ? "Enviando..." : "Enviar a aprobacion"}</Button>
      </div>
    </div>
  );
}

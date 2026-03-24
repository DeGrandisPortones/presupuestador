import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { createQuote, getQuote } from "../../api/quotes.js";
import { getDoor, submitDoor, updateDoor } from "../../api/doors.js";

function safe(v) { return String(v || "").trim(); }
function numberOrDash(v) { return safe(v) || "—"; }
function isMarcoComplete(door) {
  const r = door?.record || {};
  return !!safe(r?.end_customer?.name) && !!safe(r?.end_customer?.phone) && !!safe(r?.supplier_odoo_partner_id) && Number(r?.sale_amount || 0) > 0 && Number(r?.purchase_amount || 0) > 0;
}
function isIpanelComplete(door, q) { return !!safe(door?.record?.ipanel_quote_id) && !!q && Array.isArray(q.lines) && q.lines.length > 0; }
function buildIpanelPayloadFromDoor(door, user) { const record = door?.record || {}; return { created_by_role: "vendedor", catalog_kind: "ipanel", fulfillment_mode: "acopio", pricelist_id: 1, end_customer: { ...(record?.end_customer || {}) }, lines: [], payload: { payment_method: "", condition_mode: "", condition_text: "" }, note: `Ipanel vinculado a puerta ${door?.door_code || door?.id || ""}\nVendedor: ${user?.full_name || user?.username || ""}`.trim() }; }
function panelStatus(door, ipanelQuote) { const marco = isMarcoComplete(door); const ipanel = isIpanelComplete(door, ipanelQuote); if (!marco && !ipanel) return "Falta completar Marco e Ipanel"; if (!marco) return "Falta completar Marco"; if (!ipanel) return "Falta completar Ipanel"; return "Puerta completa"; }
function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) && n > 0 ? `$ ${n.toLocaleString("es-AR")}` : "—";
}

export default function PuertaPanelPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const q = useQuery({ queryKey: ["door", "panel", id], queryFn: () => getDoor(id), enabled: !!id });
  const door = q.data;
  const authUserId = String(user?.user_id ?? user?.id ?? "");
  const canSellerEdit = !!user?.is_vendedor && String(door?.created_by_user_id ?? "") === authUserId;
  const isLinkedDoor = !!safe(door?.linked_quote_id);
  const ipanelQuoteId = safe(door?.record?.ipanel_quote_id);
  const ipanelQ = useQuery({ queryKey: ["quote", "door-panel-ipanel", ipanelQuoteId], queryFn: () => getQuote(ipanelQuoteId), enabled: !!ipanelQuoteId });

  const openIpanelM = useMutation({
    mutationFn: async () => {
      let currentDoor = await getDoor(id);
      let nextIpanelId = safe(currentDoor?.record?.ipanel_quote_id);
      if (!nextIpanelId) {
        const createdIpanel = await createQuote(buildIpanelPayloadFromDoor(currentDoor, user));
        nextIpanelId = String(createdIpanel.id);
        currentDoor = await updateDoor(id, { record: { ...(currentDoor?.record || {}), ipanel_quote_id: nextIpanelId, ipanel_quote_label: createdIpanel?.quote_number || createdIpanel.id } });
      }
      return { nextIpanelId };
    },
    onSuccess: ({ nextIpanelId }) => navigate(`/cotizador/ipanel/${nextIpanelId}?door_workflow=1&workflow_stage=panel&door_id=${encodeURIComponent(id)}`),
    onError: (e) => toast.error(e?.message || "No se pudo abrir el Ipanel"),
  });

  const submitM = useMutation({
    mutationFn: async (mode) => {
      const saved = await updateDoor(id, { record: { ...(door?.record || {}), fulfillment_mode: mode } });
      return await submitDoor(saved.id);
    },
    onSuccess: () => { q.refetch(); toast.success("Puerta enviada a aprobación."); },
    onError: (e) => toast.error(e?.message || "No se pudo enviar la puerta"),
  });

  const statusLabel = useMemo(() => panelStatus(door, ipanelQ.data), [door, ipanelQ.data]);
  const marcoReady = isMarcoComplete(door);
  const ipanelReady = isIpanelComplete(door, ipanelQ.data);
  const selectedMode = safe(door?.record?.fulfillment_mode || door?.linked_quote_fulfillment_mode);
  const canSubmitDoor = canSellerEdit && marcoReady && ipanelReady && door?.status === "draft";

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Puerta · {door?.door_code || "—"}</h2>
            <div className="muted">Presupuesto único de puerta compuesto por <b>Marco</b> + <b>Ipanel</b>.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {door?.linked_quote_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>Ver portón</Button> : null}
            <Button variant="ghost" onClick={() => navigate("/puertas")}>Volver</Button>
          </div>
        </div>
      </div>
      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div><span className="muted">Estado:</span> <b>{statusLabel}</b></div>
          <div><span className="muted">Marco:</span> <b>{marcoReady ? "Completo" : "Falta completar"}</b></div>
          <div><span className="muted">Ipanel:</span> <b>{ipanelReady ? "Completo" : "Falta completar"}</b></div>
          <div><span className="muted">Destino:</span> <b>{selectedMode ? (selectedMode === "acopio" ? "Acopio" : "Producción") : "Sin definir"}</b></div>
        </div>
      </div>
      <div className="spacer" />

      {canSellerEdit ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            <div className="card" style={{ border: "1px solid #f2d3bf", background: "#fff8f3" }}>
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Marco</div>
              <div className="muted" style={{ marginBottom: 14 }}>Completá o editá la ficha del marco de puerta. Al guardar volvés a este panel.</div>
              <Button variant="primary" onClick={() => navigate(`/puertas/${id}/marco?door_workflow=1&return_to_panel=1`)} disabled={!canSellerEdit}>Completar Marco</Button>
            </div>
            <div className="card" style={{ border: "1px solid #d9e5f7", background: "#f7fbff" }}>
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Ipanel</div>
              <div className="muted" style={{ marginBottom: 14 }}>Completá o editá el presupuesto Ipanel de la puerta. Al guardar o confirmar volvés a este panel.</div>
              <Button onClick={() => openIpanelM.mutate()} disabled={!canSellerEdit || openIpanelM.isPending}>{openIpanelM.isPending ? "Abriendo..." : "Completar Ipanel"}</Button>
            </div>
          </div>

          <div className="spacer" />
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Enviar la puerta</div>
            <div className="muted" style={{ marginBottom: 12 }}>
              La puerta se puede enviar cuando estén completos el <b>Marco</b> y el <b>Ipanel</b>. Si está vinculada a un portón, ahora se gestiona por separado.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={selectedMode === "acopio" ? "primary" : "ghost"} disabled={!canSubmitDoor || submitM.isPending} onClick={() => submitM.mutate("acopio")}>Enviar a Acopio</Button>
              <Button variant={selectedMode === "produccion" ? "primary" : "ghost"} disabled={!canSubmitDoor || submitM.isPending} onClick={() => submitM.mutate("produccion")}>Enviar a Producción</Button>
            </div>
            {isLinkedDoor ? <div className="muted" style={{ marginTop: 10 }}>Puerta vinculada: el destino y la confirmación se manejan desde esta propia puerta.</div> : null}
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          <div className="card" style={{ background: "#fafafa" }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Resumen marco</div>
            <div className="muted">Cliente: <b>{numberOrDash(door?.record?.end_customer?.name || door?.record?.obra_cliente)}</b></div>
            <div className="muted">Teléfono: <b>{numberOrDash(door?.record?.end_customer?.phone)}</b></div>
            <div className="muted">Proveedor: <b>{numberOrDash(door?.record?.proveedor)}</b></div>
            <div className="muted">Venta marco: <b>{money(door?.record?.sale_amount)}</b></div>
            <div className="muted">Compra marco: <b>{money(door?.record?.purchase_amount)}</b></div>
            <div className="muted">Medida: <b>{[safe(door?.record?.ancho_marco_mm), safe(door?.record?.alto_marco_mm)].filter(Boolean).join(" x ") || "—"}</b></div>
            <div className="muted">Sentido / mano: <b>{numberOrDash(door?.record?.sentido_apertura)} / {numberOrDash(door?.record?.mano_bisagras)}</b></div>
          </div>
          <div className="card" style={{ background: "#fafafa" }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Resumen Ipanel</div>
            <div className="muted">Presupuesto Ipanel: <b>{numberOrDash(door?.record?.ipanel_quote_label || ipanelQ.data?.quote_number || ipanelQuoteId)}</b></div>
            <div className="muted">Estado: <b>{ipanelQ.data?.status || "—"}</b></div>
            <div className="muted">Ítems: <b>{Array.isArray(ipanelQ.data?.lines) ? ipanelQ.data.lines.length : 0}</b></div>
            <div className="muted">Forma de pago: <b>{ipanelQ.data?.payload?.payment_method || "—"}</b></div>
            <div className="muted">Condición: <b>{ipanelQ.data?.payload?.condition_mode === "special" ? (ipanelQ.data?.payload?.condition_text || "Especial") : (ipanelQ.data?.payload?.condition_mode || "—")}</b></div>
          </div>
        </div>
      )}
    </div>
  );
}

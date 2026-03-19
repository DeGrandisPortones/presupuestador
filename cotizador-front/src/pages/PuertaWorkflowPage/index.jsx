import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { getQuote, createQuote } from "../../api/quotes.js";
import { createOrGetDoorFromQuote, getDoor, updateDoor } from "../../api/doors.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";

function buildLinkedDoorRecord(baseRecord, portonQuote) {
  const record = baseRecord && typeof baseRecord === "object" ? { ...baseRecord } : {};
  const currentCustomer = record.end_customer && typeof record.end_customer === "object" ? record.end_customer : {};
  const sourceCustomer = portonQuote?.end_customer && typeof portonQuote.end_customer === "object" ? portonQuote.end_customer : {};
  record.end_customer = {
    ...currentCustomer,
    name: String(sourceCustomer.name || currentCustomer.name || "").trim(),
    phone: String(sourceCustomer.phone || currentCustomer.phone || "").trim(),
    email: String(sourceCustomer.email || currentCustomer.email || "").trim(),
    address: String(sourceCustomer.address || currentCustomer.address || "").trim(),
    city: String(sourceCustomer.city || currentCustomer.city || "").trim(),
    maps_url: String(sourceCustomer.maps_url || currentCustomer.maps_url || "").trim(),
  };
  record.obra_cliente = String(record.end_customer.name || record.obra_cliente || "").trim();
  return record;
}

function buildIpanelPayloadFromPorton(portonQuote, door) {
  const sourcePayload = portonQuote?.payload || {};
  const linkedLabel = String(door?.linked_quote_odoo_name || door?.record?.asociado_porton || portonQuote?.odoo_sale_order_name || portonQuote?.quote_number || "").trim();

  return {
    created_by_role: portonQuote?.created_by_role || "vendedor",
    catalog_kind: "ipanel",
    fulfillment_mode: "acopio",
    pricelist_id: Number(portonQuote?.pricelist_id || 1),
    bill_to_odoo_partner_id: portonQuote?.bill_to_odoo_partner_id || null,
    end_customer: { ...(portonQuote?.end_customer || {}) },
    lines: [],
    payload: {
      payment_method: String(sourcePayload?.payment_method || "").trim(),
      condition_mode: String(sourcePayload?.condition_mode || "").trim(),
      condition_text: String(sourcePayload?.condition_text || "").trim(),
    },
    note: linkedLabel ? `Ipanel vinculado a ${linkedLabel}` : "Ipanel vinculado a puerta",
  };
}

export default function PuertaWorkflowPage() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const portonQ = useQuery({
    queryKey: ["quote", "door-workflow", quoteId],
    queryFn: () => getQuote(quoteId),
    enabled: !!quoteId,
  });

  const portonQuote = portonQ.data;
  const isPorton = String(portonQuote?.catalog_kind || "porton").toLowerCase() === "porton";
  const canUse = !!user?.is_vendedor && !!quoteId;

  const bundleM = useMutation({
    mutationFn: async () => {
      const porton = await getQuote(quoteId);
      if (String(porton?.catalog_kind || "porton").toLowerCase() !== "porton") {
        throw new Error("La puerta solo puede vincularse a un presupuesto de portón.");
      }

      const rawDoor = await createOrGetDoorFromQuote(quoteId);
      const hydratedDoor = await getDoor(rawDoor.id);
      const nextRecord = buildLinkedDoorRecord(hydratedDoor?.record, porton);
      let door = hydratedDoor;

      const currentJson = JSON.stringify(hydratedDoor?.record || {});
      const nextJson = JSON.stringify(nextRecord || {});
      if (currentJson !== nextJson) {
        door = await updateDoor(hydratedDoor.id, { record: nextRecord });
      }

      let ipanelQuoteId = String(door?.record?.ipanel_quote_id || "").trim();
      if (!ipanelQuoteId) {
        const createdIpanel = await createQuote(buildIpanelPayloadFromPorton(porton, door));
        ipanelQuoteId = String(createdIpanel.id);
        const doorRecord = {
          ...(door?.record || {}),
          ipanel_quote_id: ipanelQuoteId,
          ipanel_quote_label: createdIpanel?.quote_number ? `Presupuesto ${createdIpanel.quote_number}` : "",
          ipanel_catalog_kind: "ipanel",
          ipanel_linked_at: new Date().toISOString(),
        };
        door = await updateDoor(door.id, { record: doorRecord });
      }

      return { door, ipanelQuoteId };
    },
  });

  const workflowSummary = useMemo(() => {
    const q = portonQuote;
    if (!q) return null;
    return {
      customer: q?.end_customer?.name || "(sin nombre)",
      locality: q?.end_customer?.city || "—",
      status: q?.status || "draft",
      number: q?.quote_number || "—",
    };
  }, [portonQuote]);

  async function openMarcoFirst() {
    try {
      const { door, ipanelQuoteId } = await bundleM.mutateAsync();
      navigate(`/puertas/${door.id}?door_workflow=1&workflow_stage=door_first&porton_id=${encodeURIComponent(quoteId)}&ipanel_quote_id=${encodeURIComponent(ipanelQuoteId)}`);
    } catch (e) {
      toast.error(e?.message || "No se pudo abrir el marco de puerta");
    }
  }

  async function openIpanelFirst() {
    try {
      const { door, ipanelQuoteId } = await bundleM.mutateAsync();
      navigate(`/cotizador/ipanel/${ipanelQuoteId}?door_workflow=1&workflow_stage=ipanel_first&door_id=${encodeURIComponent(door.id)}&porton_id=${encodeURIComponent(quoteId)}`);
    } catch (e) {
      toast.error(e?.message || "No se pudo abrir el Ipanel vinculado");
    }
  }

  if (!canUse) {
    return <div className="container"><div className="card">No autorizado.</div></div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Alta de puerta vinculada</h2>
        <div className="muted">La puerta se compone siempre de <b>Marco de puerta</b> + <b>Ipanel</b>. Elegí con cuál querés empezar y el flujo te lleva después al otro componente.</div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ background: "#fafafa" }}>
        {portonQ.isLoading && <div className="muted">Cargando presupuesto de portón…</div>}
        {portonQ.isError && <div style={{ color: "#d93025" }}>{portonQ.error.message}</div>}
        {!portonQ.isLoading && !isPorton && <div style={{ color: "#d93025" }}>Este flujo solo aplica a presupuestos de portón.</div>}
        {workflowSummary ? (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div><span className="muted">Presupuesto:</span> <b>{workflowSummary.number}</b></div>
            <div><span className="muted">Cliente:</span> <b>{workflowSummary.customer}</b></div>
            <div><span className="muted">Localidad:</span> <b>{workflowSummary.locality}</b></div>
            <div><span className="muted">Estado:</span> <b>{workflowSummary.status}</b></div>
          </div>
        ) : null}
      </div>

      <div className="spacer" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <div className="card" style={{ border: "1px solid #d9e5f7", background: "#f7fbff" }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Empezar por Ipanel</div>
          <div className="muted" style={{ marginBottom: 14 }}>Primero cargás el revestimiento de la puerta en el cotizador Ipanel. Al guardar o confirmar, te lleva automáticamente al marco de puerta para terminar la puerta completa.</div>
          <Button onClick={openIpanelFirst} disabled={bundleM.isPending || !isPorton}>{bundleM.isPending ? "Preparando..." : "Abrir Ipanel"}</Button>
        </div>

        <div className="card" style={{ border: "1px solid #f2d3bf", background: "#fff8f3" }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Empezar por Marco de puerta</div>
          <div className="muted" style={{ marginBottom: 14 }}>Primero completás la ficha del marco de puerta. Al guardar o enviar, te lleva automáticamente al Ipanel vinculado para completar el presupuesto final de puerta.</div>
          <Button variant="primary" onClick={openMarcoFirst} disabled={bundleM.isPending || !isPorton}>{bundleM.isPending ? "Preparando..." : "Abrir Marco de puerta"}</Button>
        </div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={() => navigate("/presupuestos")}>Volver a Mis presupuestos</Button>
      </div>
    </div>
  );
}

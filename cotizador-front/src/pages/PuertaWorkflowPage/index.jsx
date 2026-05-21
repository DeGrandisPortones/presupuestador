import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { getQuote } from "../../api/quotes.js";
import { createDoorFromQuote, getDoor } from "../../api/doors.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";

function safe(v) { return String(v || "").trim(); }

export default function PuertaWorkflowPage() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const portonQ = useQuery({ queryKey: ["quote", "door-workflow", quoteId], queryFn: () => getQuote(quoteId), enabled: !!quoteId });
  const portonQuote = portonQ.data;
  const isPorton = String(portonQuote?.catalog_kind || "porton").toLowerCase() === "porton";
  const canUse = !!user?.is_vendedor && !!quoteId;

  const createM = useMutation({
    mutationFn: async () => {
      const porton = await getQuote(quoteId);
      if (String(porton?.catalog_kind || "porton").toLowerCase() !== "porton") throw new Error("La puerta solo puede vincularse a un presupuesto de porton.");
      const created = await createDoorFromQuote(quoteId);
      return await getDoor(created.id);
    },
  });

  const summary = useMemo(() => {
    const q = portonQuote;
    if (!q) return null;
    return {
      customer: q?.end_customer?.name || [q?.end_customer?.first_name, q?.end_customer?.last_name].filter(Boolean).join(" ") || "(sin nombre)",
      locality: q?.end_customer?.city || "-",
      status: q?.status || "draft",
      number: q?.odoo_sale_order_name || q?.final_sale_order_name || q?.quote_number || "-",
    };
  }, [portonQuote]);

  async function createAndOpen(target) {
    try {
      const door = await createM.mutateAsync();
      const structureId = safe(door?.record?.structure_quote_id || door?.structure_quote_id);
      const ipanelId = safe(door?.record?.ipanel_quote_id);
      if (target === "estructura") navigate(`/cotizador/puerta/${structureId}?door_workflow=1&workflow_stage=estructura&door_id=${encodeURIComponent(door.id)}&porton_id=${encodeURIComponent(quoteId)}`);
      else if (target === "ipanel") navigate(`/cotizador/ipanel/${ipanelId}?door_workflow=1&workflow_stage=ipanel&door_id=${encodeURIComponent(door.id)}&porton_id=${encodeURIComponent(quoteId)}`);
      else navigate(`/puertas/${door.id}`);
    } catch (e) {
      toast.error(e?.message || "No se pudo crear la puerta vinculada");
    }
  }

  if (!canUse) return <div className="container"><div className="card">No autorizado.</div></div>;

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Alta de puerta vinculada</h2>
        <div className="muted">Se creara una puerta nueva vinculada a este porton. Un mismo porton puede tener varias puertas.</div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        {portonQ.isLoading && <div className="muted">Cargando presupuesto de porton...</div>}
        {portonQ.isError && <div style={{ color: "#d93025" }}>{portonQ.error.message}</div>}
        {!portonQ.isLoading && !isPorton && <div style={{ color: "#d93025" }}>Este flujo solo aplica a presupuestos de porton.</div>}
        {summary ? (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div><span className="muted">Presupuesto:</span> <b>{summary.number}</b></div>
            <div><span className="muted">Cliente:</span> <b>{summary.customer}</b></div>
            <div><span className="muted">Localidad:</span> <b>{summary.locality}</b></div>
            <div><span className="muted">Estado:</span> <b>{summary.status}</b></div>
          </div>
        ) : null}
      </div>

      <div className="spacer" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <div className="card" style={{ border: "1px solid #d9e5f7", background: "#f7fbff" }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Crear y abrir estructura</div>
          <div className="muted" style={{ marginBottom: 14 }}>Crea una puerta nueva, su presupuesto de estructura y su Ipanel automatico.</div>
          <Button variant="primary" onClick={() => createAndOpen("estructura")} disabled={createM.isPending || !isPorton}>{createM.isPending ? "Preparando..." : "Abrir estructura"}</Button>
        </div>
        <div className="card" style={{ border: "1px solid #d9e5f7", background: "#f7fbff" }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Crear y abrir Ipanel</div>
          <div className="muted" style={{ marginBottom: 14 }}>El Ipanel es el revestimiento de la puerta y queda vinculado automaticamente.</div>
          <Button onClick={() => createAndOpen("ipanel")} disabled={createM.isPending || !isPorton}>{createM.isPending ? "Preparando..." : "Abrir Ipanel"}</Button>
        </div>
        <div className="card" style={{ border: "1px solid #eee", background: "#fff" }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Crear y abrir panel</div>
          <div className="muted" style={{ marginBottom: 14 }}>Abre el panel general de la puerta para completar todo desde ahi.</div>
          <Button variant="secondary" onClick={() => createAndOpen("panel")} disabled={createM.isPending || !isPorton}>{createM.isPending ? "Preparando..." : "Abrir puerta"}</Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={() => navigate("/presupuestos")}>Volver a Mis presupuestos</Button>
      </div>
    </div>
  );
}

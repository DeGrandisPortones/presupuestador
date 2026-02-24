import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Button from "../../ui/Button.jsx";
import { listQuotes, reviewAcopioTechnical } from "../../api/quotes.js";
import { useAuthStore } from "../../domain/auth/store.js";

function acopioReqLabel(r) {
  const c = r?.acopio_to_produccion_commercial_decision || "pending";
  const t = r?.acopio_to_produccion_technical_decision || "pending";
  const cL = c === "approved" ? "OK" : c === "rejected" ? "NO" : "Pend.";
  const tL = t === "approved" ? "OK" : t === "rejected" ? "NO" : "Pend.";
  return `C:${cL} · T:${tL}`;
}

function rowLabel(r) {
  if (r.status === "pending_approvals") {
    if (r.technical_decision === "pending") return "Pendiente tu decisión";
    if (r.technical_decision === "approved" && r.commercial_decision === "pending") return "Aprobado por Técnica · Pendiente Comercial";
    if (r.technical_decision === "approved" && r.commercial_decision === "approved") return "Listo para Odoo";
    return "En aprobación";
  }
  if (r.status === "draft" && r.commercial_decision === "rejected") return "Rechazado por Comercial (aviso)";
  if (r.status === "synced_odoo") return "En Odoo";
  if (r.status === "syncing_odoo") return "Sincronizando…";
  return r.status;
}


function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}

function createdByLabel(r) {
  const name = r?.created_by_full_name || r?.created_by_username || (r?.created_by_user_id ? `#${r.created_by_user_id}` : "—");
  const role = r?.created_by_role ? ` (${r.created_by_role})` : "";
  return `${name}${role}`;
}

export default function AprobacionTecnicaPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState("aprobaciones"); // aprobaciones | acopio
  const [filter, setFilter] = useState("all"); // all | pending | rejected

  const q = useQuery({
    queryKey: ["quotes", "technical_inbox"],
    queryFn: () => listQuotes({ scope: "technical_inbox" }),
    enabled: !!user?.is_rev_tecnica,
  });

const acopioQ = useQuery({
  queryKey: ["quotes", "technical_acopio"],
  queryFn: () => listQuotes({ scope: "technical_acopio" }),
  enabled: tab === "acopio" && !!user?.is_rev_tecnica,
});

const acopioM = useMutation({
  mutationFn: ({ id, action, notes }) => reviewAcopioTechnical(id, { action, notes }),
  onSuccess: () => acopioQ.refetch(),
});


  const rows = useMemo(() => {
    const arr = q.data || [];
    if (filter === "pending") {
      return arr.filter((x) => x.status === "pending_approvals" && x.technical_decision === "pending");
    }
    if (filter === "rejected") {
      return arr.filter((x) => x.status === "draft" && x.commercial_decision === "rejected");
    }
    return arr;
  }, [q.data, filter]);

  const acopioRows = useMemo(() => acopioQ.data || [], [acopioQ.data]);

  if (!user?.is_rev_tecnica) {
    return (
      <div className="container">
        <div className="card">No autorizado (falta rol Rev. Técnica).</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Revisión Técnica</h2>
        <div className="muted">Pendientes (tu decisión) + avisos de rechazos de Comercial</div>

        <div className="spacer" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  <Button variant={tab === "aprobaciones" ? "primary" : "ghost"} onClick={() => setTab("aprobaciones")}>
    Aprobaciones
  </Button>
  <Button variant={tab === "acopio" ? "primary" : "ghost"} onClick={() => setTab("acopio")}>
    Acopio → Producción
  </Button>
</div>

{tab === "aprobaciones" && (
  <>
    <div className="spacer" />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>
        Todos
      </Button>
      <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>
        Pendientes
      </Button>
      <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>
        Rechazados (Comercial)
      </Button>
    </div>
  </>
)}
      </div>

      <div className="spacer" />

      <div className="card">
{tab === "aprobaciones" && (
  <>
        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
        {!q.isLoading && !rows.length && <div className="muted">Sin ítems</div>}

        {!!rows.length && (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vendedor/Distribuidor</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{createdByLabel(r)}</td>
                  <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                  <td>{rowLabel(r)}</td>
                  <td className="right">
                    <Button onClick={() => navigate(`/presupuestos/${r.id}`)}>Abrir</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
  </>
)}

{tab === "acopio" && (
  <>
    {acopioQ.isLoading && <div className="muted">Cargando...</div>}
    {acopioQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{acopioQ.error.message}</div>}
    {!acopioQ.isLoading && !acopioRows.length && <div className="muted">Sin solicitudes</div>}

    {!!acopioRows.length && (
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Vendedor/Distribuidor</th>
            <th>Cliente</th>
            <th>Solicitud</th>
            <th>Decisiones</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {acopioRows.map((r) => {
            const canAct = (r.acopio_to_produccion_technical_decision || "pending") === "pending";
            return (
              <tr key={r.id}>
                <td>{fmtDate(r.acopio_to_produccion_requested_at || r.created_at)}</td>
                <td>{createdByLabel(r)}</td>
                <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                <td>{r.acopio_to_produccion_notes || <span className="muted">(sin nota)</span>}</td>
                <td>{acopioReqLabel(r)}</td>
                <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`)}>Abrir</Button>
                  {canAct ? (
                    <>
                      <Button
                        disabled={acopioM.isPending}
                        onClick={() => acopioM.mutate({ id: r.id, action: "approve", notes: null })}
                      >
                        OK
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={acopioM.isPending}
                        onClick={() => {
                          const msg = window.prompt("Motivo del rechazo:", "");
                          if (msg !== null) acopioM.mutate({ id: r.id, action: "reject", notes: msg });
                        }}
                      >
                        Rechazar
                      </Button>
                    </>
                  ) : (
                    <span className="muted">Ya decidiste</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </>
)}
      </div>
    </div>
  );
}

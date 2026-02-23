import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { listQuotes, requestProductionFromAcopio } from "../../api/quotes.js";

function labelAcopioRequest(q) {
  const s = q?.acopio_to_produccion_status || "none";
  if (s === "pending") {
    const c = q?.acopio_to_produccion_commercial_decision || "pending";
    const t = q?.acopio_to_produccion_technical_decision || "pending";
    const cL = c === "approved" ? "C: OK" : c === "rejected" ? "C: NO" : "C: Pend.";
    const tL = t === "approved" ? "T: OK" : t === "rejected" ? "T: NO" : "T: Pend.";
    return `Solicitado · ${cL} · ${tL}`;
  }
  if (s === "rejected") return "Rechazado (podés reenviar)";
  return "—";
}

function labelStatus(q) {
  const s = q?.status;
  const c = q?.commercial_decision;
  const t = q?.technical_decision;

  if (s === "draft") {
    if (c === "rejected" || t === "rejected") return "Rechazado (corregir)";
    return "Borrador";
  }

  if (s === "pending_approvals") {
    if (c === "pending" && t === "pending") return "Pendiente Comercial y Técnica";
    if (c === "approved" && t === "pending") return "Pendiente Técnica";
    if (c === "pending" && t === "approved") return "Pendiente Comercial";
    if (c === "approved" && t === "approved") return "Listo para Odoo";
    return "En aprobación";
  }

  if (s === "syncing_odoo") return "Sincronizando a Odoo";
  if (s === "synced_odoo") return "Enviado a Odoo";

  // compat antiguos
  const map = {
    pending_commercial: "Pendiente Comercial",
    rejected_commercial: "Rechazado Comercial",
    pending_technical: "Pendiente Técnica",
    rejected_technical: "Rechazado Técnica",
  };
  return map[s] || s;
}

function labelPendingWho(q) {
  if (q?.status !== "pending_approvals") return "—";
  const c = q?.commercial_decision;
  const t = q?.technical_decision;

  const pendC = c === "pending";
  const pendT = t === "pending";

  if (pendC && pendT) return "Comercial y Técnica";
  if (pendC) return "Comercial";
  if (pendT) return "Técnica";
  return "—";
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}

function editPathForQuote(q) {
  const kind = (q?.catalog_kind || "porton").toLowerCase();
  return kind === "ipanel" ? `/cotizador/ipanel/${q.id}` : `/cotizador/${q.id}`;
}

export default function PresupuestosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // all | pending | rejected | acopio
  const [filter, setFilter] = useState("all");
  const [clientQ, setClientQ] = useState("");

  const q = useQuery({
    queryKey: ["quotes", "mine"],
    queryFn: () => listQuotes({ scope: "mine" }),
  });

  const requestProdM = useMutation({
    mutationFn: (id) => requestProductionFromAcopio(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", "mine"] }),
  });

  const rows = useMemo(() => {
    const arr = Array.isArray(q.data) ? q.data : [];

    let out = arr;

    if (filter === "rejected") {
      out = out.filter(
        (x) => x.status === "draft" && (x.commercial_decision === "rejected" || x.technical_decision === "rejected")
      );
    } else if (filter === "pending") {
      out = out.filter(
        (x) =>
          x.status === "pending_approvals" &&
          (x.commercial_decision === "pending" || x.technical_decision === "pending")
      );
    } else if (filter === "acopio") {
      out = out.filter((x) => x.fulfillment_mode === "acopio");
    }

    const nq = (clientQ || "").toLowerCase().trim();
    if (nq) {
      out = out.filter((x) => String(x.end_customer?.name || "").toLowerCase().includes(nq));
    }

    return out;
  }, [q.data, filter, clientQ]);

  const showPendingCol = filter === "pending";

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Mis presupuestos</h2>

        <div className="spacer" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>
            Todos
          </Button>
          <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>
            Pendientes
          </Button>
          <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>
            Rechazados
          </Button>
          <Button variant={filter === "acopio" ? "primary" : "ghost"} onClick={() => setFilter("acopio")}>
            Acopio
          </Button>
        </div>

        <div className="spacer" />

        <Input
          value={clientQ}
          onChange={setClientQ}
          placeholder="Buscar por cliente..."
          style={{ width: "100%" }}
        />
      </div>

      <div className="spacer" />

      <div className="card">
        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}

        {!q.isLoading && !rows.length && <div className="muted">Sin presupuestos</div>}

        {!!rows.length && filter !== "acopio" && (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Estado</th>
                {showPendingCol && <th>Pendiente</th>}
                <th>Destino</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                  <td>{labelStatus(r)}</td>
                  {showPendingCol && <td>{labelPendingWho(r)}</td>}
                  <td>{r.fulfillment_mode === "acopio" ? "Acopio" : "Producción"}</td>
                  <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`)}>
                      Ver
                    </Button>
                    {r.status === "draft" && (
                      <Button onClick={() => navigate(editPathForQuote(r))}>
                        Editar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!!rows.length && filter === "acopio" && (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Solicitud</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const reqStatus = r.acopio_to_produccion_status || "none";
                const canRequest = reqStatus !== "pending";
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                    <td>{labelStatus(r)}</td>
                    <td>{labelAcopioRequest(r)}</td>
                    <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`)}>
                        Ver
                      </Button>
                      {r.status === "draft" && (
                        <Button variant="ghost" onClick={() => navigate(editPathForQuote(r))}>
                          Editar
                        </Button>
                      )}
                      <Button
                        disabled={!canRequest || requestProdM.isPending}
                        onClick={() => requestProdM.mutate(r.id)}
                      >
                        Enviar a Producción
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Button from "../../ui/Button.jsx";
import { listQuotes, moveToProduccion } from "../../api/quotes.js";

function labelMeasurementStatus(q) {
  const s = q?.measurement_status || "none";
  if (s === "pending") return "Pendiente";
  if (s === "submitted") return "Enviada";
  if (s === "needs_fix") return "A corregir";
  if (s === "approved") return "Aprobada";
  if (s === "none") return "—";
  return s;
}

function labelStatus(q) {
  const s = q?.status;
  const c = q?.commercial_decision;
  const t = q?.technical_decision;

  if (s === "draft") {
    if (c === "rejected" || t === "rejected") return "Rechazado (corregir)";
    if (c === "pending" && t === "pending") return "Guardado";
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

  return s;
}

export default function PresupuestosPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all"); // all | saved | pending | rejected | acopio | produccion | mediciones
  const [searchCustomer, setSearchCustomer] = useState("");

  const q = useQuery({
    queryKey: ["quotes", "mine"],
    queryFn: () => listQuotes({ scope: "mine" }),
  });

  const qc = useQueryClient();

  const moveM = useMutation({
    mutationFn: (id) => moveToProduccion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", "mine"] }),
  });

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-AR");
  }

  const rows = useMemo(() => {
    const arr = (q.data || []).slice();
    arr.sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    let out = arr;

    if (filter === "saved") {
      out = out.filter(
        (x) => x.status === "draft" && x.commercial_decision === "pending" && x.technical_decision === "pending"
      );
    } else if (filter === "pending") {
      out = out.filter(
        (x) => x.status === "pending_approvals" && (x.commercial_decision === "pending" || x.technical_decision === "pending")
      );
    } else if (filter === "rejected") {
      out = out.filter(
        (x) => x.status === "draft" && (x.commercial_decision === "rejected" || x.technical_decision === "rejected")
      );
    } else if (filter === "acopio") {
      out = out.filter((x) => x.fulfillment_mode === "acopio" && x.status !== "draft");
    } else if (filter === "produccion") {
      out = out.filter((x) => x.fulfillment_mode === "produccion" && x.status !== "draft");
    } else if (filter === "mediciones") {
      out = out.filter((x) => x.fulfillment_mode === "produccion" && x.status !== "draft" && x.requires_measurement === true);
    }

    const sq = (searchCustomer || "").toString().trim().toLowerCase();
    if (sq) {
      out = out.filter((x) => (x.end_customer?.name || "").toString().toLowerCase().includes(sq));
    }

    return out;
  }, [q.data, filter, searchCustomer]);

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Mis presupuestos</h2>
        <div className="muted">Guardados, confirmados, en aprobación, acopio, producción y mediciones</div>

        <div className="spacer" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>
            Todos
          </Button>
          <Button variant={filter === "saved" ? "primary" : "ghost"} onClick={() => setFilter("saved")}>
            Guardados
          </Button>
          <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>
            Pendientes
          </Button>
          <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>
            Rechazados
          </Button>
          <Button variant={filter === "acopio" ? "primary" : "ghost"} onClick={() => setFilter("acopio")}>
            Portones en Acopio
          </Button>
          <Button variant={filter === "produccion" ? "primary" : "ghost"} onClick={() => setFilter("produccion")}>
            Portones en Producción
          </Button>
          <Button variant={filter === "mediciones" ? "primary" : "ghost"} onClick={() => setFilter("mediciones")}>
            Portones en Medición
          </Button>
        </div>

        <div className="spacer" />
        <input
          value={searchCustomer}
          onChange={(e) => setSearchCustomer(e.target.value)}
          placeholder="Buscar por cliente…"
          style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
        />
      </div>

      <div className="spacer" />

      <div className="card">
        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}

        {!q.isLoading && !rows.length && <div className="muted">Sin presupuestos</div>}

        {!!rows.length && (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Destino</th>
                {filter === "mediciones" ? <th>Medición</th> : null}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                  <td>{labelStatus(r)}</td>
                  <td>{r.fulfillment_mode === "acopio" ? "Acopio" : "Producción"}</td>
                  {filter === "mediciones" ? <td>{labelMeasurementStatus(r)}</td> : null}
                  <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`)}>Ver</Button>
                    {r.status === "draft" && (
                      <Button onClick={() => navigate(r.catalog_kind === "ipanel" ? `/cotizador/ipanel/${r.id}` : `/cotizador/${r.id}`)}>Editar</Button>
                    )}
                    {filter === "acopio" && (
                      <Button
                        disabled={moveM.isPending}
                        onClick={() => moveM.mutate(r.id)}
                      >
                        Pasar a Producción
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

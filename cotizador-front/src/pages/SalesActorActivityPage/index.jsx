import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { getSalesActorActivity, listSalesActors } from "../../api/quoteViewer.js";

function text(value) {
  return String(value ?? "").trim();
}
function formatDateTime(value) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("es-AR");
}
function SummaryCard({ title, value }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 170, background: "#fafafa" }}>
      <div className="muted">{title}</div>
      <div style={{ fontWeight: 900, fontSize: 28 }}>{value}</div>
    </div>
  );
}

export default function SalesActorActivityPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const usersQ = useQuery({
    queryKey: ["salesActors"],
    queryFn: listSalesActors,
    enabled: !!user?.is_superuser,
  });
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    if (!selectedUserId && usersQ.data?.length) {
      setSelectedUserId(String(usersQ.data[0].id));
    }
  }, [usersQ.data, selectedUserId]);

  const activityQ = useQuery({
    queryKey: ["salesActorActivity", selectedUserId],
    queryFn: () => getSalesActorActivity(selectedUserId),
    enabled: !!user?.is_superuser && !!selectedUserId,
  });

  const summary = activityQ.data?.summary || {};
  const actions = activityQ.data?.actions || [];
  const recentQuotes = activityQ.data?.original_quotes || [];

  const selectedUserLabel = useMemo(() => {
    const found = (usersQ.data || []).find((item) => String(item.id) === String(selectedUserId));
    if (!found) return "";
    return text(found.full_name || found.username);
  }, [usersQ.data, selectedUserId]);

  if (!user?.is_superuser) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Actividad vendedores / distribuidores</h2>
          <div className="muted">No tenés permisos para entrar a esta pantalla.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Actividad vendedores / distribuidores</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Mostramos acciones que sí tienen fecha confiable guardada en la base.
            </div>
          </div>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver al menú</Button>
        </div>

        <div className="spacer" />
        <div style={{ maxWidth: 420 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Elegir vendedor / distribuidor</div>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
          >
            <option value="">Seleccionar…</option>
            {(usersQ.data || []).map((actor) => (
              <option key={actor.id} value={actor.id}>
                {text(actor.full_name || actor.username)}{actor.is_distribuidor ? " · Distribuidor" : " · Vendedor"}
              </option>
            ))}
          </select>
        </div>

        {usersQ.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 10 }}>{usersQ.error.message}</div> : null}
      </div>

      {activityQ.isLoading ? (
        <div className="card"><div className="muted">Cargando actividad…</div></div>
      ) : null}

      {activityQ.data ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <SummaryCard title="Presupuestos guardados" value={summary.saved_quotes || 0} />
            <SummaryCard title="Presupuestos confirmados" value={summary.confirmed_quotes || 0} />
            <SummaryCard title="Salidas de acopio solicitadas" value={summary.acopio_requests || 0} />
            <SummaryCard title="Ajustes creados" value={summary.created_revisions || 0} />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <SummaryCard title="Mediciones pendientes" value={summary.pending_measurements || 0} />
            <SummaryCard title="Mediciones devueltas" value={summary.returned_measurements || 0} />
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Historial de acciones · {selectedUserLabel || "—"}</div>
            {actions.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {actions.map((event) => (
                  <div key={event.key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800 }}>{event.title}</div>
                      <div className="muted">{formatDateTime(event.at)}</div>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {event.reference || "Sin referencia"} · {event.customer || "Sin cliente"}
                    </div>
                    {event.description ? <div style={{ marginTop: 6 }}>{event.description}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No hay acciones registradas para este usuario.</div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Portones recientes del usuario</div>
            {recentQuotes.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th>Cliente</th>
                    <th>Modo</th>
                    <th>Estado</th>
                    <th>Medición</th>
                    <th>Guardado</th>
                    <th>Confirmado</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQuotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>{text(quote.final_sale_order_name || quote.odoo_sale_order_name) || (quote.quote_number ? `NP${quote.quote_number}` : String(quote.id).slice(0, 8))}</td>
                      <td>{quote.customer_name || "—"}</td>
                      <td>{String(quote.fulfillment_mode || "").toLowerCase() === "acopio" ? "Acopio" : "Producción"}</td>
                      <td>{quote.status || "—"}</td>
                      <td>{quote.measurement_status || "—"}</td>
                      <td>{formatDateTime(quote.created_at)}</td>
                      <td>{formatDateTime(quote.confirmed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted">No hay portones para mostrar.</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

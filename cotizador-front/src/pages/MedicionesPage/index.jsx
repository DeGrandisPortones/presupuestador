import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { listMeasurements } from "../../api/measurements.js";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}

function scheduleSortValue(v) {
  if (!v) return Number.MAX_SAFE_INTEGER;
  const t = new Date(`${v}T00:00:00`).getTime();
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

function buildWhatsappUrl(phone) {
  const raw = (phone || "").toString();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  if (!digits.startsWith("54")) digits = `54${digits}`;
  return `https://wa.me/${digits}`;
}

function labelMeasurementStatus(s) {
  if (s === "pending") return "Pendiente";
  if (s === "needs_fix") return "Corregir";
  if (s === "submitted") return "Enviada";
  if (s === "approved") return "Aprobada";
  return s || "—";
}

function localityLabel(row) {
  return row?.end_customer?.city || row?.end_customer?.address || "—";
}

export default function MedicionesPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const [status, setStatus] = useState("pending");
  const [customer, setCustomer] = useState("");
  const [locality, setLocality] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const enabled = !!user?.is_medidor;

  const measQ = useQuery({
    queryKey: ["measurements", "medidor", status, customer, locality, dateFrom, dateTo],
    queryFn: () => listMeasurements({
      status,
      customer,
      locality,
      dateFrom,
      dateTo,
      viewer: "medidor",
    }),
    enabled,
  });

  const rows = useMemo(() => {
    const arr = (measQ.data || []).slice();
    arr.sort((a, b) => {
      const sa = scheduleSortValue(a?.measurement_scheduled_for);
      const sb = scheduleSortValue(b?.measurement_scheduled_for);
      if (sa !== sb) return sa - sb;

      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return arr;
  }, [measQ.data]);

  if (!user?.is_medidor) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mediciones</h2>
          <div className="muted">No tenés permisos (solo Medidor).</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Mediciones</h2>
        <div className="muted">Ordenadas desde la fecha de visita más próxima hasta la más lejana.</div>

        <div className="spacer" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={status === "pending" ? "primary" : "ghost"} onClick={() => setStatus("pending")}>
            Pendientes
          </Button>
          <Button variant={status === "needs_fix" ? "primary" : "ghost"} onClick={() => setStatus("needs_fix")}>
            A corregir
          </Button>
          <Button variant={status === "submitted" ? "primary" : "ghost"} onClick={() => setStatus("submitted")}>
            Enviadas
          </Button>
          <Button variant={status === "approved" ? "primary" : "ghost"} onClick={() => setStatus("approved")}>
            Aprobadas
          </Button>
          <Button variant={status === "all" ? "primary" : "ghost"} onClick={() => setStatus("all")}>
            Todas
          </Button>
          <Button variant="ghost" onClick={() => measQ.refetch()} disabled={measQ.isFetching}>
            ↻
          </Button>
        </div>

        <div className="spacer" />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Cliente</div>
            <Input value={customer} onChange={setCustomer} placeholder="Filtrar por cliente…" style={{ width: "100%" }} />
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Localidad</div>
            <Input value={locality} onChange={setLocality} placeholder="Filtrar por localidad…" style={{ width: "100%" }} />
          </div>

          <div style={{ minWidth: 180 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Desde</div>
            <Input type="date" value={dateFrom} onChange={setDateFrom} style={{ width: "100%" }} />
          </div>

          <div style={{ minWidth: 180 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Hasta</div>
            <Input type="date" value={dateTo} onChange={setDateTo} style={{ width: "100%" }} />
          </div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        {measQ.isLoading && <div className="muted">Cargando…</div>}
        {measQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{measQ.error.message}</div>}

        {!measQ.isLoading && !rows.length && <div className="muted">Sin resultados</div>}

        {!!rows.length && (
          <table>
            <thead>
              <tr>
                <th>Fecha visita</th>
                <th>Cliente</th>
                <th>Localidad</th>
                <th>Dirección</th>
                <th>Teléfono</th>
                <th>Maps</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.measurement_scheduled_for)}</td>
                  <td style={{ fontWeight: 800 }}>{r.end_customer?.name || "(sin nombre)"}</td>
                  <td>{localityLabel(r)}</td>
                  <td>{r.end_customer?.address || "—"}</td>
                  <td>
                    {(() => {
                      const ph = r.end_customer?.phone || "";
                      const w = buildWhatsappUrl(ph);
                      return w ? (
                        <a href={w} target="_blank" rel="noreferrer">{ph}</a>
                      ) : (
                        (ph || "—")
                      );
                    })()}
                  </td>
                  <td>
                    {r.end_customer?.maps_url ? (
                      <a href={r.end_customer.maps_url} target="_blank" rel="noreferrer">
                        📍 Abrir
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{labelMeasurementStatus(r.measurement_status)}</td>
                  <td className="right">
                    <Button onClick={() => navigate(`/mediciones/${r.id}`)}>Formulario</Button>
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

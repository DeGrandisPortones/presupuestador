import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { listMeasurements } from "../../api/measurements.js";

const PAGE_SIZE = 25;

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
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
  if (s === "submitted") return "A revisión técnica";
  if (s === "approved") return "Aprobada";
  return s || "—";
}

function localityLabel(r) {
  return r?.end_customer?.city || "—";
}

function matchesSearch(r, searchText) {
  const s = String(searchText || "").trim().toLowerCase();
  if (!s) return true;
  const haystack = [
    r?.end_customer?.name,
    r?.end_customer?.city,
    r?.end_customer?.address,
    r?.end_customer?.phone,
    labelMeasurementStatus(r?.measurement_status),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(s);
}

export default function MedicionesPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const [status, setStatus] = useState("pending");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const enabled = !!user?.is_medidor;

  const measQ = useQuery({
    queryKey: ["measurements", status],
    queryFn: () => listMeasurements({ status }),
    enabled,
  });

  useEffect(() => {
    setPage(1);
  }, [status, searchText]);

  const rows = useMemo(() => {
    const arr = (measQ.data || []).slice();
    arr.sort((a, b) => {
      const ta = a?.measurement_scheduled_for ? new Date(`${a.measurement_scheduled_for}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b?.measurement_scheduled_for ? new Date(`${b.measurement_scheduled_for}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return (a?.created_at ? new Date(a.created_at).getTime() : 0) - (b?.created_at ? new Date(b.created_at).getTime() : 0);
    });
    return arr.filter((item) => matchesSearch(item, searchText));
  }, [measQ.data, searchText]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [rows.length, page]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

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
        <div className="muted">Portones en producción ya enviados a Odoo que requieren medición.</div>

        <div className="spacer" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={status === "pending" ? "primary" : "ghost"} onClick={() => setStatus("pending")}>Pendientes</Button>
          <Button variant={status === "needs_fix" ? "primary" : "ghost"} onClick={() => setStatus("needs_fix")}>A corregir</Button>
          <Button variant={status === "submitted" ? "primary" : "ghost"} onClick={() => setStatus("submitted")}>En revisión técnica</Button>
          <Button variant={status === "approved" ? "primary" : "ghost"} onClick={() => setStatus("approved")}>Aprobadas</Button>
          <Button variant={status === "all" ? "primary" : "ghost"} onClick={() => setStatus("all")}>Todas</Button>
          <Button variant="ghost" onClick={() => measQ.refetch()} disabled={measQ.isFetching}>↻</Button>
        </div>

        <div className="spacer" />
        <Input value={searchText} onChange={setSearchText} placeholder="Buscar por cliente, localidad, dirección o teléfono…" style={{ width: "100%" }} />
      </div>

      <div className="spacer" />

      <div className="card">
        {measQ.isLoading && <div className="muted">Cargando…</div>}
        {measQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{measQ.error.message}</div>}
        {!measQ.isLoading && !rows.length && <div className="muted">Sin resultados</div>}

        {!!rows.length && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Fecha visita</th>
                  <th>Alta</th>
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
                {visibleRows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.measurement_scheduled_for)}</td>
                    <td>{fmtDate(r.created_at)}</td>
                    <td style={{ fontWeight: 800 }}>{r.end_customer?.name || "(sin nombre)"}</td>
                    <td>{localityLabel(r)}</td>
                    <td>{r.end_customer?.address || "—"}</td>
                    <td>
                      {(() => {
                        const ph = r.end_customer?.phone || "";
                        const w = buildWhatsappUrl(ph);
                        return w ? <a href={w} target="_blank" rel="noreferrer">{ph}</a> : (ph || "—");
                      })()}
                    </td>
                    <td>
                      {r.end_customer?.maps_url ? (
                        <a href={r.end_customer.maps_url} target="_blank" rel="noreferrer">📍 Abrir</a>
                      ) : "—"}
                    </td>
                    <td>{labelMeasurementStatus(r.measurement_status)}</td>
                    <td className="right"><Button onClick={() => navigate(`/mediciones/${r.id}`)}>Formulario</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <PaginationControls page={page} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

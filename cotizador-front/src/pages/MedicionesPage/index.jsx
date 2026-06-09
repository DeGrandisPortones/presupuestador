import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { listMeasurements } from "../../api/measurements.js";

const PAGE_SIZE = 25;
const COMPACT_LAYOUT_MAX_PX = 760;

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
  const v = String(s || "").toLowerCase();
  if (v === "pending") return "Pendiente";
  if (v === "returned_to_seller") return "Enviada al vendedor";
  if (v === "submitted") return "Enviada a técnica";
  if (v === "needs_fix") return "Devuelta por técnica";
  if (v === "approved") return "Aprobada";
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

function shouldUseCompactMeasurementsLayout() {
  if (typeof window === "undefined") return false;
  const viewportWidth = Number(window.innerWidth || 0);
  const visualViewportWidth = Number(window.visualViewport?.width || 0);
  const screenWidth = Number(window.screen?.width || 0);
  return [viewportWidth, visualViewportWidth, screenWidth].some(
    (value) => Number.isFinite(value) && value > 0 && value <= COMPACT_LAYOUT_MAX_PX,
  );
}

function useCompactMeasurementsLayout() {
  const [compact, setCompact] = useState(() => shouldUseCompactMeasurementsLayout());

  useEffect(() => {
    function update() {
      setCompact(shouldUseCompactMeasurementsLayout());
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener?.("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener?.("resize", update);
    };
  }, []);

  return compact;
}

function StatusPill({ value }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        background: "#eef6ff",
        border: "1px solid #cfe7ff",
        color: "#075985",
        padding: "4px 8px",
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {value || "—"}
    </span>
  );
}

function MobileField({ label, value, children, strong = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 11, marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: strong ? 900 : 700, overflowWrap: "anywhere", lineHeight: 1.2 }}>
        {children || value || "—"}
      </div>
    </div>
  );
}

function MeasurementCard({ row, onOpen }) {
  const phone = row?.end_customer?.phone || "";
  const whatsappUrl = buildWhatsappUrl(phone);
  const status = String(row?.measurement_status || "").toLowerCase();
  const approved = status === "approved";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        background: "#fff",
        padding: 12,
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.15, overflowWrap: "anywhere" }}>
            {row?.end_customer?.name || "(sin nombre)"}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>{localityLabel(row)}</div>
        </div>
        <StatusPill value={labelMeasurementStatus(row?.measurement_status)} />
      </div>

      <div className="spacer" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <MobileField label="Fecha visita" value={fmtDate(row?.measurement_scheduled_for)} />
        <MobileField label="Alta" value={fmtDate(row?.created_at)} />
      </div>

      <div className="spacer" />
      <MobileField label="Dirección" value={row?.end_customer?.address || "—"} />

      <div className="spacer" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <MobileField label="Teléfono">
          {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer">{phone}</a> : (phone || "—")}
        </MobileField>
        <MobileField label="Maps">
          {row?.end_customer?.maps_url ? (
            <a href={row.end_customer.maps_url} target="_blank" rel="noreferrer">📍 Abrir</a>
          ) : "—"}
        </MobileField>
      </div>

      <div className="spacer" />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button onClick={() => onOpen(row)}>{approved ? "Ver medición" : "Formulario"}</Button>
      </div>
    </div>
  );
}

export default function MedicionesPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const compactLayout = useCompactMeasurementsLayout();

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
      return (b?.created_at ? new Date(b.created_at).getTime() : 0) - (a?.created_at ? new Date(a.created_at).getTime() : 0);
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

  function openMeasurement(row) {
    const approved = String(row?.measurement_status || "").toLowerCase() === "approved";
    navigate(approved ? `/mediciones/${row.id}?readonly=1` : `/mediciones/${row.id}`, {
      state: {
        from: "/mediciones",
        readOnlyMeasurement: approved,
      },
    });
  }

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
        <div className="muted">Portones en producción que requieren medición o seguimiento del envío.</div>

        <div className="spacer" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={status === "pending" ? "primary" : "ghost"} onClick={() => setStatus("pending")}>Pendientes</Button>
          <Button variant={status === "returned_to_seller" ? "primary" : "ghost"} onClick={() => setStatus("returned_to_seller")}>Enviadas a vendedor</Button>
          <Button variant={status === "submitted" ? "primary" : "ghost"} onClick={() => setStatus("submitted")}>Enviadas a técnica</Button>
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
            {compactLayout ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleRows.map((row) => (
                  <MeasurementCard key={row.id} row={row} onOpen={openMeasurement} />
                ))}
              </div>
            ) : (
              <div style={{ overflowX: "auto", width: "100%" }}>
                <table style={{ minWidth: 920 }}>
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
                        <td className="right">
                          <Button onClick={() => openMeasurement(r)}>
                            {String(r?.measurement_status || "").toLowerCase() === "approved" ? "Ver medición" : "Formulario"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <PaginationControls page={page} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

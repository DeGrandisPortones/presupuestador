import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { listQuotes, reviewAcopioTechnical } from "../../api/quotes.js";
import { listDoors, reviewDoorTechnical } from "../../api/doors.js";
import { listMeasurements, scheduleMeasurement } from "../../api/measurements.js";
import { useAuthStore } from "../../domain/auth/store.js";

const PAGE_SIZE = 25;
const VALID_TABS = ["mediciones", "aprobaciones_portones", "aprobaciones_puertas", "aprobaciones_mediciones", "acopio"];

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
function measurementStatusLabel(s) {
  if (s === "pending") return "Pendiente";
  if (s === "needs_fix") return "A corregir";
  if (s === "submitted") return "Pendiente revisión";
  if (s === "approved") return "Aprobada";
  return s || "—";
}
function localityLabel(r) {
  return r?.end_customer?.city || r?.end_customer?.address || "—";
}
function normalizeTab(raw) {
  const tab = String(raw || "").trim();
  return VALID_TABS.includes(tab) ? tab : "aprobaciones_portones";
}

export default function AprobacionTecnicaPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = normalizeTab(searchParams.get("tab"));
  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState("all");
  const [measurementStatus, setMeasurementStatus] = useState(initialTab === "aprobaciones_mediciones" ? "submitted" : "pending");
  const [measurementDates, setMeasurementDates] = useState({});
  const [pageAprobaciones, setPageAprobaciones] = useState(1);
  const [pageMediciones, setPageMediciones] = useState(1);
  const [pageAcopio, setPageAcopio] = useState(1);
  const [pagePuertas, setPagePuertas] = useState(1);

  useEffect(() => {
    const nextTab = normalizeTab(searchParams.get("tab"));
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams]);

  const q = useQuery({ queryKey: ["quotes", "technical_inbox"], queryFn: () => listQuotes({ scope: "technical_inbox" }), enabled: !!user?.is_rev_tecnica });
  const acopioQ = useQuery({ queryKey: ["quotes", "technical_acopio"], queryFn: () => listQuotes({ scope: "technical_acopio" }), enabled: tab === "acopio" && !!user?.is_rev_tecnica });
  const doorsQ = useQuery({ queryKey: ["doors", "technical_inbox"], queryFn: () => listDoors({ scope: "technical_inbox" }), enabled: tab === "aprobaciones_puertas" && !!user?.is_rev_tecnica });
  const measQ = useQuery({
    queryKey: ["measurements", "tecnica", tab, measurementStatus],
    queryFn: () => listMeasurements({ status: measurementStatus, viewer: "tecnica" }),
    enabled: (tab === "mediciones" || tab === "aprobaciones_mediciones") && !!user?.is_rev_tecnica,
  });

  const acopioM = useMutation({ mutationFn: ({ id, action, notes }) => reviewAcopioTechnical(id, { action, notes }), onSuccess: () => acopioQ.refetch() });
  const doorM = useMutation({ mutationFn: ({ id, action, notes }) => reviewDoorTechnical(id, { action, notes }), onSuccess: () => doorsQ.refetch() });
  const scheduleM = useMutation({
    mutationFn: ({ id, scheduledFor }) => scheduleMeasurement(id, { scheduledFor }),
    onSuccess: () => measQ.refetch(),
  });

  function goToTab(nextTab) {
    const normalized = normalizeTab(nextTab);
    setTab(normalized);
    setSearchParams({ tab: normalized });
    if (normalized === "mediciones" && ["submitted", "approved"].includes(measurementStatus)) {
      setMeasurementStatus("pending");
    }
    if (normalized === "aprobaciones_mediciones" && ["pending", "needs_fix"].includes(measurementStatus)) {
      setMeasurementStatus("submitted");
    }
  }

  useEffect(() => { setPageAprobaciones(1); }, [filter]);
  useEffect(() => { setPageMediciones(1); }, [measurementStatus]);

  const rows = useMemo(() => {
    const arr = q.data || [];
    if (filter === "pending") return arr.filter((x) => x.status === "pending_approvals" && x.technical_decision === "pending");
    if (filter === "rejected") return arr.filter((x) => x.status === "draft" && x.commercial_decision === "rejected");
    return arr;
  }, [q.data, filter]);

  const measurementRows = useMemo(() => {
    const arr = (measQ.data || []).slice();
    arr.sort((a, b) => {
      const ta = a?.measurement_scheduled_for ? new Date(`${a.measurement_scheduled_for}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b?.measurement_scheduled_for ? new Date(`${b.measurement_scheduled_for}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return String(a?.end_customer?.name || "").localeCompare(String(b?.end_customer?.name || ""), "es");
    });
    return arr;
  }, [measQ.data]);

  function paged(arr, page) {
    const start = (page - 1) * PAGE_SIZE;
    return arr.slice(start, start + PAGE_SIZE);
  }

  useEffect(() => {
    const total = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (pageAprobaciones > total) setPageAprobaciones(total);
  }, [rows.length, pageAprobaciones]);

  useEffect(() => {
    const total = Math.max(1, Math.ceil(measurementRows.length / PAGE_SIZE));
    if (pageMediciones > total) setPageMediciones(total);
  }, [measurementRows.length, pageMediciones]);

  useEffect(() => {
    const total = Math.max(1, Math.ceil((acopioQ.data || []).length / PAGE_SIZE));
    if (pageAcopio > total) setPageAcopio(total);
  }, [acopioQ.data, pageAcopio]);

  useEffect(() => {
    const total = Math.max(1, Math.ceil((doorsQ.data || []).length / PAGE_SIZE));
    if (pagePuertas > total) setPagePuertas(total);
  }, [doorsQ.data, pagePuertas]);

  if (!user?.is_rev_tecnica) return <div className="container"><div className="card">No autorizado (falta rol Rev. Técnica).</div></div>;

  const visibleRows = paged(rows, pageAprobaciones);
  const visibleMeasurements = paged(measurementRows, pageMediciones);
  const visibleAcopio = paged(acopioQ.data || [], pageAcopio);
  const visibleDoors = paged(doorsQ.data || [], pagePuertas);

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Técnica</h2>
        <div className="muted">Mediciones, aprobaciones de portones, puertas y mediciones terminadas.</div>

        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={tab === "mediciones" ? "primary" : "ghost"} onClick={() => goToTab("mediciones")}>Mediciones</Button>
          <Button variant={tab === "aprobaciones_portones" ? "primary" : "ghost"} onClick={() => goToTab("aprobaciones_portones")}>Aprobaciones Portones</Button>
          <Button variant={tab === "aprobaciones_puertas" ? "primary" : "ghost"} onClick={() => goToTab("aprobaciones_puertas")}>Aprobaciones Puertas</Button>
          <Button variant={tab === "aprobaciones_mediciones" ? "primary" : "ghost"} onClick={() => goToTab("aprobaciones_mediciones")}>Aprobaciones Mediciones</Button>
          <Button variant={tab === "acopio" ? "primary" : "ghost"} onClick={() => goToTab("acopio")}>Acopio → Producción</Button>
        </div>

        {tab === "aprobaciones_portones" && (
          <>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>Todos</Button>
              <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>Pendientes</Button>
              <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>Rechazados (Comercial)</Button>
            </div>
          </>
        )}

        {tab === "mediciones" && (
          <>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={measurementStatus === "pending" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("pending")}>Pendientes</Button>
              <Button variant={measurementStatus === "needs_fix" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("needs_fix")}>A corregir</Button>
              <Button variant={measurementStatus === "all" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("all")}>Todas</Button>
            </div>
          </>
        )}

        {tab === "aprobaciones_mediciones" && (
          <>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={measurementStatus === "submitted" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("submitted")}>Pendiente revisión</Button>
              <Button variant={measurementStatus === "approved" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("approved")}>Aprobadas</Button>
              <Button variant={measurementStatus === "all" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("all")}>Todas</Button>
            </div>
          </>
        )}
      </div>

      <div className="spacer" />

      <div className="card">
        {tab === "aprobaciones_portones" && (
          <>
            {q.isLoading && <div className="muted">Cargando...</div>}
            {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
            {!q.isLoading && !rows.length && <div className="muted">Sin ítems</div>}
            {!!rows.length && (
              <>
                <table><thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th></th></tr></thead><tbody>
                  {visibleRows.map((r) => <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{rowLabel(r)}</td><td className="right"><Button onClick={() => navigate(`/presupuestos/${r.id}`)}>Abrir</Button></td></tr>)}
                </tbody></table>
                <PaginationControls page={pageAprobaciones} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPageAprobaciones} />
              </>
            )}
          </>
        )}

        {(tab === "mediciones" || tab === "aprobaciones_mediciones") && (
          <>
            {measQ.isLoading && <div className="muted">Cargando...</div>}
            {measQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{measQ.error.message}</div>}
            {!measQ.isLoading && !measurementRows.length && <div className="muted">Sin portones para medición</div>}
            {!!measurementRows.length && (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Localidad</th>
                      <th>Dirección</th>
                      <th>Estado</th>
                      <th>Fecha visita</th>
                      <th>Asignar fecha</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMeasurements.map((r) => {
                      const dateValue = measurementDates[r.id] ?? r.measurement_scheduled_for ?? "";
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 800 }}>{r.end_customer?.name || "(sin nombre)"}</td>
                          <td>{localityLabel(r)}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{measurementStatusLabel(r.measurement_status)}</td>
                          <td>{fmtDate(r.measurement_scheduled_for)}</td>
                          <td style={{ minWidth: 220 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <Input
                                type="date"
                                value={dateValue}
                                onChange={(v) => setMeasurementDates((prev) => ({ ...prev, [r.id]: v }))}
                                style={{ width: "100%" }}
                              />
                              <Button
                                disabled={scheduleM.isPending || !dateValue}
                                onClick={() => scheduleM.mutate({ id: r.id, scheduledFor: dateValue })}
                              >
                                Guardar
                              </Button>
                            </div>
                          </td>
                          <td className="right">
                            <Button variant="ghost" onClick={() => navigate(`/mediciones/${r.id}`)}>
                              {r.measurement_status === "submitted" ? "Revisar" : "Abrir"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <PaginationControls page={pageMediciones} totalItems={measurementRows.length} pageSize={PAGE_SIZE} onPageChange={setPageMediciones} />
              </>
            )}
          </>
        )}

        {tab === "acopio" && (
          <>
            {acopioQ.isLoading && <div className="muted">Cargando...</div>}
            {acopioQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{acopioQ.error.message}</div>}
            {!acopioQ.isLoading && !(acopioQ.data || []).length && <div className="muted">Sin solicitudes</div>}
            {!!(acopioQ.data || []).length && (
              <>
                <table><thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Solicitud</th><th>Decisiones</th><th></th></tr></thead><tbody>
                  {visibleAcopio.map((r) => {
                    const canAct = (r.acopio_to_produccion_technical_decision || "pending") === "pending";
                    return <tr key={r.id}><td>{fmtDate(r.acopio_to_produccion_requested_at || r.created_at)}</td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{r.acopio_to_produccion_notes || <span className="muted">(sin nota)</span>}</td><td>{acopioReqLabel(r)}</td><td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`)}>Abrir</Button>{canAct ? <><Button disabled={acopioM.isPending} onClick={() => acopioM.mutate({ id: r.id, action: "approve", notes: null })}>OK</Button><Button variant="ghost" disabled={acopioM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) acopioM.mutate({ id: r.id, action: "reject", notes: msg }); }}>Rechazar</Button></> : <span className="muted">Ya decidiste</span>}</td></tr>;
                  })}
                </tbody></table>
                <PaginationControls page={pageAcopio} totalItems={(acopioQ.data || []).length} pageSize={PAGE_SIZE} onPageChange={setPageAcopio} />
              </>
            )}
          </>
        )}

        {tab === "aprobaciones_puertas" && (
          <>
            {doorsQ.isLoading && <div className="muted">Cargando...</div>}
            {doorsQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{doorsQ.error.message}</div>}
            {!doorsQ.isLoading && !(doorsQ.data || []).length && <div className="muted">Sin puertas pendientes</div>}
            {!!(doorsQ.data || []).length && (
              <>
                <table><thead><tr><th>Código</th><th>Cliente</th><th>Portón vinculado</th><th>Venta</th><th>Compra</th><th></th></tr></thead><tbody>
                  {visibleDoors.map((d) => <tr key={d.id}><td>{d.door_code}</td><td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td><td>{d.linked_quote_odoo_name || d.record?.asociado_porton || "—"}</td><td>{d.sale_amount ? `$ ${Number(d.sale_amount).toLocaleString("es-AR")}` : "—"}</td><td>{d.purchase_amount ? `$ ${Number(d.purchase_amount).toLocaleString("es-AR")}` : "—"}</td><td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/puertas/${d.id}`)}>Abrir</Button><Button disabled={doorM.isPending} onClick={() => doorM.mutate({ id: d.id, action: "approve", notes: null })}>OK</Button><Button variant="ghost" disabled={doorM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) doorM.mutate({ id: d.id, action: "reject", notes: msg }); }}>Rechazar</Button></td></tr>)}
                </tbody></table>
                <PaginationControls page={pagePuertas} totalItems={(doorsQ.data || []).length} pageSize={PAGE_SIZE} onPageChange={setPagePuertas} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

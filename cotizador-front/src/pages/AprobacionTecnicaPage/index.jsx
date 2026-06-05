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
const VALID_TABS = ["aprobaciones_portones", "aprobaciones_puertas", "aprobaciones_mediciones", "acopio", "acopio_listado", "produccion"];

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

function budgetObservation(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  return String(row?.budget_observation || payload?.budget_observation || payload?.presupuesto_observacion || payload?.quote_observation || "").trim();
}
function BudgetObservationCell({ row }) {
  const text = budgetObservation(row);
  if (!text) return <span className="muted">—</span>;
  return <div style={{ fontWeight: 800, background: "#fff8e1", border: "1px solid #f2d08a", borderRadius: 10, padding: "6px 8px", maxWidth: 280, whiteSpace: "pre-wrap" }}>{text}</div>;
}

function isPlegadosRow(row) {
  return String(row?.payload?.quote_subkind || row?.catalog_kind || "").toLowerCase().trim() === "plegados";
}
function plegadoDescription(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const dimensions = payload?.dimensions && typeof payload.dimensions === "object" ? payload.dimensions : {};
  return String(dimensions?.plegado_descripcion || dimensions?.descripcion_plegado || dimensions?.description || payload?.plegado_descripcion || payload?.descripcion_plegado || "").trim();
}
function plegadoSurface(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const dimensions = payload?.dimensions && typeof payload.dimensions === "object" ? payload.dimensions : {};
  const direct = Number(String(dimensions?.area_m2 ?? "").replace(",", "."));
  const width = Number(String(dimensions?.width ?? "").replace(",", "."));
  const height = Number(String(dimensions?.height ?? "").replace(",", "."));
  const area = Number.isFinite(direct) && direct > 0 ? direct : (Number.isFinite(width) && Number.isFinite(height) ? width * height : 0);
  return Number.isFinite(area) && area > 0 ? `${area.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²` : "";
}
function PlegadoInfoCell({ row }) {
  if (!isPlegadosRow(row)) return <span className="muted">—</span>;
  const surface = plegadoSurface(row);
  const description = plegadoDescription(row);
  return (
    <div style={{ background: "#f7fbff", border: "1px solid #d9e5f7", borderRadius: 10, padding: "6px 8px", maxWidth: 320 }}>
      <div style={{ fontWeight: 900 }}>{surface || "Sin superficie"}</div>
      <div className="muted" style={{ whiteSpace: "pre-wrap", marginTop: 3 }}>{description || "Sin descripción"}</div>
    </div>
  );
}

function uniqueNonEmpty(values = []) {
  const out = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}
function quoteOdooReference(row) {
  return uniqueNonEmpty([
    row?.production_sale_order_name,
    row?.final_sale_order_name,
    row?.final_copy_sale_order_name,
    row?.odoo_sale_order_name,
  ]).join(" / ");
}
function doorOdooReference(d) {
  return uniqueNonEmpty([
    d?.odoo_sale_order_name,
    d?.odoo_purchase_order_name,
    d?.record?.odoo_sale_order_name,
    d?.record?.odoo_purchase_order_name,
  ]).join(" / ");
}
function OdooReferenceCell({ value }) {
  const text = String(value || "").trim();
  if (!text) return <span className="muted">—</span>;
  return <span style={{ fontWeight: 900, background: "#e7f7ed", border: "1px solid #bfe6c8", borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>{text}</span>;
}
function productionReference(row) {
  return quoteOdooReference(row);
}
function productionSentAt(row) {
  return row?.production_sent_at || row?.measurement_review_at || row?.final_copy_synced_at || row?.final_synced_at || row?.production_delivery_committed_at || row?.confirmed_at || row?.created_at;
}
function productionStatusLabel(row) {
  const ref = productionReference(row);
  return ref ? `Enviado a producción · ${ref}` : "Enviado a producción";
}
function measurementStatusLabel(s, row) {
  if (s === "pending") return String(row?.measurement_subtype || "").toLowerCase().trim() === "sin_medicion" ? "Pendiente detalle técnico" : "Pendiente";
  if (s === "needs_fix") return "A corregir";
  if (s === "submitted") return "Pendiente aprobación final";
  if (s === "approved") return "Aprobada";
  return s || "—";
}
function measurementSubtypeLabel(row) {
  const subtype = String(row?.measurement_subtype || "normal").toLowerCase().trim();
  return subtype === "sin_medicion" ? "Detalle técnico" : "Medición";
}
function localityLabel(r) {
  return r?.end_customer?.city || r?.end_customer?.address || "—";
}
function normalizeTab(raw) {
  const tab = String(raw || "").trim();
  return VALID_TABS.includes(tab) ? tab : "aprobaciones_portones";
}
function matchesSearch(values, searchText) {
  const s = String(searchText || "").trim().toLowerCase();
  if (!s) return true;
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(s);
}
function toTimeDesc(value) {
  if (!value) return 0;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getTime();
}
function measurementSortWeight(row) {
  const status = String(row?.measurement_status || "").toLowerCase().trim();
  if (status === "submitted") return 0;
  if (status === "pending") return 1;
  if (status === "needs_fix") return 2;
  if (status === "approved") return 3;
  return 4;
}

export default function AprobacionTecnicaPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = normalizeTab(searchParams.get("tab"));
  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [measurementStatus, setMeasurementStatus] = useState(initialTab === "aprobaciones_mediciones" ? "all" : "all");
  const [measurementDates, setMeasurementDates] = useState({});
  const [pageAprobaciones, setPageAprobaciones] = useState(1);
  const [pageMediciones, setPageMediciones] = useState(1);
  const [pageAcopio, setPageAcopio] = useState(1);
  const [pageAcopioListado, setPageAcopioListado] = useState(1);
  const [pageProduccion, setPageProduccion] = useState(1);
  const [pagePuertas, setPagePuertas] = useState(1);

  useEffect(() => {
    const nextTab = normalizeTab(searchParams.get("tab"));
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams]);

  const q = useQuery({ queryKey: ["quotes", "technical_inbox"], queryFn: () => listQuotes({ scope: "technical_inbox" }), enabled: !!user?.is_rev_tecnica });
  const acopioQ = useQuery({ queryKey: ["quotes", "technical_acopio"], queryFn: () => listQuotes({ scope: "technical_acopio" }), enabled: tab === "acopio" && !!user?.is_rev_tecnica });
  const acopioListadoQ = useQuery({ queryKey: ["quotes", "technical_acopio_all"], queryFn: () => listQuotes({ scope: "technical_acopio_all" }), enabled: tab === "acopio_listado" && !!user?.is_rev_tecnica });
  const produccionQ = useQuery({ queryKey: ["quotes", "production_sent", "technical"], queryFn: () => listQuotes({ scope: "production_sent" }), enabled: tab === "produccion" && !!user?.is_rev_tecnica });
  const doorsQ = useQuery({ queryKey: ["doors", "technical_inbox"], queryFn: () => listDoors({ scope: "technical_inbox" }), enabled: tab === "aprobaciones_puertas" && !!user?.is_rev_tecnica });
  const measQ = useQuery({ queryKey: ["measurements", "tecnica", tab, measurementStatus], queryFn: () => listMeasurements({ status: "all", viewer: "tecnica" }), enabled: tab === "aprobaciones_mediciones" && !!user?.is_rev_tecnica });

  const acopioM = useMutation({ mutationFn: ({ id, action, notes }) => reviewAcopioTechnical(id, { action, notes }), onSuccess: () => acopioQ.refetch() });
  const doorM = useMutation({ mutationFn: ({ id, action, notes }) => reviewDoorTechnical(id, { action, notes }), onSuccess: () => doorsQ.refetch() });
  const scheduleM = useMutation({ mutationFn: ({ id, scheduledFor }) => scheduleMeasurement(id, { scheduledFor }), onSuccess: () => measQ.refetch() });

  function goToTab(nextTab) {
    const normalized = normalizeTab(nextTab);
    setTab(normalized);
    setSearchParams({ tab: normalized });
    if (normalized === "aprobaciones_mediciones") setMeasurementStatus("all");
  }

  useEffect(() => { setPageAprobaciones(1); }, [filter, searchText]);
  useEffect(() => { setPageMediciones(1); }, [measurementStatus, searchText]);
  useEffect(() => { setPageAcopio(1); }, [searchText]);
  useEffect(() => { setPageAcopioListado(1); }, [searchText]);
  useEffect(() => { setPageProduccion(1); }, [searchText]);
  useEffect(() => { setPagePuertas(1); }, [searchText]);

  const rows = useMemo(() => {
    const arr = (q.data || []).slice().sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at));
    let out = arr;
    if (filter === "pending") out = arr.filter((x) => x.status === "pending_approvals" && x.technical_decision === "pending");
    if (filter === "rejected") out = arr.filter((x) => x.status === "draft" && x.commercial_decision === "rejected");
    return out.filter((r) => matchesSearch([createdByLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r)], searchText));
  }, [q.data, filter, searchText]);

  const measurementRows = useMemo(() => {
    let arr = (measQ.data || []).slice();
    if (measurementStatus === "por_realizar") arr = arr.filter((x) => ["pending", "needs_fix"].includes(String(x?.measurement_status || "")));
    else if (measurementStatus === "por_controlar") arr = arr.filter((x) => String(x?.measurement_status || "") === "submitted");
    else if (measurementStatus === "approved") arr = arr.filter((x) => String(x?.measurement_status || "") === "approved");
    else if (measurementStatus === "sin_medicion") arr = arr.filter((x) => String(x?.measurement_subtype || "normal").toLowerCase().trim() === "sin_medicion");
    return arr
      .filter((r) => matchesSearch([r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, measurementStatusLabel(r?.measurement_status, r), measurementSubtypeLabel(r), createdByLabel(r), quoteOdooReference(r)], searchText))
      .sort((a, b) => {
        const weightDiff = measurementSortWeight(a) - measurementSortWeight(b);
        if (weightDiff !== 0) return weightDiff;
        return toTimeDesc(b?.measurement_scheduled_for || b?.created_at) - toTimeDesc(a?.measurement_scheduled_for || a?.created_at);
      });
  }, [measQ.data, measurementStatus, searchText]);

  const acopioRows = useMemo(() => {
    return (acopioQ.data || []).slice().sort((a, b) => toTimeDesc(b?.acopio_to_produccion_requested_at || b?.created_at) - toTimeDesc(a?.acopio_to_produccion_requested_at || a?.created_at)).filter((r) => matchesSearch([createdByLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, r?.acopio_to_produccion_notes, acopioReqLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r)], searchText));
  }, [acopioQ.data, searchText]);

  const acopioListadoRows = useMemo(() => {
    return (acopioListadoQ.data || []).slice().sort((a, b) => toTimeDesc(b?.confirmed_at || b?.created_at) - toTimeDesc(a?.confirmed_at || a?.created_at)).filter((r) => matchesSearch([createdByLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r), acopioReqLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r)], searchText));
  }, [acopioListadoQ.data, searchText]);

  const produccionRows = useMemo(() => {
    return (produccionQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(productionSentAt(b)) - toTimeDesc(productionSentAt(a)))
      .filter((r) => matchesSearch([createdByLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, productionStatusLabel(r), productionReference(r), budgetObservation(r)], searchText));
  }, [produccionQ.data, searchText]);

  const doorRows = useMemo(() => {
    return (doorsQ.data || []).slice().sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at)).filter((d) => matchesSearch([d?.door_code, d?.record?.end_customer?.name, d?.record?.obra_cliente, d?.linked_quote_odoo_name, doorOdooReference(d), d?.record?.asociado_porton, d?.status], searchText));
  }, [doorsQ.data, searchText]);

  function paged(arr, page) {
    const start = (page - 1) * PAGE_SIZE;
    return arr.slice(start, start + PAGE_SIZE);
  }

  useEffect(() => { const total = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); if (pageAprobaciones > total) setPageAprobaciones(total); }, [rows.length, pageAprobaciones]);
  useEffect(() => { const total = Math.max(1, Math.ceil(measurementRows.length / PAGE_SIZE)); if (pageMediciones > total) setPageMediciones(total); }, [measurementRows.length, pageMediciones]);
  useEffect(() => { const total = Math.max(1, Math.ceil(acopioRows.length / PAGE_SIZE)); if (pageAcopio > total) setPageAcopio(total); }, [acopioRows.length, pageAcopio]);
  useEffect(() => { const total = Math.max(1, Math.ceil(acopioListadoRows.length / PAGE_SIZE)); if (pageAcopioListado > total) setPageAcopioListado(total); }, [acopioListadoRows.length, pageAcopioListado]);
  useEffect(() => { const total = Math.max(1, Math.ceil(produccionRows.length / PAGE_SIZE)); if (pageProduccion > total) setPageProduccion(total); }, [produccionRows.length, pageProduccion]);
  useEffect(() => { const total = Math.max(1, Math.ceil(doorRows.length / PAGE_SIZE)); if (pagePuertas > total) setPagePuertas(total); }, [doorRows.length, pagePuertas]);

  if (!user?.is_rev_tecnica) return <div className="container"><div className="card">No autorizado (falta rol Rev. Técnica).</div></div>;

  const visibleRows = paged(rows, pageAprobaciones);
  const visibleMeasurements = paged(measurementRows, pageMediciones);
  const visibleAcopio = paged(acopioRows, pageAcopio);
  const visibleAcopioListado = paged(acopioListadoRows, pageAcopioListado);
  const visibleProduccion = paged(produccionRows, pageProduccion);
  const visibleDoors = paged(doorRows, pagePuertas);
  const hideScheduleColumns = measurementStatus === "sin_medicion";

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Técnica</h2>
        <div className="muted">Aprobaciones de portones, puertas, mediciones, detalles técnicos y listado de portones en acopio.</div>

        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={tab === "aprobaciones_portones" ? "primary" : "ghost"} onClick={() => goToTab("aprobaciones_portones")}>Aprobaciones Portones</Button>
          <Button variant={tab === "aprobaciones_puertas" ? "primary" : "ghost"} onClick={() => goToTab("aprobaciones_puertas")}>Aprobaciones Puertas</Button>
          <Button variant={tab === "aprobaciones_mediciones" ? "primary" : "ghost"} onClick={() => goToTab("aprobaciones_mediciones")}>Circuito técnico</Button>
          <Button variant={tab === "acopio" ? "primary" : "ghost"} onClick={() => goToTab("acopio")}>Acopio → Producción</Button>
          <Button variant={tab === "acopio_listado" ? "primary" : "ghost"} onClick={() => goToTab("acopio_listado")}>Portones en Acopio</Button>
          <Button variant={tab === "produccion" ? "primary" : "ghost"} onClick={() => goToTab("produccion")}>Portones enviados a Producción</Button>
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

        {tab === "aprobaciones_mediciones" && (
          <>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={measurementStatus === "all" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("all")}>Todas</Button>
              <Button variant={measurementStatus === "por_controlar" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("por_controlar")}>Pendientes aprobación final</Button>
              <Button variant={measurementStatus === "por_realizar" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("por_realizar")}>Pendientes por realizar</Button>
              <Button variant={measurementStatus === "sin_medicion" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("sin_medicion")}>Detalles técnicos</Button>
              <Button variant={measurementStatus === "approved" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("approved")}>Aprobadas</Button>
            </div>
          </>
        )}

        <div className="spacer" />
        <Input value={searchText} onChange={setSearchText} placeholder="Buscar por cliente, localidad, dirección, usuario, código o estado…" style={{ width: "100%" }} />
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
                <table><thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th><th>Datos plegado</th><th>Obs. presupuesto</th><th></th></tr></thead><tbody>
                  {visibleRows.map((r) => <tr key={r.id}><td>{fmtDate(r.created_at)}</td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{rowLabel(r)}</td><td><OdooReferenceCell value={quoteOdooReference(r)} /></td><td><PlegadoInfoCell row={r} /></td><td><BudgetObservationCell row={r} /></td><td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button></td></tr>)}
                </tbody></table>
                <PaginationControls page={pageAprobaciones} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPageAprobaciones} />
              </>
            )}
          </>
        )}

        {tab === "aprobaciones_mediciones" && (
          <>
            {measQ.isLoading && <div className="muted">Cargando...</div>}
            {measQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{measQ.error.message}</div>}
            {!measQ.isLoading && !measurementRows.length && <div className="muted">Sin portones en circuito técnico</div>}
            {!!measurementRows.length && (
              <>
                <table>
                  <thead><tr><th>Cliente</th><th>Tipo</th><th>Localidad</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th>{!hideScheduleColumns ? <th>Fecha visita</th> : null}{!hideScheduleColumns ? <th>Asignar fecha</th> : null}<th></th></tr></thead>
                  <tbody>
                    {visibleMeasurements.map((r) => {
                      const dateValue = measurementDates[r.id] ?? r.measurement_scheduled_for ?? "";
                      const isSinMedicion = String(r?.measurement_subtype || "normal").toLowerCase().trim() === "sin_medicion";
                      const isSubmitted = String(r?.measurement_status || "").toLowerCase().trim() === "submitted";
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 800 }}>{r.end_customer?.name || "(sin nombre)"}</td>
                          <td>{measurementSubtypeLabel(r)}</td>
                          <td>{localityLabel(r)}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{measurementStatusLabel(r.measurement_status, r)}</td>
                           <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                          {!hideScheduleColumns ? <td>{fmtDate(r.measurement_scheduled_for)}</td> : null}
                          {!hideScheduleColumns ? <td style={{ minWidth: 220 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Input type="date" value={dateValue} onChange={(v) => setMeasurementDates((prev) => ({ ...prev, [r.id]: v }))} style={{ width: "100%" }} /><Button disabled={scheduleM.isPending || !dateValue} onClick={() => scheduleM.mutate({ id: r.id, scheduledFor: dateValue })}>Guardar</Button></div></td> : null}
                          <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant={isSubmitted ? "primary" : "ghost"} onClick={() => navigate(`/mediciones/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>{isSinMedicion ? "Completar detalle técnico" : (isSubmitted ? "Aprobar final" : "Abrir")}</Button></td>
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
            {!acopioQ.isLoading && !acopioRows.length && <div className="muted">Sin solicitudes</div>}
            {!!acopioRows.length && (
              <>
                <table><thead><tr><th>Fecha</th><th>NP/NV Odoo</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Solicitud</th><th>Datos plegado</th><th>Obs. presupuesto</th><th>Decisiones</th><th></th></tr></thead><tbody>
                  {visibleAcopio.map((r) => {
                    const canAct = (r.acopio_to_produccion_technical_decision || "pending") === "pending";
                    return <tr key={r.id}><td>{fmtDate(r.acopio_to_produccion_requested_at || r.created_at)}</td><td><OdooReferenceCell value={quoteOdooReference(r)} /></td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{r.acopio_to_produccion_notes || <span className="muted">(sin nota)</span>}</td><td><PlegadoInfoCell row={r} /></td><td><BudgetObservationCell row={r} /></td><td>{acopioReqLabel(r)}</td><td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button>{canAct ? <><Button disabled={acopioM.isPending} onClick={() => acopioM.mutate({ id: r.id, action: "approve", notes: null })}>OK</Button><Button variant="ghost" disabled={acopioM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) acopioM.mutate({ id: r.id, action: "reject", notes: msg }); }}>Rechazar</Button></> : <span className="muted">Ya decidiste</span>}</td></tr>;
                  })}
                </tbody></table>
                <PaginationControls page={pageAcopio} totalItems={acopioRows.length} pageSize={PAGE_SIZE} onPageChange={setPageAcopio} />
              </>
            )}
          </>
        )}

        {tab === "acopio_listado" && (
          <>
            {acopioListadoQ.isLoading && <div className="muted">Cargando...</div>}
            {acopioListadoQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{acopioListadoQ.error.message}</div>}
            {!acopioListadoQ.isLoading && !acopioListadoRows.length && <div className="muted">Sin portones en acopio</div>}
            {!!acopioListadoRows.length && (
              <>
                <table><thead><tr><th>Fecha</th><th>NP/NV Odoo</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>Datos plegado</th><th>Obs. presupuesto</th><th>Solicitud Prod.</th><th></th></tr></thead><tbody>
                  {visibleAcopioListado.map((r) => <tr key={r.id}><td>{fmtDate(r.confirmed_at || r.created_at)}</td><td><OdooReferenceCell value={quoteOdooReference(r)} /></td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{rowLabel(r)}</td><td><PlegadoInfoCell row={r} /></td><td><BudgetObservationCell row={r} /></td><td>{r.acopio_to_produccion_status ? acopioReqLabel(r) : "—"}</td><td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button></td></tr>)}
                </tbody></table>
                <PaginationControls page={pageAcopioListado} totalItems={acopioListadoRows.length} pageSize={PAGE_SIZE} onPageChange={setPageAcopioListado} />
              </>
            )}
          </>
        )}

        {tab === "produccion" && (
          <>
            {produccionQ.isLoading && <div className="muted">Cargando...</div>}
            {produccionQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{produccionQ.error.message}</div>}
            {!produccionQ.isLoading && !produccionRows.length && <div className="muted">Sin portones enviados a producción</div>}
            {!!produccionRows.length && (
              <>
                <table><thead><tr><th>Fecha envío</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>NP/NV Odoo</th><th>Semana producción</th><th>Obs. presupuesto</th><th></th></tr></thead><tbody>
                  {visibleProduccion.map((r) => <tr key={r.id}><td>{fmtDate(productionSentAt(r))}</td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{productionReference(r) || "—"}</td><td>{r.production_delivery_year && r.production_delivery_week ? `${r.production_delivery_year} · Semana ${r.production_delivery_week}` : "—"}</td><td><BudgetObservationCell row={r} /></td><td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button></td></tr>)}
                </tbody></table>
                <PaginationControls page={pageProduccion} totalItems={produccionRows.length} pageSize={PAGE_SIZE} onPageChange={setPageProduccion} />
              </>
            )}
          </>
        )}

        {tab === "aprobaciones_puertas" && (
          <>
            {doorsQ.isLoading && <div className="muted">Cargando...</div>}
            {doorsQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{doorsQ.error.message}</div>}
            {!doorsQ.isLoading && !doorRows.length && <div className="muted">Sin puertas pendientes</div>}
            {!!doorRows.length && (
              <>
                <table><thead><tr><th>Código</th><th>Cliente</th><th>Portón vinculado</th><th>Odoo</th><th>Venta</th><th>Compra</th><th></th></tr></thead><tbody>
                  {visibleDoors.map((d) => <tr key={d.id}><td>{d.door_code}</td><td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td><td>{d.linked_quote_odoo_name || d.record?.asociado_porton || "—"}</td><td><OdooReferenceCell value={doorOdooReference(d)} /></td><td>{d.sale_amount ? `$ ${Number(d.sale_amount).toLocaleString("es-AR")}` : "—"}</td><td>{d.purchase_amount ? `$ ${Number(d.purchase_amount).toLocaleString("es-AR")}` : "—"}</td><td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/puertas/${d.id}`)}>Abrir</Button><Button disabled={doorM.isPending} onClick={() => doorM.mutate({ id: d.id, action: "approve", notes: null })}>OK</Button><Button variant="ghost" disabled={doorM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) doorM.mutate({ id: d.id, action: "reject", notes: msg }); }}>Rechazar</Button></td></tr>)}
                </tbody></table>
                <PaginationControls page={pagePuertas} totalItems={doorRows.length} pageSize={PAGE_SIZE} onPageChange={setPagePuertas} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

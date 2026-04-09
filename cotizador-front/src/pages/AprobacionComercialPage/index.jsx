import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { listQuotes, reviewAcopioCommercial } from "../../api/quotes.js";
import { adminGetProductionPlanning, adminSaveProductionPlanning } from "../../api/admin.js";
import { listDoors, reviewDoorCommercial } from "../../api/doors.js";
import { listMeasurements } from "../../api/measurements.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { downloadListingDoorPdf, downloadListingQuotePdf } from "../../utils/listingPdf.js";

const PAGE_SIZE = 25;

function acopioReqLabel(r) {
  const c = r?.acopio_to_produccion_commercial_decision || "pending";
  const t = r?.acopio_to_produccion_technical_decision || "pending";
  const cL = c === "approved" ? "OK" : c === "rejected" ? "NO" : "Pend.";
  const tL = t === "approved" ? "OK" : t === "rejected" ? "NO" : "Pend.";
  return `C:${cL} · T:${tL}`;
}
function rowLabel(r) {
  if (r.status === "pending_approvals") {
    if (r.commercial_decision === "pending") return "Pendiente tu decisión";
    if (r.commercial_decision === "approved" && r.technical_decision === "pending") return "Aprobado por Comercial · Pendiente Técnica";
    if (r.commercial_decision === "approved" && r.technical_decision === "approved") return "Listo para Odoo";
    return "En aprobación";
  }
  if (r.status === "draft" && r.technical_decision === "rejected") return "Rechazado por Técnica (aviso)";
  if (r.status === "synced_odoo") return "En Odoo";
  if (r.status === "syncing_odoo") return "Sincronizando…";
  return r.status;
}
function measurementRowLabel(r) {
  const status = String(r?.measurement_status || "");
  if (status === "commercial_review") return "Revisión comercial de medición";
  if (status === "submitted") return "Pendiente técnica";
  if (status === "needs_fix") return "Devuelto para corregir";
  if (status === "approved") return "Aprobada";
  return status || "—";
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
function PdfIconButton({ onClick, disabled = false }) {
  return (
    <Button variant="ghost" disabled={disabled} onClick={onClick} title="Descargar PDF">
      📄
    </Button>
  );
}

export default function AprobacionComercialPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState("aprobaciones");
  const [filter, setFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [pageAprobaciones, setPageAprobaciones] = useState(1);
  const [pageAcopio, setPageAcopio] = useState(1);
  const [pageAcopioListado, setPageAcopioListado] = useState(1);
  const [pagePuertas, setPagePuertas] = useState(1);
  const [pageMediciones, setPageMediciones] = useState(1);
  const [downloadingPdfKey, setDownloadingPdfKey] = useState("");
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, idx) => String(currentYear - 1 + idx));
  const [planningYear, setPlanningYear] = useState(String(currentYear));
  const [planningDraft, setPlanningDraft] = useState([]);

  const q = useQuery({ queryKey: ["quotes", "commercial_inbox"], queryFn: () => listQuotes({ scope: "commercial_inbox" }), enabled: !!user?.is_enc_comercial });
  const acopioQ = useQuery({ queryKey: ["quotes", "commercial_acopio"], queryFn: () => listQuotes({ scope: "commercial_acopio" }), enabled: tab === "acopio" && !!user?.is_enc_comercial });
  const acopioListadoQ = useQuery({ queryKey: ["quotes", "commercial_acopio_all"], queryFn: () => listQuotes({ scope: "commercial_acopio_all" }), enabled: tab === "acopio_listado" && !!user?.is_enc_comercial });
  const doorsQ = useQuery({ queryKey: ["doors", "commercial_inbox"], queryFn: () => listDoors({ scope: "commercial_inbox" }), enabled: tab === "puertas" && !!user?.is_enc_comercial });
  const medicionesQ = useQuery({
    queryKey: ["measurements", "commercial_review"],
    queryFn: () => listMeasurements({ status: "commercial_review", viewer: "comercial" }),
    enabled: tab === "mediciones" && !!user?.is_enc_comercial,
  });
  const planningQ = useQuery({
    queryKey: ["admin", "production-planning", planningYear],
    queryFn: () => adminGetProductionPlanning(Number(planningYear || currentYear)),
    enabled: tab === "planificacion" && !!user?.is_enc_comercial,
  });

  const acopioM = useMutation({ mutationFn: ({ id, action, notes }) => reviewAcopioCommercial(id, { action, notes }), onSuccess: () => acopioQ.refetch() });
  const doorM = useMutation({ mutationFn: ({ id, action, notes }) => reviewDoorCommercial(id, { action, notes }), onSuccess: () => doorsQ.refetch() });
  const planningSaveM = useMutation({
    mutationFn: async () => {
      return adminSaveProductionPlanning({
        year: Number(planningYear || currentYear),
        weeks: planningDraft.map((row) => ({
          week_number: Number(row.week_number || row.week || 0),
          capacity: Math.max(0, Number(String(row.capacity_input ?? row.capacity ?? 0).replace(",", ".")) || 0),
          comment: String(row.comment_input ?? row.comment ?? "").trim(),
        })),
      });
    },
    onSuccess: (planning) => {
      setPlanningDraft(
        (planning?.weeks || []).map((row) => ({
          ...row,
          capacity_input: String(row.capacity ?? 0),
          comment_input: String(row.comment ?? ""),
        })),
      );
      toast.success("Planificación guardada.");
      planningQ.refetch();
    },
    onError: (e) => {
      toast.error(e?.message || "No se pudo guardar la planificación.");
    },
  });

  async function handleDownloadQuotePdf(id) {
    const key = `quote-${id}`;
    setDownloadingPdfKey(key);
    try {
      await downloadListingQuotePdf(id);
    } catch (e) {
      toast.error(e?.message || "No se pudo descargar el PDF");
    } finally {
      setDownloadingPdfKey("");
    }
  }

  async function handleDownloadDoorPdf(id) {
    const key = `door-${id}`;
    setDownloadingPdfKey(key);
    try {
      await downloadListingDoorPdf(id);
    } catch (e) {
      toast.error(e?.message || "No se pudo descargar el PDF de puerta");
    } finally {
      setDownloadingPdfKey("");
    }
  }

  const rows = useMemo(() => {
    const arr = (q.data || []).slice().sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at));
    let out = arr;
    if (filter === "pending") out = arr.filter((x) => x.status === "pending_approvals" && x.commercial_decision === "pending");
    if (filter === "rejected") out = arr.filter((x) => x.status === "draft" && x.technical_decision === "rejected");
    return out.filter((r) => matchesSearch([createdByLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r)], searchText));
  }, [q.data, filter, searchText]);

  const acopioRows = useMemo(() => {
    return (acopioQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.acopio_to_produccion_requested_at || b?.created_at) - toTimeDesc(a?.acopio_to_produccion_requested_at || a?.created_at))
      .filter((r) => matchesSearch([createdByLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, r?.acopio_to_produccion_notes, acopioReqLabel(r)], searchText));
  }, [acopioQ.data, searchText]);

  const acopioListadoRows = useMemo(() => {
    return (acopioListadoQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.confirmed_at || b?.created_at) - toTimeDesc(a?.confirmed_at || a?.created_at))
      .filter((r) => matchesSearch([createdByLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r), acopioReqLabel(r)], searchText));
  }, [acopioListadoQ.data, searchText]);

  const doorRows = useMemo(() => {
    return (doorsQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at))
      .filter((d) => matchesSearch([d?.door_code, d?.record?.end_customer?.name, d?.record?.obra_cliente, d?.linked_quote_odoo_name, d?.record?.asociado_porton, d?.status], searchText));
  }, [doorsQ.data, searchText]);

  const medicionesRows = useMemo(() => {
    return (medicionesQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.measurement_at || b?.created_at) - toTimeDesc(a?.measurement_at || a?.created_at))
      .filter((r) =>
        matchesSearch(
          [
            createdByLabel(r),
            r?.end_customer?.name,
            r?.end_customer?.city,
            r?.end_customer?.address,
            measurementRowLabel(r),
            ...(Array.isArray(r?.measurement_commercial_diff_json)
              ? r.measurement_commercial_diff_json.map((item) => item?.label || item?.key)
              : []),
          ],
          searchText,
        ),
      );
  }, [medicionesQ.data, searchText]);

  useEffect(() => {
    if (!planningQ.data?.weeks) return;
    setPlanningDraft(
      planningQ.data.weeks.map((row) => ({
        ...row,
        capacity_input: String(row.capacity ?? 0),
        comment_input: String(row.comment ?? ""),
      })),
    );
  }, [planningQ.data]);

  useEffect(() => { setPageAprobaciones(1); }, [filter, searchText]);
  useEffect(() => { setPageAcopio(1); }, [searchText]);
  useEffect(() => { setPageAcopioListado(1); }, [searchText]);
  useEffect(() => { setPagePuertas(1); }, [searchText]);
  useEffect(() => { setPageMediciones(1); }, [searchText]);

  const visibleRows = useMemo(() => rows.slice((pageAprobaciones - 1) * PAGE_SIZE, pageAprobaciones * PAGE_SIZE), [rows, pageAprobaciones]);
  const visibleAcopioRows = useMemo(() => acopioRows.slice((pageAcopio - 1) * PAGE_SIZE, pageAcopio * PAGE_SIZE), [acopioRows, pageAcopio]);
  const visibleAcopioListadoRows = useMemo(() => acopioListadoRows.slice((pageAcopioListado - 1) * PAGE_SIZE, pageAcopioListado * PAGE_SIZE), [acopioListadoRows, pageAcopioListado]);
  const visibleDoorRows = useMemo(() => doorRows.slice((pagePuertas - 1) * PAGE_SIZE, pagePuertas * PAGE_SIZE), [doorRows, pagePuertas]);
  const visibleMedicionesRows = useMemo(() => medicionesRows.slice((pageMediciones - 1) * PAGE_SIZE, pageMediciones * PAGE_SIZE), [medicionesRows, pageMediciones]);

  if (!user?.is_enc_comercial) {
    return <div className="container"><div className="card">No autorizado (falta rol Enc. Comercial).</div></div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Aprobación Comercial</h2>
        <div className="muted">Presupuestos, portones en acopio, puertas y mediciones pendientes de tu decisión.</div>

        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={tab === "aprobaciones" ? "primary" : "ghost"} onClick={() => setTab("aprobaciones")}>Aprobaciones</Button>
          <Button variant={tab === "planificacion" ? "primary" : "ghost"} onClick={() => setTab("planificacion")}>Planificación</Button>
          <Button variant={tab === "mediciones" ? "primary" : "ghost"} onClick={() => setTab("mediciones")}>Mediciones</Button>
          <Button variant={tab === "acopio" ? "primary" : "ghost"} onClick={() => setTab("acopio")}>Acopio → Producción</Button>
          <Button variant={tab === "acopio_listado" ? "primary" : "ghost"} onClick={() => setTab("acopio_listado")}>Portones en Acopio</Button>
          <Button variant={tab === "puertas" ? "primary" : "ghost"} onClick={() => setTab("puertas")}>Puertas</Button>
        </div>

        {tab === "aprobaciones" && (
          <>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>Todos</Button>
              <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>Pendientes</Button>
              <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>Rechazados (Técnica)</Button>
            </div>
          </>
        )}

        {tab !== "planificacion" ? (
          <>
            <div className="spacer" />
            <Input value={searchText} onChange={setSearchText} placeholder="Buscar por cliente, localidad, dirección, usuario, código, estado o campo..." style={{ width: "100%" }} />
          </>
        ) : null}
      </div>

      <div className="spacer" />

      <div className="card">
        {tab === "aprobaciones" && (
          <>
            {q.isLoading && <div className="muted">Cargando...</div>}
            {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
            {!q.isLoading && !rows.length && <div className="muted">Sin ítems</div>}
            {!!rows.length && (
              <>
                <table>
                  <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {visibleRows.map((r) => {
                      const pdfKey = `quote-${r.id}`;
                      return (
                        <tr key={r.id}>
                          <td>{fmtDate(r.created_at)}</td>
                          <td>{createdByLabel(r)}</td>
                          <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{rowLabel(r)}</td>
                          <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                            <Button onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <PaginationControls page={pageAprobaciones} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPageAprobaciones} />
              </>
            )}
          </>
        )}

        {tab === "planificacion" && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <div className="muted">Año</div>
              <select
                value={planningYear}
                onChange={(e) => setPlanningYear(String(e.target.value || currentYear))}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", outline: "none", background: "#fff" }}
              >
                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              <Button variant="ghost" onClick={() => planningQ.refetch()} disabled={planningQ.isLoading || planningQ.isFetching}>Recargar</Button>
              <Button onClick={() => planningSaveM.mutate()} disabled={planningSaveM.isPending || planningQ.isLoading}>
                {planningSaveM.isPending ? "Guardando..." : "Guardar planificación"}
              </Button>
            </div>

            {planningQ.isLoading && <div className="muted">Cargando planificación...</div>}
            {planningQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{planningQ.error.message}</div>}
            {!planningQ.isLoading && !planningDraft.length && <div className="muted">Sin semanas cargadas para este año.</div>}

            {!planningQ.isLoading && !!planningDraft.length && (
              <table>
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th className="right">Capacidad</th>
                    <th>Comentarios</th>
                    <th className="right">Comprometidos</th>
                    <th className="right">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {planningDraft.map((row) => {
                    const week = Number(row.week_number || row.week || 0);
                    const capacity = Math.max(0, Number(String(row.capacity_input ?? row.capacity ?? 0).replace(",", ".")) || 0);
                    const committed = Math.max(0, Number(row.committed_count || 0));
                    const available = Math.max(0, Number(row.available ?? (capacity - committed)) || 0);
                    const comment = String(row.comment_input ?? row.comment ?? "");
                    return (
                      <tr key={`${planningYear}-${week}`}>
                        <td>Semana {week}</td>
                        <td>{fmtDate(row.start_date)}</td>
                        <td>{fmtDate(row.end_date)}</td>
                        <td className="right">
                          <input
                            type="number"
                            min="0"
                            value={row.capacity_input ?? row.capacity ?? 0}
                            onChange={(e) => {
                              const nextValue = String(e.target.value || "0");
                              setPlanningDraft((prev) => prev.map((item) => Number(item.week_number || item.week || 0) === week ? { ...item, capacity_input: nextValue } : item));
                            }}
                            style={{ width: 110, textAlign: "right", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", outline: "none" }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={comment}
                            placeholder="Comentario de la semana"
                            onChange={(e) => {
                              const nextValue = String(e.target.value || "");
                              setPlanningDraft((prev) => prev.map((item) => Number(item.week_number || item.week || 0) === week ? { ...item, comment_input: nextValue } : item));
                            }}
                            style={{ width: "100%", minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", outline: "none" }}
                          />
                        </td>
                        <td className="right">{committed}</td>
                        <td className="right">{available}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "mediciones" && (
          <>
            {medicionesQ.isLoading && <div className="muted">Cargando...</div>}
            {medicionesQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{medicionesQ.error.message}</div>}
            {!medicionesQ.isLoading && !medicionesRows.length && <div className="muted">Sin mediciones pendientes de revisión comercial</div>}
            {!!medicionesRows.length && (
              <>
                <table>
                  <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>Campos modificados</th><th></th></tr></thead>
                  <tbody>
                    {visibleMedicionesRows.map((r) => (
                      <tr key={r.id}>
                        <td>{fmtDate(r.measurement_at || r.created_at)}</td>
                        <td>{createdByLabel(r)}</td>
                        <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                        <td>{r.end_customer?.address || "—"}</td>
                        <td>{measurementRowLabel(r)}</td>
                        <td>
                          {Array.isArray(r?.measurement_commercial_diff_json) && r.measurement_commercial_diff_json.length
                            ? r.measurement_commercial_diff_json.map((item) => item?.label || item?.key).filter(Boolean).join(", ")
                            : "—"}
                        </td>
                        <td className="right">
                          <Button onClick={() => navigate(`/mediciones/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls page={pageMediciones} totalItems={medicionesRows.length} pageSize={PAGE_SIZE} onPageChange={setPageMediciones} />
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
                <table>
                  <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Solicitud</th><th>Decisiones</th><th></th></tr></thead>
                  <tbody>
                    {visibleAcopioRows.map((r) => {
                      const canAct = (r.acopio_to_produccion_commercial_decision || "pending") === "pending";
                      const pdfKey = `quote-${r.id}`;
                      return (
                        <tr key={r.id}>
                          <td>{fmtDate(r.acopio_to_produccion_requested_at || r.created_at)}</td>
                          <td>{createdByLabel(r)}</td>
                          <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{r.acopio_to_produccion_notes || <span className="muted">(sin nota)</span>}</td>
                          <td>{acopioReqLabel(r)}</td>
                          <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                            <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                            {canAct ? (
                              <>
                                <Button disabled={acopioM.isPending} onClick={() => acopioM.mutate({ id: r.id, action: "approve", notes: null })}>OK</Button>
                                <Button variant="ghost" disabled={acopioM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) acopioM.mutate({ id: r.id, action: "reject", notes: msg }); }}>Rechazar</Button>
                              </>
                            ) : <span className="muted">Ya decidiste</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                <table>
                  <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>Solicitud Prod.</th><th></th></tr></thead>
                  <tbody>
                    {visibleAcopioListadoRows.map((r) => {
                      const pdfKey = `quote-${r.id}`;
                      return (
                        <tr key={r.id}>
                          <td>{fmtDate(r.confirmed_at || r.created_at)}</td>
                          <td>{createdByLabel(r)}</td>
                          <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{rowLabel(r)}</td>
                          <td>{r.acopio_to_produccion_status ? acopioReqLabel(r) : "—"}</td>
                          <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                            <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <PaginationControls page={pageAcopioListado} totalItems={acopioListadoRows.length} pageSize={PAGE_SIZE} onPageChange={setPageAcopioListado} />
              </>
            )}
          </>
        )}

        {tab === "puertas" && (
          <>
            {doorsQ.isLoading && <div className="muted">Cargando...</div>}
            {doorsQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{doorsQ.error.message}</div>}
            {!doorsQ.isLoading && !doorRows.length && <div className="muted">Sin puertas pendientes</div>}
            {!!doorRows.length && (
              <>
                <table>
                  <thead><tr><th>Código</th><th>Cliente</th><th>Portón vinculado</th><th>Venta</th><th>Compra</th><th></th></tr></thead>
                  <tbody>
                    {visibleDoorRows.map((d) => {
                      const pdfKey = `door-${d.id}`;
                      return (
                        <tr key={d.id}>
                          <td>{d.door_code}</td>
                          <td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td>
                          <td>{d.linked_quote_odoo_name || d.record?.asociado_porton || "—"}</td>
                          <td>{d.sale_amount ? `$ ${Number(d.sale_amount).toLocaleString("es-AR")}` : "—"}</td>
                          <td>{d.purchase_amount ? `$ ${Number(d.purchase_amount).toLocaleString("es-AR")}` : "—"}</td>
                          <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadDoorPdf(d.id)} />
                            <Button variant="ghost" onClick={() => navigate(`/puertas/${d.id}`)}>Abrir</Button>
                            <Button disabled={doorM.isPending} onClick={() => doorM.mutate({ id: d.id, action: "approve", notes: null })}>OK</Button>
                            <Button variant="ghost" disabled={doorM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) doorM.mutate({ id: d.id, action: "reject", notes: msg }); }}>Rechazar</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <PaginationControls page={pagePuertas} totalItems={doorRows.length} pageSize={PAGE_SIZE} onPageChange={setPagePuertas} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

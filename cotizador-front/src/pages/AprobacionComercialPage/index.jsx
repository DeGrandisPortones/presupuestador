import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { listQuotes, reviewAcopioCommercial } from "../../api/quotes.js";
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
function catalogKind(row) {
  return String(row?.payload?.quote_subkind || row?.catalog_kind || "porton").toLowerCase().trim();
}
function isIpanelRow(row) {
  return catalogKind(row) === "ipanel";
}
function isPortonLikeRow(row) {
  const kind = catalogKind(row);
  return kind !== "ipanel" && kind !== "puerta";
}
function catalogKindLabel(row) {
  const kind = catalogKind(row);
  if (kind === "ipanel") return "Ipanel";
  if (kind === "puerta") return "Puerta";
  if (kind === "plegados") return "Plegado";
  if (kind === "otros") return "Otros";
  return "Portón";
}

function budgetObservation(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  return String(row?.budget_observation || payload?.budget_observation || payload?.presupuesto_observacion || payload?.quote_observation || "").trim();
}
function BudgetObservationCell({ row }) {
  const text = budgetObservation(row);
  const [open, setOpen] = useState(false);
  if (!text) return <span className="muted">—</span>;
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>Ver observación</Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #ddd",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              width: "min(720px, 96vw)",
              maxHeight: "80vh",
              overflow: "auto",
              padding: 18,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Observación presupuesto</h3>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, fontWeight: 700 }}>{text}</div>
          </div>
        </div>
      ) : null}
    </>
  );
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
function applyApprovalFilter(arr, filter) {
  let out = arr;
  if (filter === "pending") out = arr.filter((x) => x.status === "pending_approvals" && x.commercial_decision === "pending");
  if (filter === "rejected") out = arr.filter((x) => x.status === "draft" && x.technical_decision === "rejected");
  return out;
}
function quoteSearchValues(r) {
  return [createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r)];
}

export default function AprobacionComercialPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState("aprobaciones_portones");
  const [filter, setFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [pageAprobaciones, setPageAprobaciones] = useState(1);
  const [pageIpanels, setPageIpanels] = useState(1);
  const [pageAcopio, setPageAcopio] = useState(1);
  const [pageAcopioListado, setPageAcopioListado] = useState(1);
  const [pageProduccion, setPageProduccion] = useState(1);
  const [pageProduccionIpanels, setPageProduccionIpanels] = useState(1);
  const [pagePuertas, setPagePuertas] = useState(1);
  const [pageMediciones, setPageMediciones] = useState(1);
  const [downloadingPdfKey, setDownloadingPdfKey] = useState("");

  const q = useQuery({ queryKey: ["quotes", "commercial_inbox"], queryFn: () => listQuotes({ scope: "commercial_inbox" }), enabled: !!user?.is_enc_comercial });
  const acopioQ = useQuery({ queryKey: ["quotes", "commercial_acopio"], queryFn: () => listQuotes({ scope: "commercial_acopio" }), enabled: tab === "acopio" && !!user?.is_enc_comercial });
  const acopioListadoQ = useQuery({ queryKey: ["quotes", "commercial_acopio_all"], queryFn: () => listQuotes({ scope: "commercial_acopio_all" }), enabled: tab === "acopio_listado" && !!user?.is_enc_comercial });
  const produccionQ = useQuery({ queryKey: ["quotes", "production_sent", "commercial", tab], queryFn: () => listQuotes({ scope: "production_sent" }), enabled: ["produccion", "produccion_ipanels"].includes(tab) && !!user?.is_enc_comercial });
  const doorsQ = useQuery({ queryKey: ["doors", "commercial_inbox"], queryFn: () => listDoors({ scope: "commercial_inbox" }), enabled: tab === "puertas" && !!user?.is_enc_comercial });
  const medicionesQ = useQuery({
    queryKey: ["measurements", "commercial_review"],
    queryFn: () => listMeasurements({ status: "commercial_review", viewer: "comercial" }),
    enabled: tab === "mediciones" && !!user?.is_enc_comercial,
  });

  const acopioM = useMutation({ mutationFn: ({ id, action, notes }) => reviewAcopioCommercial(id, { action, notes }), onSuccess: () => acopioQ.refetch() });
  const doorM = useMutation({ mutationFn: ({ id, action, notes }) => reviewDoorCommercial(id, { action, notes }), onSuccess: () => doorsQ.refetch() });

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

  const approvalBaseRows = useMemo(() => {
    const arr = (q.data || []).slice().sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at));
    return applyApprovalFilter(arr, filter).filter((r) => matchesSearch(quoteSearchValues(r), searchText));
  }, [q.data, filter, searchText]);
  const rows = useMemo(() => approvalBaseRows.filter(isPortonLikeRow), [approvalBaseRows]);
  const ipanelRows = useMemo(() => approvalBaseRows.filter(isIpanelRow), [approvalBaseRows]);

  const acopioRows = useMemo(() => {
    return (acopioQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.acopio_to_produccion_requested_at || b?.created_at) - toTimeDesc(a?.acopio_to_produccion_requested_at || a?.created_at))
      .filter((r) => matchesSearch([createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, r?.acopio_to_produccion_notes, acopioReqLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r)], searchText));
  }, [acopioQ.data, searchText]);

  const acopioListadoRows = useMemo(() => {
    return (acopioListadoQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.confirmed_at || b?.created_at) - toTimeDesc(a?.confirmed_at || a?.created_at))
      .filter((r) => matchesSearch([createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r), acopioReqLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r)], searchText));
  }, [acopioListadoQ.data, searchText]);

  const productionBaseRows = useMemo(() => {
    return (produccionQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(productionSentAt(b)) - toTimeDesc(productionSentAt(a)))
      .filter((r) => matchesSearch([createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, productionStatusLabel(r), productionReference(r), budgetObservation(r)], searchText));
  }, [produccionQ.data, searchText]);
  const produccionRows = useMemo(() => productionBaseRows.filter(isPortonLikeRow), [productionBaseRows]);
  const produccionIpanelRows = useMemo(() => productionBaseRows.filter(isIpanelRow), [productionBaseRows]);

  const doorRows = useMemo(() => {
    return (doorsQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at))
      .filter((d) => matchesSearch([d?.door_code, d?.record?.end_customer?.name, d?.record?.obra_cliente, d?.linked_quote_odoo_name, doorOdooReference(d), d?.record?.asociado_porton, d?.status], searchText));
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
            quoteOdooReference(r),
            ...(Array.isArray(r?.measurement_commercial_diff_json)
              ? r.measurement_commercial_diff_json.map((item) => item?.label || item?.key)
              : []),
          ],
          searchText,
        ),
      );
  }, [medicionesQ.data, searchText]);

  useEffect(() => { setPageAprobaciones(1); setPageIpanels(1); }, [filter, searchText]);
  useEffect(() => { setPageAcopio(1); }, [searchText]);
  useEffect(() => { setPageAcopioListado(1); }, [searchText]);
  useEffect(() => { setPageProduccion(1); setPageProduccionIpanels(1); }, [searchText]);
  useEffect(() => { setPagePuertas(1); }, [searchText]);
  useEffect(() => { setPageMediciones(1); }, [searchText]);

  const visibleRows = useMemo(() => rows.slice((pageAprobaciones - 1) * PAGE_SIZE, pageAprobaciones * PAGE_SIZE), [rows, pageAprobaciones]);
  const visibleIpanels = useMemo(() => ipanelRows.slice((pageIpanels - 1) * PAGE_SIZE, pageIpanels * PAGE_SIZE), [ipanelRows, pageIpanels]);
  const visibleAcopioRows = useMemo(() => acopioRows.slice((pageAcopio - 1) * PAGE_SIZE, pageAcopio * PAGE_SIZE), [acopioRows, pageAcopio]);
  const visibleAcopioListadoRows = useMemo(() => acopioListadoRows.slice((pageAcopioListado - 1) * PAGE_SIZE, pageAcopioListado * PAGE_SIZE), [acopioListadoRows, pageAcopioListado]);
  const visibleProduccionRows = useMemo(() => produccionRows.slice((pageProduccion - 1) * PAGE_SIZE, pageProduccion * PAGE_SIZE), [produccionRows, pageProduccion]);
  const visibleProduccionIpanelRows = useMemo(() => produccionIpanelRows.slice((pageProduccionIpanels - 1) * PAGE_SIZE, pageProduccionIpanels * PAGE_SIZE), [produccionIpanelRows, pageProduccionIpanels]);
  const visibleDoorRows = useMemo(() => doorRows.slice((pagePuertas - 1) * PAGE_SIZE, pagePuertas * PAGE_SIZE), [doorRows, pagePuertas]);
  const visibleMedicionesRows = useMemo(() => medicionesRows.slice((pageMediciones - 1) * PAGE_SIZE, pageMediciones * PAGE_SIZE), [medicionesRows, pageMediciones]);

  if (!user?.is_enc_comercial) {
    return <div className="container"><div className="card">No autorizado (falta rol Enc. Comercial).</div></div>;
  }

  const renderApprovalRows = (items, totalItems, page, onPageChange, emptyText, showPlegadoInfo = true) => (
    <>
      {q.isLoading && <div className="muted">Cargando...</div>}
      {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
      {!q.isLoading && !totalItems && <div className="muted">{emptyText}</div>}
      {!!totalItems && (
        <>
          <table>
            <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th>{showPlegadoInfo ? <th>Datos plegado</th> : null}<th>Obs. presupuesto</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => {
                const pdfKey = `quote-${r.id}`;
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>{createdByLabel(r)}</td>
                    <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                    <td>{r.end_customer?.address || "—"}</td>
                    <td>{rowLabel(r)}</td>
                    <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                    {showPlegadoInfo ? <td><PlegadoInfoCell row={r} /></td> : null}
                    <td><BudgetObservationCell row={r} /></td>
                    <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                      <Button onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationControls page={page} totalItems={totalItems} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
        </>
      )}
    </>
  );

  const renderProductionRows = (items, totalItems, page, onPageChange, emptyText) => (
    <>
      {produccionQ.isLoading && <div className="muted">Cargando...</div>}
      {produccionQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{produccionQ.error.message}</div>}
      {!produccionQ.isLoading && !totalItems && <div className="muted">{emptyText}</div>}
      {!!totalItems && (
        <>
          <table>
            <thead><tr><th>Fecha envío</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>NP/NV Odoo</th><th>Semana producción</th><th>Obs. presupuesto</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => {
                const pdfKey = `quote-${r.id}`;
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(productionSentAt(r))}</td>
                    <td>{createdByLabel(r)}</td>
                    <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                    <td>{r.end_customer?.address || "—"}</td>
                    <td>{productionReference(r) || "—"}</td>
                    <td>{r.production_delivery_year && r.production_delivery_week ? `${r.production_delivery_year} · Semana ${r.production_delivery_week}` : "—"}</td>
                    <td><BudgetObservationCell row={r} /></td>
                    <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                      <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationControls page={page} totalItems={totalItems} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
        </>
      )}
    </>
  );

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Aprobación Comercial</h2>
        <div className="muted">Aprobaciones separadas de portones, Ipanels, puertas, acopio y mediciones pendientes de tu decisión.</div>

        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={tab === "aprobaciones_portones" ? "primary" : "ghost"} onClick={() => setTab("aprobaciones_portones")}>Aprobaciones Portones</Button>
          <Button variant={tab === "aprobaciones_ipanels" ? "primary" : "ghost"} onClick={() => setTab("aprobaciones_ipanels")}>Aprobaciones Ipanels</Button>
          <Button variant={tab === "mediciones" ? "primary" : "ghost"} onClick={() => setTab("mediciones")}>Mediciones</Button>
          <Button variant={tab === "acopio" ? "primary" : "ghost"} onClick={() => setTab("acopio")}>Acopio → Producción</Button>
          <Button variant={tab === "acopio_listado" ? "primary" : "ghost"} onClick={() => setTab("acopio_listado")}>Portones / Ipanels en Acopio</Button>
          <Button variant={tab === "produccion" ? "primary" : "ghost"} onClick={() => setTab("produccion")}>Portones enviados a Producción</Button>
          <Button variant={tab === "produccion_ipanels" ? "primary" : "ghost"} onClick={() => setTab("produccion_ipanels")}>Ipanels enviados a Producción</Button>
          <Button variant={tab === "puertas" ? "primary" : "ghost"} onClick={() => setTab("puertas")}>Puertas</Button>
        </div>

        {["aprobaciones_portones", "aprobaciones_ipanels"].includes(tab) && (
          <>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>Todos</Button>
              <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>Pendientes</Button>
              <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>Rechazados (Técnica)</Button>
            </div>
          </>
        )}

        <div className="spacer" />
        <Input value={searchText} onChange={setSearchText} placeholder="Buscar por cliente, localidad, dirección, usuario, código, estado o campo..." style={{ width: "100%" }} />
      </div>

      <div className="spacer" />

      <div className="card">
        {tab === "aprobaciones_portones" && renderApprovalRows(visibleRows, rows.length, pageAprobaciones, setPageAprobaciones, "Sin portones pendientes")}
        {tab === "aprobaciones_ipanels" && renderApprovalRows(visibleIpanels, ipanelRows.length, pageIpanels, setPageIpanels, "Sin Ipanels pendientes", false)}

        {tab === "mediciones" && (
          <>
            {medicionesQ.isLoading && <div className="muted">Cargando...</div>}
            {medicionesQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{medicionesQ.error.message}</div>}
            {!medicionesQ.isLoading && !medicionesRows.length && <div className="muted">Sin mediciones pendientes de revisión comercial</div>}
            {!!medicionesRows.length && (
              <>
                <table>
                  <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th><th>Campos modificados</th><th></th></tr></thead>
                  <tbody>
                    {visibleMedicionesRows.map((r) => (
                      <tr key={r.id}>
                        <td>{fmtDate(r.measurement_at || r.created_at)}</td>
                        <td>{createdByLabel(r)}</td>
                        <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                        <td>{r.end_customer?.address || "—"}</td>
                        <td>{measurementRowLabel(r)}</td>
                        <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                        <td>{Array.isArray(r?.measurement_commercial_diff_json) && r.measurement_commercial_diff_json.length ? r.measurement_commercial_diff_json.map((item) => item?.label || item?.key).filter(Boolean).join(", ") : "—"}</td>
                        <td className="right"><Button onClick={() => navigate(`/mediciones/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button></td>
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
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Solicitud</th><th>NP/NV Odoo</th><th>Datos plegado</th><th>Obs. presupuesto</th><th>Decisiones</th><th></th></tr></thead>
                  <tbody>
                    {visibleAcopioRows.map((r) => {
                      const canAct = (r.acopio_to_produccion_commercial_decision || "pending") === "pending";
                      const pdfKey = `quote-${r.id}`;
                      return (
                        <tr key={r.id}>
                          <td>{fmtDate(r.acopio_to_produccion_requested_at || r.created_at)}</td>
                          <td>{catalogKindLabel(r)}</td>
                          <td>{createdByLabel(r)}</td>
                          <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{r.acopio_to_produccion_notes || <span className="muted">(sin nota)</span>}</td>
                          <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                          <td><PlegadoInfoCell row={r} /></td>
                          <td><BudgetObservationCell row={r} /></td>
                          <td>{acopioReqLabel(r)}</td>
                          <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                            <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                            {canAct ? <><Button disabled={acopioM.isPending} onClick={() => acopioM.mutate({ id: r.id, action: "approve", notes: null })}>OK</Button><Button variant="ghost" disabled={acopioM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) acopioM.mutate({ id: r.id, action: "reject", notes: msg }); }}>Rechazar</Button></> : <span className="muted">Ya decidiste</span>}
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
            {!acopioListadoQ.isLoading && !acopioListadoRows.length && <div className="muted">Sin portones/Ipanels en acopio</div>}
            {!!acopioListadoRows.length && (
              <>
                <table>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th><th>Datos plegado</th><th>Obs. presupuesto</th><th>Solicitud Prod.</th><th></th></tr></thead>
                  <tbody>
                    {visibleAcopioListadoRows.map((r) => {
                      const pdfKey = `quote-${r.id}`;
                      return (
                        <tr key={r.id}>
                          <td>{fmtDate(r.confirmed_at || r.created_at)}</td>
                          <td>{catalogKindLabel(r)}</td>
                          <td>{createdByLabel(r)}</td>
                          <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{rowLabel(r)}</td>
                          <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                          <td><PlegadoInfoCell row={r} /></td>
                          <td><BudgetObservationCell row={r} /></td>
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

        {tab === "produccion" && renderProductionRows(visibleProduccionRows, produccionRows.length, pageProduccion, setPageProduccion, "Sin portones enviados a producción")}
        {tab === "produccion_ipanels" && renderProductionRows(visibleProduccionIpanelRows, produccionIpanelRows.length, pageProduccionIpanels, setPageProduccionIpanels, "Sin Ipanels enviados a producción")}

        {tab === "puertas" && (
          <>
            {doorsQ.isLoading && <div className="muted">Cargando...</div>}
            {doorsQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{doorsQ.error.message}</div>}
            {!doorsQ.isLoading && !doorRows.length && <div className="muted">Sin puertas pendientes</div>}
            {!!doorRows.length && (
              <>
                <table>
                  <thead><tr><th>Código</th><th>Cliente</th><th>Portón vinculado</th><th>Odoo</th><th>Venta</th><th>Compra</th><th></th></tr></thead>
                  <tbody>
                    {visibleDoorRows.map((d) => {
                      const pdfKey = `door-${d.id}`;
                      return (
                        <tr key={d.id}>
                          <td>{d.door_code}</td>
                          <td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td>
                          <td>{d.linked_quote_odoo_name || d.record?.asociado_porton || "—"}</td>
                          <td><OdooReferenceCell value={doorOdooReference(d)} /></td>
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

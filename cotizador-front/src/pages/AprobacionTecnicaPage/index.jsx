import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { listQuotes, reviewAcopioTechnical } from "../../api/quotes.js";
import { listDoors, reviewDoorTechnical } from "../../api/doors.js";
import { listMeasurements, scheduleMeasurement } from "../../api/measurements.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { downloadListingQuotePdf, downloadListingQuoteProformaPdf } from "../../utils/listingPdf.js";
import { downloadPlegadoAttachment, formatPlegadoAttachmentMeta, getPlegadoAttachment, openPlegadoAttachment } from "../../utils/plegadoAttachment.js";

const PAGE_SIZE = 25;
const TECHNICAL_TAB_LABELS = {
  aprobaciones_todos: "Todos",
  aprobaciones_portones: "Aprobación de Portones",
  aprobaciones_ipanels: "Aprobación de Ipanels",
  aprobaciones_puertas: "Aprobación de Puertas",
  aprobaciones_plegados: "Aprobación de Plegados",
  aprobaciones_otros: "Aprobación de Otros",
  aprobaciones_mediciones: "Circuito técnico",
  acopio: "Acopio → Producción",
  acopio_listado: "En Acopio",
  produccion: "Enviados a Producción",
  produccion_ipanels: "Enviados a Producción",
  produccion_puertas: "Enviadas a Producción",
  aprobados: "Aprobados (historial)",
};
const TECHNICAL_TABS_BY_SECTION = {
  all: ["aprobaciones_todos", "aprobaciones_portones", "aprobaciones_ipanels", "aprobaciones_puertas", "aprobaciones_plegados", "aprobaciones_otros", "aprobaciones_mediciones", "acopio", "acopio_listado", "produccion", "produccion_ipanels", "produccion_puertas", "aprobados"],
  porton: ["aprobaciones_portones", "aprobaciones_mediciones", "acopio", "acopio_listado", "produccion", "aprobados"],
  ipanel: ["aprobaciones_ipanels", "acopio", "acopio_listado", "produccion_ipanels", "aprobados"],
  puerta: ["aprobaciones_puertas", "aprobaciones_mediciones", "acopio", "acopio_listado", "produccion_puertas", "aprobados"],
  plegados: ["aprobaciones_plegados", "aprobados"],
  otros: ["aprobaciones_otros", "aprobados"],
};
const VALID_TABS = Object.keys(TECHNICAL_TAB_LABELS);
function normalizeTechnicalTab(raw, section = "all") {
  const allowed = TECHNICAL_TABS_BY_SECTION[section] || TECHNICAL_TABS_BY_SECTION.all;
  const value = String(raw || "").trim();
  return allowed.includes(value) ? value : allowed[0];
}

function technicalTabLabel(tabKey, section = "all") {
  if (tabKey === "acopio") {
    if (section === "porton") return "Portones: Acopio → Producción";
    if (section === "ipanel") return "Ipanels: Acopio → Producción";
    if (section === "puerta") return "Puertas: Acopio → Producción";
    if (section === "plegados") return "Plegados: Acopio → Producción";
    if (section === "otros") return "Otros: Acopio → Producción";
    return "Todos: Acopio → Producción";
  }
  if (tabKey === "acopio_listado") {
    if (section === "porton") return "Portones en Acopio";
    if (section === "ipanel") return "Ipanels en Acopio";
    if (section === "puerta") return "Puertas en Acopio";
    if (section === "plegados") return "Plegados en Acopio";
    if (section === "otros") return "Otros en Acopio";
    return "Todos en Acopio";
  }
  if (tabKey === "produccion") {
    if (section === "porton") return "Portones enviados a Producción";
    if (section === "ipanel") return "Ipanels enviados a Producción";
    if (section === "puerta") return "Puertas enviadas a Producción";
    if (section === "plegados") return "Plegados enviados a Producción";
    if (section === "otros") return "Otros enviados a Producción";
    return "Todos enviados a Producción";
  }
  if (tabKey === "produccion_ipanels") return "Ipanels enviados a Producción";
  if (tabKey === "produccion_puertas") return "Puertas enviadas a Producción";
  if (tabKey === "aprobaciones_mediciones") {
    if (section === "porton") return "Circuito técnico Portones";
    if (section === "puerta") return "Circuito técnico Puertas";
    if (section === "ipanel") return "Circuito técnico Ipanels";
    return "Circuito técnico";
  }
  return TECHNICAL_TAB_LABELS[tabKey] || tabKey;
}

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
function catalogKind(row) {
  return String(row?.payload?.quote_subkind || row?.catalog_kind || "porton").toLowerCase().trim();
}
function isIpanelRow(row) {
  return catalogKind(row) === "ipanel";
}

const APPROVAL_SECTION_LABELS = {
  all: "Todos",
  porton: "Portones",
  ipanel: "Ipanels",
  puerta: "Puertas",
  plegados: "Plegados",
  otros: "Otros",
};
const VALID_APPROVAL_SECTIONS = new Set(Object.keys(APPROVAL_SECTION_LABELS));
function normalizeApprovalSection(raw) {
  const value = String(raw || "all").trim().toLowerCase();
  return VALID_APPROVAL_SECTIONS.has(value) ? value : "all";
}
function isOtrosRow(row) { return catalogKind(row) === "otros"; }
function isPuertaQuoteRow(row) {
  const kind = catalogKind(row);
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  return kind === "puerta" || payload?.door_structure_quote === true || String(payload?.quote_subkind || "").toLowerCase().trim() === "puerta";
}
function isPortonOnlyRow(row) {
  const kind = catalogKind(row);
  return !["ipanel", "puerta", "plegados", "otros"].includes(kind);
}
function isPortonLikeRow(row) { return isPortonOnlyRow(row); }
function rowMatchesApprovalSection(row, section) {
  if (section === "all") return true;
  if (section === "porton") return isPortonOnlyRow(row);
  if (section === "ipanel") return isIpanelRow(row);
  if (section === "puerta") return isPuertaQuoteRow(row);
  if (section === "plegados") return isPlegadosRow(row);
  if (section === "otros") return isOtrosRow(row);
  return true;
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
  const [open, setOpen] = useState(false);
  if (!isPlegadosRow(row)) return <span className="muted">—</span>;
  const surface = plegadoSurface(row);
  const description = plegadoDescription(row);
  const attachment = getPlegadoAttachment(row || {});
  return (
    <>
      <div style={{ background: "#f7fbff", border: "1px solid #d9e5f7", borderRadius: 10, padding: "6px 8px", maxWidth: 340 }}>
        <div style={{ fontWeight: 900 }}>{surface || "Sin superficie"}</div>
        <div style={{ whiteSpace: "pre-wrap", marginTop: 3, fontWeight: 800, fontSize: 13 }}>{description || "Sin descripción"}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          <Button variant="ghost" onClick={() => setOpen(true)}>Ver datos</Button>
          {attachment ? <Button variant="ghost" onClick={() => openPlegadoAttachment(attachment)}>Ver plano</Button> : null}
        </div>
      </div>
      {open ? (
        <div role="dialog" aria-modal="true" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, border: "1px solid #ddd", boxShadow: "0 20px 50px rgba(0,0,0,0.25)", width: "min(760px, 96vw)", maxHeight: "80vh", overflow: "auto", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Plano y comentarios del plegado</h3>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>
            <div className="muted">Superficie</div>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>{surface || "—"}</div>
            <div className="muted">Descripción / comentarios</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{description || "Sin descripción"}</div>
            <div className="muted">Plano</div>
            {attachment ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}><span style={{ fontWeight: 800 }}>{formatPlegadoAttachmentMeta(attachment)}</span><Button variant="ghost" onClick={() => openPlegadoAttachment(attachment)}>Ver plano</Button><Button variant="ghost" onClick={() => downloadPlegadoAttachment(attachment)}>Descargar</Button></div> : <div className="muted" style={{ marginTop: 6 }}>Sin plano adjunto.</div>}
          </div>
        </div>
      ) : null}
    </>
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
// La medición ya pasó measurement_status='approved' (Técnica ya la revisó), pero la NV
// real vive en la "copia" (quote_kind='copy'), no en la fila original - y esa copia puede
// haber quedado trabada (falló el envío a Odoo, o directamente nunca llegó a generarse)
// sin ningún indicio visible: la fila se veía igual que una ya terminada de verdad. Caso
// real: NP4303/NP4309 (ver measurementFinalization.js) - quedaron invisibles para Técnica
// durante semanas porque la etiqueta decía "Aprobada" y el botón "Abrir", como cualquier
// medición ya cerrada.
function needsFinalTechnicalApproval(row) {
  if (String(row?.measurement_status || "") !== "approved") return false;
  const nvReady =
    row?.final_status === "synced_odoo" ||
    Number(row?.final_sale_order_id || 0) > 0 ||
    row?.final_copy_status === "synced_odoo" ||
    Number(row?.final_copy_sale_order_id || 0) > 0;
  const nvSyncing = row?.final_status === "syncing_odoo" || row?.final_copy_status === "syncing_odoo";
  return !nvReady && !nvSyncing;
}
function measurementStatusLabel(s, row) {
  if (String(row?.measurement_commercial_review_status || "") === "pending") return "Pendiente aprob. comercial postmedición";
  if (s === "pending") return String(row?.measurement_subtype || "").toLowerCase().trim() === "sin_medicion" ? "Pendiente detalle técnico" : "Pendiente";
  if (s === "needs_fix") return "A corregir";
  if (s === "submitted") return "Pendiente aprobación final";
  if (s === "returned_to_seller") return "Devuelta al vendedor";
  if (s === "approved") return needsFinalTechnicalApproval(row) ? "Aprobada — falta generar NV" : "Aprobada";
  return s || "—";
}
function measurementSubtypeLabel(row) {
  const subtype = String(row?.measurement_subtype || "normal").toLowerCase().trim();
  return subtype === "sin_medicion" ? "Detalle técnico" : "Medición";
}
function localityLabel(r) {
  return r?.end_customer?.city || r?.end_customer?.address || "—";
}
function normalizeTab(raw, section = "all") {
  return normalizeTechnicalTab(raw, section);
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
  if (status === "approved" && needsFinalTechnicalApproval(row)) return 0;
  if (status === "pending") return 1;
  if (status === "needs_fix") return 2;
  if (status === "approved") return 3;
  return 4;
}
function applyApprovalFilter(arr, filter) {
  let out = arr;
  if (filter === "pending") out = arr.filter((x) => x.status === "pending_approvals" && x.technical_decision === "pending");
  if (filter === "rejected") out = arr.filter((x) => x.status === "draft" && x.commercial_decision === "rejected");
  return out;
}
function quoteSearchValues(r) {
  return [createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r), getPlegadoAttachment(r)?.name];
}

export default function AprobacionTecnicaPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const approvalSection = normalizeApprovalSection(searchParams.get("section"));
  const initialTab = normalizeTab(searchParams.get("tab"), approvalSection);
  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [measurementStatus, setMeasurementStatus] = useState(initialTab === "aprobaciones_mediciones" ? "all" : "all");
  const [measurementDates, setMeasurementDates] = useState({});
  const [pageTodos, setPageTodos] = useState(1);
  const [pageAprobaciones, setPageAprobaciones] = useState(1);
  const [pageIpanels, setPageIpanels] = useState(1);
  const [pagePlegados, setPagePlegados] = useState(1);
  const [pageOtros, setPageOtros] = useState(1);
  const [pageIpanelDetalles, setPageIpanelDetalles] = useState(1);
  const [pagePlegadoDetalles, setPagePlegadoDetalles] = useState(1);
  const [pageMediciones, setPageMediciones] = useState(1);
  const [pageAcopio, setPageAcopio] = useState(1);
  const [pageAcopioListado, setPageAcopioListado] = useState(1);
  const [pageProduccion, setPageProduccion] = useState(1);
  const [pageProduccionIpanels, setPageProduccionIpanels] = useState(1);
  const [pagePuertas, setPagePuertas] = useState(1);
  const [pageAprobados, setPageAprobados] = useState(1);
  const [downloadingPdfKey, setDownloadingPdfKey] = useState("");

  useEffect(() => {
    const nextTab = normalizeTab(searchParams.get("tab"), approvalSection);
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams, approvalSection]);

  const q = useQuery({ queryKey: ["quotes", "technical_inbox"], queryFn: () => listQuotes({ scope: "technical_inbox" }), enabled: !!user?.is_rev_tecnica });
  const acopioQ = useQuery({ queryKey: ["quotes", "technical_acopio"], queryFn: () => listQuotes({ scope: "technical_acopio" }), enabled: tab === "acopio" && !!user?.is_rev_tecnica });
  const acopioListadoQ = useQuery({ queryKey: ["quotes", "technical_acopio_all"], queryFn: () => listQuotes({ scope: "technical_acopio_all" }), enabled: tab === "acopio_listado" && !!user?.is_rev_tecnica });
  const produccionQ = useQuery({ queryKey: ["quotes", "production_sent", "technical", tab], queryFn: () => listQuotes({ scope: "production_sent" }), enabled: ["produccion", "produccion_ipanels", "produccion_puertas"].includes(tab) && !!user?.is_rev_tecnica });
  const doorsQ = useQuery({ queryKey: ["doors", "technical_inbox"], queryFn: () => listDoors({ scope: "technical_inbox" }), enabled: tab === "aprobaciones_puertas" && !!user?.is_rev_tecnica });
  const measQ = useQuery({ queryKey: ["measurements", "tecnica", tab, measurementStatus], queryFn: () => listMeasurements({ status: "all", viewer: "tecnica" }), enabled: ["aprobaciones_mediciones", "aprobaciones_ipanels", "aprobaciones_plegados"].includes(tab) && !!user?.is_rev_tecnica });
  const aprobadosQ = useQuery({ queryKey: ["quotes", "technical_approved"], queryFn: () => listQuotes({ scope: "technical_approved" }), enabled: tab === "aprobados" && !!user?.is_rev_tecnica });

  const acopioM = useMutation({ mutationFn: ({ id, action, notes }) => reviewAcopioTechnical(id, { action, notes }), onSuccess: () => acopioQ.refetch() });
  const doorM = useMutation({ mutationFn: ({ id, action, notes }) => reviewDoorTechnical(id, { action, notes }), onSuccess: () => doorsQ.refetch() });
  const scheduleM = useMutation({ mutationFn: ({ id, scheduledFor }) => scheduleMeasurement(id, { scheduledFor }), onSuccess: () => measQ.refetch() });

  const visibleTabKeys = TECHNICAL_TABS_BY_SECTION[approvalSection] || TECHNICAL_TABS_BY_SECTION.all;

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

  async function handleDownloadProformaPdf(id) {
    const key = `proforma-${id}`;
    setDownloadingPdfKey(key);
    try {
      await downloadListingQuoteProformaPdf(id);
    } catch (e) {
      toast.error(e?.message || "No se pudo descargar la proforma");
    } finally {
      setDownloadingPdfKey("");
    }
  }

  function goToTab(nextTab) {
    const normalized = normalizeTab(nextTab, approvalSection);
    setTab(normalized);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("section", approvalSection);
    nextParams.set("tab", normalized);
    setSearchParams(nextParams, { replace: true });
    if (normalized === "aprobaciones_mediciones") setMeasurementStatus("all");
  }

  useEffect(() => { setPageTodos(1); setPageAprobaciones(1); setPageIpanels(1); setPagePlegados(1); setPageOtros(1); }, [filter, searchText, approvalSection]);
  useEffect(() => { setPageIpanelDetalles(1); }, [searchText, measQ.data]);
  useEffect(() => { setPageMediciones(1); }, [measurementStatus, searchText]);
  useEffect(() => { setPageAcopio(1); }, [searchText]);
  useEffect(() => { setPageAcopioListado(1); }, [searchText]);
  useEffect(() => { setPageProduccion(1); setPageProduccionIpanels(1); }, [searchText]);
  useEffect(() => { setPagePuertas(1); }, [searchText]);
  useEffect(() => { setPageAprobados(1); }, [searchText]);

  const approvalBaseRows = useMemo(() => {
    const arr = (q.data || []).slice().sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at));
    return applyApprovalFilter(arr, filter).filter((r) => matchesSearch(quoteSearchValues(r), searchText));
  }, [q.data, filter, searchText]);

  const allApprovalRows = approvalBaseRows;
  const rows = useMemo(() => approvalBaseRows.filter(isPortonOnlyRow), [approvalBaseRows]);
  const ipanelRows = useMemo(() => approvalBaseRows.filter(isIpanelRow), [approvalBaseRows]);
  const plegadoRows = useMemo(() => approvalBaseRows.filter(isPlegadosRow), [approvalBaseRows]);
  const otrosRows = useMemo(() => approvalBaseRows.filter(isOtrosRow), [approvalBaseRows]);

  const measurementRows = useMemo(() => {
    let arr = (measQ.data || []).slice().filter((r) => !isIpanelRow(r) && !isPlegadosRow(r)).filter((r) => rowMatchesApprovalSection(r, approvalSection));
    if (measurementStatus === "por_realizar") arr = arr.filter((x) => ["pending", "needs_fix"].includes(String(x?.measurement_status || "")));
    else if (measurementStatus === "por_controlar") arr = arr.filter((x) => String(x?.measurement_status || "") === "submitted");
    else if (measurementStatus === "returned_to_seller") arr = arr.filter((x) => String(x?.measurement_status || "") === "returned_to_seller");
    else if (measurementStatus === "approved") arr = arr.filter((x) => String(x?.measurement_status || "") === "approved");
    else if (measurementStatus === "sin_medicion") arr = arr.filter((x) => String(x?.measurement_subtype || "normal").toLowerCase().trim() === "sin_medicion");
    return arr
      .filter((r) => matchesSearch([r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, measurementStatusLabel(r?.measurement_status, r), measurementSubtypeLabel(r), createdByLabel(r), quoteOdooReference(r)], searchText))
      .sort((a, b) => {
        const weightDiff = measurementSortWeight(a) - measurementSortWeight(b);
        if (weightDiff !== 0) return weightDiff;
        return toTimeDesc(b?.measurement_scheduled_for || b?.created_at) - toTimeDesc(a?.measurement_scheduled_for || a?.created_at);
      });
  }, [measQ.data, measurementStatus, searchText, approvalSection]);

  const ipanelDetailRows = useMemo(() => {
    return (measQ.data || [])
      .slice()
      .filter((r) => isIpanelRow(r))
      .filter((r) => String(r?.measurement_subtype || "normal").toLowerCase().trim() === "sin_medicion")
      .filter((r) => matchesSearch([r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, measurementStatusLabel(r?.measurement_status, r), createdByLabel(r), quoteOdooReference(r), budgetObservation(r)], searchText))
      .sort((a, b) => {
        const weightDiff = measurementSortWeight(a) - measurementSortWeight(b);
        if (weightDiff !== 0) return weightDiff;
        return toTimeDesc(b?.measurement_review_at || b?.created_at) - toTimeDesc(a?.measurement_review_at || a?.created_at);
      });
  }, [measQ.data, searchText]);

  const plegadoDetailRows = useMemo(() => {
    return (measQ.data || [])
      .slice()
      .filter((r) => isPlegadosRow(r))
      .filter((r) => String(r?.measurement_subtype || "normal").toLowerCase().trim() === "sin_medicion")
      .filter((r) => matchesSearch([r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, measurementStatusLabel(r?.measurement_status, r), createdByLabel(r), quoteOdooReference(r), budgetObservation(r)], searchText))
      .sort((a, b) => {
        const weightDiff = measurementSortWeight(a) - measurementSortWeight(b);
        if (weightDiff !== 0) return weightDiff;
        return toTimeDesc(b?.measurement_review_at || b?.created_at) - toTimeDesc(a?.measurement_review_at || a?.created_at);
      });
  }, [measQ.data, searchText]);

  const acopioRows = useMemo(() => {
    return (acopioQ.data || []).slice().sort((a, b) => toTimeDesc(b?.acopio_to_produccion_requested_at || b?.created_at) - toTimeDesc(a?.acopio_to_produccion_requested_at || a?.created_at)).filter((r) => rowMatchesApprovalSection(r, approvalSection))
      .filter((r) => matchesSearch([createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, r?.acopio_to_produccion_notes, acopioReqLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r), getPlegadoAttachment(r)?.name], searchText));
  }, [acopioQ.data, searchText, approvalSection]);

  const acopioListadoRows = useMemo(() => {
    return (acopioListadoQ.data || []).slice().sort((a, b) => toTimeDesc(b?.confirmed_at || b?.created_at) - toTimeDesc(a?.confirmed_at || a?.created_at)).filter((r) => rowMatchesApprovalSection(r, approvalSection))
      .filter((r) => matchesSearch([createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r), acopioReqLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r), getPlegadoAttachment(r)?.name], searchText));
  }, [acopioListadoQ.data, searchText, approvalSection]);

  const productionBaseRows = useMemo(() => {
    return (produccionQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(productionSentAt(b)) - toTimeDesc(productionSentAt(a)))
      .filter((r) => rowMatchesApprovalSection(r, approvalSection))
      .filter((r) => matchesSearch([createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, productionStatusLabel(r), productionReference(r), budgetObservation(r)], searchText));
  }, [produccionQ.data, searchText, approvalSection]);
  const produccionRows = useMemo(() => productionBaseRows.filter(isPortonLikeRow), [productionBaseRows]);
  const produccionIpanelRows = useMemo(() => productionBaseRows.filter(isIpanelRow), [productionBaseRows]);
  const produccionPuertasRows = useMemo(() => productionBaseRows.filter(isPuertaQuoteRow), [productionBaseRows]);

  const doorRows = useMemo(() => {
    return (doorsQ.data || []).slice().sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at)).filter((d) => matchesSearch([d?.door_code, d?.record?.end_customer?.name, d?.record?.obra_cliente, d?.linked_quote_odoo_name, doorOdooReference(d), d?.record?.asociado_porton, d?.status], searchText));
  }, [doorsQ.data, searchText]);

  function paged(arr, page) {
    const start = (page - 1) * PAGE_SIZE;
    return arr.slice(start, start + PAGE_SIZE);
  }

  useEffect(() => { const total = Math.max(1, Math.ceil(allApprovalRows.length / PAGE_SIZE)); if (pageTodos > total) setPageTodos(total); }, [allApprovalRows.length, pageTodos]);
  useEffect(() => { const total = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); if (pageAprobaciones > total) setPageAprobaciones(total); }, [rows.length, pageAprobaciones]);
  useEffect(() => { const total = Math.max(1, Math.ceil(ipanelRows.length / PAGE_SIZE)); if (pageIpanels > total) setPageIpanels(total); }, [ipanelRows.length, pageIpanels]);
  useEffect(() => { const total = Math.max(1, Math.ceil(plegadoRows.length / PAGE_SIZE)); if (pagePlegados > total) setPagePlegados(total); }, [plegadoRows.length, pagePlegados]);
  useEffect(() => { const total = Math.max(1, Math.ceil(otrosRows.length / PAGE_SIZE)); if (pageOtros > total) setPageOtros(total); }, [otrosRows.length, pageOtros]);
  useEffect(() => { const total = Math.max(1, Math.ceil(ipanelDetailRows.length / PAGE_SIZE)); if (pageIpanelDetalles > total) setPageIpanelDetalles(total); }, [ipanelDetailRows.length, pageIpanelDetalles]);
  useEffect(() => { const total = Math.max(1, Math.ceil(plegadoDetailRows.length / PAGE_SIZE)); if (pagePlegadoDetalles > total) setPagePlegadoDetalles(total); }, [plegadoDetailRows.length, pagePlegadoDetalles]);
  useEffect(() => { const total = Math.max(1, Math.ceil(measurementRows.length / PAGE_SIZE)); if (pageMediciones > total) setPageMediciones(total); }, [measurementRows.length, pageMediciones]);
  useEffect(() => { const total = Math.max(1, Math.ceil(acopioRows.length / PAGE_SIZE)); if (pageAcopio > total) setPageAcopio(total); }, [acopioRows.length, pageAcopio]);
  useEffect(() => { const total = Math.max(1, Math.ceil(acopioListadoRows.length / PAGE_SIZE)); if (pageAcopioListado > total) setPageAcopioListado(total); }, [acopioListadoRows.length, pageAcopioListado]);
  useEffect(() => { const total = Math.max(1, Math.ceil((tab === "produccion_puertas" ? produccionPuertasRows.length : produccionRows.length) / PAGE_SIZE)); if (pageProduccion > total) setPageProduccion(total); }, [produccionRows.length, produccionPuertasRows.length, pageProduccion, tab]);
  useEffect(() => { const total = Math.max(1, Math.ceil(produccionIpanelRows.length / PAGE_SIZE)); if (pageProduccionIpanels > total) setPageProduccionIpanels(total); }, [produccionIpanelRows.length, pageProduccionIpanels]);
  useEffect(() => { const total = Math.max(1, Math.ceil(doorRows.length / PAGE_SIZE)); if (pagePuertas > total) setPagePuertas(total); }, [doorRows.length, pagePuertas]);

  if (!user?.is_rev_tecnica) return <div className="container"><div className="card">No autorizado (falta rol Rev. Técnica).</div></div>;

  const visibleAllApprovalRows = paged(allApprovalRows, pageTodos);
  const visibleRows = paged(rows, pageAprobaciones);
  const visibleIpanels = paged(ipanelRows, pageIpanels);
  const visiblePlegados = paged(plegadoRows, pagePlegados);
  const visibleOtros = paged(otrosRows, pageOtros);
  const visibleIpanelDetails = paged(ipanelDetailRows, pageIpanelDetalles);
  const visiblePlegadoDetails = paged(plegadoDetailRows, pagePlegadoDetalles);
  const visibleMeasurements = paged(measurementRows, pageMediciones);
  const visibleAcopio = paged(acopioRows, pageAcopio);
  const visibleAcopioListado = paged(acopioListadoRows, pageAcopioListado);
  const visibleProduccion = paged(produccionRows, pageProduccion);
  const visibleProduccionIpanels = paged(produccionIpanelRows, pageProduccionIpanels);
  const visibleProduccionPuertas = paged(produccionPuertasRows, pageProduccion);
  const visibleDoors = paged(doorRows, pagePuertas);

  const aprobadosRows = useMemo(() => {
    return (aprobadosQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.technical_at || b?.created_at) - toTimeDesc(a?.technical_at || a?.created_at))
      .filter((r) => rowMatchesApprovalSection(r, approvalSection))
      .filter((r) => matchesSearch(quoteSearchValues(r), searchText));
  }, [aprobadosQ.data, searchText, approvalSection]);
  const visibleAprobados = paged(aprobadosRows, pageAprobados);

  const hideScheduleColumns = measurementStatus === "sin_medicion" || measurementStatus === "approved";

  const renderApprovalRows = (items, totalItems, page, onPageChange, emptyText, showPlegadoInfo = true, showType = false) => (
    <>
      {q.isLoading && <div className="muted">Cargando...</div>}
      {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
      {!q.isLoading && !totalItems && <div className="muted">{emptyText}</div>}
      {!!totalItems && (
        <>
          <table><thead><tr><th>Fecha</th>{showType ? <th>Tipo</th> : null}<th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th>{showPlegadoInfo ? <th>Datos plegado</th> : null}<th>Obs. presupuesto</th><th></th></tr></thead><tbody>
            {items.map((r) => <tr key={r.id}><td>{fmtDate(r.created_at)}</td>{showType ? <td>{catalogKindLabel(r)}</td> : null}<td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{rowLabel(r)}</td><td><OdooReferenceCell value={quoteOdooReference(r)} /></td>{showPlegadoInfo ? <td><PlegadoInfoCell row={r} /></td> : null}<td><BudgetObservationCell row={r} /></td><td className="right"><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button></div></td></tr>)}
          </tbody></table>
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
          <table><thead><tr><th>Fecha envío</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>NP/NV Odoo</th><th>Semana producción</th><th>Obs. presupuesto</th><th></th></tr></thead><tbody>
            {items.map((r) => <tr key={r.id}><td>{fmtDate(productionSentAt(r))}</td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{productionReference(r) || "—"}</td><td>{r.production_delivery_year && r.production_delivery_week ? `${r.production_delivery_year} · Semana ${r.production_delivery_week} - ${Number(r.production_delivery_week) + 1}` : "—"}</td><td><BudgetObservationCell row={r} /></td><td className="right"><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button></div></td></tr>)}
          </tbody></table>
          <PaginationControls page={page} totalItems={totalItems} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
        </>
      )}
    </>
  );

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Técnica</h2>
        <div className="muted">Aprobaciones separadas de portones, Ipanels, puertas, mediciones y acopio.</div>

        <div className="spacer" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {visibleTabKeys.map((tabKey) => (
              <Button key={tabKey} variant={tab === tabKey ? "primary" : "ghost"} onClick={() => goToTab(tabKey)}>{technicalTabLabel(tabKey, approvalSection)}</Button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => navigate("/aprobacion/tecnica/menu")}>Volver al submenú</Button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>Vista: {APPROVAL_SECTION_LABELS[approvalSection] || "Todos"}</div>

        {["aprobaciones_todos", "aprobaciones_portones", "aprobaciones_ipanels", "aprobaciones_plegados", "aprobaciones_otros"].includes(tab) && (
          <>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>Todos</Button>
              <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>Pendientes</Button>
              <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>Rechazados (Comercial)</Button>
            </div>
          </>
        )}

        {tab === "aprobaciones_plegados" && renderApprovalRows(visiblePlegados, plegadoRows.length, pagePlegados, setPagePlegados, "Sin plegados pendientes", true)}
        {tab === "aprobaciones_otros" && renderApprovalRows(visibleOtros, otrosRows.length, pageOtros, setPageOtros, "Sin presupuestos Otros pendientes", false)}

        {tab === "aprobaciones_mediciones" && (
          <>
            <div className="spacer" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={measurementStatus === "all" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("all")}>Todas</Button>
              <Button variant={measurementStatus === "por_controlar" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("por_controlar")}>Pendientes aprobación final</Button>
              <Button variant={measurementStatus === "returned_to_seller" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("returned_to_seller")}>Devueltas al vendedor</Button>
              <Button variant={measurementStatus === "por_realizar" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("por_realizar")}>Pendientes por realizar</Button>
              <Button variant={measurementStatus === "approved" ? "primary" : "ghost"} onClick={() => setMeasurementStatus("approved")}>Aprobadas</Button>
            </div>
          </>
        )}

        <div className="spacer" />
        <Input value={searchText} onChange={setSearchText} placeholder="Buscar por cliente, localidad, dirección, usuario, código o estado…" style={{ width: "100%" }} />
      </div>

      <div className="spacer" />

      <div className="card">
        {tab === "aprobaciones_todos" && renderApprovalRows(visibleAllApprovalRows, allApprovalRows.length, pageTodos, setPageTodos, "Sin aprobaciones", true, true)}
        {tab === "aprobaciones_portones" && renderApprovalRows(visibleRows, rows.length, pageAprobaciones, setPageAprobaciones, "Sin portones pendientes", false)}

        {tab === "aprobaciones_ipanels" && (
          <>
            <h3 style={{ marginTop: 0 }}>Aprobaciones Ipanels</h3>
            {renderApprovalRows(visibleIpanels, ipanelRows.length, pageIpanels, setPageIpanels, "Sin Ipanels pendientes", false)}
            <div className="spacer" />
            <h3 style={{ marginBottom: 8 }}>Detalles técnicos Ipanels sin medición</h3>
            <div className="muted" style={{ marginBottom: 12 }}>Los Ipanels no pasan por medidor. Se completan y aprueban desde esta sección.</div>
            {measQ.isLoading && <div className="muted">Cargando detalles técnicos...</div>}
            {measQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{measQ.error.message}</div>}
            {!measQ.isLoading && !ipanelDetailRows.length && <div className="muted">Sin detalles técnicos de Ipanels</div>}
            {!!ipanelDetailRows.length && (
              <>
                <table><thead><tr><th>Cliente</th><th>Localidad</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th><th>Obs. presupuesto</th><th></th></tr></thead><tbody>
                  {visibleIpanelDetails.map((r) => {
                    const isSubmitted = String(r?.measurement_status || "").toLowerCase().trim() === "submitted";
                    const isPendingComercial = String(r?.measurement_commercial_review_status || "") === "pending";
                    return <tr key={r.id}><td style={{ fontWeight: 800 }}>{r.end_customer?.name || "(sin nombre)"}</td><td>{localityLabel(r)}</td><td>{r.end_customer?.address || "—"}</td><td>{measurementStatusLabel(r.measurement_status, r)}</td><td><OdooReferenceCell value={quoteOdooReference(r)} /></td><td><BudgetObservationCell row={r} /></td><td className="right"><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>{isPendingComercial ? <Button variant="ghost" disabled title="Pendiente de aprobación comercial post-medición">Bloqueado</Button> : <Button variant={isSubmitted ? "primary" : "ghost"} onClick={() => navigate(`/mediciones/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>{isSubmitted ? "Aprobar detalle" : "Completar detalle técnico"}</Button>}</div></td></tr>;
                  })}
                </tbody></table>
                <PaginationControls page={pageIpanelDetalles} totalItems={ipanelDetailRows.length} pageSize={PAGE_SIZE} onPageChange={setPageIpanelDetalles} />
              </>
            )}
          </>
        )}

        {tab === "aprobaciones_plegados" && (
          <>
            <h3 style={{ marginTop: 0 }}>Aprobaciones Plegados</h3>
            {renderApprovalRows(visiblePlegados, plegadoRows.length, pagePlegados, setPagePlegados, "Sin plegados pendientes", true)}
            <div className="spacer" />
            <h3 style={{ marginBottom: 8 }}>Detalles técnicos Plegados sin medición</h3>
            <div className="muted" style={{ marginBottom: 12 }}>Los Plegados no pasan por medidor. Se aprueban directo desde esta sección.</div>
            {measQ.isLoading && <div className="muted">Cargando detalles técnicos...</div>}
            {measQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{measQ.error.message}</div>}
            {!measQ.isLoading && !plegadoDetailRows.length && <div className="muted">Sin detalles técnicos de Plegados</div>}
            {!!plegadoDetailRows.length && (
              <>
                <table><thead><tr><th>Cliente</th><th>Localidad</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th><th>Obs. presupuesto</th><th></th></tr></thead><tbody>
                  {visiblePlegadoDetails.map((r) => {
                    const isSubmitted = String(r?.measurement_status || "").toLowerCase().trim() === "submitted";
                    const isPendingComercial = String(r?.measurement_commercial_review_status || "") === "pending";
                    return <tr key={r.id}><td style={{ fontWeight: 800 }}>{r.end_customer?.name || "(sin nombre)"}</td><td>{localityLabel(r)}</td><td>{r.end_customer?.address || "—"}</td><td>{measurementStatusLabel(r.measurement_status, r)}</td><td><OdooReferenceCell value={quoteOdooReference(r)} /></td><td><BudgetObservationCell row={r} /></td><td className="right"><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>{isPendingComercial ? <Button variant="ghost" disabled title="Pendiente de aprobación comercial post-medición">Bloqueado</Button> : <Button variant={isSubmitted ? "primary" : "ghost"} onClick={() => navigate(`/mediciones/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>{isSubmitted ? "Aprobar detalle" : "Completar detalle técnico"}</Button>}</div></td></tr>;
                  })}
                </tbody></table>
                <PaginationControls page={pagePlegadoDetalles} totalItems={plegadoDetailRows.length} pageSize={PAGE_SIZE} onPageChange={setPagePlegadoDetalles} />
              </>
            )}
          </>
        )}
        {tab === "aprobaciones_otros" && renderApprovalRows(visibleOtros, otrosRows.length, pageOtros, setPageOtros, "Sin presupuestos Otros pendientes", false)}

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
                      const needsFinal = needsFinalTechnicalApproval(r);
                      const isPendingComercial = String(r?.measurement_commercial_review_status || "") === "pending";
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 800 }}>{r.end_customer?.name || "(sin nombre)"}</td>
                          <td>{measurementSubtypeLabel(r)}</td>
                          <td>{localityLabel(r)}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{measurementStatusLabel(r.measurement_status, r)}</td>
                          <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                          {!hideScheduleColumns ? <td>{fmtDate(r.measurement_scheduled_for)}</td> : null}
                          {!hideScheduleColumns ? <td style={{ minWidth: 220 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Input type="date" value={dateValue} disabled={isPendingComercial} onChange={(v) => setMeasurementDates((prev) => ({ ...prev, [r.id]: v }))} style={{ width: "100%" }} /><Button disabled={isPendingComercial || scheduleM.isPending || !dateValue} onClick={() => scheduleM.mutate({ id: r.id, scheduledFor: dateValue })}>Guardar</Button></div></td> : null}
                          <td className="right"><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>{isPendingComercial ? <Button variant="ghost" disabled title="Pendiente de aprobación comercial post-medición">Bloqueado</Button> : <Button variant={(isSubmitted || needsFinal) ? "primary" : "ghost"} onClick={() => navigate(`/mediciones/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>{isSinMedicion ? "Completar detalle técnico" : ((isSubmitted || needsFinal) ? "Aprobar final" : "Abrir")}</Button>}</div></td>
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
                    return <tr key={r.id}><td>{fmtDate(r.acopio_to_produccion_requested_at || r.created_at)}</td><td><OdooReferenceCell value={quoteOdooReference(r)} /></td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{r.acopio_to_produccion_notes || <span className="muted">(sin nota)</span>}</td><td><PlegadoInfoCell row={r} /></td><td><BudgetObservationCell row={r} /></td><td>{acopioReqLabel(r)}</td><td className="right"><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button>{canAct ? <><Button disabled={acopioM.isPending} onClick={() => acopioM.mutate({ id: r.id, action: "approve", notes: null })}>OK</Button><Button variant="ghost" disabled={acopioM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) acopioM.mutate({ id: r.id, action: "reject", notes: msg }); }}>Rechazar</Button></> : <span className="muted">Ya decidiste</span>}</div></td></tr>;
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
            {!acopioListadoQ.isLoading && !acopioListadoRows.length && <div className="muted">Sin elementos en acopio</div>}
            {!!acopioListadoRows.length && (
              <>
                <table><thead><tr><th>Fecha</th><th>NP/NV Odoo</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>Datos plegado</th><th>Obs. presupuesto</th><th>Solicitud Prod.</th><th></th></tr></thead><tbody>
                  {visibleAcopioListado.map((r) => <tr key={r.id}><td>{fmtDate(r.confirmed_at || r.created_at)}</td><td><OdooReferenceCell value={quoteOdooReference(r)} /></td><td>{createdByLabel(r)}</td><td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td><td>{r.end_customer?.address || "—"}</td><td>{rowLabel(r)}</td><td><PlegadoInfoCell row={r} /></td><td><BudgetObservationCell row={r} /></td><td>{r.acopio_to_produccion_status ? acopioReqLabel(r) : "—"}</td><td className="right"><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button></div></td></tr>)}
                </tbody></table>
                <PaginationControls page={pageAcopioListado} totalItems={acopioListadoRows.length} pageSize={PAGE_SIZE} onPageChange={setPageAcopioListado} />
              </>
            )}
          </>
        )}

        {tab === "produccion" && renderProductionRows(visibleProduccion, produccionRows.length, pageProduccion, setPageProduccion, "Sin portones enviados a producción")}
        {tab === "produccion_ipanels" && renderProductionRows(visibleProduccionIpanels, produccionIpanelRows.length, pageProduccionIpanels, setPageProduccionIpanels, "Sin Ipanels enviados a producción")}
        {tab === "produccion_puertas" && renderProductionRows(visibleProduccionPuertas, produccionPuertasRows.length, pageProduccion, setPageProduccion, "Sin puertas enviadas a producción")}

        {tab === "aprobados" && (
          <>
            {aprobadosQ.isLoading && <div className="muted">Cargando...</div>}
            {aprobadosQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{aprobadosQ.error.message}</div>}
            {!aprobadosQ.isLoading && !aprobadosRows.length && <div className="muted">Sin presupuestos aprobados</div>}
            {!!aprobadosRows.length && (
              <>
                <table>
                  <thead><tr><th>Fecha aprob.</th><th>Tipo</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th><th>Obs. presupuesto</th><th></th></tr></thead>
                  <tbody>
                    {visibleAprobados.map((r) => {
                      const pdfKey = `quote-${r.id}`;
                      const proformaKey = `proforma-${r.id}`;
                      const isDistribuidor = r.created_by_role === "distribuidor";
                      return (
                        <tr key={r.id}>
                          <td>{fmtDate(r.technical_at || r.created_at)}</td>
                          <td>{catalogKindLabel(r)}</td>
                          <td>{createdByLabel(r)}</td>
                          <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{rowLabel(r)}</td>
                          <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                          <td><BudgetObservationCell row={r} /></td>
                          <td className="right">
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <Button variant="ghost" disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} title="Descargar PDF">📄</Button>
                              {isDistribuidor && (
                                <Button variant="ghost" disabled={downloadingPdfKey === proformaKey} onClick={() => handleDownloadProformaPdf(r.id)} title="Descargar proforma">
                                  <span style={{ position: "relative", display: "inline-flex" }}>📄<span style={{ position: "absolute", bottom: 0, right: -2, fontSize: 9, fontWeight: 900, lineHeight: 1 }}>P</span></span>
                                </Button>
                              )}
                              <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/tecnica" } })}>Abrir</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <PaginationControls page={pageAprobados} totalItems={aprobadosRows.length} pageSize={PAGE_SIZE} onPageChange={setPageAprobados} />
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
                  {visibleDoors.map((d) => <tr key={d.id}><td>{d.door_code}</td><td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td><td>{d.linked_quote_odoo_name || d.record?.asociado_porton || "—"}</td><td><OdooReferenceCell value={doorOdooReference(d)} /></td><td>{d.sale_amount ? `$ ${Number(d.sale_amount).toLocaleString("es-AR")}` : "—"}</td><td>{d.purchase_amount ? `$ ${Number(d.purchase_amount).toLocaleString("es-AR")}` : "—"}</td><td className="right"><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button variant="ghost" onClick={() => navigate(`/puertas/${d.id}`)}>Abrir</Button><Button disabled={doorM.isPending} onClick={() => doorM.mutate({ id: d.id, action: "approve", notes: null })}>OK</Button><Button variant="ghost" disabled={doorM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) doorM.mutate({ id: d.id, action: "reject", notes: msg }); }}>Rechazar</Button></div></td></tr>)}
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

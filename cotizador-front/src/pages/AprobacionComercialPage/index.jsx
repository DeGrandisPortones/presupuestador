import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { listQuotes, reviewAcopioCommercial } from "../../api/quotes.js";
import { listDoors, reviewDoorCommercial } from "../../api/doors.js";
import { listMeasurements } from "../../api/measurements.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { downloadListingDoorPdf, downloadListingQuotePdf, downloadListingQuoteProformaPdf } from "../../utils/listingPdf.js";
import { downloadPlegadoAttachment, formatPlegadoAttachmentMeta, getPlegadoAttachment, openPlegadoAttachment } from "../../utils/plegadoAttachment.js";
import { computeCommercialLinesDiff } from "../../domain/quote/commercialDiff.js";

const PAGE_SIZE = 25;
const COMMERCIAL_TAB_LABELS = {
  aprobaciones_todos: "Todos",
  aprobaciones_portones: "Aprobación de Portones",
  aprobaciones_ipanels: "Aprobación de Ipanels",
  aprobaciones_plegados: "Aprobación de Plegados",
  aprobaciones_otros: "Aprobación de Otros",
  mediciones: "Mediciones / circuito técnico",
  acopio: "Acopio → Producción",
  acopio_listado: "En Acopio",
  produccion: "Enviados a Producción",
  produccion_ipanels: "Enviados a Producción",
  produccion_puertas: "Enviadas a Producción",
  puertas: "Aprobación de Puertas",
  aprobados: "Aprobados (historial)",
};
const COMMERCIAL_TABS_BY_SECTION = {
  all: ["aprobaciones_todos", "aprobaciones_portones", "aprobaciones_ipanels", "aprobaciones_plegados", "aprobaciones_otros", "mediciones", "acopio", "acopio_listado", "produccion", "produccion_ipanels", "produccion_puertas", "puertas", "aprobados"],
  porton: ["aprobaciones_portones", "mediciones", "acopio", "acopio_listado", "produccion", "aprobados"],
  ipanel: ["aprobaciones_ipanels", "acopio", "acopio_listado", "produccion_ipanels", "aprobados"],
  puerta: ["puertas", "mediciones", "acopio", "acopio_listado", "produccion_puertas", "aprobados"],
  plegados: ["aprobaciones_plegados", "aprobados"],
  otros: ["aprobaciones_otros", "aprobados"],
};
function normalizeCommercialTab(raw, section = "all") {
  const allowed = COMMERCIAL_TABS_BY_SECTION[section] || COMMERCIAL_TABS_BY_SECTION.all;
  const value = String(raw || "").trim();
  return allowed.includes(value) ? value : allowed[0];
}

function commercialTabLabel(tabKey, section = "all") {
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
  if (tabKey === "mediciones") {
    if (section === "porton") return "Mediciones Portones";
    if (section === "puerta") return "Mediciones Puertas";
    return "Mediciones / circuito técnico";
  }
  return COMMERCIAL_TAB_LABELS[tabKey] || tabKey;
}

function acopioReqLabel(r) {
  const c = r?.acopio_to_produccion_commercial_decision || "pending";
  const t = r?.acopio_to_produccion_technical_decision || "pending";
  const cL = c === "approved" ? "OK" : c === "rejected" ? "NO" : "Pend.";
  const tL = t === "approved" ? "OK" : t === "rejected" ? "NO" : "Pend.";
  return `C:${cL} · T:${tL}`;
}
function rowLabel(r) {
  // Ya estaba aprobado (comercial y tecnica) pero la medicion salio con una
  // superficie mayor a la presupuestada, asi que volvio al vendedor para que
  // lo revise - mismo status='draft' que un borrador nunca confirmado, pero
  // measurement_status lo distingue (mismo criterio que PresupuestosPage/
  // PortonesEstadoPage).
  if (r.measurement_status === "returned_to_seller") return "Devuelto al vendedor — medida distinta a lo presupuestado";
  if (r.measurement_commercial_review_status === "pending") return "Reenviado — esperando tu aprobación (ver pestaña Mediciones)";
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
  if (String(r?.measurement_commercial_review_status || "") === "pending") return "Pendiente tu aprobación";
  const status = String(r?.measurement_status || "");
  if (status === "submitted") return "Pendiente técnica";
  if (status === "needs_fix") return "Devuelto para corregir";
  if (status === "approved") return "Aprobada";
  return status || "—";
}
function measurementQuickDiffLabel(row) {
  const snapshot = row?.measurement_commercial_diff_json;
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.original_lines)) return "—";
  const diff = computeCommercialLinesDiff(snapshot.original_lines, row?.lines || []);
  if (!diff.hasChanges) return "Sin cambios";
  const sign = diff.diffAmount > 0 ? "+" : diff.diffAmount < 0 ? "-" : "";
  const amountText = `${sign}$${Math.abs(diff.diffAmount).toLocaleString("es-AR")}`;
  const percentText = diff.diffPercent === null ? "" : ` (${sign}${Math.abs(diff.diffPercent).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%)`;
  return `${amountText}${percentText}`;
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
  return [createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, rowLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r), getPlegadoAttachment(r)?.name];
}

export default function AprobacionComercialPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const approvalSection = normalizeApprovalSection(searchParams.get("section"));

  const [tab, setTab] = useState(() => normalizeCommercialTab(searchParams.get("tab"), approvalSection));
  const [filter, setFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [pageTodos, setPageTodos] = useState(1);
  const [pageAprobaciones, setPageAprobaciones] = useState(1);
  const [pageIpanels, setPageIpanels] = useState(1);
  const [pagePlegados, setPagePlegados] = useState(1);
  const [pageOtros, setPageOtros] = useState(1);
  const [pageAcopio, setPageAcopio] = useState(1);
  const [pageAcopioListado, setPageAcopioListado] = useState(1);
  const [pageProduccion, setPageProduccion] = useState(1);
  const [pageProduccionIpanels, setPageProduccionIpanels] = useState(1);
  const [pagePuertas, setPagePuertas] = useState(1);
  const [pageMediciones, setPageMediciones] = useState(1);
  const [pageAprobados, setPageAprobados] = useState(1);
  const [downloadingPdfKey, setDownloadingPdfKey] = useState("");

  const q = useQuery({ queryKey: ["quotes", "commercial_inbox"], queryFn: () => listQuotes({ scope: "commercial_inbox" }), enabled: !!user?.is_enc_comercial });
  const acopioQ = useQuery({ queryKey: ["quotes", "commercial_acopio"], queryFn: () => listQuotes({ scope: "commercial_acopio" }), enabled: tab === "acopio" && !!user?.is_enc_comercial });
  const acopioListadoQ = useQuery({ queryKey: ["quotes", "commercial_acopio_all"], queryFn: () => listQuotes({ scope: "commercial_acopio_all" }), enabled: tab === "acopio_listado" && !!user?.is_enc_comercial });
  const produccionQ = useQuery({ queryKey: ["quotes", "production_sent", "commercial", tab], queryFn: () => listQuotes({ scope: "production_sent" }), enabled: ["produccion", "produccion_ipanels", "produccion_puertas"].includes(tab) && !!user?.is_enc_comercial });
  const doorsQ = useQuery({ queryKey: ["doors", "commercial_inbox"], queryFn: () => listDoors({ scope: "commercial_inbox" }), enabled: tab === "puertas" && !!user?.is_enc_comercial });
  const medicionesQ = useQuery({
    queryKey: ["measurements", "commercial_review"],
    queryFn: () => listMeasurements({ status: "commercial_review", viewer: "comercial" }),
    enabled: tab === "mediciones" && !!user?.is_enc_comercial,
  });
  const aprobadosQ = useQuery({ queryKey: ["quotes", "commercial_approved"], queryFn: () => listQuotes({ scope: "commercial_approved" }), enabled: tab === "aprobados" && !!user?.is_enc_comercial });

  const acopioM = useMutation({ mutationFn: ({ id, action, notes }) => reviewAcopioCommercial(id, { action, notes }), onSuccess: () => acopioQ.refetch() });
  const doorM = useMutation({ mutationFn: ({ id, action, notes }) => reviewDoorCommercial(id, { action, notes }), onSuccess: () => doorsQ.refetch() });
  const visibleTabKeys = COMMERCIAL_TABS_BY_SECTION[approvalSection] || COMMERCIAL_TABS_BY_SECTION.all;

  function goToTab(nextTab) {
    const normalized = normalizeCommercialTab(nextTab, approvalSection);
    setTab(normalized);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("section", approvalSection);
    nextParams.set("tab", normalized);
    setSearchParams(nextParams, { replace: true });
  }

  useEffect(() => {
    const nextTab = normalizeCommercialTab(searchParams.get("tab"), approvalSection);
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams, approvalSection]);

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

  const approvalBaseRows = useMemo(() => {
    const arr = (q.data || []).slice().sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at));
    return applyApprovalFilter(arr, filter).filter((r) => matchesSearch(quoteSearchValues(r), searchText));
  }, [q.data, filter, searchText]);
  const allApprovalRows = approvalBaseRows;
  const rows = useMemo(() => approvalBaseRows.filter(isPortonOnlyRow), [approvalBaseRows]);
  const ipanelRows = useMemo(() => approvalBaseRows.filter(isIpanelRow), [approvalBaseRows]);
  const plegadoRows = useMemo(() => approvalBaseRows.filter(isPlegadosRow), [approvalBaseRows]);
  const otrosRows = useMemo(() => approvalBaseRows.filter(isOtrosRow), [approvalBaseRows]);

  const acopioRows = useMemo(() => {
    return (acopioQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.acopio_to_produccion_requested_at || b?.created_at) - toTimeDesc(a?.acopio_to_produccion_requested_at || a?.created_at))
      .filter((r) => rowMatchesApprovalSection(r, approvalSection))
      .filter((r) => matchesSearch([createdByLabel(r), catalogKindLabel(r), r?.end_customer?.name, r?.end_customer?.city, r?.end_customer?.address, r?.acopio_to_produccion_notes, acopioReqLabel(r), quoteOdooReference(r), budgetObservation(r), plegadoSurface(r), plegadoDescription(r), getPlegadoAttachment(r)?.name], searchText));
  }, [acopioQ.data, searchText, approvalSection]);

  const acopioListadoRows = useMemo(() => {
    return (acopioListadoQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.confirmed_at || b?.created_at) - toTimeDesc(a?.confirmed_at || a?.created_at))
      .filter((r) => rowMatchesApprovalSection(r, approvalSection))
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
    return (doorsQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.created_at) - toTimeDesc(a?.created_at))
      .filter((d) => matchesSearch([d?.door_code, d?.record?.end_customer?.name, d?.record?.obra_cliente, d?.linked_quote_odoo_name, doorOdooReference(d), d?.record?.asociado_porton, d?.status], searchText));
  }, [doorsQ.data, searchText]);

  const medicionesRows = useMemo(() => {
    return (medicionesQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.measurement_at || b?.created_at) - toTimeDesc(a?.measurement_at || a?.created_at))
      .filter((r) => rowMatchesApprovalSection(r, approvalSection))
      .filter((r) =>
        matchesSearch(
          [
            createdByLabel(r),
            r?.end_customer?.name,
            r?.end_customer?.city,
            r?.end_customer?.address,
            measurementRowLabel(r),
            quoteOdooReference(r),
          ],
          searchText,
        ),
      );
  }, [medicionesQ.data, searchText, approvalSection]);

  useEffect(() => { setPageTodos(1); setPageAprobaciones(1); setPageIpanels(1); setPagePlegados(1); setPageOtros(1); }, [filter, searchText, approvalSection]);
  useEffect(() => { setPageAcopio(1); }, [searchText]);
  useEffect(() => { setPageAcopioListado(1); }, [searchText]);
  useEffect(() => { setPageProduccion(1); setPageProduccionIpanels(1); }, [searchText]);
  useEffect(() => { setPagePuertas(1); }, [searchText]);
  useEffect(() => { setPageMediciones(1); }, [searchText]);
  useEffect(() => { setPageAprobados(1); }, [searchText]);

  const visibleAllApprovalRows = useMemo(() => allApprovalRows.slice((pageTodos - 1) * PAGE_SIZE, pageTodos * PAGE_SIZE), [allApprovalRows, pageTodos]);
  const visibleRows = useMemo(() => rows.slice((pageAprobaciones - 1) * PAGE_SIZE, pageAprobaciones * PAGE_SIZE), [rows, pageAprobaciones]);
  const visibleIpanels = useMemo(() => ipanelRows.slice((pageIpanels - 1) * PAGE_SIZE, pageIpanels * PAGE_SIZE), [ipanelRows, pageIpanels]);
  const visiblePlegados = useMemo(() => plegadoRows.slice((pagePlegados - 1) * PAGE_SIZE, pagePlegados * PAGE_SIZE), [plegadoRows, pagePlegados]);
  const visibleOtros = useMemo(() => otrosRows.slice((pageOtros - 1) * PAGE_SIZE, pageOtros * PAGE_SIZE), [otrosRows, pageOtros]);
  const visibleAcopioRows = useMemo(() => acopioRows.slice((pageAcopio - 1) * PAGE_SIZE, pageAcopio * PAGE_SIZE), [acopioRows, pageAcopio]);
  const visibleAcopioListadoRows = useMemo(() => acopioListadoRows.slice((pageAcopioListado - 1) * PAGE_SIZE, pageAcopioListado * PAGE_SIZE), [acopioListadoRows, pageAcopioListado]);
  const visibleProduccionRows = useMemo(() => produccionRows.slice((pageProduccion - 1) * PAGE_SIZE, pageProduccion * PAGE_SIZE), [produccionRows, pageProduccion]);
  const visibleProduccionIpanelRows = useMemo(() => produccionIpanelRows.slice((pageProduccionIpanels - 1) * PAGE_SIZE, pageProduccionIpanels * PAGE_SIZE), [produccionIpanelRows, pageProduccionIpanels]);
  const visibleProduccionPuertasRows = useMemo(() => produccionPuertasRows.slice((pageProduccion - 1) * PAGE_SIZE, pageProduccion * PAGE_SIZE), [produccionPuertasRows, pageProduccion]);
  const visibleDoorRows = useMemo(() => doorRows.slice((pagePuertas - 1) * PAGE_SIZE, pagePuertas * PAGE_SIZE), [doorRows, pagePuertas]);
  const visibleMedicionesRows = useMemo(() => medicionesRows.slice((pageMediciones - 1) * PAGE_SIZE, pageMediciones * PAGE_SIZE), [medicionesRows, pageMediciones]);

  const aprobadosRows = useMemo(() => {
    return (aprobadosQ.data || [])
      .slice()
      .sort((a, b) => toTimeDesc(b?.commercial_at || b?.created_at) - toTimeDesc(a?.commercial_at || a?.created_at))
      .filter((r) => rowMatchesApprovalSection(r, approvalSection))
      .filter((r) => matchesSearch(quoteSearchValues(r), searchText));
  }, [aprobadosQ.data, searchText, approvalSection]);
  const visibleAprobadosRows = useMemo(() => aprobadosRows.slice((pageAprobados - 1) * PAGE_SIZE, pageAprobados * PAGE_SIZE), [aprobadosRows, pageAprobados]);

  if (!user?.is_enc_comercial) {
    return <div className="container"><div className="card">No autorizado (falta rol Enc. Comercial).</div></div>;
  }

  const renderApprovalRows = (items, totalItems, page, onPageChange, emptyText, showPlegadoInfo = true, showType = false) => (
    <>
      {q.isLoading && <div className="muted">Cargando...</div>}
      {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
      {!q.isLoading && !totalItems && <div className="muted">{emptyText}</div>}
      {!!totalItems && (
        <>
          <table>
            <thead><tr><th>Fecha</th>{showType ? <th>Tipo</th> : null}<th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th>{showPlegadoInfo ? <th>Datos plegado</th> : null}<th>Obs. presupuesto</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => {
                const pdfKey = `quote-${r.id}`;
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(r.created_at)}</td>
                    {showType ? <td>{catalogKindLabel(r)}</td> : null}
                    <td>{createdByLabel(r)}</td>
                    <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                    <td>{r.end_customer?.address || "—"}</td>
                    <td>{rowLabel(r)}</td>
                    <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                    {showPlegadoInfo ? <td><PlegadoInfoCell row={r} /></td> : null}
                    <td><BudgetObservationCell row={r} /></td>
                    <td className="right">
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                        <Button onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                      </div>
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
                    <td className="right">
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                        <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                      </div>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {visibleTabKeys.map((tabKey) => (
              <Button key={tabKey} variant={tab === tabKey ? "primary" : "ghost"} onClick={() => goToTab(tabKey)}>{commercialTabLabel(tabKey, approvalSection)}</Button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => navigate("/aprobacion/comercial/menu")}>Volver al submenú</Button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>Vista: {APPROVAL_SECTION_LABELS[approvalSection] || "Todos"}</div>

        {["aprobaciones_todos", "aprobaciones_portones", "aprobaciones_ipanels", "aprobaciones_plegados", "aprobaciones_otros"].includes(tab) && (
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
        {tab === "aprobaciones_todos" && renderApprovalRows(visibleAllApprovalRows, allApprovalRows.length, pageTodos, setPageTodos, "Sin aprobaciones", true, true)}
        {tab === "aprobaciones_portones" && renderApprovalRows(visibleRows, rows.length, pageAprobaciones, setPageAprobaciones, "Sin portones pendientes", false)}
        {tab === "aprobaciones_ipanels" && renderApprovalRows(visibleIpanels, ipanelRows.length, pageIpanels, setPageIpanels, "Sin Ipanels pendientes", false)}
        {tab === "aprobaciones_plegados" && renderApprovalRows(visiblePlegados, plegadoRows.length, pagePlegados, setPagePlegados, "Sin plegados pendientes", true)}
        {tab === "aprobaciones_otros" && renderApprovalRows(visibleOtros, otrosRows.length, pageOtros, setPageOtros, "Sin presupuestos Otros pendientes", false)}

        {tab === "mediciones" && (
          <>
            {medicionesQ.isLoading && <div className="muted">Cargando...</div>}
            {medicionesQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{medicionesQ.error.message}</div>}
            {!medicionesQ.isLoading && !medicionesRows.length && <div className="muted">Sin mediciones pendientes de revisión comercial</div>}
            {!!medicionesRows.length && (
              <>
                <table>
                  <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th><th>Diferencia</th><th></th></tr></thead>
                  <tbody>
                    {visibleMedicionesRows.map((r) => (
                      <tr key={r.id}>
                        <td>{fmtDate(r.measurement_at || r.created_at)}</td>
                        <td>{createdByLabel(r)}</td>
                        <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                        <td>{r.end_customer?.address || "—"}</td>
                        <td>{measurementRowLabel(r)}</td>
                        <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                        <td>{measurementQuickDiffLabel(r)}</td>
                        <td className="right" style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {/* La aprobacion/devolucion se hace desde el detalle del presupuesto
                              (/presupuestos/:id), donde se ve el detalle completo de la diferencia
                              contra el presupuesto original antes de decidir. */}
                          <Button onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
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
            {!!acopioRows.length && (() => {
              const hasPlegado = acopioRows.some(isPlegadosRow);
              return (
                <>
                  <table>
                    <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Solicitud</th><th>NP/NV Odoo</th>{hasPlegado && <th>Datos plegado</th>}<th>Obs. presupuesto</th><th>Decisiones</th><th></th></tr></thead>
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
                            <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                            {hasPlegado && <td><PlegadoInfoCell row={r} /></td>}
                            <td><BudgetObservationCell row={r} /></td>
                            <td>{acopioReqLabel(r)}</td>
                            <td className="right">
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                                {canAct ? <><Button disabled={acopioM.isPending} onClick={() => acopioM.mutate({ id: r.id, action: "approve", notes: null })}>OK</Button><Button variant="ghost" disabled={acopioM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) acopioM.mutate({ id: r.id, action: "reject", notes: msg }); }}>Rechazar</Button></> : <span className="muted">Ya decidiste</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <PaginationControls page={pageAcopio} totalItems={acopioRows.length} pageSize={PAGE_SIZE} onPageChange={setPageAcopio} />
                </>
              );
            })()}
          </>
        )}

        {tab === "acopio_listado" && (
          <>
            {acopioListadoQ.isLoading && <div className="muted">Cargando...</div>}
            {acopioListadoQ.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{acopioListadoQ.error.message}</div>}
            {!acopioListadoQ.isLoading && !acopioListadoRows.length && <div className="muted">Sin elementos en acopio</div>}
            {!!acopioListadoRows.length && (() => {
              const hasPlegado = acopioListadoRows.some(isPlegadosRow);
              return (
                <>
                  <table>
                    <thead><tr><th>Fecha</th><th>Vendedor/Distribuidor</th><th>Cliente</th><th>Dirección</th><th>Estado</th><th>NP/NV Odoo</th>{hasPlegado && <th>Datos plegado</th>}<th>Obs. presupuesto</th><th>Solicitud Prod.</th><th></th></tr></thead>
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
                            <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                            {hasPlegado && <td><PlegadoInfoCell row={r} /></td>}
                            <td><BudgetObservationCell row={r} /></td>
                            <td>{r.acopio_to_produccion_status ? acopioReqLabel(r) : "—"}</td>
                            <td className="right">
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                                <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <PaginationControls page={pageAcopioListado} totalItems={acopioListadoRows.length} pageSize={PAGE_SIZE} onPageChange={setPageAcopioListado} />
                </>
              );
            })()}
          </>
        )}

        {tab === "produccion" && renderProductionRows(visibleProduccionRows, produccionRows.length, pageProduccion, setPageProduccion, "Sin portones enviados a producción")}
        {tab === "produccion_ipanels" && renderProductionRows(visibleProduccionIpanelRows, produccionIpanelRows.length, pageProduccionIpanels, setPageProduccionIpanels, "Sin Ipanels enviados a producción")}
        {tab === "produccion_puertas" && renderProductionRows(visibleProduccionPuertasRows, produccionPuertasRows.length, pageProduccion, setPageProduccion, "Sin puertas enviadas a producción")}

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
                    {visibleAprobadosRows.map((r) => {
                      const pdfKey = `quote-${r.id}`;
                      const proformaKey = `proforma-${r.id}`;
                      const isDistribuidor = r.created_by_role === "distribuidor";
                      return (
                        <tr key={r.id}>
                          <td>{fmtDate(r.commercial_at || r.created_at)}</td>
                          <td>{catalogKindLabel(r)}</td>
                          <td>{createdByLabel(r)}</td>
                          <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                          <td>{r.end_customer?.address || "—"}</td>
                          <td>{rowLabel(r)}</td>
                          <td><OdooReferenceCell value={quoteOdooReference(r)} /></td>
                          <td><BudgetObservationCell row={r} /></td>
                          <td className="right">
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadQuotePdf(r.id)} />
                              {isDistribuidor && (
                                <Button variant="ghost" disabled={downloadingPdfKey === proformaKey} onClick={() => handleDownloadProformaPdf(r.id)} title="Descargar proforma">
                                  <span style={{ position: "relative", display: "inline-flex" }}>📄<span style={{ position: "absolute", bottom: 0, right: -2, fontSize: 9, fontWeight: 900, lineHeight: 1 }}>P</span></span>
                                </Button>
                              )}
                              <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`, { state: { from: "/aprobacion/comercial" } })}>Abrir</Button>
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
                          <td className="right">
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <PdfIconButton disabled={downloadingPdfKey === pdfKey} onClick={() => handleDownloadDoorPdf(d.id)} />
                              <Button variant="ghost" onClick={() => navigate(`/puertas/${d.id}`)}>Abrir</Button>
                              <Button disabled={doorM.isPending} onClick={() => doorM.mutate({ id: d.id, action: "approve", notes: null })}>OK</Button>
                              <Button variant="ghost" disabled={doorM.isPending} onClick={() => { const msg = window.prompt("Motivo del rechazo:", ""); if (msg !== null) doorM.mutate({ id: d.id, action: "reject", notes: msg }); }}>Rechazar</Button>
                            </div>
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

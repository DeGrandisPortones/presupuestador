import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { listDoors } from "../../api/doors.js";
import { listQuotes, requestProductionFromAcopio } from "../../api/quotes.js";
import { downloadListingQuotePdf, downloadListingQuoteProformaPdf } from "../../utils/listingPdf.js";
import { downloadPlegadoAttachment, formatPlegadoAttachmentMeta, getPlegadoAttachment, openPlegadoAttachment } from "../../utils/plegadoAttachment.js";

const PAGE_SIZE = 25;

function effectiveQuoteKind(q) {
  return String(q?.payload?.quote_subkind || q?.catalog_kind || "porton").toLowerCase();
}

function quoteEditorPath(q) {
  const kind = effectiveQuoteKind(q);
  if (kind === "ipanel") return `/cotizador/ipanel/${q.id}`;
  if (kind === "plegados") return `/cotizador/plegados/${q.id}`;
  if (kind === "otros") return `/cotizador/otros/${q.id}`;
  return `/cotizador/${q.id}`;
}

function isReturnedFromMeasurement(q) {
  return String(q?.measurement_status || "").toLowerCase() === "returned_to_seller";
}

function labelMeasurementStatus(q) {
  const s = String(q?.measurement_status || "none").toLowerCase();
  if (s === "pending") return "Pendiente";
  if (s === "submitted") return "Enviada a técnica";
  if (s === "needs_fix") return "Realizada / corregir";
  if (s === "approved") return "Realizada";
  if (s === "returned_to_seller") return "Pendiente por hacer cambios postmedición";
  if (s === "none") return "—";
  return s || "—";
}
function quoteWaitingMeasurement(q) {
  return q?.status === "pending_approvals" && q?.commercial_decision === "approved" && q?.technical_decision === "approved" && q?.requires_measurement === true && String(q?.measurement_status || "none").toLowerCase() !== "approved";
}
function labelQuoteStatus(q) {
  if (isReturnedFromMeasurement(q)) return "Pendiente por hacer cambios postmedición";
  const s = q?.status;
  const c = q?.commercial_decision;
  const t = q?.technical_decision;
  if (s === "draft") {
    if (c === "rejected" || t === "rejected") return "Rechazado (corregir)";
    if (c === "pending" && t === "pending") return "Guardado";
    return "Borrador";
  }
  if (s === "pending_approvals") {
    if (c === "pending" && t === "pending") return "Pendiente Comercial y Técnica";
    if (c === "approved" && t === "pending") return "Pendiente Técnica";
    if (c === "pending" && t === "approved") return "Pendiente Comercial";
    if (quoteWaitingMeasurement(q)) return "Pendiente medición técnica";
    if (c === "approved" && t === "approved") return "Listo para Odoo";
    return "En aprobación";
  }
  if (s === "syncing_odoo") return "Sincronizando a Odoo";
  if (s === "synced_odoo") return "Enviado a Odoo";
  return s || "—";
}
function labelDoorStatus(door) {
  const s = String(door?.status || "").toLowerCase();
  const c = String(door?.commercial_decision || "pending").toLowerCase();
  const t = String(door?.technical_decision || "pending").toLowerCase();
  if (s === "draft") {
    if (c === "rejected" || t === "rejected") return "Rechazado (corregir)";
    if (c === "pending" && t === "pending") return "Guardado";
    return "Borrador";
  }
  if (s === "pending_approvals") {
    if (c === "pending" && t === "pending") return "Pendiente Comercial y Técnica";
    if (c === "approved" && t === "pending") return "Pendiente Técnica";
    if (c === "pending" && t === "approved") return "Pendiente Comercial";
    if (c === "approved" && t === "approved") return "Listo para Odoo";
    return "En aprobación";
  }
  if (s === "syncing_odoo") return "Sincronizando a Odoo";
  if (s === "synced_odoo") return "Enviado a Odoo";
  return door?.status || "—";
}
function quoteTypeLabel(q) {
  const kind = effectiveQuoteKind(q);
  if (kind === "ipanel") return "Ipanel";
  if (kind === "plegados") return "Plegados";
  if (kind === "otros") return "Otros";
  if (kind === "puerta") return "Puerta";
  return "Portón";
}
function doorTypeLabel() { return "Puerta"; }
function localityLabelFromQuote(q) { return q?.end_customer?.city || "—"; }
function localityLabelFromDoor(d) { return d?.record?.end_customer?.city || "—"; }
function normalizeSearch(text) { return String(text || "").trim().toLowerCase(); }
function matchesRowSearch(item, searchText) {
  const s = normalizeSearch(searchText);
  if (!s) return true;
  if (item.rowKind === "door") {
    const d = item.raw;
    const haystack = [doorTypeLabel(), d?.door_code, doorOdooReference(d), d?.record?.end_customer?.name, d?.record?.end_customer?.city, d?.record?.end_customer?.address, d?.record?.end_customer?.phone, d?.record?.obra_cliente, d?.linked_quote_odoo_name, d?.record?.asociado_porton, d?.record?.ipanel_quote_id, d?.record?.ipanel_quote_label, labelDoorStatus(d)].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(s);
  }
  const q = item.raw;
  const haystack = [quoteTypeLabel(q), quoteOdooReference(q), q?.end_customer?.name, q?.end_customer?.city, q?.end_customer?.address, q?.end_customer?.phone, labelQuoteStatus(q), labelMeasurementStatus(q), q?.fulfillment_mode === "acopio" ? "acopio" : "produccion", plegadoDescription(q), getPlegadoAttachment(q)?.name].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(s);
}
function toTimeDesc(value) { if (!value) return 0; const d = new Date(value); if (Number.isNaN(d.getTime())) return 0; return d.getTime(); }
function isQuoteSaved(q) { return q?.status === "draft" && q?.commercial_decision === "pending" && q?.technical_decision === "pending"; }
function isQuotePending(q) { return q?.status === "pending_approvals" && (q?.commercial_decision === "pending" || q?.technical_decision === "pending"); }
function isQuoteRejected(q) { return q?.status === "draft" && (q?.commercial_decision === "rejected" || q?.technical_decision === "rejected"); }
function isDoorSaved(d) { return d?.status === "draft" && d?.commercial_decision === "pending" && d?.technical_decision === "pending"; }
function isDoorPending(d) { return d?.status === "pending_approvals" && (d?.commercial_decision === "pending" || d?.technical_decision === "pending"); }
function isDoorRejected(d) { return d?.status === "draft" && (d?.commercial_decision === "rejected" || d?.technical_decision === "rejected"); }
function fmtDate(value) { if (!value) return "—"; const raw = String(value); const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw); if (Number.isNaN(d.getTime())) return "—"; return d.toLocaleDateString("es-AR"); }
function fmtDateTime(value) { if (!value) return "—"; const raw = String(value); const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw); if (Number.isNaN(d.getTime())) return "—"; const date = d.toLocaleDateString("es-AR"); const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }); return `${date} ${time}`; }

function uniqueNonEmpty(values = []) {
  const out = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}
function quoteOdooReference(q) {
  return uniqueNonEmpty([
    q?.production_sale_order_name,
    q?.final_sale_order_name,
    q?.final_copy_sale_order_name,
    q?.odoo_sale_order_name,
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

function getRejectionInfoFromQuote(q) {
  const commercialRejected = String(q?.commercial_decision || "").toLowerCase() === "rejected";
  const technicalRejected = String(q?.technical_decision || "").toLowerCase() === "rejected";
  if (!commercialRejected && !technicalRejected) return null;
  const title = commercialRejected ? "Motivo del rechazo comercial" : "Motivo del rechazo técnico";
  const reason = String(
    q?.rejection_notes ||
    q?.rejection_reason ||
    q?.commercial_rejection_notes ||
    q?.technical_rejection_notes ||
    q?.review_notes ||
    q?.payload?.rejection_notes ||
    q?.payload?.rejection_reason ||
    q?.payload?.commercial_rejection_notes ||
    q?.payload?.technical_rejection_notes ||
    ""
  ).trim();
  return { title, reason: reason || "No hay motivo cargado para este rechazo." };
}
function getRejectionInfoFromDoor(d) {
  const commercialRejected = String(d?.commercial_decision || "").toLowerCase() === "rejected";
  const technicalRejected = String(d?.technical_decision || "").toLowerCase() === "rejected";
  if (!commercialRejected && !technicalRejected) return null;
  const title = commercialRejected ? "Motivo del rechazo comercial" : "Motivo del rechazo técnico";
  const reason = String(
    d?.rejection_notes ||
    d?.rejection_reason ||
    d?.commercial_rejection_notes ||
    d?.technical_rejection_notes ||
    d?.record?.rejection_notes ||
    d?.record?.rejection_reason ||
    d?.record?.commercial_rejection_notes ||
    d?.record?.technical_rejection_notes ||
    d?.record?.payload?.rejection_notes ||
    d?.record?.payload?.rejection_reason ||
    ""
  ).trim();
  return { title, reason: reason || "No hay motivo cargado para este rechazo." };
}
function RejectedStatusButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        color: "#b42318",
        fontWeight: 700,
        textDecoration: "underline",
      }}
    >
      {label}
    </button>
  );
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
function PlegadoModal({ row, onClose }) {
  if (!row) return null;
  const description = plegadoDescription(row);
  const surface = plegadoSurface(row);
  const attachment = getPlegadoAttachment(row || {});
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 760, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 20 }}>Plano y comentarios del plegado</div>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
        <div className="spacer" />
        <div className="muted">Superficie</div>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>{surface || "—"}</div>
        <div className="muted">Descripción / comentarios</div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontWeight: 800, fontSize: 15, background: "#f7fbff", border: "1px solid #d9e5f7", borderRadius: 12, padding: 12 }}>{description || "Sin descripción"}</div>
        <div className="spacer" />
        <div className="muted">Plano</div>
        {attachment ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontWeight: 800 }}>{formatPlegadoAttachmentMeta(attachment)}</span>
            <Button variant="ghost" onClick={() => openPlegadoAttachment(attachment)}>Ver plano</Button>
            <Button variant="ghost" onClick={() => downloadPlegadoAttachment(attachment)}>Descargar</Button>
          </div>
        ) : <div className="muted" style={{ marginTop: 6 }}>Sin plano adjunto.</div>}
      </div>
    </div>
  );
}

function buildClientAcceptanceUrl(token) {
  if (!token) return null;
  return `${window.location.origin}/aceptacion-cliente/${token}`;
}

function LinkPopup({ url, onClose }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);
  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div ref={ref} style={{
      position: "absolute", zIndex: 100, background: "#fff", border: "1px solid #ddd",
      borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", padding: "14px 16px",
      minWidth: 320, maxWidth: 460, right: 0, top: "calc(100% + 4px)",
    }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Link de aceptación del cliente:</div>
      <div style={{ fontSize: 12, wordBreak: "break-all", background: "#f5f5f5", padding: "6px 8px", borderRadius: 4, color: "#333", marginBottom: 10 }}>{url}</div>
      <button
        onClick={handleCopy}
        style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #ccc", background: copied ? "#e8f5e9" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: copied ? "#1b5e20" : "#333" }}
      >
        {copied ? "✓ Copiado" : "Copiar link"}
      </button>
    </div>
  );
}

function TypeBadge({ label }) {
  const isDoor = label === "Puerta";
  const isIpanel = label === "Ipanel";
  const isPlegados = label === "Plegados";
  const isOtros = label === "Otros";
  let background = "#eef2ff";
  let color = "#3730a3";
  if (isDoor) {
    background = "#f5f3ff";
    color = "#6b21a8";
  } else if (isIpanel) {
    background = "#ecfeff";
    color = "#155e75";
  } else if (isPlegados) {
    background = "#fff7ed";
    color = "#9a3412";
  } else if (isOtros) {
    background = "#ecfdf5";
    color = "#166534";
  }
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, background, color, whiteSpace: "nowrap" }}>{label}</span>;
}

export default function PresupuestosPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [downloadingPdfKey, setDownloadingPdfKey] = useState("");
  const [rejectionModal, setRejectionModal] = useState(null);
  const [plegadoModal, setPlegadoModal] = useState(null);
  const [linkPopupId, setLinkPopupId] = useState(null);

  const showAcceptanceColumn = filter === "produccion" && !!user?.is_distribuidor;

  const quotesQ = useQuery({ queryKey: ["quotes", "mine"], queryFn: () => listQuotes({ scope: "mine" }) });
  const doorsQ = useQuery({ queryKey: ["doors", "mine", "presupuestos"], queryFn: () => listDoors({ scope: "mine" }), enabled: !!user?.is_vendedor || !!user?.is_distribuidor });
  const qc = useQueryClient();
  const moveM = useMutation({ mutationFn: (id) => requestProductionFromAcopio(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", "mine"] }) });
  const canDownloadQuoteProforma = !!user?.is_distribuidor && !user?.is_vendedor;

  async function handleDownloadQuotePdf(quoteId) {
    const key = `quote-${quoteId}`;
    setDownloadingPdfKey(key);
    try { await downloadListingQuotePdf(quoteId); } catch (e) { toast.error(e?.message || "No se pudo descargar el PDF"); } finally { setDownloadingPdfKey(""); }
  }

  async function handleDownloadQuoteProformaPdf(quoteId) {
    const key = `proforma-${quoteId}`;
    setDownloadingPdfKey(key);
    try { await downloadListingQuoteProformaPdf(quoteId); } catch (e) { toast.error(e?.message || "No se pudo descargar la proforma"); } finally { setDownloadingPdfKey(""); }
  }

  const linkedDoorQuoteIds = useMemo(() => new Set((doorsQ.data || []).map((d) => String(d?.linked_quote_id || "").trim()).filter(Boolean)), [doorsQ.data]);
  useEffect(() => { setPage(1); }, [filter, typeFilter, searchText]);

  // Resetear el filtro de estado si el tipo seleccionado no lo soporta
  useEffect(() => {
    setFilter((prev) => (prev === "mediciones" && typeFilter !== "porton" ? "all" : prev));
  }, [typeFilter]);

  const rows = useMemo(() => {
    const quoteRows = (quotesQ.data || []).map((q) => ({
      rowKind: "quote",
      id: q.id,
      raw: q,
      createdAt: q.created_at,
      typeLabel: quoteTypeLabel(q),
      clientName: q?.end_customer?.name || "",
      locality: localityLabelFromQuote(q),
      statusLabel: labelQuoteStatus(q),
      destinationLabel: q?.fulfillment_mode === "acopio" ? "Acopio" : "Producción",
      measurementDate: fmtDate(q?.measurement_scheduled_for),
      measurementStatus: labelMeasurementStatus(q),
      odooReference: quoteOdooReference(q),
    }));
    const doorRows = (doorsQ.data || []).map((d) => ({
      rowKind: "door",
      id: d.id,
      raw: d,
      createdAt: d?.created_at || d?.updated_at,
      typeLabel: doorTypeLabel(),
      clientName: d?.record?.end_customer?.name || d?.record?.obra_cliente || "",
      locality: localityLabelFromDoor(d),
      statusLabel: labelDoorStatus(d),
      destinationLabel: "Puerta",
      measurementDate: "—",
      measurementStatus: "—",
      odooReference: doorOdooReference(d),
    }));
    const merged = [...quoteRows, ...doorRows];
    merged.sort((a, b) => toTimeDesc(b.createdAt) - toTimeDesc(a.createdAt));
    let filtered = merged;
    if (filter === "saved") filtered = filtered.filter((item) => (item.rowKind === "door" ? isDoorSaved(item.raw) : isQuoteSaved(item.raw)));
    else if (filter === "pending") filtered = filtered.filter((item) => (item.rowKind === "door" ? isDoorPending(item.raw) : isQuotePending(item.raw)));
    else if (filter === "rejected") filtered = filtered.filter((item) => (item.rowKind === "door" ? isDoorRejected(item.raw) : isQuoteRejected(item.raw)));
    else if (filter === "acopio") filtered = filtered.filter((item) => item.rowKind === "quote" && item.raw?.fulfillment_mode === "acopio" && item.raw?.status !== "draft");
    else if (filter === "produccion") filtered = filtered.filter((item) => item.rowKind === "quote" && item.raw?.fulfillment_mode === "produccion" && item.raw?.status !== "draft");
    else if (filter === "mediciones") {
      filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "porton").filter((item) => {
        const q = item.raw;
        if (isReturnedFromMeasurement(q)) return true;
        return q?.fulfillment_mode === "produccion" && q?.status !== "draft" && q?.requires_measurement === true;
      });
    }
    if (typeFilter === "porton") filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "porton");
    if (typeFilter === "ipanel") filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "ipanel");
    if (typeFilter === "plegados") filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "plegados");
    if (typeFilter === "otros") filtered = filtered.filter((item) => item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "otros");
    if (typeFilter === "door") filtered = filtered.filter((item) => item.rowKind === "door" || (item.rowKind === "quote" && effectiveQuoteKind(item.raw) === "puerta"));
    return filtered.filter((item) => matchesRowSearch(item, searchText));
  }, [quotesQ.data, doorsQ.data, filter, typeFilter, searchText]);

  useEffect(() => { const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); if (page > totalPages) setPage(totalPages); }, [rows.length, page]);
  const visibleRows = useMemo(() => { const start = (page - 1) * PAGE_SIZE; return rows.slice(start, start + PAGE_SIZE); }, [rows, page]);
  const isLoading = quotesQ.isLoading || doorsQ.isLoading;
  const error = quotesQ.error || doorsQ.error;

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Mis presupuestos</h2>
        <div className="muted">Portones, Ipanel, Otros y puertas, con seguimiento de estados, acopio, producción y mediciones</div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <Button variant={typeFilter === "all" ? "primary" : "ghost"} onClick={() => setTypeFilter("all")}>Todos los tipos</Button>
          <Button variant={typeFilter === "porton" ? "primary" : "ghost"} onClick={() => setTypeFilter("porton")}>Portón</Button>
          <Button variant={typeFilter === "ipanel" ? "primary" : "ghost"} onClick={() => setTypeFilter("ipanel")}>Ipanel</Button>
          <Button variant={typeFilter === "plegados" ? "primary" : "ghost"} onClick={() => setTypeFilter("plegados")}>Plegados</Button>
          <Button variant={typeFilter === "otros" ? "primary" : "ghost"} onClick={() => setTypeFilter("otros")}>Otros</Button>
          <Button variant={typeFilter === "door" ? "primary" : "ghost"} onClick={() => setTypeFilter("door")}>Puerta</Button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>Todos</Button>
          <Button variant={filter === "saved" ? "primary" : "ghost"} onClick={() => setFilter("saved")}>Guardados</Button>
          <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>Pendientes</Button>
          <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>Rechazados</Button>
          <Button variant={filter === "acopio" ? "primary" : "ghost"} onClick={() => setFilter("acopio")}>En Acopio</Button>
          <Button variant={filter === "produccion" ? "primary" : "ghost"} onClick={() => setFilter("produccion")}>En Producción</Button>
          {typeFilter === "porton" && (
            <Button variant={filter === "mediciones" ? "primary" : "ghost"} onClick={() => setFilter("mediciones")}>En Medición</Button>
          )}
        </div>
        <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Buscar por tipo, cliente, localidad, dirección, teléfono o estado…" style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }} />
      </div>

      <div className="spacer" />
      <div className="card">
        {isLoading && <div className="muted">Cargando...</div>}
        {error && <div style={{ color: "#d93025", fontSize: 13 }}>{error.message}</div>}
        {!isLoading && !rows.length && <div className="muted">Sin presupuestos</div>}
        {!!rows.length && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Localidad</th>
                  <th>Estado</th>
                  <th>NP/NV Odoo</th>
                  <th>Destino</th>
                  {filter === "mediciones" ? <th>Fecha medición</th> : null}
                  {filter === "mediciones" ? <th>Estado medición</th> : null}
                  {showAcceptanceColumn ? <th>Aceptación del cliente</th> : null}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item) => {
                  if (item.rowKind === "door") {
                    const door = item.raw;
                    return (
                      <tr key={`door-${door.id}`}>
                        <td>{fmtDateTime(item.createdAt)}</td>
                        <td><TypeBadge label={item.typeLabel} /></td>
                        <td>{item.clientName || <span className="muted">(sin nombre)</span>}</td>
                        <td>{item.locality}</td>
                        <td>
                          {getRejectionInfoFromDoor(door) ? (
                            <RejectedStatusButton
                              label={item.statusLabel}
                              onClick={() => setRejectionModal(getRejectionInfoFromDoor(door))}
                            />
                          ) : item.statusLabel}
                        </td>
                        <td><OdooReferenceCell value={item.odooReference} /></td>
                        <td>{item.destinationLabel}</td>
                        {filter === "mediciones" ? <td>—</td> : null}
                        {filter === "mediciones" ? <td>—</td> : null}
                        {showAcceptanceColumn ? <td>—</td> : null}
                        <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                          <Button variant="ghost" onClick={() => navigate(`/puertas/${door.id}`)}>Abrir puerta</Button>
                          {door.linked_quote_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>Ver portón</Button> : null}
                        </td>
                      </tr>
                    );
                  }

                  const r = item.raw;
                  const originalPdfKey = `quote-${r.id}`;
                  const originalProformaPdfKey = `proforma-${r.id}`;
                  const finalPdfKey = r.final_copy_id ? `quote-${r.final_copy_id}` : "";
                  const finalProformaPdfKey = r.final_copy_id ? `proforma-${r.final_copy_id}` : "";
                  const canRequestProduction = r.fulfillment_mode === "acopio" && r.status === "synced_odoo" && r.acopio_to_produccion_status !== "pending";
                  const hasFinal = !!r.final_copy_id;
                  const finalDraft = hasFinal && !["syncing_odoo", "synced_odoo"].includes(String(r.final_copy_status || ""));
                  const canAddDoor = effectiveQuoteKind(r) === "porton" && r.status === "draft" && !linkedDoorQuoteIds.has(String(r.id));
                  const hasMeasurementDetail = effectiveQuoteKind(r) === "porton" && (r?.requires_measurement === true || String(r?.measurement_mode || "").toLowerCase() === "tecnica_only" || String(r?.measurement_subtype || "").toLowerCase() === "sin_medicion" || !["", "none"].includes(String(r?.measurement_status || "").toLowerCase()));
                  const isMeasurementApproved = String(r?.measurement_status || "").toLowerCase() === "approved";
                  const isTechnicalOnly = String(r?.measurement_subtype || "").toLowerCase() === "sin_medicion" || String(r?.measurement_mode || "").toLowerCase() === "tecnica_only";
                  const measurementLabel = isTechnicalOnly ? "Ver detalle técnico" : "Ver medición";
                  return (
                    <tr key={r.id}>
                      <td>{fmtDateTime(r.created_at)}</td>
                      <td><TypeBadge label={item.typeLabel} /></td>
                      <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                      <td>{item.locality}</td>
                      <td>
                        {getRejectionInfoFromQuote(r) ? (
                          <RejectedStatusButton
                            label={item.statusLabel}
                            onClick={() => setRejectionModal(getRejectionInfoFromQuote(r))}
                          />
                        ) : item.statusLabel}
                      </td>
                      <td><OdooReferenceCell value={item.odooReference} /></td>
                      <td>{item.destinationLabel}</td>
                      {filter === "mediciones" ? <td>{item.measurementDate}</td> : null}
                      {filter === "mediciones" ? <td>{item.measurementStatus}</td> : null}
                      {showAcceptanceColumn ? (() => {
                        const token = r.measurement_share_token;
                        const acceptanceUrl = token ? buildClientAcceptanceUrl(token) : null;
                        const acceptance = r.payload?.measurement_client_acceptance;
                        const showLinkPopup = linkPopupId === r.id;
                        return (
                          <td style={{ position: "relative", minWidth: 160 }}>
                            {acceptanceUrl ? (
                              <div style={{ marginBottom: acceptance ? 8 : 0 }}>
                                <button
                                  onClick={() => setLinkPopupId(showLinkPopup ? null : r.id)}
                                  style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #90caf9", background: "#e3f2fd", color: "#0d47a1", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                                >
                                  🔗 Ver link
                                </button>
                                {showLinkPopup && <LinkPopup url={acceptanceUrl} onClose={() => setLinkPopupId(null)} />}
                              </div>
                            ) : <span style={{ color: "#ccc", fontSize: 12 }}>Sin link aún</span>}
                            {acceptance ? (
                              <div style={{ fontSize: 12, color: "#333", marginTop: acceptanceUrl ? 6 : 0 }}>
                                <div style={{ fontWeight: 700 }}>{acceptance.full_name || "—"}</div>
                                <div style={{ color: "#666" }}>DNI: {acceptance.dni || "—"}</div>
                                <div style={{ color: "#888" }}>{fmtDateTime(acceptance.accepted_at || r.measurement_client_accepted_at)}</div>
                              </div>
                            ) : r.measurement_share_enabled_at ? (
                              <div style={{ fontSize: 12, color: "#999", fontStyle: "italic", marginTop: 4 }}>Pendiente de aceptación</div>
                            ) : null}
                          </td>
                        );
                      })() : null}
                      <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                        <Button variant="ghost" disabled={downloadingPdfKey === originalPdfKey} onClick={() => handleDownloadQuotePdf(r.id)}>Ver original</Button>
                        {canDownloadQuoteProforma ? <Button variant="ghost" disabled={downloadingPdfKey === originalProformaPdfKey} onClick={() => handleDownloadQuoteProformaPdf(r.id)}>Proforma</Button> : null}
                        {hasFinal ? <Button variant="ghost" disabled={downloadingPdfKey === finalPdfKey} onClick={() => handleDownloadQuotePdf(r.final_copy_id)}>Ver final</Button> : null}
                        {canDownloadQuoteProforma && hasFinal ? <Button variant="ghost" disabled={downloadingPdfKey === finalProformaPdfKey} onClick={() => handleDownloadQuoteProformaPdf(r.final_copy_id)}>Proforma final</Button> : null}
                        {hasMeasurementDetail ? <Button variant="ghost" disabled={!isMeasurementApproved} title={isMeasurementApproved ? "" : "Disponible cuando Técnica apruebe la medición / detalle técnico"} onClick={() => { if (!isMeasurementApproved) return; navigate(`/mediciones/${r.id}`); }}>{measurementLabel}</Button> : null}
                        {effectiveQuoteKind(r) === "plegados" ? <Button variant="ghost" onClick={() => setPlegadoModal(r)}>Plano / comentarios</Button> : null}
                        {r.status === "draft" ? <Button onClick={() => navigate(quoteEditorPath(r))}>Editar</Button> : null}
                        {canAddDoor ? <Button variant="ghost" onClick={() => navigate(`/puertas/nuevo/${r.id}`)}>Agregar puerta</Button> : null}
                        {hasFinal && finalDraft ? <Button onClick={() => navigate(quoteEditorPath({ ...r, id: r.final_copy_id }))}>Editar final</Button> : null}
                        {filter === "acopio" ? <Button disabled={moveM.isPending || !canRequestProduction} title={canRequestProduction ? "Solicitar paso a Producción" : "Solo disponible cuando el presupuesto original ya fue aprobado y enviado a Odoo"} onClick={() => moveM.mutate(r.id)}>{r.acopio_to_produccion_status === "pending" ? "Solicitud en revisión" : "Solicitar paso a Producción"}</Button> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <PaginationControls page={page} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>
      <PlegadoModal row={plegadoModal} onClose={() => setPlegadoModal(null)} />
      {rejectionModal ? (
        <div
          onClick={() => setRejectionModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 640, background: "#fff" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 20 }}>{rejectionModal.title}</div>
              <Button variant="ghost" onClick={() => setRejectionModal(null)}>Cerrar</Button>
            </div>
            <div className="spacer" />
            <div
              style={{
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
                background: "#fff8f3",
                border: "1px solid #f2d3bf",
                borderRadius: 12,
                padding: 16,
              }}
            >
              {rejectionModal.reason}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

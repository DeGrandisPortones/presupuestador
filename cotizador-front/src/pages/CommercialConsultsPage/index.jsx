import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import {
  addCommercialConsultMessage,
  closeCommercialConsult,
  createCommercialConsult,
  getCommercialConsult,
  listCommercialConsultRequesters,
  listCommercialConsults,
  markCommercialConsultRead,
  searchCommercialConsultRequesters,
} from "../../api/commercialConsults.js";
import {
  downloadTicketAttachment,
  fileToTicketAttachment,
  formatTicketAttachmentMeta,
  isImageTicketAttachment,
  isVideoTicketAttachment,
  openTicketAttachment,
} from "../../utils/ticketAttachment.js";

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status) {
  const s = String(status || "pending").trim().toLowerCase();
  if (s === "pending") return "Pendiente";
  if (s === "in_progress") return "En proceso";
  if (s === "closed") return "Cerrada";
  return s || "—";
}

function statusTone(status) {
  const s = String(status || "pending").trim().toLowerCase();
  if (s === "closed") return { border: "#7a7a7a", background: "#f4f4f4", color: "#444" };
  if (s === "in_progress") return { border: "#1f7a45", background: "#eaf8ef", color: "#1f7a45" };
  return { border: "#a66300", background: "#fff3e0", color: "#a66300" };
}

function messageBubbleStyle(isOwn, isResolution = false) {
  if (isResolution) {
    return {
      alignSelf: "stretch",
      border: "1px solid #1f7a45",
      background: "#eefaf2",
      color: "#0f5d31",
      borderRadius: 14,
      padding: 14,
    };
  }
  return {
    alignSelf: isOwn ? "flex-end" : "flex-start",
    maxWidth: "80%",
    border: `1px solid ${isOwn ? "#01a39f" : "#e0e0e0"}`,
    background: isOwn ? "rgba(1,163,159,0.10)" : "#fff",
    borderRadius: 14,
    padding: 12,
  };
}

function normalizeSearch(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Selector de adjunto reusado en los 3 formularios de "nuevo ticket" + respuesta + cierre,
// todos comparten la misma forma (imagen/pdf/video, ver utils/ticketAttachment.js).
function AttachmentField({ attachment, error, attaching, onSelectFile, onRemove }) {
  return (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      {!attachment ? (
        <>
          <label
            className="btn btn--secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: 0, cursor: attaching ? "wait" : "pointer" }}
          >
            <span>{attaching ? "Adjuntando..." : "Adjuntar imagen, PDF o video"}</span>
            <input type="file" accept="image/*,application/pdf,video/*" onChange={onSelectFile} disabled={attaching} style={{ display: "none" }} />
          </label>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>Imagen o PDF hasta 15 MB - Video hasta 5 MB</div>
        </>
      ) : (
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 10, border: "1px solid var(--dg-teal)",
            borderRadius: 10, padding: "8px 12px", fontSize: 13, background: "rgba(1,163,159,0.08)",
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--dg-petrol)" }}>{formatTicketAttachmentMeta(attachment)}</span>
          <button type="button" onClick={onRemove} className="btn btn--ghost" style={{ padding: "3px 9px", fontSize: 12 }}>
            Quitar
          </button>
        </div>
      )}
      {error ? <div style={{ color: "#d93025", fontSize: 12, marginTop: 6, fontWeight: 700 }}>{error}</div> : null}
    </div>
  );
}

function MessageAttachment({ attachment }) {
  if (!attachment?.data_url) return null;
  if (isImageTicketAttachment(attachment)) {
    return (
      <div style={{ marginTop: 8 }}>
        <img
          src={attachment.data_url}
          alt={attachment.name || "adjunto"}
          onClick={() => openTicketAttachment(attachment)}
          style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, cursor: "pointer", display: "block" }}
        />
      </div>
    );
  }
  if (isVideoTicketAttachment(attachment)) {
    return (
      <div style={{ marginTop: 8 }}>
        <video controls src={attachment.data_url} style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, display: "block" }} />
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={() => openTicketAttachment(attachment)}
        style={{ border: "1px solid #ddd", borderRadius: 8, background: "#fff", padding: "5px 10px", cursor: "pointer", fontSize: 12 }}
      >
        {formatTicketAttachmentMeta(attachment)}
      </button>
      <button type="button" onClick={() => downloadTicketAttachment(attachment)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "#01a39f", fontWeight: 700 }}>
        Descargar
      </button>
    </div>
  );
}

// Popup para elegir a mano un subconjunto de vendedores O distribuidores (primero se
// elige el rol, la lista de abajo solo muestra ese rol) a los que mandarles el mismo
// ticket (uno por destinatario, igual que "Todos los vendedores" pero con seleccion
// puntual en vez de toda la audiencia).
function RequesterPickerModal({ open, role, onRoleChange, requesters, isLoading, error, initialSelectedIds, onConfirm, onClose }) {
  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState(() => new Set(initialSelectedIds));

  useEffect(() => {
    if (open) setCheckedIds(new Set(initialSelectedIds));
    else setSearch("");
    // Solo re-sincronizar la seleccion de trabajo cuando el popup se abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const term = normalizeSearch(search);
  const filtered = term
    ? requesters.filter((r) => normalizeSearch(`${r.full_name || ""} ${r.username || ""}`).includes(term))
    : requesters;

  function toggle(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeRole(nextRole) {
    if (nextRole === role) return;
    setCheckedIds(new Set());
    onRoleChange(nextRole);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(480px, 96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, padding: 18, boxShadow: "0 22px 70px rgba(15,23,42,0.35)", border: "1px solid #e5e7eb" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Elegir destinatarios</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Button variant={role === "vendedores" ? "primary" : "ghost"} onClick={() => changeRole("vendedores")}>
            Vendedores
          </Button>
          <Button variant={role === "distribuidores" ? "primary" : "ghost"} onClick={() => changeRole("distribuidores")}>
            Distribuidores
          </Button>
        </div>
        <Input value={search} onChange={setSearch} placeholder="Buscar por nombre o usuario" style={{ width: "100%" }} autoFocus />
        <div style={{ height: 8 }} />
        <div style={{ flex: 1, minHeight: 120, overflowY: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          {isLoading ? <div className="muted" style={{ padding: 12 }}>Cargando…</div> : null}
          {error ? <div style={{ color: "#d93025", fontSize: 13, padding: 12 }}>{error}</div> : null}
          {!isLoading && !error && !filtered.length ? <div className="muted" style={{ padding: 12 }}>Sin resultados.</div> : null}
          {!isLoading && !error && filtered.map((r) => {
            const checked = checkedIds.has(r.id);
            return (
              <label
                key={r.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                  borderBottom: "1px solid #f0f0f0", cursor: "pointer",
                  background: checked ? "rgba(1,163,159,0.06)" : "transparent",
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} />
                <div>
                  <div style={{ fontWeight: 700 }}>{r.full_name || r.username}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{r.username}</div>
                </div>
              </label>
            );
          })}
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div className="muted" style={{ fontSize: 13 }}>{checkedIds.size} seleccionado(s)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => onConfirm([...checkedIds])} disabled={!checkedIds.size}>Confirmar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function handleTicketAttachmentFile(file, { setAttachment, setError, setAttaching }) {
  setError("");
  if (!file) return;
  setAttaching(true);
  try {
    const attachment = await fileToTicketAttachment(file);
    setAttachment(attachment);
  } catch (err) {
    setError(err?.message || "No se pudo adjuntar el archivo.");
  } finally {
    setAttaching(false);
  }
}

export default function CommercialConsultsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const markedReadRef = useRef(0);

  const isCommercial = !!(user?.is_superuser || user?.is_enc_comercial);
  const isRequester = !!(!isCommercial && (user?.is_vendedor || user?.is_distribuidor));
  const canAccess = isCommercial || isRequester;

  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(isCommercial ? "pending" : "open");
  const [selectedId, setSelectedId] = useState(null);
  const [subject, setSubject] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [searchText, setSearchText] = useState("");

  const [showNewForm, setShowNewForm] = useState(false);
  const [targetSearch, setTargetSearch] = useState("");
  const [targetResults, setTargetResults] = useState([]);
  const [targetSearching, setTargetSearching] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [audienceMode, setAudienceMode] = useState("target");
  const [bulkNotice, setBulkNotice] = useState("");
  const [selectedMultiTargets, setSelectedMultiTargets] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerRole, setPickerRole] = useState("vendedores");

  const [newAttachment, setNewAttachment] = useState(null);
  const [newAttachmentError, setNewAttachmentError] = useState("");
  const [newAttaching, setNewAttaching] = useState(false);
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [replyAttachmentError, setReplyAttachmentError] = useState("");
  const [replyAttaching, setReplyAttaching] = useState(false);
  const [resolutionAttachment, setResolutionAttachment] = useState(null);
  const [resolutionAttachmentError, setResolutionAttachmentError] = useState("");
  const [resolutionAttaching, setResolutionAttaching] = useState(false);

  function closeNewForm() {
    setShowNewForm(false);
    setSelectedTarget(null);
    setTargetSearch("");
    setTargetResults([]);
    setAudienceMode("target");
    setSelectedMultiTargets([]);
    setShowPicker(false);
    setPickerRole("vendedores");
    setNewAttachment(null);
    setNewAttachmentError("");
    setReferenceNumber("");
  }

  // Deep-link desde el detalle de un presupuesto/NV/NP (ver QuoteDetailPage, boton
  // "Abrir consulta comercial"): ?ref=NV4304 precarga el numero y abre el formulario
  // de "nuevo ticket" solo, sin que el usuario tenga que ir a buscarlo el mismo.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;
    setReferenceNumber(ref);
    if (isCommercial) setShowNewForm(true);
    const next = new URLSearchParams(searchParams);
    next.delete("ref");
    setSearchParams(next, { replace: true });
    // Solo se consume una vez, al llegar con el parametro en la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setStatus(isCommercial ? "pending" : "open");
  }, [isCommercial]);

  useEffect(() => {
    if (!isCommercial || !showNewForm) return;
    const term = targetSearch.trim();
    if (term.length < 2) {
      setTargetResults([]);
      setTargetSearching(false);
      return;
    }
    setTargetSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchCommercialConsultRequesters(term);
        setTargetResults(results);
      } catch {
        setTargetResults([]);
      } finally {
        setTargetSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [targetSearch, isCommercial, showNewForm]);

  const pickerQ = useQuery({
    queryKey: ["commercialConsultRequestersList", pickerRole],
    queryFn: () => listCommercialConsultRequesters(pickerRole),
    enabled: isCommercial && showPicker,
    staleTime: 30000,
  });

  const scope = isCommercial ? "commercial" : "mine";

  const ticketsQ = useQuery({
    queryKey: ["commercialConsults", scope, status],
    queryFn: () => listCommercialConsults({ scope, status }),
    enabled: canAccess,
    refetchInterval: 15000,
  });

  const baseTickets = ticketsQ.data || [];

  const tickets = useMemo(() => {
    const term = normalizeSearch(searchText);
    if (!term) return baseTickets;
    return baseTickets.filter((ticket) => {
      const haystack = normalizeSearch([
        ticket.id,
        ticket.subject,
        ticket.reference_number,
        ticket.created_by_name,
        ticket.created_by_role,
        ticket.created_by_username,
        ticket.assigned_to_name,
        ticket.on_behalf_of_name,
        ticket.last_message_text,
      ].join(" "));
      return haystack.includes(term);
    });
  }, [baseTickets, searchText]);

  useEffect(() => {
    if (!tickets.length) {
      setSelectedId(null);
      return;
    }
    const exists = tickets.some((ticket) => String(ticket.id) === String(selectedId));
    if (!selectedId || !exists) setSelectedId(tickets[0].id);
  }, [tickets, selectedId]);

  const selectedListTicket = useMemo(
    () => tickets.find((ticket) => String(ticket.id) === String(selectedId)) || null,
    [tickets, selectedId]
  );

  const detailQ = useQuery({
    queryKey: ["commercialConsult", selectedId],
    queryFn: () => getCommercialConsult(selectedId),
    enabled: canAccess && !!selectedId,
    refetchInterval: 10000,
  });

  const selectedTicket = detailQ.data || null;

  const markReadM = useMutation({
    mutationFn: (ticketId) => markCommercialConsultRead(ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commercialConsultUnreadSummary"] });
      qc.invalidateQueries({ queryKey: ["commercialConsults"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["commercialConsult", selectedId] });
    },
  });

  useEffect(() => {
    const ticketId = Number(selectedListTicket?.id || 0);
    const unreadCount = Number(selectedListTicket?.unread_count || 0);
    if (!ticketId || unreadCount <= 0) return;
    if (markedReadRef.current === ticketId) return;
    markedReadRef.current = ticketId;
    markReadM.mutate(ticketId);
  }, [selectedListTicket, markReadM]);

  const createM = useMutation({
    mutationFn: () =>
      createCommercialConsult(
        isCommercial
          ? audienceMode === "target"
            ? { subject, message: newMessage, target_user_id: selectedTarget?.id, attachment: newAttachment, reference_number: referenceNumber }
            : audienceMode === "selected"
            ? { subject, message: newMessage, target_user_ids: selectedMultiTargets.map((t) => t.id), attachment: newAttachment, reference_number: referenceNumber }
            : { subject, message: newMessage, audience: audienceMode, attachment: newAttachment, reference_number: referenceNumber }
          : { subject, message: newMessage, attachment: newAttachment, reference_number: referenceNumber }
      ),
    onSuccess: (result) => {
      setSubject("");
      setNewMessage("");
      closeNewForm();
      qc.invalidateQueries({ queryKey: ["commercialConsults"] });
      qc.invalidateQueries({ queryKey: ["commercialConsultUnreadSummary"] });
      if (result?.bulk) {
        const audienceLabel =
          result.audience === "vendedores" ? "todos los vendedores"
          : result.audience === "distribuidores" ? "todos los distribuidores"
          : "los destinatarios elegidos";
        setBulkNotice(`Se creó ${result.count} ticket(s) para ${audienceLabel}.`);
        const first = result.tickets?.[0];
        if (first) {
          setSelectedId(first.id);
          qc.setQueryData(["commercialConsult", first.id], first);
        }
      } else {
        setBulkNotice("");
        setSelectedId(result.id);
        qc.setQueryData(["commercialConsult", result.id], result);
      }
    },
  });

  const replyM = useMutation({
    mutationFn: () => addCommercialConsultMessage(selectedId, { message: replyMessage, attachment: replyAttachment }),
    onSuccess: (ticket) => {
      setReplyMessage("");
      setReplyAttachment(null);
      setReplyAttachmentError("");
      qc.invalidateQueries({ queryKey: ["commercialConsults"] });
      qc.invalidateQueries({ queryKey: ["commercialConsultUnreadSummary"] });
      qc.setQueryData(["commercialConsult", ticket.id], ticket);
    },
  });

  const closeM = useMutation({
    mutationFn: () => closeCommercialConsult(selectedId, { resolution: resolutionText, attachment: resolutionAttachment }),
    onSuccess: (ticket) => {
      setResolutionText("");
      setResolutionAttachment(null);
      setResolutionAttachmentError("");
      qc.invalidateQueries({ queryKey: ["commercialConsults"] });
      qc.invalidateQueries({ queryKey: ["commercialConsultUnreadSummary"] });
      qc.setQueryData(["commercialConsult", ticket.id], ticket);
    },
  });

  const headerText = isCommercial
    ? "Gestor de consultas comerciales"
    : "Consultas comerciales";

  const subheaderText = isCommercial
    ? "Atendé tickets pendientes, en proceso y cerrados. La primera respuesta pasa la consulta a En proceso y el cierre exige resolución final."
    : "Abrí un ticket al encargado comercial, seguí la conversación y revisá respuestas no leídas.";

  const visibleStatusButtons = isCommercial
    ? [
        ["pending", "Pendientes"],
        ["in_progress", "En proceso"],
        ["closed", "Cerradas"],
        ["all", "Todas"],
      ]
    : [
        ["open", "Abiertas"],
        ["closed", "Cerradas"],
        ["all", "Todas"],
      ];

  const detailMessages = useMemo(() => {
    return Array.isArray(selectedTicket?.messages) ? selectedTicket.messages : [];
  }, [selectedTicket]);

  if (!canAccess) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Consultas comerciales</h2>
          <div className="muted">No tenés permisos para acceder a este módulo.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>{headerText}</h2>
        <div className="muted">{subheaderText}</div>

        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {visibleStatusButtons.map(([value, label]) => (
            <Button key={value} variant={status === value ? "primary" : "ghost"} onClick={() => setStatus(value)}>
              {label}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => ticketsQ.refetch()} disabled={ticketsQ.isFetching}>↻</Button>
        </div>
      </div>

      <div className="spacer" />

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1, minWidth: 340 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>{isCommercial ? "Tickets" : "Mis tickets"}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="muted" style={{ fontSize: 12 }}>{tickets.length} item(s)</div>
              {isCommercial ? (
                <Button
                  variant={showNewForm ? "ghost" : "primary"}
                  onClick={() => (showNewForm ? closeNewForm() : setShowNewForm(true))}
                >
                  {showNewForm ? "Cancelar" : "+ Nuevo"}
                </Button>
              ) : null}
            </div>
          </div>

          {isCommercial ? (
            <>
              <div className="spacer" />
              <Input
                value={searchText}
                onChange={setSearchText}
                placeholder="Buscar por ticket, asunto, N° de venta/pedido, vendedor, distribuidor o mensaje"
                style={{ width: "100%" }}
              />
            </>
          ) : null}

          {isCommercial && showNewForm ? (
            <>
              <div className="spacer" />
              <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Nuevo ticket</div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <Button
                    variant={audienceMode === "target" ? "primary" : "ghost"}
                    onClick={() => setAudienceMode("target")}
                  >
                    Puntual
                  </Button>
                  <Button
                    variant={audienceMode === "vendedores" ? "primary" : "ghost"}
                    onClick={() => setAudienceMode("vendedores")}
                  >
                    Todos los vendedores
                  </Button>
                  <Button
                    variant={audienceMode === "distribuidores" ? "primary" : "ghost"}
                    onClick={() => setAudienceMode("distribuidores")}
                  >
                    Todos los distribuidores
                  </Button>
                  <Button
                    variant={audienceMode === "selected" ? "primary" : "ghost"}
                    onClick={() => setAudienceMode("selected")}
                  >
                    Elegir varios
                  </Button>
                </div>

                {audienceMode === "selected" ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                      <Button variant="ghost" onClick={() => setShowPicker(true)}>
                        {selectedMultiTargets.length ? "Editar destinatarios" : "Elegir destinatarios"}
                      </Button>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {selectedMultiTargets.length
                          ? `${selectedMultiTargets.length} seleccionado(s)`
                          : "Ningún destinatario elegido todavía"}
                      </div>
                    </div>
                    {selectedMultiTargets.length ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {selectedMultiTargets.map((t) => (
                          <span
                            key={t.id}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              border: "1px solid #01a39f", borderRadius: 999, padding: "4px 10px",
                              fontSize: 12, background: "rgba(1,163,159,0.06)",
                            }}
                          >
                            {t.full_name || t.username}
                            <button
                              type="button"
                              onClick={() => setSelectedMultiTargets((prev) => prev.filter((x) => x.id !== t.id))}
                              style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 800, color: "#01a39f", padding: 0, lineHeight: 1 }}
                              aria-label={`Quitar ${t.full_name || t.username}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <Input value={subject} onChange={setSubject} placeholder="Asunto" style={{ width: "100%" }} />
                    <div style={{ height: 8 }} />
                    <Input value={referenceNumber} onChange={setReferenceNumber} placeholder="N° de venta, de pedido o de presupuesto (opcional)" style={{ width: "100%" }} />
                    <div style={{ height: 8 }} />
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Describí la consulta comercial"
                      style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                    />
                    <AttachmentField
                      attachment={newAttachment}
                      error={newAttachmentError}
                      attaching={newAttaching}
                      onSelectFile={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleTicketAttachmentFile(file, { setAttachment: setNewAttachment, setError: setNewAttachmentError, setAttaching: setNewAttaching });
                        e.target.value = "";
                      }}
                      onRemove={() => { setNewAttachment(null); setNewAttachmentError(""); }}
                    />
                    <Button
                      onClick={() => createM.mutate()}
                      disabled={createM.isPending || !subject.trim() || !newMessage.trim() || !selectedMultiTargets.length}
                    >
                      {createM.isPending ? "Enviando…" : `Enviar a ${selectedMultiTargets.length || ""} destinatario(s)`}
                    </Button>
                    {createM.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{createM.error.message}</div> : null}
                  </>
                ) : audienceMode === "target" ? (
                  !selectedTarget ? (
                    <>
                      <Input
                        value={targetSearch}
                        onChange={setTargetSearch}
                        placeholder="Buscar vendedor o distribuidor (mín. 2 letras)"
                        style={{ width: "100%" }}
                        autoFocus
                      />
                      <div style={{ height: 8 }} />
                      {targetSearching ? <div className="muted" style={{ fontSize: 13 }}>Buscando…</div> : null}
                      {!targetSearching && targetSearch.trim().length >= 2 && !targetResults.length ? (
                        <div className="muted" style={{ fontSize: 13 }}>Sin resultados.</div>
                      ) : null}
                      {!targetSearching && targetResults.length ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                          {targetResults.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setSelectedTarget(r);
                                setTargetResults([]);
                                setTargetSearch("");
                              }}
                              style={{
                                textAlign: "left",
                                border: "1px solid #e6e6e6",
                                background: "#fff",
                                borderRadius: 10,
                                padding: "8px 10px",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontWeight: 700 }}>{r.full_name || r.username}</div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {r.is_distribuidor ? "Distribuidor" : "Vendedor"} · {r.username}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          border: "1px solid #01a39f",
                          borderRadius: 10,
                          padding: "8px 10px",
                          background: "rgba(1,163,159,0.06)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>{selectedTarget.full_name || selectedTarget.username}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {selectedTarget.is_distribuidor ? "Distribuidor" : "Vendedor"} · {selectedTarget.username}
                          </div>
                        </div>
                        <Button variant="ghost" onClick={() => setSelectedTarget(null)}>Cambiar</Button>
                      </div>
                      <div style={{ height: 8 }} />
                      <Input value={subject} onChange={setSubject} placeholder="Asunto" style={{ width: "100%" }} />
                      <div style={{ height: 8 }} />
                      <Input value={referenceNumber} onChange={setReferenceNumber} placeholder="N° de venta, de pedido o de presupuesto (opcional)" style={{ width: "100%" }} />
                      <div style={{ height: 8 }} />
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Describí la consulta comercial"
                        style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                      />
                      <AttachmentField
                        attachment={newAttachment}
                        error={newAttachmentError}
                        attaching={newAttaching}
                        onSelectFile={(e) => {
                          const file = e.target.files?.[0] || null;
                          handleTicketAttachmentFile(file, { setAttachment: setNewAttachment, setError: setNewAttachmentError, setAttaching: setNewAttaching });
                          e.target.value = "";
                        }}
                        onRemove={() => { setNewAttachment(null); setNewAttachmentError(""); }}
                      />
                      <Button
                        onClick={() => createM.mutate()}
                        disabled={createM.isPending || !subject.trim() || !newMessage.trim()}
                      >
                        {createM.isPending ? "Creando…" : "Crear ticket"}
                      </Button>
                      {createM.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{createM.error.message}</div> : null}
                    </>
                  )
                ) : (
                  <>
                    <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                      {audienceMode === "vendedores"
                        ? "Se creará un ticket individual para cada vendedor activo."
                        : "Se creará un ticket individual para cada distribuidor activo."}
                    </div>
                    <Input value={subject} onChange={setSubject} placeholder="Asunto" style={{ width: "100%" }} />
                    <div style={{ height: 8 }} />
                    <Input value={referenceNumber} onChange={setReferenceNumber} placeholder="N° de venta, de pedido o de presupuesto (opcional)" style={{ width: "100%" }} />
                    <div style={{ height: 8 }} />
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Describí la consulta comercial"
                      style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                    />
                    <AttachmentField
                      attachment={newAttachment}
                      error={newAttachmentError}
                      attaching={newAttaching}
                      onSelectFile={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleTicketAttachmentFile(file, { setAttachment: setNewAttachment, setError: setNewAttachmentError, setAttaching: setNewAttaching });
                        e.target.value = "";
                      }}
                      onRemove={() => { setNewAttachment(null); setNewAttachmentError(""); }}
                    />
                    <Button
                      onClick={() => createM.mutate()}
                      disabled={createM.isPending || !subject.trim() || !newMessage.trim()}
                    >
                      {createM.isPending
                        ? "Enviando…"
                        : audienceMode === "vendedores"
                        ? "Enviar a todos los vendedores"
                        : "Enviar a todos los distribuidores"}
                    </Button>
                    {createM.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{createM.error.message}</div> : null}
                  </>
                )}
              </div>
            </>
          ) : null}

          {isCommercial && bulkNotice ? (
            <>
              <div className="spacer" />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid #1f7a45",
                  background: "#eaf8ef",
                  color: "#1f7a45",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontSize: 13,
                }}
              >
                <span>{bulkNotice}</span>
                <button
                  type="button"
                  onClick={() => setBulkNotice("")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#1f7a45", fontWeight: 800 }}
                >
                  ×
                </button>
              </div>
            </>
          ) : null}

          {isRequester ? (
            <>
              <div className="spacer" />
              <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Nueva consulta</div>
                <Input value={subject} onChange={setSubject} placeholder="Asunto" style={{ width: "100%" }} />
                <div style={{ height: 8 }} />
                <Input value={referenceNumber} onChange={setReferenceNumber} placeholder="N° de venta, de pedido o de presupuesto (opcional)" style={{ width: "100%" }} />
                <div style={{ height: 8 }} />
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Describí la consulta comercial"
                  style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                />
                <AttachmentField
                  attachment={newAttachment}
                  error={newAttachmentError}
                  attaching={newAttaching}
                  onSelectFile={(e) => {
                    const file = e.target.files?.[0] || null;
                    handleTicketAttachmentFile(file, { setAttachment: setNewAttachment, setError: setNewAttachmentError, setAttaching: setNewAttaching });
                    e.target.value = "";
                  }}
                  onRemove={() => { setNewAttachment(null); setNewAttachmentError(""); }}
                />
                <Button
                  onClick={() => createM.mutate()}
                  disabled={createM.isPending || !subject.trim() || !newMessage.trim()}
                >
                  {createM.isPending ? "Creando…" : "Crear ticket"}
                </Button>
                {createM.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{createM.error.message}</div> : null}
              </div>
            </>
          ) : null}

          <div className="spacer" />

          {ticketsQ.isLoading ? <div className="muted">Cargando…</div> : null}
          {ticketsQ.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{ticketsQ.error.message}</div> : null}
          {!ticketsQ.isLoading && !tickets.length ? <div className="muted">Sin consultas para mostrar.</div> : null}

          {!!tickets.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tickets.map((ticket) => {
                const isSelected = String(ticket.id) === String(selectedId);
                const tone = statusTone(ticket.status);
                const unreadCount = Number(ticket.unread_count || 0);
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      markedReadRef.current = 0;
                      setSelectedId(ticket.id);
                    }}
                    style={{
                      textAlign: "left",
                      border: isSelected ? "2px solid #01a39f" : "1px solid #e6e6e6",
                      background: isSelected ? "rgba(1,163,159,0.06)" : "#fff",
                      borderRadius: 14,
                      padding: 12,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>#{ticket.id} · {ticket.subject}</div>
                        {ticket.reference_number ? (
                          <div style={{ display: "inline-block", marginTop: 4, padding: "1px 8px", borderRadius: 999, border: "1px solid #01a39f", color: "#01a39f", fontSize: 11, fontWeight: 800 }}>
                            {ticket.reference_number}
                          </div>
                        ) : null}
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {isCommercial ? `${ticket.created_by_name} · ${ticket.created_by_role}` : fmtDateTime(ticket.created_at)}
                        </div>
                        {ticket.on_behalf_of_name ? (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            Dirigido a: {ticket.on_behalf_of_name}
                          </div>
                        ) : null}
                      </div>
                      <div
                        style={{
                          padding: "4px 9px",
                          borderRadius: 999,
                          border: `1px solid ${tone.border}`,
                          background: tone.background,
                          color: tone.color,
                          fontSize: 12,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {statusLabel(ticket.status)}
                      </div>
                    </div>

                    {ticket.last_message_text ? (
                      <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                        {String(ticket.last_message_text).slice(0, 180)}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8 }}>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Último mov.: {fmtDateTime(ticket.last_message_at || ticket.updated_at || ticket.created_at)}
                      </div>
                      {unreadCount > 0 ? (
                        <div
                          style={{
                            minWidth: 24,
                            height: 24,
                            borderRadius: 999,
                            background: "#d93025",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 800,
                            padding: "0 8px",
                          }}
                          title={`${unreadCount} mensaje(s) sin leer`}
                        >
                          {unreadCount}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="card" style={{ flex: 2, minWidth: 520 }}>
          {!selectedId ? (
            <div className="muted">Seleccioná una consulta para ver la conversación.</div>
          ) : null}

          {detailQ.isLoading ? <div className="muted">Cargando conversación…</div> : null}
          {detailQ.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{detailQ.error.message}</div> : null}

          {selectedTicket ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 4 }}>#{selectedTicket.id} · {selectedTicket.subject}</h3>
                  {selectedTicket.reference_number ? (
                    <div style={{ display: "inline-block", marginBottom: 6, padding: "2px 10px", borderRadius: 999, border: "1px solid #01a39f", color: "#01a39f", fontSize: 12, fontWeight: 800 }}>
                      {selectedTicket.reference_number}
                    </div>
                  ) : null}
                  <div className="muted" style={{ fontSize: 13 }}>
                    Creada por {selectedTicket.created_by_name} ({selectedTicket.created_by_role}) · {fmtDateTime(selectedTicket.created_at)}
                  </div>
                  {selectedTicket.on_behalf_of_name ? (
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      Dirigido a: {selectedTicket.on_behalf_of_name}
                    </div>
                  ) : null}
                  {selectedTicket.assigned_to_name ? (
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      Encargado asignado: {selectedTicket.assigned_to_name}
                    </div>
                  ) : null}
                  {selectedTicket.closed_at ? (
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      Cerrada por {selectedTicket.closed_by_name || "Enc. Comercial"} · {fmtDateTime(selectedTicket.closed_at)}
                    </div>
                  ) : null}
                </div>
                <div
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${statusTone(selectedTicket.status).border}`,
                    background: statusTone(selectedTicket.status).background,
                    color: statusTone(selectedTicket.status).color,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  {statusLabel(selectedTicket.status)}
                </div>
              </div>

              <div className="spacer" />

              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
                {detailMessages.map((message) => {
                  const isOwn = Number(message.author_user_id || 0) === Number(user?.user_id || user?.id || 0);
                  const isResolution = String(message.message_type || "message") === "resolution";
                  return (
                    <div key={message.id} style={messageBubbleStyle(isOwn, isResolution)}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                        <div style={{ fontWeight: 800 }}>
                          {message.author_name}
                          <span className="muted" style={{ fontWeight: 400 }}> · {message.author_role}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(message.created_at)}</div>
                      </div>
                      {isResolution ? <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Resolución final</div> : null}
                      <div style={{ whiteSpace: "pre-wrap" }}>{message.message_text}</div>
                      <MessageAttachment attachment={message.attachment} />
                    </div>
                  );
                })}
              </div>

              {selectedTicket.can_reply ? (
                <>
                  <div className="spacer" />
                  <div style={{ borderTop: "1px solid #eee", paddingTop: 16 }}>
                    <div className="muted" style={{ marginBottom: 8 }}>{isCommercial ? "Responder consulta" : "Enviar respuesta"}</div>
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder={isCommercial ? "Escribí la respuesta comercial" : "Escribí tu mensaje"}
                      style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                    />
                    <AttachmentField
                      attachment={replyAttachment}
                      error={replyAttachmentError}
                      attaching={replyAttaching}
                      onSelectFile={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleTicketAttachmentFile(file, { setAttachment: setReplyAttachment, setError: setReplyAttachmentError, setAttaching: setReplyAttaching });
                        e.target.value = "";
                      }}
                      onRemove={() => { setReplyAttachment(null); setReplyAttachmentError(""); }}
                    />
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button onClick={() => replyM.mutate()} disabled={replyM.isPending || !replyMessage.trim()}>
                        {replyM.isPending ? "Enviando…" : "Enviar mensaje"}
                      </Button>
                    </div>
                    {replyM.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{replyM.error.message}</div> : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="spacer" />
                  <div className="muted">La consulta está cerrada. Ya no se pueden enviar más mensajes.</div>
                </>
              )}

              {isCommercial && selectedTicket.status !== "closed" ? (
                <>
                  <div className="spacer" />
                  <div style={{ borderTop: "1px solid #eee", paddingTop: 16 }}>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Cerrar consulta</div>
                    <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                      Para cerrar, la resolución final se guarda como último mensaje y bloquea nuevas respuestas del vendedor/distribuidor.
                    </div>
                    <textarea
                      value={resolutionText}
                      onChange={(e) => setResolutionText(e.target.value)}
                      placeholder="Detalle de la resolución final"
                      style={{ width: "100%", minHeight: 110, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                    />
                    <AttachmentField
                      attachment={resolutionAttachment}
                      error={resolutionAttachmentError}
                      attaching={resolutionAttaching}
                      onSelectFile={(e) => {
                        const file = e.target.files?.[0] || null;
                        handleTicketAttachmentFile(file, { setAttachment: setResolutionAttachment, setError: setResolutionAttachmentError, setAttaching: setResolutionAttaching });
                        e.target.value = "";
                      }}
                      onRemove={() => { setResolutionAttachment(null); setResolutionAttachmentError(""); }}
                    />
                    <div style={{ marginTop: 8 }}>
                      <Button variant="ghost" onClick={() => closeM.mutate()} disabled={closeM.isPending || !resolutionText.trim()}>
                        {closeM.isPending ? "Cerrando…" : "Cerrar con resolución"}
                      </Button>
                    </div>
                    {closeM.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{closeM.error.message}</div> : null}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {isCommercial ? (
        <RequesterPickerModal
          open={showPicker}
          role={pickerRole}
          onRoleChange={setPickerRole}
          requesters={pickerQ.data || []}
          isLoading={pickerQ.isLoading}
          error={pickerQ.isError ? pickerQ.error.message : ""}
          initialSelectedIds={selectedMultiTargets.map((t) => t.id)}
          onClose={() => setShowPicker(false)}
          onConfirm={(ids) => {
            const byId = new Map((pickerQ.data || []).map((r) => [r.id, r]));
            setSelectedMultiTargets(ids.map((id) => byId.get(id)).filter(Boolean));
            setShowPicker(false);
          }}
        />
      ) : null}
    </div>
  );
}

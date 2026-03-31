import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import {
  addTechnicalConsultMessage,
  closeTechnicalConsult,
  createTechnicalConsult,
  getTechnicalConsult,
  listTechnicalConsults,
  markTechnicalConsultRead,
} from "../../api/technicalConsults.js";

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
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export default function TechnicalConsultsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const markedReadRef = useRef(0);

  const isTechnical = !!(user?.is_superuser || user?.is_rev_tecnica);
  const isRequester = !!(!isTechnical && (user?.is_vendedor || user?.is_distribuidor));
  const canAccess = isTechnical || isRequester;

  const [status, setStatus] = useState(isTechnical ? "pending" : "open");
  const [selectedId, setSelectedId] = useState(null);
  const [subject, setSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    setStatus(isTechnical ? "pending" : "open");
  }, [isTechnical]);

  const scope = isTechnical ? "technical" : "mine";

  const ticketsQ = useQuery({
    queryKey: ["technicalConsults", scope, status],
    queryFn: () => listTechnicalConsults({ scope, status }),
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
        ticket.created_by_name,
        ticket.created_by_role,
        ticket.created_by_username,
        ticket.assigned_to_name,
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
    queryKey: ["technicalConsult", selectedId],
    queryFn: () => getTechnicalConsult(selectedId),
    enabled: canAccess && !!selectedId,
    refetchInterval: 10000,
  });

  const selectedTicket = detailQ.data || null;

  const markReadM = useMutation({
    mutationFn: (ticketId) => markTechnicalConsultRead(ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technicalConsultUnreadSummary"] });
      qc.invalidateQueries({ queryKey: ["technicalConsults"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["technicalConsult", selectedId] });
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
    mutationFn: () => createTechnicalConsult({ subject, message: newMessage }),
    onSuccess: (ticket) => {
      setSubject("");
      setNewMessage("");
      setSelectedId(ticket.id);
      qc.invalidateQueries({ queryKey: ["technicalConsults"] });
      qc.invalidateQueries({ queryKey: ["technicalConsultUnreadSummary"] });
      qc.setQueryData(["technicalConsult", ticket.id], ticket);
    },
  });

  const replyM = useMutation({
    mutationFn: () => addTechnicalConsultMessage(selectedId, { message: replyMessage }),
    onSuccess: (ticket) => {
      setReplyMessage("");
      qc.invalidateQueries({ queryKey: ["technicalConsults"] });
      qc.invalidateQueries({ queryKey: ["technicalConsultUnreadSummary"] });
      qc.setQueryData(["technicalConsult", ticket.id], ticket);
    },
  });

  const closeM = useMutation({
    mutationFn: () => closeTechnicalConsult(selectedId, { resolution: resolutionText }),
    onSuccess: (ticket) => {
      setResolutionText("");
      qc.invalidateQueries({ queryKey: ["technicalConsults"] });
      qc.invalidateQueries({ queryKey: ["technicalConsultUnreadSummary"] });
      qc.setQueryData(["technicalConsult", ticket.id], ticket);
    },
  });

  const headerText = isTechnical
    ? "Gestor de consultas técnicas"
    : "Consultas técnicas";

  const subheaderText = isTechnical
    ? "Atendé tickets pendientes, en proceso y cerrados. La primera respuesta pasa la consulta a En proceso y el cierre exige resolución final."
    : "Abrí un ticket al encargado técnico, seguí la conversación y revisá respuestas no leídas.";

  const visibleStatusButtons = isTechnical
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
          <h2 style={{ marginTop: 0 }}>Consultas técnicas</h2>
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
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>{isTechnical ? "Tickets" : "Mis tickets"}</h3>
            <div className="muted" style={{ fontSize: 12 }}>{tickets.length} item(s)</div>
          </div>

          {isTechnical ? (
            <>
              <div className="spacer" />
              <Input
                value={searchText}
                onChange={setSearchText}
                placeholder="Buscar por ticket, asunto, vendedor, distribuidor o mensaje"
                style={{ width: "100%" }}
              />
            </>
          ) : null}

          {isRequester ? (
            <>
              <div className="spacer" />
              <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Nueva consulta</div>
                <Input value={subject} onChange={setSubject} placeholder="Asunto" style={{ width: "100%" }} />
                <div style={{ height: 8 }} />
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Describí la consulta técnica"
                  style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                />
                <div style={{ height: 8 }} />
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
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {isTechnical ? `${ticket.created_by_name} · ${ticket.created_by_role}` : fmtDateTime(ticket.created_at)}
                        </div>
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
                  <div className="muted" style={{ fontSize: 13 }}>
                    Creada por {selectedTicket.created_by_name} ({selectedTicket.created_by_role}) · {fmtDateTime(selectedTicket.created_at)}
                  </div>
                  {selectedTicket.assigned_to_name ? (
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      Técnico asignado: {selectedTicket.assigned_to_name}
                    </div>
                  ) : null}
                  {selectedTicket.closed_at ? (
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      Cerrada por {selectedTicket.closed_by_name || "Rev. Técnica"} · {fmtDateTime(selectedTicket.closed_at)}
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
                    </div>
                  );
                })}
              </div>

              {selectedTicket.can_reply ? (
                <>
                  <div className="spacer" />
                  <div style={{ borderTop: "1px solid #eee", paddingTop: 16 }}>
                    <div className="muted" style={{ marginBottom: 8 }}>{isTechnical ? "Responder consulta" : "Enviar respuesta"}</div>
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder={isTechnical ? "Escribí la respuesta técnica" : "Escribí tu mensaje"}
                      style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
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

              {isTechnical && selectedTicket.status !== "closed" ? (
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
    </div>
  );
}

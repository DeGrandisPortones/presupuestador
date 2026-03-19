import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import PaginationControls from "../../ui/PaginationControls.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { listDoors } from "../../api/doors.js";
import { listQuotes, requestProductionFromAcopio } from "../../api/quotes.js";

const PAGE_SIZE = 25;

function labelMeasurementStatus(q) {
  const s = String(q?.measurement_status || "none").toLowerCase();
  if (s === "pending") return "Pendiente";
  if (s === "submitted") return "Realizada";
  if (s === "needs_fix") return "Realizada / corregir";
  if (s === "approved") return "Realizada";
  if (s === "none") return "—";
  return s;
}

function labelQuoteStatus(q) {
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
  return String(q?.catalog_kind || "porton").toLowerCase() === "ipanel" ? "Ipanel" : "Portón";
}

function doorTypeLabel() {
  return "Puerta";
}

function localityLabelFromQuote(q) {
  return q?.end_customer?.city || "—";
}

function localityLabelFromDoor(d) {
  return d?.record?.end_customer?.city || "—";
}

function normalizeSearch(text) {
  return String(text || "").trim().toLowerCase();
}

function matchesRowSearch(item, searchText) {
  const s = normalizeSearch(searchText);
  if (!s) return true;

  if (item.rowKind === "door") {
    const d = item.raw;
    const haystack = [
      doorTypeLabel(),
      d?.door_code,
      d?.record?.end_customer?.name,
      d?.record?.end_customer?.city,
      d?.record?.end_customer?.address,
      d?.record?.end_customer?.phone,
      d?.record?.obra_cliente,
      d?.linked_quote_odoo_name,
      d?.record?.asociado_porton,
      d?.record?.ipanel_quote_id,
      d?.record?.ipanel_quote_label,
      labelDoorStatus(d),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(s);
  }

  const q = item.raw;
  const haystack = [
    quoteTypeLabel(q),
    q?.end_customer?.name,
    q?.end_customer?.city,
    q?.end_customer?.address,
    q?.end_customer?.phone,
    labelQuoteStatus(q),
    q?.fulfillment_mode === "acopio" ? "acopio" : "produccion",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(s);
}

function toTimeDesc(value) {
  if (!value) return 0;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getTime();
}

function isQuoteSaved(q) {
  return q?.status === "draft" && q?.commercial_decision === "pending" && q?.technical_decision === "pending";
}

function isQuotePending(q) {
  return q?.status === "pending_approvals" && (q?.commercial_decision === "pending" || q?.technical_decision === "pending");
}

function isQuoteRejected(q) {
  return q?.status === "draft" && (q?.commercial_decision === "rejected" || q?.technical_decision === "rejected");
}

function isDoorSaved(d) {
  return d?.status === "draft" && d?.commercial_decision === "pending" && d?.technical_decision === "pending";
}

function isDoorPending(d) {
  return d?.status === "pending_approvals" && (d?.commercial_decision === "pending" || d?.technical_decision === "pending");
}

function isDoorRejected(d) {
  return d?.status === "draft" && (d?.commercial_decision === "rejected" || d?.technical_decision === "rejected");
}

function fmtDate(value) {
  if (!value) return "—";
  const raw = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}

function TypeBadge({ label }) {
  const isDoor = label === "Puerta";
  const isIpanel = label === "Ipanel";

  let background = "#eef2ff";
  let color = "#3730a3";

  if (isDoor) {
    background = "#f5f3ff";
    color = "#6b21a8";
  } else if (isIpanel) {
    background = "#ecfeff";
    color = "#155e75";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export default function PresupuestosPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const quotesQ = useQuery({
    queryKey: ["quotes", "mine"],
    queryFn: () => listQuotes({ scope: "mine" }),
  });

  const doorsQ = useQuery({
    queryKey: ["doors", "mine", "presupuestos"],
    queryFn: () => listDoors({ scope: "mine" }),
    enabled: !!user?.is_vendedor,
  });

  const qc = useQueryClient();

  const moveM = useMutation({
    mutationFn: (id) => requestProductionFromAcopio(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes", "mine"] }),
  });

  const linkedDoorQuoteIds = useMemo(() => {
    return new Set((doorsQ.data || []).map((d) => String(d?.linked_quote_id || "").trim()).filter(Boolean));
  }, [doorsQ.data]);

  useEffect(() => {
    setPage(1);
  }, [filter, searchText]);

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
    }));

    const merged = [...quoteRows, ...doorRows];
    merged.sort((a, b) => toTimeDesc(b.createdAt) - toTimeDesc(a.createdAt));

    let filtered = merged;

    if (filter === "saved") {
      filtered = filtered.filter((item) => (item.rowKind === "door" ? isDoorSaved(item.raw) : isQuoteSaved(item.raw)));
    } else if (filter === "pending") {
      filtered = filtered.filter((item) => (item.rowKind === "door" ? isDoorPending(item.raw) : isQuotePending(item.raw)));
    } else if (filter === "rejected") {
      filtered = filtered.filter((item) => (item.rowKind === "door" ? isDoorRejected(item.raw) : isQuoteRejected(item.raw)));
    } else if (filter === "acopio") {
      filtered = filtered.filter((item) => item.rowKind === "quote" && item.raw?.fulfillment_mode === "acopio" && item.raw?.status !== "draft");
    } else if (filter === "produccion") {
      filtered = filtered.filter((item) => item.rowKind === "quote" && item.raw?.fulfillment_mode === "produccion" && item.raw?.status !== "draft");
    } else if (filter === "mediciones") {
      filtered = filtered.filter(
        (item) =>
          item.rowKind === "quote"
          && item.raw?.fulfillment_mode === "produccion"
          && item.raw?.status !== "draft"
          && item.raw?.requires_measurement === true,
      );
    }

    return filtered.filter((item) => matchesRowSearch(item, searchText));
  }, [quotesQ.data, doorsQ.data, filter, searchText]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [rows.length, page]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  const isLoading = quotesQ.isLoading || doorsQ.isLoading;
  const error = quotesQ.error || doorsQ.error;

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Mis presupuestos</h2>
        <div className="muted">Portones, Ipanel y puertas, con seguimiento de estados, acopio, producción y mediciones</div>

        <div className="spacer" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={filter === "all" ? "primary" : "ghost"} onClick={() => setFilter("all")}>Todos</Button>
          <Button variant={filter === "saved" ? "primary" : "ghost"} onClick={() => setFilter("saved")}>Guardados</Button>
          <Button variant={filter === "pending" ? "primary" : "ghost"} onClick={() => setFilter("pending")}>Pendientes</Button>
          <Button variant={filter === "rejected" ? "primary" : "ghost"} onClick={() => setFilter("rejected")}>Rechazados</Button>
          <Button variant={filter === "acopio" ? "primary" : "ghost"} onClick={() => setFilter("acopio")}>Portones en Acopio</Button>
          <Button variant={filter === "produccion" ? "primary" : "ghost"} onClick={() => setFilter("produccion")}>Portones en Producción</Button>
          <Button variant={filter === "mediciones" ? "primary" : "ghost"} onClick={() => setFilter("mediciones")}>Portones en Medición</Button>
        </div>

        <div className="spacer" />

        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Buscar por tipo, cliente, localidad, dirección, teléfono, código o estado…"
          style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
        />
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
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Localidad</th>
                  <th>Estado</th>
                  <th>Destino</th>
                  {filter === "mediciones" ? <th>Fecha medición</th> : null}
                  {filter === "mediciones" ? <th>Estado medición</th> : null}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item) => {
                  if (item.rowKind === "door") {
                    const door = item.raw;
                    return (
                      <tr key={`door-${door.id}`}>
                        <td>{fmtDate(item.createdAt)}</td>
                        <td><TypeBadge label={item.typeLabel} /></td>
                        <td>{item.clientName || <span className="muted">(sin nombre)</span>}</td>
                        <td>{item.locality}</td>
                        <td>{item.statusLabel}</td>
                        <td>{item.destinationLabel}</td>
                        {filter === "mediciones" ? <td>—</td> : null}
                        {filter === "mediciones" ? <td>—</td> : null}
                        <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                          <Button variant="ghost" onClick={() => navigate(`/puertas/${door.id}`)}>Abrir puerta</Button>
                          {door.linked_quote_id ? (
                            <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>Ver portón</Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  }

                  const r = item.raw;
                  const canRequestProduction =
                    r.fulfillment_mode === "acopio"
                    && r.status === "synced_odoo"
                    && r.acopio_to_produccion_status !== "pending";
                  const hasFinal = !!r.final_copy_id;
                  const finalDraft = hasFinal && !["syncing_odoo", "synced_odoo"].includes(String(r.final_copy_status || ""));
                  const canAddDoor = String(r?.catalog_kind || "porton").toLowerCase() === "porton" && r.status === "draft" && !linkedDoorQuoteIds.has(String(r.id));

                  return (
                    <tr key={r.id}>
                      <td>{fmtDate(r.created_at)}</td>
                      <td><TypeBadge label={item.typeLabel} /></td>
                      <td>{r.end_customer?.name || <span className="muted">(sin nombre)</span>}</td>
                      <td>{item.locality}</td>
                      <td>{item.statusLabel}</td>
                      <td>{item.destinationLabel}</td>
                      {filter === "mediciones" ? <td>{item.measurementDate}</td> : null}
                      {filter === "mediciones" ? <td>{item.measurementStatus}</td> : null}
                      <td className="right" style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                        <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.id}`)}>Ver original</Button>
                        {r.status === "draft" && (
                          <Button onClick={() => navigate(r.catalog_kind === "ipanel" ? `/cotizador/ipanel/${r.id}` : `/cotizador/${r.id}`)}>Editar</Button>
                        )}
                        {canAddDoor ? (
                          <Button variant="ghost" onClick={() => navigate(`/puertas/nuevo/${r.id}`)}>Agregar puerta</Button>
                        ) : null}
                        {hasFinal ? (
                          <>
                            <Button variant="ghost" onClick={() => navigate(`/presupuestos/${r.final_copy_id}`)}>Ver final</Button>
                            {finalDraft ? (
                              <Button onClick={() => navigate(r.catalog_kind === "ipanel" ? `/cotizador/ipanel/${r.final_copy_id}` : `/cotizador/${r.final_copy_id}`)}>
                                Editar final
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {filter === "acopio" && (
                          <Button
                            disabled={moveM.isPending || !canRequestProduction}
                            title={canRequestProduction ? "Solicitar paso a Producción" : "Solo disponible cuando el presupuesto original ya fue aprobado y enviado a Odoo"}
                            onClick={() => moveM.mutate(r.id)}
                          >
                            {r.acopio_to_produccion_status === "pending" ? "Solicitud en revisión" : "Solicitar paso a Producción"}
                          </Button>
                        )}
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
    </div>
  );
}

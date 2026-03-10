import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import { getQuote, reviewCommercial, reviewTechnical, createRevisionQuote } from "../../api/quotes.js";
import { downloadMedicionPdf } from "../../api/pdf.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { formatARS } from "../../domain/quote/pricing.js";
import MeasurementReadOnlyView from "../../components/MeasurementReadOnlyView.jsx";

function pillStyle(bg, border) {
  return { padding: "2px 8px", borderRadius: 999, background: bg, border: `1px solid ${border}`, fontSize: 12, fontWeight: 800 };
}

function measurementStatusLabel(s) {
  if (s === "pending") return "Pendiente";
  if (s === "submitted") return "Enviada (esperando revisión)";
  if (s === "needs_fix") return "A corregir";
  if (s === "approved") return "Aprobada";
  if (s === "none" || !s) return "Pendiente";
  return s;
}

function hasMeasurementForPdf(q) {
  return !!q?.measurement_form || !!q?.measurement_source_quote_id || ["submitted", "needs_fix", "approved"].includes(q?.measurement_status);
}

function decisionLabel(d) {
  if (d === "approved") return "Aprobado";
  if (d === "rejected") return "Rechazado";
  return "Pendiente";
}

export default function QuoteDetailPage() {
  const params = useParams();
  const quoteId = params.id ? String(params.id) : null;

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => getQuote(quoteId),
    enabled: !!quoteId,
  });

  const quote = q.data;

  const canCommercial = !!user?.is_enc_comercial && quote?.created_by_role === "vendedor";
  const canTech = !!user?.is_rev_tecnica;

  const canCommercialAct =
    canCommercial &&
    quote?.status === "pending_approvals" &&
    quote?.commercial_decision === "pending";

  const canTechAct =
    canTech &&
    quote?.status === "pending_approvals" &&
    quote?.technical_decision === "pending";

  const showMeasurement =
    !!quote?.requires_measurement ||
    (quote?.catalog_kind === "porton" && quote?.status === "synced_odoo" && quote?.fulfillment_mode === "produccion");

  const commercialM = useMutation({
    mutationFn: ({ action }) => reviewCommercial(quoteId, { action, notes }),
    onSuccess: () => q.refetch(),
  });

  const revisionM = useMutation({
    mutationFn: () => createRevisionQuote(quoteId),
    onSuccess: (newQuote) => {
      if (!newQuote?.id) return;
      navigate(newQuote.catalog_kind === "ipanel" ? `/cotizador/ipanel/${newQuote.id}` : `/cotizador/${newQuote.id}`);
    },
  });

  const techM = useMutation({
    mutationFn: ({ action }) => reviewTechnical(quoteId, { action, notes }),
    onSuccess: () => q.refetch(),
  });

  const lines = Array.isArray(quote?.lines) ? quote.lines : [];

  const rejectionBoxes = useMemo(() => {
    if (!quote) return [];
    const arr = [];
    if (quote.commercial_decision === "rejected") {
      arr.push({ title: "Rechazo Comercial", body: quote.commercial_notes || "(sin motivo)" });
    }
    if (quote.technical_decision === "rejected") {
      arr.push({ title: "Rechazo Técnica", body: quote.technical_notes || "(sin motivo)" });
    }
    return arr;
  }, [quote]);

  const showCrossNoticeCommercial = canCommercial && quote?.technical_decision === "rejected";
  const showCrossNoticeTech = canTech && quote?.commercial_decision === "rejected";

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>
          Presupuesto #{quoteId ? String(quoteId).slice(0, 8) : "—"}
        </h2>

        {quote?.original_quote_id && String(quote.original_quote_id) !== String(quote.id) && (
          <div className="muted" style={{ marginTop: 6 }}>
            Relacionado a:
            <Button
              variant="ghost"
              style={{ marginLeft: 6 }}
              onClick={() => navigate(`/presupuestos/${quote.original_quote_id}`)}
              title="Abrir presupuesto original"
            >
              #{String(quote.original_quote_id).slice(0, 8)}
            </Button>
          </div>
        )}

        {q.isLoading && <div className="muted">Cargando...</div>}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}

        {quote && (
          <>
            <div className="spacer" />

            <div className="muted" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span>
                Estado: <b>{quote.status}</b>
              </span>
              <span>· Creado por: <b>{quote.created_by_role}</b></span>
              <span>
                · Destino: <b>{quote.fulfillment_mode === "acopio" ? "Acopio" : "Producción"}</b>
              </span>

              {quote.status === "synced_odoo" && (
                <span style={pillStyle("#e7f7ed", "#bfe6c8")}>
                  En Odoo: {quote.odoo_sale_order_name || `SO#${quote.odoo_sale_order_id}`}
                </span>
              )}
              {quote.status === "syncing_odoo" && (
                <span style={pillStyle("#fff7e6", "#ffd9a8")}>
                  Sincronizando a Odoo…
                </span>
              )}
              {quote.status === "pending_approvals" && (
                <span style={pillStyle("#eef4ff", "#c7dafc")}>
                  En aprobación
                </span>
              )}
              {quote.status === "draft" && (quote.commercial_decision === "rejected" || quote.technical_decision === "rejected") && (
                <span style={pillStyle("#fff5f5", "#f2c1be")}>
                  Rechazado (para corregir)
                </span>
              )}
            </div>

            {(showCrossNoticeCommercial || showCrossNoticeTech) && (
              <>
                <div className="spacer" />
                <div style={{ padding: 10, borderRadius: 10, border: "1px solid #ffe3a3", background: "#fff7e6" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Aviso</div>
                  {showCrossNoticeCommercial && (
                    <div>
                      Técnica lo rechazó: <b>{quote.technical_notes || "(sin motivo)"}</b>
                    </div>
                  )}
                  {showCrossNoticeTech && (
                    <div>
                      Comercial lo rechazó: <b>{quote.commercial_notes || "(sin motivo)"}</b>
                    </div>
                  )}
                </div>
              </>
            )}

            {!!rejectionBoxes.length && (
              <>
                <div className="spacer" />
                {rejectionBoxes.map((b) => (
                  <div key={b.title} style={{ padding: 10, borderRadius: 10, border: "1px solid #f2c1be", background: "#fff5f5", marginBottom: 10 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>{b.title}</div>
                    <div>{b.body}</div>
                  </div>
                ))}
              </>
            )}

            <div className="spacer" />

            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="muted">Cliente</div>
                <div style={{ fontWeight: 700 }}>{quote.end_customer?.name || "(sin nombre)"}</div>
                <div className="muted">{quote.end_customer?.phone || ""}</div>
                <div className="muted">{quote.end_customer?.address || ""}</div>
              </div>

              <div style={{ flex: 1 }}>
                <div className="muted">Observaciones</div>
                <div>{quote.note || <span className="muted">(sin notas)</span>}</div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                {quote.status === "draft" && (
                  <Button onClick={() => navigate((quote.catalog_kind || "porton") === "ipanel" ? `/cotizador/ipanel/${quote.id}` : `/cotizador/${quote.id}`)}>Editar</Button>
                )}
                {((user?.is_vendedor || user?.is_distribuidor) && String(quote.created_by_user_id) === String(user.user_id) && quote.status === "synced_odoo" && hasMeasurementForPdf(quote)) && (
                  <Button
                    variant="ghost"
                    disabled={revisionM.isPending}
                    onClick={() => revisionM.mutate()}
                    title="Crear un nuevo presupuesto (ajuste) referenciado a este"
                  >
                    {revisionM.isPending ? "Creando…" : "Crear ajuste"}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => navigate("/presupuestos")}>Volver</Button>
              </div>
            </div>

            <div className="spacer" />

            <div className="card" style={{ background: "#fafafa" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Aprobaciones</div>
              <div className="muted" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>
                  Comercial: <b>{decisionLabel(quote.commercial_decision)}</b>
                  {quote.commercial_decision === "rejected" && quote.commercial_notes ? ` · ${quote.commercial_notes}` : ""}
                </span>
                <span>
                  Técnica: <b>{decisionLabel(quote.technical_decision)}</b>
                  {quote.technical_decision === "rejected" && quote.technical_notes ? ` · ${quote.technical_notes}` : ""}
                </span>
              </div>
            </div>

            <div className="spacer" />

            {showMeasurement && (
              <>
                <div className="spacer" />

                <div className="card" style={{ background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>Planilla de medición</div>
                      <div className="muted">
                        Estado: <b>{measurementStatusLabel(quote.measurement_status)}</b>
                        {quote.measurement_status === "needs_fix" && quote.measurement_review_notes ? ` · ${quote.measurement_review_notes}` : ""}
                      </div>
                    </div>

                    {hasMeasurementForPdf(quote) && (
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <Button variant="secondary" onClick={() => downloadMedicionPdf(quote.id)}>
                          Descargar PDF
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="spacer" />

                  {!hasMeasurementForPdf(quote) && (
                    <div className="muted">Todavía no hay medición cargada.</div>
                  )}

                  {quote.measurement_form && <MeasurementReadOnlyView quote={quote} />}
                </div>
              </>
            )}

            <h3 style={{ marginTop: 0 }}>Ítems</h3>
            {!lines.length && <div className="muted">Sin ítems</div>}

            {!!lines.length && (
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="right">Cant.</th>
                    <th className="right">Base</th>
                    <th className="right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const qty = Number(l.qty || 0);
                    const base = Number(l.basePrice ?? l.price ?? 0);
                    const total = qty * base;

                    return (
                      <tr key={idx}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{l.name || `Producto ${l.product_id}`}</div>
                          <div className="muted">ID: {l.product_id} {l.code ? `| ${l.code}` : ""}</div>
                        </td>
                        <td className="right">{qty}</td>
                        <td className="right">{formatARS(base)}</td>
                        <td className="right" style={{ fontWeight: 800 }}>{formatARS(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {(canCommercial || canTech) && (
              <>
                <div className="spacer" />

                <div className="card" style={{ background: "#fafafa" }}>
                  <div style={{ fontWeight: 900 }}>Acciones de revisión</div>
                  <div className="muted">Solo si está en <b>pending_approvals</b> y tu decisión está en <b>pending</b>.</div>

                  <div className="spacer" />

                  <div className="muted">Observaciones del revisor</div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Motivo si rechaza / notas si aprueba…"
                    style={{
                      width: "100%",
                      minHeight: 60,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />

                  <div className="spacer" />

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canCommercial && (
                      <>
                        <Button
                          disabled={!canCommercialAct || commercialM.isPending}
                          title={!canCommercialAct ? "No disponible" : ""}
                          onClick={() => commercialM.mutate({ action: "approve" })}
                        >
                          {commercialM.isPending ? "Procesando..." : "Aprobar Comercial"}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={!canCommercialAct || commercialM.isPending}
                          title={!canCommercialAct ? "No disponible" : ""}
                          onClick={() => commercialM.mutate({ action: "reject" })}
                        >
                          Rechazar Comercial
                        </Button>
                      </>
                    )}

                    {canTech && (
                      <>
                        <Button
                          disabled={!canTechAct || techM.isPending}
                          title={!canTechAct ? "No disponible" : ""}
                          onClick={() => techM.mutate({ action: "approve" })}
                        >
                          {techM.isPending ? "Procesando..." : "Aprobar Técnica (si ya aprobó Comercial, envía a Odoo)"}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={!canTechAct || techM.isPending}
                          title={!canTechAct ? "No disponible" : ""}
                          onClick={() => techM.mutate({ action: "reject" })}
                        >
                          Rechazar Técnica
                        </Button>
                      </>
                    )}
                  </div>

                  {(commercialM.isError || techM.isError) && <div className="spacer" />}
                  {commercialM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{commercialM.error.message}</div>}
                  {techM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{techM.error.message}</div>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { adminGetHistoryDetail } from "../../api/admin.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";

const KIND_LABELS = { porton: "Portón", ipanel: "Ipanel", plegados: "Plegados", puerta: "Puerta", otros: "Otros" };

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return "—"; }
}

function fmtMoney(n) {
  if (n == null || n === "") return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function DecisionRow({ label, decision, at, byName, notes }) {
  const color = decision === "approved" ? "#1b5e20" : decision === "rejected" ? "#b71c1c" : "#888";
  const text = decision === "approved" ? "✓ Aprobado" : decision === "rejected" ? "✗ Rechazado" : decision === "pending" ? "Pendiente" : decision || "—";
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ minWidth: 160, color: "#666", fontSize: 13 }}>{label}</div>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, color }}>{text}</span>
        {at && <span style={{ fontSize: 12, color: "#888", marginLeft: 10 }}>{fmt(at)}</span>}
        {byName && <span style={{ fontSize: 12, color: "#555", marginLeft: 10 }}>por {byName}</span>}
        {notes && <div style={{ fontSize: 12, color: "#666", marginTop: 4, fontStyle: "italic" }}>"{notes}"</div>}
      </div>
    </div>
  );
}

function TimelineRow({ label, value, sub }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ minWidth: 220, color: "#666", fontSize: 13 }}>{label}</div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 14 }}>{value || "—"}</span>
        {sub && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function SectionCard({ title, children, accent }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${accent || "#01a39f"}` }}>
      <h3 style={{ margin: "0 0 16px 0", color: accent || "#01a39f" }}>{title}</h3>
      {children}
    </div>
  );
}

function LinesTable({ lines }) {
  if (!Array.isArray(lines) || lines.length === 0) return <div className="muted" style={{ fontSize: 13 }}>Sin líneas de detalle.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700 }}>Producto</th>
            <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>Cant.</th>
            <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>P. Unitario</th>
            <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const qty = l.qty ?? l.quantity ?? 1;
            const price = l.basePrice ?? l.base_price ?? l.price ?? l.price_unit ?? l.unit_price ?? 0;
            const sub = price * qty;
            return (
              <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "6px 10px" }}>{l.name || l.raw_name || l.display_name || String(l.product_id || "—")}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{qty}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{price > 0 ? fmtMoney(price) : "—"}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{sub > 0 ? fmtMoney(sub) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function fmtTypeName(key) {
  if (!key) return null;
  return String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function PayloadSummary({ payload, catalogKind }) {
  if (!payload || typeof payload !== "object") return null;
  const fields = [];

  const add = (label, val) => { if (val != null && val !== "") fields.push({ label, val: String(val) }); };

  if (catalogKind === "porton" || !catalogKind) {
    add("Tipo de portón", fmtTypeName(payload.porton_type || payload.type));
    add("Alto", payload.alto ?? payload.height);
    add("Ancho", payload.ancho ?? payload.width);
    add("Color", payload.color);
    add("Motor", payload.motor);
    add("Telecomandos", payload.telecomandos ?? payload.remotes);
  } else if (catalogKind === "ipanel") {
    add("Tipo Ipanel", fmtTypeName(payload.ipanel_type || payload.type));
    add("Alto", payload.alto ?? payload.height);
    add("Ancho", payload.ancho ?? payload.width);
    add("Color", payload.color);
  } else if (catalogKind === "puerta") {
    add("Tipo", fmtTypeName(payload.door_type || payload.type));
    add("Alto", payload.alto ?? payload.height);
    add("Ancho", payload.ancho ?? payload.width);
  } else {
    add("Tipo", fmtTypeName(payload.type));
    add("Alto", payload.alto ?? payload.height);
    add("Ancho", payload.ancho ?? payload.width);
  }

  add("Nota", payload.note || payload.obs);
  add("Financiamiento", payload.financing_percent != null ? `${payload.financing_percent}%` : null);

  if (fields.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 16px" }}>
      {fields.map(({ label, val }) => (
        <div key={label}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdministracionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const allowed = !!(user?.is_administracion || user?.is_superuser);
  const [showLines, setShowLines] = useState(false);

  const q = useQuery({
    queryKey: ["adminHistoryDetail", id],
    queryFn: () => adminGetHistoryDetail(id),
    enabled: allowed && !!id,
    staleTime: 30000,
  });

  if (!allowed) return <div className="container"><div className="spacer" /><div className="card">No autorizado.</div></div>;
  if (q.isLoading) return <div className="container"><div className="spacer" /><div className="card muted">Cargando...</div></div>;
  if (q.isError) return <div className="container"><div className="spacer" /><div className="card" style={{ color: "red" }}>Error: {q.error?.message}</div></div>;

  const quote = q.data;
  if (!quote) return null;

  const npRef = quote.odoo_sale_order_name;
  const nvRef = quote.final_sale_order_name || quote.final_copy_sale_order_name;
  const customerName = quote.end_customer?.name || "—";
  const sellerName = quote.seller_full_name || quote.seller_username || "—";
  const kindLabel = KIND_LABELS[quote.catalog_kind] || quote.catalog_kind || "—";
  const modeLabel = quote.fulfillment_mode === "acopio" ? "Acopio" : quote.fulfillment_mode === "produccion" ? "Producción" : "—";

  const totalAmount = (() => {
    const lines = Array.isArray(quote.lines) ? quote.lines : [];
    const sum = lines.reduce((acc, l) => {
      const price = Number(l.basePrice ?? l.base_price ?? l.price ?? l.price_unit ?? l.unit_price ?? 0) || 0;
      const qty = Number(l.qty ?? l.quantity ?? 1) || 1;
      return acc + price * qty;
    }, 0);
    return sum > 0 ? sum : null;
  })();

  const hasMeasurement = !!quote.requires_measurement && quote.measurement_status !== "none";
  const finalNv = nvRef || (quote.final_status === "synced_odoo" ? "—" : null);
  const finalTechByName = quote.final_technical_by_full_name || quote.final_technical_by_username || null;

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {npRef && <span style={{ fontSize: 20, fontWeight: 900 }}>{npRef}</span>}
            {nvRef && <span style={{ fontSize: 16, fontWeight: 700, color: "#1b5e20", background: "#e8f5e9", padding: "2px 10px", borderRadius: 999 }}>{nvRef}</span>}
            <span style={{ fontSize: 13, color: "#888", padding: "2px 8px", background: "#f5f5f5", borderRadius: 999 }}>{kindLabel}</span>
            <span style={{ fontSize: 13, color: "#888", padding: "2px 8px", background: "#f5f5f5", borderRadius: 999 }}>{modeLabel}</span>
          </div>
          <div style={{ marginTop: 6, color: "#444" }}>
            <strong>{customerName}</strong>
            <span style={{ color: "#888", marginLeft: 10, fontSize: 13 }}>Vendedor: {sellerName}</span>
            {totalAmount && <span style={{ color: "#333", marginLeft: 10, fontSize: 13, fontWeight: 600 }}>{fmtMoney(totalAmount)}</span>}
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate("/administracion")}>← Volver</Button>
      </div>

      <div className="spacer" />

      {/* Resumen del presupuesto */}
      <SectionCard title="Resumen del presupuesto" accent="#555">
        <PayloadSummary payload={quote.payload} catalogKind={quote.catalog_kind} />
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowLines((v) => !v)}
            style={{ background: "none", border: "1px solid #ccc", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
          >
            {showLines ? "▲ Ocultar líneas del presupuesto" : "▼ Ver líneas del presupuesto"}
          </button>
        </div>
        {showLines && (
          <div style={{ marginTop: 12 }}>
            <LinesTable lines={quote.lines} />
          </div>
        )}
        {quote.note && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#fffde7", borderRadius: 6, fontSize: 13, color: "#555" }}>
            Observaciones: {quote.note}
          </div>
        )}
      </SectionCard>

      <div className="spacer" />

      {/* Historial Comercial / Administrativo */}
      <SectionCard title="Historial Comercial / Administrativo" accent="#01a39f">
        <TimelineRow label="Creado por" value={sellerName} sub={`${quote.created_by_role === "distribuidor" ? "Distribuidor" : "Vendedor"} · ${fmt(quote.created_at)}`} />
        <TimelineRow label="Cliente" value={customerName} sub={[
          quote.end_customer?.phone && `Tel: ${quote.end_customer.phone}`,
          quote.end_customer?.email && `Email: ${quote.end_customer.email}`,
          quote.end_customer?.address && `Dir: ${quote.end_customer.address}`,
        ].filter(Boolean).join(" · ") || null} />
        <TimelineRow label="Enviado a aprobación" value={fmt(quote.confirmed_at)} />
        <DecisionRow
          label="Aprobación comercial"
          decision={quote.commercial_decision}
          at={quote.commercial_at}
          byName={quote.commercial_by_full_name || quote.commercial_by_username}
          notes={quote.commercial_notes}
        />
        <DecisionRow
          label="Aprobación técnica"
          decision={quote.technical_decision}
          at={quote.technical_at}
          byName={quote.technical_by_full_name || quote.technical_by_username}
          notes={quote.technical_notes}
        />
        <TimelineRow label="NP generado en Odoo" value={npRef || "—"} />
        {quote.rejection_notes && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: "#ffebee", borderRadius: 6, fontSize: 13, color: "#b71c1c" }}>
            Notas de rechazo: {quote.rejection_notes}
          </div>
        )}
      </SectionCard>

      <div className="spacer" />

      {/* Historial Técnico */}
      <SectionCard title="Historial Técnico" accent="#5c35a8">
        <TimelineRow label="Modo de cumplimiento" value={modeLabel} />
        <TimelineRow label="Requiere medición" value={quote.requires_measurement ? "Sí" : "No"} />

        {hasMeasurement && (
          <>
            {quote.measurement_scheduled_for && (
              <TimelineRow label="Medición programada para" value={fmtDate(quote.measurement_scheduled_for)} />
            )}
            <TimelineRow
              label="Medición realizada"
              value={quote.measurement_at ? fmt(quote.measurement_at) : "—"}
              sub={quote.measurement_by_full_name || quote.measurement_by_username ? `por ${quote.measurement_by_full_name || quote.measurement_by_username}` : null}
            />
            <TimelineRow
              label="Revisión de medición"
              value={quote.measurement_review_at ? fmt(quote.measurement_review_at) : "—"}
              sub={[
                (quote.measurement_review_by_full_name || quote.measurement_review_by_username) && `por ${quote.measurement_review_by_full_name || quote.measurement_review_by_username}`,
                quote.measurement_review_notes,
              ].filter(Boolean).join(" — ") || null}
            />
          </>
        )}

        {(quote.final_technical_decision || quote.final_logistics_decision) && (
          <>
            <DecisionRow
              label="Decisión técnica final"
              decision={quote.final_technical_decision}
              at={quote.final_technical_decision_at}
              byName={finalTechByName}
              notes={quote.final_technical_notes}
            />
            <DecisionRow
              label="Decisión logística"
              decision={quote.final_logistics_decision}
              at={quote.final_logistics_decision_at}
              byName={null}
              notes={quote.final_logistics_notes}
            />
          </>
        )}

        {finalNv && (
          <TimelineRow
            label="NV generado en Odoo"
            value={finalNv}
            sub={fmt(quote.final_synced_at || quote.final_copy_synced_at)}
          />
        )}

        {quote.production_delivery_week && (
          <TimelineRow
            label="Semana de producción"
            value={`Semana ${quote.production_delivery_week} / ${quote.production_delivery_year}`}
            sub={quote.production_delivery_week_start ? `${fmtDate(quote.production_delivery_week_start)} — ${fmtDate(quote.production_delivery_week_end)}` : null}
          />
        )}
      </SectionCard>

      <div className="spacer" />
    </div>
  );
}

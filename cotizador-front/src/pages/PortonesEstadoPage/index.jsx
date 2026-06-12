import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listPortonesEstado } from "../../api/quotes.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";

const STATUS_COLORS = {
  green:  { bg: "#e8f5e9", text: "#1b5e20", border: "#a5d6a7" },
  teal:   { bg: "#e0f2f1", text: "#004d40", border: "#80cbc4" },
  blue:   { bg: "#e3f2fd", text: "#0d47a1", border: "#90caf9" },
  yellow: { bg: "#fffde7", text: "#f57f17", border: "#fff176" },
  orange: { bg: "#fff3e0", text: "#bf360c", border: "#ffcc80" },
  red:    { bg: "#ffebee", text: "#b71c1c", border: "#ef9a9a" },
  gray:   { bg: "#f5f5f5", text: "#424242", border: "#e0e0e0" },
};

function computeStatusInfo(q) {
  if (q.final_technical_decision === "rejected")
    return { label: "Rechazado en revisión técnica final", color: "red" };
  if (q.final_logistics_decision === "rejected")
    return { label: "Rechazado en logística", color: "red" };

  if (q.status === "draft") {
    if (q.technical_decision === "rejected")
      return { label: "Rechazado en revisión técnica", color: "red" };
    if (q.commercial_decision === "rejected")
      return { label: "Rechazado comercialmente", color: "red" };
    return { label: "Borrador", color: "gray" };
  }

  if (q.status === "pending_approvals") {
    if (q.technical_decision === "rejected")
      return { label: "Rechazado en revisión técnica", color: "red" };
    if (q.commercial_decision === "rejected")
      return { label: "Rechazado comercialmente", color: "red" };
    if (q.technical_decision === "pending" && q.commercial_decision === "pending")
      return { label: "Esperando aprobación técnica y comercial", color: "orange" };
    if (q.technical_decision === "approved" && q.commercial_decision === "pending")
      return { label: "Aprobado técnicamente, esperando aprobación comercial", color: "yellow" };
    if (q.technical_decision === "pending" && q.commercial_decision === "approved")
      return { label: "Aprobado comercialmente, esperando aprobación técnica", color: "yellow" };
  }

  if (q.status === "syncing_odoo")
    return { label: "Procesando en Odoo...", color: "blue" };

  if (q.status === "synced_odoo") {
    if (q.fulfillment_mode === "acopio") {
      if (q.acopio_to_produccion_status === "pending")
        return { label: "Solicitado pase a producción, pendiente de aprobación técnica", color: "orange" };
      if (q.final_copy_id) {
        if (q.final_copy_status === "synced_odoo")
          return { label: "Completo — orden de producción generada", color: "green" };
        if (q.final_copy_status === "syncing_odoo")
          return { label: "Aprobado — sincronizando con Odoo...", color: "blue" };
        return { label: "Pase a producción aprobado, en proceso", color: "teal" };
      }
      return { label: "En Acopio", color: "teal" };
    }

    if (q.fulfillment_mode === "produccion") {
      if (!q.requires_measurement || q.measurement_status === "none") {
        if (q.final_status === "synced_odoo")
          return { label: "Completo — orden de producción generada", color: "green" };
        if (q.final_status === "syncing_odoo")
          return { label: "Sincronizando con Odoo...", color: "blue" };
        if (q.final_technical_decision === "approved" && q.final_logistics_decision === "approved")
          return { label: "Aprobado — pendiente de envío a Odoo", color: "teal" };
        if (q.final_technical_decision === "approved")
          return { label: "Aprobado técnicamente — esperando aprobación de logística", color: "yellow" };
        return { label: "Esperando aprobación técnica final", color: "orange" };
      }

      if (q.measurement_status === "pending")
        return { label: "Medición pendiente", color: "yellow" };
      if (q.measurement_status === "submitted") {
        if (q.measurement_share_enabled_at)
          return { label: "Esperando que el cliente acepte los datos técnicos finales", color: "orange" };
        return { label: "Medición entregada, esperando revisión técnica", color: "orange" };
      }
      if (q.measurement_status === "needs_fix")
        return { label: "Medición requiere correcciones", color: "red" };
      if (q.measurement_status === "approved") {
        if (q.measurement_commercial_review_required && q.measurement_commercial_review_status !== "approved")
          return { label: "Medición aprobada — esperando revisión comercial", color: "orange" };
        if (q.final_status === "synced_odoo")
          return { label: "Completo — orden de producción generada", color: "green" };
        if (q.final_status === "syncing_odoo")
          return { label: "Sincronizando con Odoo...", color: "blue" };
        if (q.final_technical_decision === "approved" && q.final_logistics_decision === "approved")
          return { label: "Aprobado — pendiente de envío a Odoo", color: "teal" };
        if (q.final_technical_decision === "approved")
          return { label: "Aprobado técnicamente — esperando aprobación de logística", color: "yellow" };
        return { label: "Esperando aprobación técnica final", color: "orange" };
      }
      return { label: "En producción", color: "teal" };
    }

    return { label: "Confirmado en Odoo", color: "teal" };
  }

  return { label: "Estado desconocido", color: "gray" };
}

function StatusBadge({ color, label }) {
  const c = STATUS_COLORS[color] || STATUS_COLORS.gray;
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 999,
      border: `1px solid ${c.border}`,
      background: c.bg,
      color: c.text,
      fontWeight: 600,
      fontSize: 13,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

const COLOR_GROUPS = [
  { key: "all",    label: "Todos" },
  { key: "red",    label: "Rechazados" },
  { key: "orange", label: "Pendientes" },
  { key: "yellow", label: "En proceso" },
  { key: "teal",   label: "Acopio / Producción" },
  { key: "green",  label: "Completos" },
  { key: "blue",   label: "Sincronizando" },
];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function PortonesEstadoPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const allowed = !!(user?.is_rev_tecnica || user?.is_superuser);

  const [filterColor, setFilterColor] = useState("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["portones_estado"],
    queryFn: listPortonesEstado,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const rows = useMemo(() => {
    if (!q.data) return [];
    return q.data.map((quote) => ({
      ...quote,
      statusInfo: computeStatusInfo(quote),
      customerName: quote.end_customer?.name || "—",
      sellerName: quote.created_by_full_name || quote.created_by_username || "—",
      displayRef: quote.final_sale_order_name
        || quote.final_copy_sale_order_name
        || quote.odoo_sale_order_name
        || `#${quote.quote_number || "—"}`,
    }));
  }, [q.data]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filterColor !== "all") out = out.filter((r) => r.statusInfo.color === filterColor);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      out = out.filter((r) =>
        r.displayRef.toLowerCase().includes(s) ||
        String(r.quote_number || "").includes(s) ||
        r.customerName.toLowerCase().includes(s) ||
        r.sellerName.toLowerCase().includes(s) ||
        r.statusInfo.label.toLowerCase().includes(s)
      );
    }
    return out;
  }, [rows, filterColor, search]);

  if (!allowed) {
    return <div className="container"><div className="card">No autorizado.</div></div>;
  }

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Estado de Portones</h2>
          <div className="muted" style={{ marginTop: 4 }}>
            Vista general del estado actual de todos los portones en el sistema.
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate("/aprobacion/tecnica/menu")}>
          ← Volver al menú
        </Button>
      </div>

      <div className="spacer" />

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {COLOR_GROUPS.map((g) => {
          const active = filterColor === g.key;
          const count = g.key === "all" ? rows.length : rows.filter((r) => r.statusInfo.color === g.key).length;
          if (g.key !== "all" && count === 0) return null;
          return (
            <button
              key={g.key}
              onClick={() => setFilterColor(g.key)}
              style={{
                padding: "5px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? "#333" : "#ccc"}`,
                background: active ? "#333" : "#fff",
                color: active ? "#fff" : "#333",
                fontWeight: active ? 700 : 400,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {g.label} ({count})
            </button>
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, vendedor o N°..."
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #ccc",
            fontSize: 13,
            minWidth: 220,
          }}
        />
      </div>

      <div className="spacer" />

      {q.isLoading && <div className="card muted" style={{ textAlign: "center" }}>Cargando...</div>}
      {q.isError && <div className="card" style={{ color: "red" }}>Error: {q.error?.message}</div>}

      {!q.isLoading && !q.isError && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #e0e0e0" }}>
                <th style={thStyle}>Referencia</th>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Vendedor / Distribuidor</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "24px 16px", color: "#888" }}>
                    No hay portones que coincidan con el filtro.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid #f0f0f0", transition: "background 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 700, color: "#333" }}>{r.displayRef}</span>
                  </td>
                  <td style={tdStyle}>{r.customerName}</td>
                  <td style={tdStyle}>{r.sellerName}</td>
                  <td style={tdStyle}>
                    <StatusBadge color={r.statusInfo.color} label={r.statusInfo.label} />
                  </td>
                  <td style={{ ...tdStyle, color: "#888", fontSize: 13 }}>
                    {formatDate(r.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="spacer" />
    </div>
  );
}

const thStyle = {
  padding: "12px 16px",
  textAlign: "left",
  fontWeight: 700,
  fontSize: 13,
  color: "#555",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "12px 16px",
  fontSize: 14,
  verticalAlign: "middle",
};

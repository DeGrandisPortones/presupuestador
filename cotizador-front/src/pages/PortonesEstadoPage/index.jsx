import { useState, useMemo, useRef, useEffect } from "react";
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
        return { label: "Medición entregada, esperando revisión técnica", color: "orange" };
      }
      if (q.measurement_status === "needs_fix")
        return { label: "Medición requiere correcciones", color: "red" };
      if (q.measurement_status === "approved") {
        if (q.measurement_commercial_review_required && q.measurement_commercial_review_status !== "approved")
          return { label: "Medición aprobada — esperando revisión comercial", color: "orange" };
        // La NV se crea junto con la aprobación técnica final; el link se genera DESPUÉS de la NV.
        const nvReady = q.final_copy_status === "synced_odoo" || q.final_status === "synced_odoo";
        const nvSyncing = q.final_copy_status === "syncing_odoo" || q.final_status === "syncing_odoo";
        // Chequear aceptación por timestamp O por el objeto en payload (portones viejos pueden tener solo el payload)
        const clientAccepted = !!(q.measurement_client_accepted_at || q.measurement_client_acceptance?.accepted_at);
        if (nvSyncing)
          return { label: "Generando orden de producción en Odoo...", color: "blue" };
        if (nvReady && clientAccepted)
          return { label: "Completo — cliente aceptó, en producción", color: "green" };
        if (nvReady && q.measurement_share_enabled_at && !clientAccepted)
          return { label: "Link enviado — esperando aceptación del cliente", color: "yellow" };
        if (nvReady)
          return { label: "Completo — orden de producción generada", color: "green" };
        // Cliente aceptó pero NV no fue creada (finalizacion falló previamente — requiere revisión)
        if (q.measurement_share_enabled_at && clientAccepted)
          return { label: "Cliente aceptó — NV pendiente de generación", color: "orange" };
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

function daysSince(isoDate) {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
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

function DaysBadge({ days }) {
  if (days === null || days === undefined) return null;
  const urgent = days >= 7;
  return (
    <span style={{
      display: "inline-block",
      marginLeft: 8,
      padding: "2px 10px",
      borderRadius: 999,
      border: `1px solid ${urgent ? "#ef9a9a" : "#ffe082"}`,
      background: urgent ? "#ffebee" : "#fffde7",
      color: urgent ? "#b71c1c" : "#f57f17",
      fontWeight: 700,
      fontSize: 12,
      whiteSpace: "nowrap",
    }}>
      {days === 0 ? "hoy" : `${days}d esperando`}
    </span>
  );
}

const COLOR_GROUPS = [
  { key: "all",    label: "Todos" },
  { key: "red",    label: "Rechazados" },
  { key: "orange", label: "Pendientes" },
  { key: "yellow", label: "Esperando cliente" },
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

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
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
      minWidth: 340, maxWidth: 480, right: 0, top: "calc(100% + 4px)",
    }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Link de aceptación del cliente:</div>
      <div style={{ fontSize: 12, wordBreak: "break-all", background: "#f5f5f5", padding: "6px 8px", borderRadius: 4, color: "#333", marginBottom: 10 }}>
        {url}
      </div>
      <button
        onClick={handleCopy}
        style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #ccc", background: copied ? "#e8f5e9" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: copied ? "#1b5e20" : "#333" }}
      >
        {copied ? "✓ Copiado" : "Copiar link"}
      </button>
    </div>
  );
}

function PhoneModal({ row, onClose }) {
  const phones = [
    { label: "Cliente", value: row?.end_customer?.phone },
    { label: "Opcional", value: row?.extra_contact?.phone },
    {
      label: row?.created_by_role === "distribuidor" ? "Distribuidor" : "Vendedor",
      value: row?.created_by_phone,
    },
  ].filter((p) => p.value);

  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          padding: "24px 28px", minWidth: 280, maxWidth: 380,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: "#222" }}>
          Teléfonos — {row?.customerName}
        </div>
        {phones.map((p) => (
          <div key={p.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
              {p.label}
            </div>
            <a
              href={`tel:+549${p.value.replace(/\D/g, "")}`}
              style={{ fontSize: 17, fontWeight: 700, color: "#0d47a1", textDecoration: "none" }}
            >
              {p.value}
            </a>
          </div>
        ))}
        <button
          onClick={onClose}
          style={{
            marginTop: 8, width: "100%", padding: "8px 0", borderRadius: 7,
            border: "1px solid #e0e0e0", background: "#f5f5f5", cursor: "pointer",
            fontSize: 13, fontWeight: 600, color: "#555",
          }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function PortonesEstadoPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const allowed = !!(user?.is_rev_tecnica || user?.is_superuser || user?.is_enc_comercial);

  const [filterColor, setFilterColor] = useState("all");
  const [search, setSearch] = useState("");
  const [linkPopupId, setLinkPopupId] = useState(null);
  const [phoneModalRow, setPhoneModalRow] = useState(null);

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
      extra_contact: quote.extra_contact || null,
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
        <div className="card" style={{ padding: 0, overflow: "visible" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #e0e0e0" }}>
                <th style={thStyle}>Referencia</th>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Vendedor / Distribuidor</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Aceptación del cliente</th>
                <th style={thStyle}>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "24px 16px", color: "#888" }}>
                    No hay portones que coincidan con el filtro.
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const acceptanceUrl = r.measurement_share_token ? buildClientAcceptanceUrl(r.measurement_share_token) : null;
                const acceptance = r.measurement_client_acceptance;
                const showLinkPopup = linkPopupId === r.id;
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid #f0f0f0", transition: "background 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 700, color: "#333" }}>{r.displayRef}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {r.customerName}
                        {(r.end_customer?.phone || r.extra_contact?.phone || r.created_by_phone) && (
                          <button
                            onClick={() => setPhoneModalRow(r)}
                            title="Ver teléfonos"
                            style={{
                              padding: "2px 7px", borderRadius: 5, border: "1px solid #90caf9",
                              background: "#e3f2fd", color: "#0d47a1", cursor: "pointer",
                              fontSize: 13, lineHeight: 1, flexShrink: 0,
                            }}
                          >
                            📞
                          </button>
                        )}
                      </span>
                    </td>
                    <td style={tdStyle}>{r.sellerName}</td>
                    <td style={tdStyle}>
                      <StatusBadge color={r.statusInfo.color} label={r.statusInfo.label} />
                      {r.measurement_share_enabled_at && !r.measurement_client_accepted_at && r.final_status !== "synced_odoo" && (
                        <DaysBadge days={daysSince(r.measurement_review_at)} />
                      )}
                    </td>
                    <td style={{ ...tdStyle, position: "relative" }}>
                      {acceptanceUrl && (
                        <div style={{ marginBottom: acceptance ? 8 : 0 }}>
                          <button
                            onClick={() => setLinkPopupId(showLinkPopup ? null : r.id)}
                            style={{
                              padding: "3px 10px", borderRadius: 6, border: "1px solid #90caf9",
                              background: "#e3f2fd", color: "#0d47a1", cursor: "pointer", fontSize: 12, fontWeight: 600,
                            }}
                          >
                            🔗 Ver link
                          </button>
                          {showLinkPopup && (
                            <LinkPopup url={acceptanceUrl} onClose={() => setLinkPopupId(null)} />
                          )}
                        </div>
                      )}
                      {acceptance ? (
                        <div style={{ fontSize: 12, color: "#333" }}>
                          <div style={{ fontWeight: 600 }}>{acceptance.full_name || "—"}</div>
                          <div style={{ color: "#666" }}>DNI: {acceptance.dni || "—"}</div>
                          <div style={{ color: "#888" }}>{formatDateTime(acceptance.accepted_at || r.measurement_client_accepted_at)}</div>
                        </div>
                      ) : r.measurement_share_enabled_at ? (
                        <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>Pendiente de aceptación</div>
                      ) : (
                        <span style={{ color: "#ccc" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: "#888", fontSize: 13 }}>
                      {formatDate(r.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="spacer" />

      {phoneModalRow && (
        <PhoneModal row={phoneModalRow} onClose={() => setPhoneModalRow(null)} />
      )}
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

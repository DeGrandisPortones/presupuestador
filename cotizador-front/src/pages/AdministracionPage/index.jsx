import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { adminGetHistory } from "../../api/admin.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

const KIND_LABELS = { porton: "Portón", ipanel: "Ipanel", plegados: "Plegados", puerta: "Puerta", otros: "Otros" };
const KIND_OPTIONS = [
  { value: "", label: "Todos los tipos" },
  { value: "porton", label: "Portones" },
  { value: "ipanel", label: "Ipanels" },
  { value: "puerta", label: "Puertas" },
  { value: "plegados", label: "Plegados" },
  { value: "otros", label: "Otros" },
];

function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return "—"; }
}

function DecisionBadge({ decision }) {
  if (!decision || decision === "pending") return <span style={{ color: "#888", fontSize: 12 }}>Pendiente</span>;
  if (decision === "approved") return <span style={{ color: "#1b5e20", fontSize: 12, fontWeight: 700 }}>✓ Aprobado</span>;
  if (decision === "rejected") return <span style={{ color: "#b71c1c", fontSize: 12, fontWeight: 700 }}>✗ Rechazado</span>;
  return <span style={{ fontSize: 12 }}>{decision}</span>;
}

function getOdooRef(q) {
  return q.final_sale_order_name || q.final_copy_sale_order_name || q.odoo_sale_order_name || "—";
}

function getNvRef(q) {
  return q.final_sale_order_name || q.final_copy_sale_order_name || null;
}

export default function AdministracionPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const allowed = !!(user?.is_administracion || user?.is_superuser);

  const [kind, setKind] = useState("");
  const [fulfillment, setFulfillment] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const q = useQuery({
    queryKey: ["adminHistory", kind, fulfillment, search, fromDate, toDate],
    queryFn: () => adminGetHistory({ kind, q: search, fulfillment, from_date: fromDate, to_date: toDate }),
    enabled: allowed,
    staleTime: 30000,
  });

  const rows = useMemo(() => q.data || [], [q.data]);

  if (!allowed) {
    return <div className="container"><div className="spacer" /><div className="card">No autorizado.</div></div>;
  }

  const applySearch = () => setSearch(searchInput);

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Historial de ventas</h2>
          <div className="muted" style={{ marginTop: 4 }}>Todos los presupuestos enviados a Odoo (NP/NV).</div>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>{rows.length} resultado(s)</div>
      </div>

      <div className="spacer" />

      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Tipo</div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}
          >
            {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={{ flex: "1 1 160px" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Modo</div>
          <select
            value={fulfillment}
            onChange={(e) => setFulfillment(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}
          >
            <option value="all">Todos</option>
            <option value="acopio">Acopio</option>
            <option value="produccion">Producción</option>
          </select>
        </div>

        <div style={{ flex: "1 1 140px" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Desde</div>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}
          />
        </div>

        <div style={{ flex: "1 1 140px" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Hasta</div>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}
          />
        </div>

        <div style={{ flex: "2 1 260px" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Buscar</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Input
              value={searchInput}
              onChange={setSearchInput}
              placeholder="NP, NV, cliente, vendedor..."
              style={{ flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
            />
            <Button variant="secondary" onClick={applySearch}>Buscar</Button>
            {(search || kind || fulfillment !== "all" || fromDate || toDate) && (
              <Button variant="ghost" onClick={() => { setSearch(""); setSearchInput(""); setKind(""); setFulfillment("all"); setFromDate(""); setToDate(""); }}>
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="spacer" />

      {q.isLoading && <div className="card muted" style={{ textAlign: "center" }}>Cargando...</div>}
      {q.isError && <div className="card" style={{ color: "red" }}>Error: {q.error?.message}</div>}

      {!q.isLoading && !q.isError && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #e0e0e0" }}>
                  <th style={th}>NP / Referencia</th>
                  <th style={th}>NV</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Modo</th>
                  <th style={th}>Cliente</th>
                  <th style={th}>Vendedor</th>
                  <th style={th}>Ap. Comercial</th>
                  <th style={th}>Ap. Técnica</th>
                  <th style={th}>Fecha NP</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: "center", padding: 24, color: "#888" }}>Sin resultados.</td></tr>
                )}
                {rows.map((r) => {
                  const nv = getNvRef(r);
                  return (
                    <tr
                      key={r.id}
                      style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                    >
                      <td style={td}><span style={{ fontWeight: 700 }}>{r.odoo_sale_order_name || "—"}</span></td>
                      <td style={td}><span style={{ fontWeight: nv ? 700 : 400, color: nv ? "#1b5e20" : "#aaa" }}>{nv || "—"}</span></td>
                      <td style={td}>{KIND_LABELS[r.catalog_kind] || r.catalog_kind || "—"}</td>
                      <td style={td}>
                        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: r.fulfillment_mode === "acopio" ? "#e3f2fd" : "#e8f5e9", color: r.fulfillment_mode === "acopio" ? "#0d47a1" : "#1b5e20" }}>
                          {r.fulfillment_mode === "acopio" ? "Acopio" : r.fulfillment_mode === "produccion" ? "Producción" : "—"}
                        </span>
                      </td>
                      <td style={td}>{r.end_customer?.name || "—"}</td>
                      <td style={td}>{r.seller_full_name || r.seller_username || "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <DecisionBadge decision={r.commercial_decision} />
                        {r.commercial_at && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{formatDate(r.commercial_at)}</div>}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <DecisionBadge decision={r.technical_decision} />
                        {r.technical_at && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{formatDate(r.technical_at)}</div>}
                      </td>
                      <td style={{ ...td, fontSize: 13, color: "#555" }}>{formatDate(r.confirmed_at || r.created_at)}</td>
                      <td style={td}>
                        <Button
                          variant="ghost"
                          onClick={() => navigate(`/administracion/${r.id}`)}
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="spacer" />
    </div>
  );
}

const th = { padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#666", whiteSpace: "nowrap" };
const td = { padding: "10px 14px", fontSize: 14, verticalAlign: "middle" };

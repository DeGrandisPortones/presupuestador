import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { getMyCommission } from "../../api/commissions.js";

function toYyyyMm(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentQuincena(date = new Date()) {
  return date.getDate() <= 15 ? "first" : "second";
}

function money(value) {
  return Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CATEGORIA_LABELS = {
  porton: "Portón",
  ipanel: "Panel",
  puerta: "Puerta",
  plegados: "Plegado",
  otros: "Otros",
};

function categoriaLabel(categoria) {
  return CATEGORIA_LABELS[categoria] || categoria || "—";
}

function docLabel(moveType) {
  return moveType === "out_refund" ? "NC" : "FV";
}

function ComisionDetalleModal({ sellerName, invoices, onClose }) {
  const portonCount = new Set(
    invoices.filter((i) => i.categoria === "porton" && i.counts_as_porton).map((i) => i.invoice_origin),
  ).size;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(17,24,39,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 960, width: "100%", maxHeight: "88vh", overflowY: "auto", borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#111827" }}>Facturas — {sellerName}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {portonCount} portón(es) · {invoices.length} comprobante(s)
            </div>
          </div>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>

        <div className="spacer" />

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "8px 10px" }}>Fecha</th>
                <th style={{ padding: "8px 10px" }}>Doc.</th>
                <th style={{ padding: "8px 10px" }}>Comprobante</th>
                <th style={{ padding: "8px 10px" }}>Origen</th>
                <th style={{ padding: "8px 10px" }}>Cliente</th>
                <th style={{ padding: "8px 10px" }}>Tipo</th>
                <th style={{ padding: "8px 10px" }}>Cuenta</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Neto ARS</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Neto USD</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr key={`${inv.move_name}-${i}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 10px" }}>{inv.invoice_date}</td>
                  <td style={{ padding: "8px 10px" }}>{docLabel(inv.move_type)}</td>
                  <td style={{ padding: "8px 10px" }}>{inv.move_name || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{inv.invoice_origin || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{inv.partner_name || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{categoriaLabel(inv.categoria)}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {inv.counts_as_porton ? (
                      <span style={{ background: "#2563eb", color: "#fff", borderRadius: 999, padding: "2px 10px", fontWeight: 700, fontSize: 12 }}>Sí</span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{money(inv.neto_ars)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{inv.neto_usd != null ? money(inv.neto_usd) : "—"}</td>
                </tr>
              ))}
              {!invoices.length ? (
                <tr><td colSpan={9} style={{ padding: 16, textAlign: "center" }} className="muted">Sin comprobantes en este período.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div
      style={{
        flex: "1 1 220px",
        minWidth: 220,
        border: "1px solid #eee",
        borderRadius: 14,
        padding: 18,
        background: accent ? "rgba(1,163,159,0.06)" : "#fff",
      }}
    >
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6, color: accent ? "#01a39f" : "inherit" }}>
        {value}
      </div>
    </div>
  );
}

function ClaimsNotice({ onOpenTicket }) {
  return (
    <div className="card" style={{ border: "1px solid #dbeafe", background: "#eff6ff" }}>
      <div style={{ fontWeight: 800, color: "#1e3a8a", marginBottom: 6 }}>
        ¿Un reclamo sobre el cálculo de tu comisión?
      </div>
      <div style={{ color: "#1e3a8a", fontSize: 14 }}>
        Si necesitás hacer un reclamo sobre el cálculo de las comisiones, debe realizarlo por medio de un ticket a Comercial hasta:
      </div>
      <ul style={{ color: "#1e3a8a", fontSize: 14, margin: "8px 0 0", paddingLeft: 20 }}>
        <li><b>Primera quincena:</b> día 05 del mes siguiente (5 días antes del pago).</li>
        <li><b>Segunda quincena:</b> día 20 del mes siguiente (5 días antes del pago).</li>
      </ul>
      <div style={{ marginTop: 12 }}>
        <Button variant="secondary" onClick={onOpenTicket}>Abrir ticket a Comercial</Button>
      </div>
    </div>
  );
}

export default function ComisionesVendedorPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isVendedor = !!(user?.is_vendedor && !user?.is_distribuidor);
  const isFlavio = /flavio/i.test(String(user?.full_name || ""));

  const [month, setMonth] = useState(toYyyyMm());
  const [period, setPeriod] = useState(currentQuincena());
  const [detailOpen, setDetailOpen] = useState(false);

  const commQ = useQuery({
    queryKey: ["myCommission", month, period],
    queryFn: () => getMyCommission({ month, period }),
    enabled: isVendedor,
  });

  const data = commQ.data || null;
  const effectivePeriod = data?.period || (isFlavio ? "full" : period);
  const periodLabel = effectivePeriod === "first" ? "1 al 15" : effectivePeriod === "second" ? "16 al fin de mes" : "Mes completo";

  if (!isVendedor) {
    return (
      <div className="container">
        <div className="spacer" />
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mis comisiones</h2>
          <div className="muted">No tenés permisos para acceder a este módulo.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spacer" />

      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>Mis comisiones</h2>
        <div className="muted">
          {isFlavio
            ? "Se calcula mensual: tramos sobre portones 1–12 → 1%, 13–20 → 2%, 21+ → 2.5% sobre el neto."
            : "Se calcula quincenal (1–15 y 16–fin, cada mitad con su propio tramo): 1–6 → 1%, 7–10 → 2%, 11+ → 2.5% sobre el neto."}
          {" "}Ipaneles, puertas, plegados y otros: 2% sobre el neto. +1% adicional si el USD facturado de portones del mes supera USD 62.000.
        </div>

        <div className="spacer" />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="muted" style={{ marginBottom: 4, fontSize: 12 }}>Mes</div>
            <Input type="month" value={month} onChange={setMonth} style={{ minWidth: 160 }} />
          </div>
          {!isFlavio ? (
            <div>
              <div className="muted" style={{ marginBottom: 4, fontSize: 12 }}>Quincena</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant={period === "first" ? "primary" : "ghost"} onClick={() => setPeriod("first")}>1–15</Button>
                <Button variant={period === "second" ? "primary" : "ghost"} onClick={() => setPeriod("second")}>16–fin</Button>
              </div>
            </div>
          ) : null}
          <Button variant="ghost" onClick={() => commQ.refetch()} disabled={commQ.isFetching}>
            {commQ.isFetching ? "Actualizando…" : "↻ Actualizar"}
          </Button>
        </div>
      </div>

      <div className="spacer" />

      {commQ.isLoading ? <div className="card"><div className="muted">Cargando tu comisión…</div></div> : null}
      {commQ.isError ? <div className="card"><div style={{ color: "#d93025", fontSize: 13 }}>{commQ.error.message}</div></div> : null}

      {data ? (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{periodLabel} · {month}</h3>
            {!data.matched ? (
              <span className="muted" style={{ fontSize: 13 }}>
                {data.reason || "Todavía no tenés ventas facturadas en este período."}
              </span>
            ) : null}
          </div>

          <div className="spacer" />

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <StatCard label="Cant. portones vendidos" value={data.porton_count} />
            <StatCard label="Cant. portones por distribuidor" value={data.porton_count_dist} />
            <StatCard label="Monto comisionado" value={`$ ${money(data.total_commission_ars)}`} accent />
          </div>

          {data.matched && data.invoices?.length ? (
            <div style={{ marginTop: 14 }}>
              <Button variant="ghost" onClick={() => setDetailOpen(true)}>Ver detalle / composición</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="spacer" />
      <ClaimsNotice onOpenTicket={() => navigate("/consultas-comerciales")} />

      {detailOpen && data ? (
        <ComisionDetalleModal
          sellerName={data.seller_name}
          invoices={data.invoices || []}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}

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
        <li><b>Primera quincena:</b> día 20 del mes (5 días antes del pago).</li>
        <li><b>Segunda quincena:</b> día 05 del mes (5 días antes del pago).</li>
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
        </div>
      ) : null}

      <div className="spacer" />
      <ClaimsNotice onOpenTicket={() => navigate("/consultas-comerciales")} />
    </div>
  );
}

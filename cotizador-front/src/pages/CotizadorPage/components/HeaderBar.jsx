import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Input from "../../../ui/Input.jsx";
import Button from "../../../ui/Button.jsx";
import { useQuoteStore } from "../../../domain/quote/store.js";
import { PAYMENT_METHODS } from "../../../domain/quote/portonConstants.js";
import { getFinancingPaymentMethods } from "../../../api/financingSettings.js";
import { IVA_RATE_DEFAULT } from "../../../domain/quote/defaults.js";
import { calcTotals, formatARS } from "../../../domain/quote/pricing.js";

const MULTIPLE_PAYMENT_METHOD = "PAGO MÚLTIPLE";

function mergePaymentMethods(baseMethods, customMethods, currentMethod) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const label = String(value || "").trim();
    const key = label.toUpperCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    out.push(label);
  };
  add(MULTIPLE_PAYMENT_METHOD);
  (Array.isArray(baseMethods) ? baseMethods : []).forEach(add);
  (Array.isArray(customMethods) ? customMethods : []).forEach(add);
  add(currentMethod);
  return out;
}

function normalizeNumber(value) {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function formatPercent(n) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(round2(n));
}

function isMultiplePaymentMethod(value) {
  const raw = String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return raw.startsWith("PAGO MULTIPLE");
}

function parseExistingMultiple(paymentMethod) {
  const raw = String(paymentMethod || "");
  const matches = [...raw.matchAll(/\[([^\]]+)\]\s*([0-9.,]+)\s*%/g)];
  if (!matches.length) return [];
  return matches.map((m, idx) => ({
    id: `${Date.now()}-${idx}`,
    method: String(m[1] || "").trim(),
    valueMode: "percent",
    value: String(m[2] || "").replace(".", ","),
  }));
}

function buildRowPercent(row, baseTotal) {
  const value = normalizeNumber(row.value);
  if (row.valueMode === "amount") {
    return baseTotal > 0 ? round2((value / baseTotal) * 100) : 0;
  }
  return round2(value);
}

function MultiplePaymentModal({ open, onClose, paymentMethods, baseTotal, initialPaymentMethod, onApply }) {
  const [rows, setRows] = useState(() => {
    const parsed = parseExistingMultiple(initialPaymentMethod);
    return parsed.length ? parsed : [{ id: `${Date.now()}-0`, method: "", valueMode: "percent", value: "" }];
  });

  if (!open) return null;

  const safeBaseTotal = Number(baseTotal || 0) || 0;
  const rowPercents = rows.map((row) => buildRowPercent(row, safeBaseTotal));
  const percentTotal = round2(rowPercents.reduce((acc, n) => acc + n, 0));
  const hasMissing = rows.some((row) => !String(row.method || "").trim() || !(normalizeNumber(row.value) > 0));
  const isComplete = !hasMissing && Math.abs(percentTotal - 100) <= 0.01;

  const updateRow = (id, patch) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const removeRow = (id) => {
    setRows((current) => current.length <= 1 ? current : current.filter((row) => row.id !== id));
  };

  const addRow = () => {
    setRows((current) => [...current, { id: `${Date.now()}-${current.length}`, method: "", valueMode: "percent", value: "" }]);
  };

  const apply = () => {
    if (safeBaseTotal <= 0 && rows.some((row) => row.valueMode === "amount")) {
      toast.error("Para cargar importes, primero agregá ítems al presupuesto.");
      return;
    }
    if (hasMissing) {
      toast.error("Completá forma de pago y porcentaje/importe en todas las filas.");
      return;
    }
    if (!isComplete) {
      toast.error(`La distribución debe sumar 100%. Ahora suma ${formatPercent(percentTotal)}%.`);
      return;
    }

    const parts = rows.map((row) => {
      const pct = buildRowPercent(row, safeBaseTotal);
      const amountText = row.valueMode === "amount" ? ` (${formatARS(normalizeNumber(row.value))})` : "";
      return { method: String(row.method || "").trim(), percent: pct, amountText };
    });

    const paymentMethod = `PAGO MÚLTIPLE: ${parts.map((p) => `[${p.method}] ${formatPercent(p.percent)}%${p.amountText}`).join("; ")}`;
    const detail = `Pago múltiple:\n${parts.map((p) => `- ${p.method}: ${formatPercent(p.percent)}%${p.amountText}`).join("\n")}`;
    onApply({ paymentMethod, detail });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1200 }} onClick={onClose}>
      <div className="card" style={{ width: "100%", maxWidth: 920, maxHeight: "90vh", overflow: "auto", background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 24, marginBottom: 4 }}>Pago múltiple</div>
            <div className="muted">Declarar el 100% de la forma de pago. Podés cargar porcentaje o importe.</div>
            <div className="muted" style={{ marginTop: 4 }}>Base para importes: <b>{formatARS(safeBaseTotal)}</b></div>
          </div>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>

        <div className="spacer" />

        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row, idx) => {
            const pct = buildRowPercent(row, safeBaseTotal);
            return (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1.7fr) 120px minmax(140px, 1fr) 120px auto", gap: 8, alignItems: "end", border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                <div>
                  <div className="muted" style={{ marginBottom: 5 }}>Forma de pago {idx + 1}</div>
                  <select value={row.method} onChange={(e) => updateRow(row.id, { method: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}>
                    <option value="">Seleccione...</option>
                    {paymentMethods.filter((x) => !isMultiplePaymentMethod(x)).map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 5 }}>Carga</div>
                  <select value={row.valueMode} onChange={(e) => updateRow(row.id, { valueMode: e.target.value, value: "" })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}>
                    <option value="percent">%</option>
                    <option value="amount">$</option>
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 5 }}>{row.valueMode === "amount" ? "Importe" : "Porcentaje"}</div>
                  <Input value={row.value} onChange={(v) => updateRow(row.id, { value: v })} placeholder={row.valueMode === "amount" ? "100000" : "50"} inputMode="decimal" style={{ width: "100%" }} />
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 5 }}>Equivale</div>
                  <div style={{ fontWeight: 900, paddingBottom: 8 }}>{formatPercent(pct)}%</div>
                </div>
                <Button variant="ghost" onClick={() => removeRow(row.id)} disabled={rows.length <= 1}>Quitar</Button>
              </div>
            );
          })}
        </div>

        <div className="spacer" />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={addRow}>Agregar forma</Button>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900, color: isComplete ? "#0b7" : "#d93025" }}>Total declarado: {formatPercent(percentTotal)}%</div>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={apply}>Aplicar pago múltiple</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HeaderBar({ showMargin }) {
  const {
    marginPercent,
    marginPercentInput,
    setMarginPercentInput,
    commitMarginPercentInput,
    conditionMode,
    setConditionMode,
    conditionText,
    setConditionText,
    paymentMethod,
    setPaymentMethod,
    endCustomer,
    setEndCustomer,
    lines,
  } = useQuoteStore();
  const [multipleOpen, setMultipleOpen] = useState(false);

  const paymentMethodsQ = useQuery({
    queryKey: ["financing-payment-methods"],
    queryFn: getFinancingPaymentMethods,
    staleTime: 60 * 1000,
  });

  const paymentMethods = useMemo(
    () => mergePaymentMethods(PAYMENT_METHODS, paymentMethodsQ.data, paymentMethod),
    [paymentMethodsQ.data, paymentMethod],
  );

  const baseTotals = useMemo(() => calcTotals(lines, marginPercent, IVA_RATE_DEFAULT, 0), [lines, marginPercent]);
  const isMultiplePayment = isMultiplePaymentMethod(paymentMethod);

  const coefClass =
    marginPercent < 0 ? "coef-input coef-negative" :
    marginPercent > 0 ? "coef-input coef-positive" :
    "coef-input";

  const handlePaymentChange = (nextValue) => {
    if (String(nextValue || "") === MULTIPLE_PAYMENT_METHOD) {
      setMultipleOpen(true);
      return;
    }
    setPaymentMethod(nextValue);
  };

  const applyMultiplePayment = ({ paymentMethod: nextPaymentMethod, detail }) => {
    setPaymentMethod(nextPaymentMethod);
    setConditionMode("cond2");
    setConditionText(detail);
    setMultipleOpen(false);
  };

  return (
    <div className="card">
      <MultiplePaymentModal
        open={multipleOpen}
        onClose={() => setMultipleOpen(false)}
        paymentMethods={paymentMethods}
        baseTotal={baseTotals.total}
        initialPaymentMethod={paymentMethod}
        onApply={applyMultiplePayment}
      />
      <div className="row" style={{ alignItems: "center" }}>
        {showMargin ? (
          <div>
            <div className="muted">Coeficiente (%)</div>
            <Input
              type="text"
              inputMode="decimal"
              value={marginPercentInput}
              onChange={(v) => setMarginPercentInput(v)}
              onBlur={() => commitMarginPercentInput()}
              className={coefClass}
              placeholder="0"
              style={{ minWidth: 120 }}
            />
          </div>
        ) : null}

        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="muted">Cliente final (nombre)</div>
          <Input value={endCustomer.first_name || ""} onChange={(v) => setEndCustomer({ first_name: v })} placeholder="Nombre" style={{ width: "100%" }} />
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="muted">Cliente final (apellido)</div>
          <Input value={endCustomer.last_name || ""} onChange={(v) => setEndCustomer({ last_name: v })} placeholder="Apellido" style={{ width: "100%" }} />
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="muted">Localidad</div>
          <Input value={endCustomer.city || ""} onChange={(v) => setEndCustomer({ city: v })} placeholder="Localidad" style={{ width: "100%" }} />
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="muted">Dirección</div>
          <Input value={endCustomer.address} onChange={(v) => setEndCustomer({ address: v })} placeholder="Calle y altura" style={{ width: "100%" }} />
        </div>

        <div style={{ minWidth: 170 }}>
          <div className="muted">Teléfono</div>
          <Input value={endCustomer.phone} onChange={(v) => setEndCustomer({ phone: v })} placeholder="Sin 0 y sin 15" style={{ minWidth: 160 }} />
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="muted">Correo</div>
          <Input value={endCustomer.email || ""} onChange={(v) => setEndCustomer({ email: v })} placeholder="cliente@correo.com" style={{ width: "100%" }} />
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="muted">Google Maps (URL)</div>
          <Input value={endCustomer.maps_url || ""} onChange={(v) => setEndCustomer({ maps_url: v })} placeholder="https://maps.app.goo.gl/..." style={{ width: "100%" }} />
        </div>

        <div style={{ minWidth: 280 }}>
          <div className="muted">Forma de pago</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={isMultiplePayment ? MULTIPLE_PAYMENT_METHOD : (paymentMethod || "")}
              onChange={(e) => handlePaymentChange(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", minWidth: 220 }}
            >
              <option value="">Seleccione forma de pago</option>
              {paymentMethods.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            {isMultiplePayment ? <Button variant="ghost" onClick={() => setMultipleOpen(true)}>Editar</Button> : null}
          </div>
          {isMultiplePayment ? <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{paymentMethod}</div> : null}
          {paymentMethodsQ.isError ? <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>No se pudieron cargar formas agregadas.</div> : null}
        </div>

        <div>
          <div className="muted">Condición</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={isMultiplePayment ? "cond2" : (conditionMode || "cond1")}
              onChange={(e) => setConditionMode(e.target.value)}
              disabled={isMultiplePayment}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", minWidth: 150 }}
              title="Condición"
            >
              <option value="cond1">Condición 1</option>
              <option value="cond2">Condición 2</option>
              <option value="special">Especial</option>
            </select>
            {(conditionMode === "special" || isMultiplePayment) ? (
              <Input value={conditionText || ""} onChange={(v) => setConditionText(v)} placeholder="Escribí la condición..." style={{ minWidth: 360 }} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

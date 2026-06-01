import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Input from "../../../ui/Input.jsx";
import Button from "../../../ui/Button.jsx";
import { useQuoteStore } from "../../../domain/quote/store.js";
import { PAYMENT_METHODS } from "../../../domain/quote/portonConstants.js";
import { getFinancingPaymentMethods } from "../../../api/financingSettings.js";

const MULTIPLE_PAYMENT_METHOD = "PAGO MÚLTIPLE";

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isMultiplePaymentMethod(value) {
  return normalizeKey(value).startsWith("PAGO MULTIPLE");
}

function mergePaymentMethods(baseMethods, apiMethods, currentMethod, apiLoaded) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const label = String(value || "").trim();
    const key = normalizeKey(label);
    if (!label || seen.has(key)) return;
    seen.add(key);
    out.push(label);
  };

  add(MULTIPLE_PAYMENT_METHOD);

  // Si el backend respondió, esa lista es la fuente de verdad: ya trae los nombres editados
  // y reemplaza los defaults viejos. Los defaults locales sólo quedan como fallback si falla/carga la API.
  const sourceMethods = apiLoaded && Array.isArray(apiMethods) && apiMethods.length
    ? apiMethods
    : baseMethods;
  (Array.isArray(sourceMethods) ? sourceMethods : []).forEach(add);

  // Conserva una forma ya seleccionada en presupuestos viejos, pero no vuelve a mezclar todos los defaults viejos.
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

function paymentAllowsCondition2(value) {
  const key = normalizeKey(value);
  if (!key || isMultiplePaymentMethod(value)) return false;
  return (
    key.includes("CHEQUE") ||
    key.includes("CTA CTE") ||
    key.includes("CUENTA CORRIENTE") ||
    key.includes("EFECTIVO")
  );
}

function parseExistingMultiple(paymentMethod) {
  const raw = String(paymentMethod || "");
  const matches = [...raw.matchAll(/\[([^\]]+)\]\s*([0-9.,]+)\s*%/g)];
  if (!matches.length) return [];
  return matches.map((m, idx) => ({
    id: `${Date.now()}-${idx}`,
    method: String(m[1] || "").trim(),
    value: String(m[2] || "").replace(".", ","),
  }));
}

function buildRowPercent(row) {
  return round2(normalizeNumber(row.value));
}

function MultiplePaymentModal({ open, onClose, paymentMethods, initialPaymentMethod, onApply }) {
  const [rows, setRows] = useState(() => {
    const parsed = parseExistingMultiple(initialPaymentMethod);
    return parsed.length ? parsed : [{ id: `${Date.now()}-0`, method: "", value: "" }];
  });

  useEffect(() => {
    if (!open) return;
    const parsed = parseExistingMultiple(initialPaymentMethod);
    setRows(parsed.length ? parsed : [{ id: `${Date.now()}-0`, method: "", value: "" }]);
  }, [open, initialPaymentMethod]);

  if (!open) return null;

  const rowPercents = rows.map((row) => buildRowPercent(row));
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
    setRows((current) => [...current, { id: `${Date.now()}-${current.length}`, method: "", value: "" }]);
  };

  const apply = () => {
    if (hasMissing) {
      toast.error("Completá forma de pago y porcentaje en todas las filas.");
      return;
    }
    if (!isComplete) {
      toast.error(`La distribución debe sumar 100%. Ahora suma ${formatPercent(percentTotal)}%.`);
      return;
    }

    const parts = rows.map((row) => {
      const pct = buildRowPercent(row);
      return { method: String(row.method || "").trim(), percent: pct };
    });

    const paymentMethod = `PAGO MÚLTIPLE: ${parts.map((p) => `[${p.method}] ${formatPercent(p.percent)}%`).join("; ")}`;
    const detail = `Pago múltiple:\n${parts.map((p) => `- ${p.method}: ${formatPercent(p.percent)}%`).join("\n")}`;
    onApply({ paymentMethod, detail });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1200 }} onClick={onClose}>
      <div className="card" style={{ width: "100%", maxWidth: 820, maxHeight: "90vh", overflow: "auto", background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 24, marginBottom: 4 }}>Pago múltiple</div>
            <div className="muted">Declarar el 100% de la forma de pago. Se carga solo por porcentaje.</div>
          </div>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>

        <div className="spacer" />

        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row, idx) => {
            const pct = buildRowPercent(row);
            return (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.7fr) minmax(140px, 1fr) 120px auto", gap: 8, alignItems: "end", border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                <div>
                  <div className="muted" style={{ marginBottom: 5 }}>Forma de pago {idx + 1}</div>
                  <select value={row.method} onChange={(e) => updateRow(row.id, { method: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}>
                    <option value="">Seleccione...</option>
                    {paymentMethods.filter((x) => !isMultiplePaymentMethod(x)).map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 5 }}>Porcentaje</div>
                  <Input value={row.value} onChange={(v) => updateRow(row.id, { value: v })} placeholder="50" inputMode="decimal" style={{ width: "100%" }} />
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 5 }}>Declarado</div>
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
  } = useQuoteStore();
  const [multipleOpen, setMultipleOpen] = useState(false);

  const paymentMethodsQ = useQuery({
    queryKey: ["financing-payment-methods"],
    queryFn: getFinancingPaymentMethods,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const paymentMethods = useMemo(
    () => mergePaymentMethods(PAYMENT_METHODS, paymentMethodsQ.data, paymentMethod, paymentMethodsQ.isSuccess),
    [paymentMethodsQ.data, paymentMethodsQ.isSuccess, paymentMethod],
  );

  const isMultiplePayment = isMultiplePaymentMethod(paymentMethod);
  const allowsCondition2 = paymentAllowsCondition2(paymentMethod);
  const conditionValue = allowsCondition2 && conditionMode === "cond2" ? "cond2" : "cond1";

  useEffect(() => {
    if (!["cond1", "cond2"].includes(conditionMode) || (!allowsCondition2 && conditionMode !== "cond1")) {
      setConditionMode("cond1");
    }
  }, [allowsCondition2, conditionMode, setConditionMode]);

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
    if (!paymentAllowsCondition2(nextValue)) {
      setConditionMode("cond1");
    }
  };

  const applyMultiplePayment = ({ paymentMethod: nextPaymentMethod, detail }) => {
    setPaymentMethod(nextPaymentMethod);
    setConditionMode("cond1");
    setConditionText(detail);
    setMultipleOpen(false);
  };

  return (
    <div className="card">
      <MultiplePaymentModal
        open={multipleOpen}
        onClose={() => setMultipleOpen(false)}
        paymentMethods={paymentMethods}
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
              value={conditionValue}
              onChange={(e) => {
                const nextMode = e.target.value === "cond2" && allowsCondition2 ? "cond2" : "cond1";
                setConditionMode(nextMode);
              }}
              disabled={!allowsCondition2}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", minWidth: 150 }}
              title="Condición"
            >
              <option value="cond1">Condición 1</option>
              {allowsCondition2 ? <option value="cond2">Condición 2</option> : null}
            </select>
            {allowsCondition2 && conditionValue === "cond2" ? (
              <Input value={conditionText || ""} onChange={(v) => setConditionText(v)} placeholder="Detalle condición 2..." style={{ minWidth: 320 }} />
            ) : null}
          </div>
          {!allowsCondition2 ? <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>Condición 2 solo para cheque, cuenta corriente o efectivo.</div> : null}
        </div>
      </div>
    </div>
  );
}

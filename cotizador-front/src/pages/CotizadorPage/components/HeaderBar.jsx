import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Input from "../../../ui/Input.jsx";
import Button from "../../../ui/Button.jsx";
import { useQuoteStore } from "../../../domain/quote/store.js";
import { useAuthStore } from "../../../domain/auth/store.js";
import { PAYMENT_METHODS } from "../../../domain/quote/portonConstants.js";
import { getFinancingPaymentMethods } from "../../../api/financingSettings.js";
import { searchExistingCustomers } from "../../../api/quotes.js";

const MULTIPLE_PAYMENT_METHOD = "Pago Multiple";
const CARD_CATEGORY = "Tarjetas";
const MAIN_PAYMENT_METHODS = [
  MULTIPLE_PAYMENT_METHOD,
  "Efectivo",
  "Transferencia",
  "Cta Cte",
  "Cheques 30",
  "Cheques 0 - 30 - 60 - 90 - 120",
  "Cheques 0 - 30 - 60 - 90 - 120 - 150 - 180 - 210",
  CARD_CATEGORY,
];

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bCHEQUES\b/g, "CHEQUE")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isMultiplePaymentMethod(value) {
  return normalizeKey(value).startsWith("PAGO MULTIPLE");
}

function isCardPaymentMethod(value) {
  const key = normalizeKey(value);
  if (!key || isMultiplePaymentMethod(value)) return false;
  return (
    key.startsWith("CORDOBESA") ||
    key.startsWith("NARANJA") ||
    key.startsWith("OTRAS TC BANC") ||
    key.startsWith("OTRAS") ||
    (key.includes("CUOTAS") && !key.includes("CHEQUE"))
  );
}

function sortCardMethods(methods) {
  const groupOrder = (value) => {
    const key = normalizeKey(value);
    if (key.startsWith("CORDOBESA")) return 1;
    if (key.startsWith("NARANJA")) return 2;
    if (key.startsWith("OTRAS")) return 3;
    return 9;
  };
  const installments = (value) => {
    const m = normalizeKey(value).match(/\b(\d{1,2})\b/);
    return m ? Number(m[1]) : 999;
  };
  return [...methods].sort((a, b) => {
    const g = groupOrder(a) - groupOrder(b);
    if (g) return g;
    const q = installments(a) - installments(b);
    if (q) return q;
    return String(a).localeCompare(String(b), "es");
  });
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

  if (apiLoaded && Array.isArray(apiMethods)) {
    apiMethods.forEach(add);
  }

  // Los defaults locales agregan opciones nuevas aunque el backend todavía no haya devuelto configuración.
  (Array.isArray(baseMethods) ? baseMethods : []).forEach(add);
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
  if (!key || isMultiplePaymentMethod(value) || key === normalizeKey(CARD_CATEGORY)) return false;
  return key === normalizeKey("Efectivo") || key === normalizeKey("Cheques 30") || key === normalizeKey("Cheque 30");
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

function paymentCategoryFromMethod(paymentMethod, categoryOverride = "") {
  const raw = String(paymentMethod || "").trim();
  const key = normalizeKey(raw);
  if (categoryOverride === CARD_CATEGORY && (!raw || isCardPaymentMethod(raw))) return CARD_CATEGORY;
  if (!raw) return "";
  if (isMultiplePaymentMethod(raw)) return MULTIPLE_PAYMENT_METHOD;
  if (isCardPaymentMethod(raw)) return CARD_CATEGORY;
  if (key === normalizeKey("Efectivo")) return "Efectivo";
  if (key === normalizeKey("Transferencia")) return "Transferencia";
  if (key === normalizeKey("Cta Cte") || key === normalizeKey("Cuenta Corriente")) return "Cta Cte";
  if (key === normalizeKey("Cheques 30") || key === normalizeKey("Cheque 30")) {
    return "Cheques 30";
  }
  if (key === normalizeKey("Cheques 0 - 30 - 60 - 90 - 120") || key === normalizeKey("Cheque 0 - 30 - 60 - 90 -120")) {
    return "Cheques 0 - 30 - 60 - 90 - 120";
  }
  if (key === normalizeKey("Cheques 0 - 30 - 60 - 90 - 120 - 150 - 180 - 210") || key === normalizeKey("Cheques 0 - 30 - 60 - 90 - 120 - 150 - 180")) {
    return "Cheques 0 - 30 - 60 - 90 - 120 - 150 - 180 - 210";
  }
  return raw;
}


function splitExistingCustomerName(customer = {}) {
  const first = String(customer?.first_name || "").trim();
  const last = String(customer?.last_name || "").trim();
  if (first || last) return { first_name: first, last_name: last };
  const fullName = String(customer?.name || "").trim();
  if (!fullName) return { first_name: "", last_name: "" };
  const parts = fullName.split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
}

function normalizeExistingCustomer(customer = {}) {
  const split = splitExistingCustomerName(customer);
  return {
    name: String(customer?.name || [split.first_name, split.last_name].filter(Boolean).join(" ")).trim(),
    first_name: split.first_name,
    last_name: split.last_name,
    phone: String(customer?.phone || "").trim(),
    email: String(customer?.email || "").trim(),
    address: String(customer?.address || customer?.street || "").trim(),
    maps_url: String(customer?.maps_url || "").trim(),
    city: String(customer?.city || "").trim(),
  };
}

function customerResultLabel(item = {}) {
  const c = item?.customer || {};
  const name = String(c?.name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Cliente sin nombre").trim();
  const parts = [
    c?.phone ? `Tel: ${c.phone}` : "",
    c?.city || "",
    c?.address || "",
  ].filter(Boolean);
  return { name, detail: parts.join(" · ") };
}

function ExistingCustomerModal({ open, onClose, onApply }) {
  const [query, setQuery] = useState("");
  const cleanQuery = query.trim();
  const canSearch = cleanQuery.length >= 2;
  const customersQ = useQuery({
    queryKey: ["existing-customers", cleanQuery],
    queryFn: () => searchExistingCustomers({ query: cleanQuery, limit: 25 }),
    enabled: open && canSearch,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;

  const results = Array.isArray(customersQ.data) ? customersQ.data : [];
  const apply = (item) => {
    const customer = normalizeExistingCustomer(item?.customer || {});
    onApply(customer);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1200 }} onClick={onClose}>
      <div className="card" style={{ width: "100%", maxWidth: 900, maxHeight: "90vh", overflow: "auto", background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 24, marginBottom: 4 }}>Datos cliente existente</div>
            <div className="muted">Buscá por nombre, apellido, teléfono, email, localidad, dirección, presupuesto o referencia Odoo.</div>
          </div>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>

        <div className="spacer" />
        <Input value={query} onChange={setQuery} placeholder="Ej: Juan, 351..., NV4248, NP4248, localidad..." style={{ width: "100%" }} autoFocus />
        {!canSearch ? <div className="muted" style={{ marginTop: 8 }}>Escribí al menos 2 caracteres para buscar.</div> : null}
        {customersQ.isFetching ? <div className="muted" style={{ marginTop: 8 }}>Buscando clientes guardados…</div> : null}
        {customersQ.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 8 }}>{customersQ.error?.message || "No se pudo buscar clientes."}</div> : null}
        {canSearch && !customersQ.isFetching && !customersQ.isError && !results.length ? <div className="muted" style={{ marginTop: 8 }}>No encontré clientes guardados con esa búsqueda.</div> : null}

        {!!results.length ? (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {results.map((item) => {
              const label = customerResultLabel(item);
              return (
                <button
                  key={item.key || item.quote_id}
                  type="button"
                  onClick={() => apply(item)}
                  style={{ textAlign: "left", border: "1px solid #e5e7eb", background: "#fff", borderRadius: 12, padding: 12, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>{label.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{item.reference || "Presupuesto"}</div>
                  </div>
                  {label.detail ? <div className="muted" style={{ marginTop: 4 }}>{label.detail}</div> : null}
                  {item.created_by_full_name || item.created_by_username ? <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>Vendedor: {item.created_by_full_name || item.created_by_username}</div> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
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

    const paymentMethod = `Pago Multiple: ${parts.map((p) => `[${p.method}] ${formatPercent(p.percent)}%`).join("; ")}`;
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
    extraContact,
    setExtraContact,
    distribuidorVendedorNombre,
    setDistribuidorVendedorNombre,
  } = useQuoteStore();
  const user = useAuthStore((s) => s.user);
  const isDistribuidor = !!(user?.is_distribuidor && !user?.is_vendedor);
  const [multipleOpen, setMultipleOpen] = useState(false);
  const [customerLookupOpen, setCustomerLookupOpen] = useState(false);
  const [paymentCategoryOverride, setPaymentCategoryOverride] = useState("");

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

  const cardPaymentMethods = useMemo(
    () => sortCardMethods(paymentMethods.filter((x) => isCardPaymentMethod(x))),
    [paymentMethods],
  );

  const isMultiplePayment = isMultiplePaymentMethod(paymentMethod);
  const currentPaymentCategory = paymentCategoryFromMethod(paymentMethod, paymentCategoryOverride);
  const paymentCategoryOptions = useMemo(() => {
    const options = [...MAIN_PAYMENT_METHODS];
    if (currentPaymentCategory && !options.some((x) => normalizeKey(x) === normalizeKey(currentPaymentCategory))) {
      options.push(currentPaymentCategory);
    }
    return options;
  }, [currentPaymentCategory]);
  const showCardSelector = currentPaymentCategory === CARD_CATEGORY;
  const allowsCondition2 = paymentAllowsCondition2(paymentMethod);
  const conditionValue = allowsCondition2 && conditionMode === "cond2" ? "cond2" : "cond1";

  useEffect(() => {
    if (!paymentMethod || isCardPaymentMethod(paymentMethod)) return;
    setPaymentCategoryOverride("");
  }, [paymentMethod]);

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
      setPaymentCategoryOverride("");
      setMultipleOpen(true);
      return;
    }

    if (String(nextValue || "") === CARD_CATEGORY) {
      setPaymentCategoryOverride(CARD_CATEGORY);
      if (!isCardPaymentMethod(paymentMethod)) {
        setPaymentMethod("");
        setConditionMode("cond1");
      }
      return;
    }

    setPaymentCategoryOverride("");
    setPaymentMethod(nextValue);
    if (!paymentAllowsCondition2(nextValue)) {
      setConditionMode("cond1");
    }
  };

  const applyMultiplePayment = ({ paymentMethod: nextPaymentMethod, detail }) => {
    setPaymentCategoryOverride("");
    setPaymentMethod(nextPaymentMethod);
    setConditionMode("cond1");
    setConditionText(detail);
    setMultipleOpen(false);
  };

  const handleCardPaymentChange = (nextValue) => {
    setPaymentCategoryOverride(CARD_CATEGORY);
    setPaymentMethod(nextValue);
    setConditionMode("cond1");
  };

  const applyExistingCustomer = (customer) => {
    setEndCustomer(customer);
    setCustomerLookupOpen(false);
    toast.success("Datos del cliente cargados.");
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
      <ExistingCustomerModal
        open={customerLookupOpen}
        onClose={() => setCustomerLookupOpen(false)}
        onApply={applyExistingCustomer}
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

        <div style={{ minWidth: 210 }}>
          <div className="muted">Cliente guardado</div>
          <Button variant="secondary" onClick={() => setCustomerLookupOpen(true)}>Datos cliente existente</Button>
        </div>


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

        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="muted">Contacto adicional (nombre)</div>
          <Input value={extraContact?.name || ""} onChange={(v) => setExtraContact({ name: v })} placeholder="Ej. jefe de obra" style={{ width: "100%" }} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div className="muted">Rol / calidad</div>
          <Input value={extraContact?.role || ""} onChange={(v) => setExtraContact({ role: v })} placeholder="Ej. jefe de obra" style={{ width: "100%" }} />
        </div>
        <div style={{ minWidth: 160 }}>
          <div className="muted">Teléfono contacto adicional</div>
          <Input value={extraContact?.phone || ""} onChange={(v) => setExtraContact({ phone: v })} placeholder="Sin 0 y sin 15" style={{ minWidth: 150 }} />
        </div>

        {isDistribuidor ? (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="muted">Vendedor del distribuidor</div>
            <Input value={distribuidorVendedorNombre || ""} onChange={(v) => setDistribuidorVendedorNombre(v)} placeholder="Nombre del vendedor" style={{ width: "100%" }} />
          </div>
        ) : null}

        <div style={{ minWidth: 280 }}>
          <div className="muted">Forma de pago</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={isMultiplePayment ? MULTIPLE_PAYMENT_METHOD : (currentPaymentCategory || "")}
                onChange={(e) => handlePaymentChange(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", minWidth: 220 }}
              >
                <option value="">Seleccione forma de pago</option>
                {paymentCategoryOptions.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
              {isMultiplePayment ? <Button variant="ghost" onClick={() => setMultipleOpen(true)}>Editar</Button> : null}
            </div>
            {showCardSelector ? (
              <select
                value={isCardPaymentMethod(paymentMethod) ? paymentMethod : ""}
                onChange={(e) => handleCardPaymentChange(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", minWidth: 220 }}
              >
                <option value="">Seleccione tarjeta/cuotas</option>
                {cardPaymentMethods.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            ) : null}
          </div>
          {isMultiplePayment ? <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{paymentMethod}</div> : null}
          {showCardSelector && !paymentMethod ? <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>Elegí la tarjeta y cuotas para aplicar el recargo correspondiente.</div> : null}
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
        </div>
      </div>
    </div>
  );
}

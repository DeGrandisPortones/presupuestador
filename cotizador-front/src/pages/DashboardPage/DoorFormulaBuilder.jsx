import { useEffect, useMemo, useState } from "react";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

const VARIABLE_OPTIONS = [
  { value: "precio_ipanel", label: "precio_ipanel" },
  { value: "precio_compra_marco", label: "precio_compra_marco" },
  { value: "precio_compra", label: "precio_compra (alias)" },
  { value: "precio_venta_marco", label: "precio_venta_marco" },
  { value: "precio_venta", label: "precio_venta (alias)" },
];
const TOKEN_REGEX = /precio_ipanel|precio_compra_marco|precio_venta_marco|precio_compra|precio_venta|[()+\-*/]|\d+(?:[.,]\d+)?/g;
function normalizeNumber(v) { return String(v ?? "").replace(/,/g, ".").replace(/[^0-9.]/g, "").trim(); }
function parseTokens(formula) { const raw = String(formula || "").trim(); const matched = raw.match(TOKEN_REGEX); return matched?.length ? matched : ["precio_ipanel", "+", "precio_venta_marco"]; }
function buildFormula(tokens) { return (Array.isArray(tokens) ? tokens : []).join(" ").trim(); }

export default function DoorFormulaBuilder({ value, onChange }) {
  const [tokens, setTokens] = useState(parseTokens(value));
  const [numberValue, setNumberValue] = useState("");
  const formula = useMemo(() => buildFormula(tokens), [tokens]);
  useEffect(() => { setTokens(parseTokens(value)); }, [value]);
  useEffect(() => { onChange?.(formula); }, [formula, onChange]);
  function pushToken(token) { setTokens((prev) => [...prev, token]); }
  function removeAt(idx) { setTokens((prev) => prev.filter((_, i) => i !== idx)); }
  function resetBase() { setTokens(["precio_ipanel", "+", "precio_venta_marco"]); }
  function addNumber() { const n = normalizeNumber(numberValue); if (!n) return; pushToken(n); setNumberValue(""); }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {VARIABLE_OPTIONS.map((opt) => <Button key={opt.value} variant="ghost" onClick={() => pushToken(opt.value)}>{opt.label}</Button>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {["(", ")", "+", "-", "*", "/"].map((op) => <Button key={op} variant="ghost" onClick={() => pushToken(op)}>{op}</Button>)}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ minWidth: 160 }}>
          <div className="muted">Valor fijo</div>
          <Input value={numberValue} onChange={setNumberValue} placeholder="Ej: 1000 o 2.5" style={{ width: "100%" }} />
        </div>
        <Button variant="ghost" onClick={addNumber}>Agregar valor fijo</Button>
        <Button variant="ghost" onClick={() => setTokens((prev) => prev.slice(0, -1))} disabled={!tokens.length}>Borrar último</Button>
        <Button variant="ghost" onClick={resetBase}>Usar fórmula base</Button>
      </div>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff", minHeight: 72 }}>
        <div className="muted" style={{ marginBottom: 8 }}>Tokens de la fórmula</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {tokens.map((token, idx) => (
            <button key={`${token}-${idx}`} type="button" onClick={() => removeAt(idx)} style={{ border: "1px solid #d1d5db", background: "#f9fafb", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}>
              {token} ✕
            </button>
          ))}
        </div>
      </div>
      <div className="spacer" />
      <div className="muted">Vista previa: <b>{formula}</b></div>
    </div>
  );
}

import { useEffect, useState } from "react";
import Button from "../../../ui/Button";
import { useQuoteStore } from "../../../domain/quote/store";

const SYSTEM_PRODUCT_IDS = new Set([3008, 3009]);
const INTEGER_QTY_PRODUCT_IDS = new Set([3582, 3251]);

function isFreeQtyLine(line) {
  return !!line?.free_quantity || !!line?.quantity_editable || String(line?.quantity_mode || "").toLowerCase() === "free";
}

function normalizeDecimalText(value) {
  return String(value ?? "").trim().replace(",", ".");
}

function isPartialDecimalInput(value) {
  const raw = String(value ?? "").trim();
  if (raw === "" || raw === "." || raw === ",") return true;
  return /^\d+[\.,]$/.test(raw);
}

function isValidDecimalInput(value) {
  const raw = String(value ?? "").trim();
  if (isPartialDecimalInput(raw)) return false;
  if (!/^\d*([\.,]\d*)?$/.test(raw)) return false;
  const n = Number(normalizeDecimalText(raw));
  return Number.isFinite(n) && n >= 0;
}

export default function LineRow({ line, finalUnit, total, formatARS }) {
  const { setQty, removeLine } = useQuoteStore();
  const visibleName = String(line.name || line.raw_name || `Producto ${line.product_id}`).trim();
  const visibleOdooId = Number(line.odoo_id || line.product_id || 0) || Number(line.product_id || 0);
  const isProtectedLine = !!line.auto_system_item || !!line.surface_quantity || !!line.previously_billed_line || SYSTEM_PRODUCT_IDS.has(Number(line.product_id));
  const isFreeQuantityLine = !isProtectedLine && isFreeQtyLine(line);
  const isIntegerQtyLine = !isProtectedLine && !isFreeQuantityLine && INTEGER_QTY_PRODUCT_IDS.has(Number(line.product_id));
  const isUnitOnlyLine = !isProtectedLine && !isFreeQuantityLine && !isIntegerQtyLine;
  const canEditQty = isFreeQuantityLine || isIntegerQtyLine;
  const [qtyText, setQtyText] = useState(String(line.qty ?? ""));

  useEffect(() => {
    setQtyText(String(line.qty ?? ""));
  }, [line.product_id, line.qty]);

  function handleQtyChange(e) {
    const raw = e.target.value;

    if (isFreeQuantityLine) {
      const cleaned = String(raw || "").replace(/[^0-9.,]/g, "");
      setQtyText(cleaned);
      if (isValidDecimalInput(cleaned)) {
        setQty(line.product_id, cleaned);
      }
      return;
    }

    setQtyText(raw);
    setQty(line.product_id, raw);
  }

  function handleQtyBlur() {
    if (!isFreeQuantityLine) return;

    const raw = String(qtyText || "").trim();
    if (isValidDecimalInput(raw)) {
      setQty(line.product_id, raw);
      return;
    }

    setQtyText(String(line.qty ?? ""));
  }

  return (
    <tr>
      <td style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 600 }}>{visibleName}</div>
        <div className="muted">
          ID Presupuestador: {line.product_id}
          {" · "}
          ID Odoo: {visibleOdooId}
          {line.code ? ` · ${line.code}` : ""}
          {line.auto_system_item ? " · Auto por sistema y superficie" : ""}
          {!line.auto_system_item && line.surface_quantity ? " · Cantidad por superficie" : ""}
          {isUnitOnlyLine ? " · Unidad fija" : ""}
          {isIntegerQtyLine ? " · Cantidad entera" : ""}
          {isFreeQuantityLine ? " · Cantidad editable" : ""}
          {line.previously_billed_line ? " · Facturado previamente" : ""}
        </div>
      </td>

      <td className="right">
        <input
          type={isFreeQuantityLine ? "text" : "number"}
          inputMode={isFreeQuantityLine ? "decimal" : undefined}
          value={qtyText}
          min={isFreeQuantityLine ? undefined : 0}
          step={isIntegerQtyLine ? "1" : "0.01"}
          disabled={!canEditQty}
          onChange={handleQtyChange}
          onBlur={handleQtyBlur}
          style={{
            width: 90,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #ddd",
            textAlign: "right",
            opacity: canEditQty ? 1 : 0.7,
          }}
        />
      </td>

      <td className="right">{formatARS(line.basePrice)}</td>
      <td className="right">{formatARS(finalUnit)}</td>
      <td className="right" style={{ fontWeight: 700 }}>{formatARS(total)}</td>

      <td className="right">
        {isProtectedLine ? (
          <span className="muted">Auto</span>
        ) : (
          <Button variant="danger" onClick={() => removeLine(line.product_id)}>🗑️</Button>
        )}
      </td>
    </tr>
  );
}

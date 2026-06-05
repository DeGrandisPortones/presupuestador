import { useEffect, useState } from "react";
import Button from "../../../ui/Button";
import { useQuoteStore } from "../../../domain/quote/store";
import { useAuthStore } from "../../../domain/auth/store.js";

const SYSTEM_PRODUCT_IDS = new Set([3008, 3009]);
const INTEGER_QTY_PRODUCT_IDS = new Set([3582, 3251]);
const SHIPPING_PRODUCT_IDS = new Set([2842]);

function isShippingLine(line) {
  return SHIPPING_PRODUCT_IDS.has(Number(line?.product_id));
}

function isFreeQtyLine(line) {
  return isShippingLine(line) || !!line?.free_quantity || !!line?.quantity_editable || String(line?.quantity_mode || "").toLowerCase() === "free";
}

function formatQtyInput(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

function isAllowedQtyText(raw, integerOnly) {
  const value = String(raw ?? "").trim();
  if (value === "") return true;
  if (integerOnly) return /^\d*$/.test(value);
  return /^\d*(?:[.,]\d*)?$/.test(value);
}

function parseQtyText(raw) {
  const value = String(raw ?? "").trim().replace(",", ".");
  if (!value || value === ".") return null;
  if (value.endsWith(".")) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function LineRow({ line, finalUnit, total, formatARS }) {
  const { setQty, setLineBasePrice, removeLine } = useQuoteStore();
  const user = useAuthStore((state) => state.user);
  const visibleName = String(line.name || line.raw_name || `Producto ${line.product_id}`).trim();
  const visibleOdooId = Number(line.odoo_id || line.product_id || 0) || Number(line.product_id || 0);
  const isProtectedLine = !!line.auto_system_item || !!line.surface_quantity || !!line.previously_billed_line || SYSTEM_PRODUCT_IDS.has(Number(line.product_id));
  const isFreeQuantityLine = !isProtectedLine && isFreeQtyLine(line);
  const isIntegerQtyLine = !isProtectedLine && !isFreeQuantityLine && INTEGER_QTY_PRODUCT_IDS.has(Number(line.product_id));
  const isUnitOnlyLine = !isProtectedLine && !isFreeQuantityLine && !isIntegerQtyLine;
  const canEditQty = isFreeQuantityLine || isIntegerQtyLine;
  const canEditPrice = !!user?.is_distribuidor && isShippingLine(line) && !line.previously_billed_line;
  const isShippingEditableLine = isShippingLine(line);
  const [qtyText, setQtyText] = useState(() => formatQtyInput(line.qty));
  const [priceText, setPriceText] = useState(() => formatQtyInput(line.basePrice));

  useEffect(() => {
    setQtyText(formatQtyInput(line.qty));
  }, [line.qty]);

  useEffect(() => {
    setPriceText(formatQtyInput(line.basePrice));
  }, [line.basePrice]);

  function commitQty(raw, { force = false } = {}) {
    if (!canEditQty) return;
    const parsed = parseQtyText(raw);
    if (parsed === null) {
      if (force) setQtyText(formatQtyInput(line.qty));
      return;
    }

    if (isIntegerQtyLine) {
      const next = Math.trunc(Math.max(0, parsed));
      setQty(line.product_id, next);
      setQtyText(String(next));
      return;
    }

    const next = Math.round(Math.max(0, parsed) * 100) / 100;
    if (next > 0) {
      setQty(line.product_id, next);
      setQtyText(String(next));
      return;
    }

    if (force) setQtyText(formatQtyInput(line.qty));
  }

  function handleQtyChange(e) {
    const raw = e.target.value;
    if (!canEditQty) return;
    if (!isAllowedQtyText(raw, isIntegerQtyLine)) return;
    setQtyText(raw);
    if (!isShippingEditableLine) commitQty(raw);
  }

  function commitPrice(raw, { force = false } = {}) {
    if (!canEditPrice) return;
    const parsed = parseQtyText(raw);
    if (parsed === null) {
      if (force) setPriceText(formatQtyInput(line.basePrice));
      return;
    }
    const next = Math.round(Math.max(0, parsed) * 100) / 100;
    setLineBasePrice(line.product_id, next);
    setPriceText(String(next));
  }

  function handlePriceChange(e) {
    const raw = e.target.value;
    if (!canEditPrice) return;
    if (!isAllowedQtyText(raw, false)) return;
    setPriceText(raw);
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
          {isShippingLine(line) && canEditPrice ? " · Precio editable distribuidor" : ""}
          {line.previously_billed_line ? " · Facturado previamente" : ""}
        </div>
      </td>

      <td className="right">
        <input
          type="text"
          inputMode={isIntegerQtyLine ? "numeric" : "decimal"}
          value={qtyText}
          disabled={!canEditQty}
          onChange={handleQtyChange}
          onBlur={(e) => commitQty(e.target.value, { force: true })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
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

      <td className="right">
        {canEditPrice ? (
          <input
            type="text"
            inputMode="decimal"
            value={priceText}
            onChange={handlePriceChange}
            onBlur={(e) => commitPrice(e.target.value, { force: true })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
            style={{
              width: 120,
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #ddd",
              textAlign: "right",
            }}
          />
        ) : formatARS(line.basePrice)}
      </td>
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

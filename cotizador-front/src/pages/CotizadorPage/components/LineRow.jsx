import Button from "../../../ui/Button";
import { useQuoteStore } from "../../../domain/quote/store";

const SYSTEM_PRODUCT_IDS = new Set([3008, 3009]);
const INTEGER_QTY_PRODUCT_IDS = new Set([3582, 3251]);

function isFreeQtyLine(line) {
  return !!line?.free_quantity || !!line?.quantity_editable || String(line?.quantity_mode || "").toLowerCase() === "free";
}

function getQtyMode({ isProtectedLine, isFreeQuantityLine, isIntegerQtyLine }) {
  if (isProtectedLine) return "protected";
  if (isFreeQuantityLine) return "free";
  if (isIntegerQtyLine) return "integer";
  return "fixed";
}

export default function LineRow({ line, finalUnit, total, formatARS }) {
  const { setQty, removeLine } = useQuoteStore();
  const visibleName = String(line.name || line.raw_name || `Producto ${line.product_id}`).trim();
  const visibleOdooId = Number(line.odoo_id || line.product_id || 0) || Number(line.product_id || 0);
  const isProtectedLine = !!line.auto_system_item || !!line.surface_quantity || !!line.previously_billed_line || SYSTEM_PRODUCT_IDS.has(Number(line.product_id));
  const isFreeQuantityLine = !isProtectedLine && isFreeQtyLine(line);
  const isIntegerQtyLine = !isProtectedLine && !isFreeQuantityLine && INTEGER_QTY_PRODUCT_IDS.has(Number(line.product_id));
  const isUnitOnlyLine = !isProtectedLine && !isFreeQuantityLine && !isIntegerQtyLine;
  const qtyMode = getQtyMode({ isProtectedLine, isFreeQuantityLine, isIntegerQtyLine });
  const canEditQty = qtyMode === "free" || qtyMode === "integer";
  const qtyStep = qtyMode === "integer" ? "1" : "0.01";

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
          type="number"
          value={line.qty}
          min={0}
          step={qtyStep}
          disabled={!canEditQty}
          data-qty-mode={qtyMode}
          aria-label={`Cantidad de ${visibleName}`}
          title={canEditQty ? "Editar cantidad" : "Cantidad fija"}
          onChange={(e) => setQty(line.product_id, e.target.value)}
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

import Button from "../../../ui/Button";
import { useQuoteStore } from "../../../domain/quote/store";

const SYSTEM_PRODUCT_IDS = new Set([3008, 3009]);
const INTEGER_QTY_PRODUCT_IDS = new Set([3582, 3251]);

export default function LineRow({ line, finalUnit, total, formatARS }) {
  const { setQty, removeLine } = useQuoteStore();
  const visibleName = String(line.name || line.raw_name || `Producto ${line.product_id}`).trim();
  const visibleOdooId = Number(line.odoo_id || line.product_id || 0) || Number(line.product_id || 0);
  const isProtectedLine = !!line.auto_system_item || !!line.surface_quantity || !!line.previously_billed_line || SYSTEM_PRODUCT_IDS.has(Number(line.product_id));
  const isIntegerQtyLine = !isProtectedLine && INTEGER_QTY_PRODUCT_IDS.has(Number(line.product_id));
  const isUnitOnlyLine = !isProtectedLine && !isIntegerQtyLine;

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
          {line.previously_billed_line ? " · Facturado previamente" : ""}
        </div>
      </td>

      <td className="right">
        <input
          type="number"
          value={line.qty}
          min={0}
          step={isIntegerQtyLine ? "1" : "0.01"}
          disabled={isProtectedLine || isUnitOnlyLine}
          onChange={(e) => setQty(line.product_id, e.target.value)}
          style={{
            width: 90,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #ddd",
            textAlign: "right",
            opacity: isProtectedLine || isUnitOnlyLine ? 0.7 : 1,
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

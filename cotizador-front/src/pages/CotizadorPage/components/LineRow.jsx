import Button from "../../../ui/Button";
import { useQuoteStore } from "../../../domain/quote/store";

const SYSTEM_PRODUCT_IDS = new Set([3008, 3009]);

export default function LineRow({ line, finalUnit, total, formatARS }) {
  const { setQty, removeLine } = useQuoteStore();
  const visibleName = String(line.name || line.raw_name || `Producto ${line.product_id}`).trim();
  const isProtectedLine = !!line.auto_system_item || !!line.surface_quantity || SYSTEM_PRODUCT_IDS.has(Number(line.product_id));

  return (
    <tr>
      <td style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 600 }}>{visibleName}</div>
        <div className="muted">
          ID: {line.product_id} {line.code ? `| ${line.code}` : ""}
          {line.auto_system_item ? " · Auto por sistema y superficie" : ""}
          {!line.auto_system_item && line.surface_quantity ? " · Cantidad por superficie" : ""}
        </div>
      </td>

      <td className="right">
        <input
          type="number"
          value={line.qty}
          min={0}
          step="0.01"
          disabled={isProtectedLine}
          onChange={(e) => setQty(line.product_id, e.target.value)}
          style={{
            width: 90,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #ddd",
            textAlign: "right",
            opacity: isProtectedLine ? 0.7 : 1,
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

import Button from "../../../ui/Button";
import { useQuoteStore } from "../../../domain/quote/store";

export default function LineRow({ line, finalUnit, total, formatARS }) {
  const { setQty, removeLine } = useQuoteStore();
  const visibleName = String(line.name || line.raw_name || `Producto ${line.product_id}`).trim();
  const isProtectedLine = !!line.surface_quantity || !!line.previously_billed_line;

  return (
    <tr>
      <td style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 600 }}>{visibleName}</div>
        <div className="muted">
          ID: {line.product_id} {line.code ? `| ${line.code}` : ""}
          {line.surface_quantity ? " · Cantidad por superficie" : ""}
          {line.previously_billed_line ? " · Facturado previamente" : ""}
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

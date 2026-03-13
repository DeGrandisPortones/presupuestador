import Button from "../../../ui/Button";
import { useQuoteStore } from "../../../domain/quote/store";

export default function LineRow({ line, finalUnit, total, formatARS }) {
  const { setQty, removeLine } = useQuoteStore();
  const rawName = String(line.raw_name || "").trim();
  const visibleName = String(line.name || rawName || `Producto ${line.product_id}`).trim();
  const showRawName = rawName && rawName !== visibleName;

  return (
    <tr>
      <td style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 600 }}>{visibleName}</div>
        <div className="muted">
          ID: {line.product_id} {line.code ? `| ${line.code}` : ""}
        </div>
        {showRawName ? (
          <div className="muted" style={{ fontSize: 12 }}>
            Nombre interno: {rawName}
          </div>
        ) : null}
      </td>

      <td className="right">
        <input
          type="number"
          value={line.qty}
          min={1}
          onChange={(e) => setQty(line.product_id, e.target.value)}
          style={{ width: 90, padding: "6px 8px", borderRadius: 8, border: "1px solid #ddd", textAlign: "right" }}
        />
      </td>

      <td className="right">{formatARS(line.basePrice)}</td>
      <td className="right">{formatARS(finalUnit)}</td>
      <td className="right" style={{ fontWeight: 700 }}>{formatARS(total)}</td>

      <td className="right">
        <Button variant="danger" onClick={() => removeLine(line.product_id)}>🗑️</Button>
      </td>
    </tr>
  );
}

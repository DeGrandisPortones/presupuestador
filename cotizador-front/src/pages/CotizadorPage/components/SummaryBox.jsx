import { formatARS } from "../../../domain/quote/pricing";

function formatIvaLabel(rate) {
  const n = Number(rate || 0);
  if (!Number.isFinite(n) || n <= 0) return "IVA";
  return `IVA (${(n * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`;
}

export default function SummaryBox({ totals }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ minWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
          <div className="muted">Subtotal</div>
          <div>{formatARS(totals.subtotal)}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
          <div className="muted">{formatIvaLabel(totals.ivaRate)}</div>
          <div>{formatARS(totals.iva)}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #eee", fontWeight: 800 }}>
          <div>Total</div>
          <div>{formatARS(totals.total)}</div>
        </div>
      </div>
    </div>
  );
}

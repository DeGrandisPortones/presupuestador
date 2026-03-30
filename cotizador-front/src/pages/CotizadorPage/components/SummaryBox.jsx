import { formatARS } from "../../../domain/quote/pricing";

export default function SummaryBox({ totals }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ minWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
          <div className="muted">Subtotal</div>
          <div>{formatARS(totals.subtotal)}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
          <div className="muted">IVA</div>
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

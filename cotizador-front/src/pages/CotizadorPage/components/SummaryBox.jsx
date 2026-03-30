import { formatARS } from "../../../domain/quote/pricing";

export default function SummaryBox({ totals, paymentMethod }) {
  const hasFinancing = Number(totals?.financingAmount || 0) > 0;
  const financingPercent = Number(totals?.financingPercent || 0);
  const financingLabel = financingPercent > 0
    ? `Recargo financiación (${financingPercent}%)`
    : "Recargo financiación";

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
        {hasFinancing ? (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
            <div className="muted">
              <div>{financingLabel}</div>
              {paymentMethod ? <div style={{ fontSize: 12 }}>{paymentMethod}</div> : null}
            </div>
            <div>{formatARS(totals.financingAmount)}</div>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #eee", fontWeight: 800 }}>
          <div>Total</div>
          <div>{formatARS(totals.total)}</div>
        </div>
      </div>
    </div>
  );
}

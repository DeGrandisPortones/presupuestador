import { useQuoteStore } from "../../../domain/quote/store";
import { formatARS } from "../../../domain/quote/pricing";

export default function SummaryBox({ totals }) {
  const conditionMode = useQuoteStore((s) => s.conditionMode);
  const isCondition2 = String(conditionMode || "").trim().toLowerCase() === "cond2";

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
        {isCondition2 ? (
          <div
            className="muted"
            style={{
              marginTop: 6,
              paddingTop: 8,
              borderTop: "1px solid #eee",
              fontSize: 12,
              textAlign: "right",
              lineHeight: 1.35,
            }}
          >
            El 10,5% del IVA está aplicado directamente en los productos.
          </div>
        ) : null}
      </div>
    </div>
  );
}

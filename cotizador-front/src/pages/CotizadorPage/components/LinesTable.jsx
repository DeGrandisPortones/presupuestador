import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { calcFinalUnitPrice, calcLineTotal, formatARS, resolveQuoteAdjustmentPercent } from "../../../domain/quote/pricing";
import { getFinancingPreview } from "../../../api/odoo";
import LineRow from "./LineRow";

export default function LinesTable({ financingPercent = null }) {
  const { lines, marginPercent, paymentMethod, conditionMode } = useQuoteStore();
  const shouldResolveFinancing = financingPercent === null || financingPercent === undefined;
  const financingQ = useQuery({
    queryKey: ["financing-preview-lines", paymentMethod],
    queryFn: () => getFinancingPreview(paymentMethod),
    enabled: shouldResolveFinancing && !!String(paymentMethod || "").trim(),
    staleTime: 60 * 1000,
  });
  const rawFinancingPercent = Number(
    shouldResolveFinancing ? financingQ.data?.percent || 0 : financingPercent || 0,
  ) || 0;
  const effectiveFinancingPercent = shouldResolveFinancing
    ? resolveQuoteAdjustmentPercent(rawFinancingPercent, conditionMode)
    : rawFinancingPercent;

  if (!lines.length) return <div className="muted">Agregá productos para armar el presupuesto.</div>;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Ítems</h3>
      {effectiveFinancingPercent !== 0 ? (
        <div className="muted" style={{ marginBottom: 8 }}>
          Los precios finales por ítem incluyen {effectiveFinancingPercent > 0 ? "el recargo" : "el descuento"} aplicado ({Math.abs(effectiveFinancingPercent).toFixed(2)}%).
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th className="right">Cant.</th>
            <th className="right">Precio base</th>
            <th className="right">Precio final</th>
            <th className="right">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const finalUnit = calcFinalUnitPrice(l.basePrice, marginPercent, effectiveFinancingPercent);
            const total = calcLineTotal(l.qty, finalUnit);
            return <LineRow key={l.product_id} line={l} finalUnit={finalUnit} total={total} formatARS={formatARS} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

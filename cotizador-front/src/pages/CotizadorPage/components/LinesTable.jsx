import { useQuoteStore } from "../../../domain/quote/store";
import { calcFinalUnitPrice, calcLineTotal, formatARS } from "../../../domain/quote/pricing";
import LineRow from "./LineRow";

export default function LinesTable({ financingPercent = 0 }) {
  const { lines, marginPercent } = useQuoteStore();

  if (!lines.length) return <div className="muted">Agregá productos para armar el presupuesto.</div>;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Ítems</h3>
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
            const finalUnit = calcFinalUnitPrice(l.basePrice, marginPercent, financingPercent);
            const total = calcLineTotal(l.qty, finalUnit);
            return <LineRow key={l.product_id} line={l} finalUnit={finalUnit} total={total} formatARS={formatARS} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

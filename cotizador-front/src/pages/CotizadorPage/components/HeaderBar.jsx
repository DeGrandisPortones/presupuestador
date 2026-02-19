import Input from "../../../ui/Input.jsx";
import { useQuoteStore } from "../../../domain/quote/store.js";

export default function HeaderBar({ pricelists, loadingPricelists, showMargin }) {
  const {
    pricelistId,
    marginPercent,
    setPricelist,
    setMarginPercent,
    fulfillmentMode,
    setFulfillmentMode,
    endCustomer,
    setEndCustomer,
  } = useQuoteStore();

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center" }}>
        <div>
          <div className="muted">Lista de precios</div>
          <select
            value={pricelistId || ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              const pl = pricelists.find((x) => x.id === id);
              setPricelist(pl || null);
            }}
            disabled={loadingPricelists}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", minWidth: 220 }}
          >
            <option value="" disabled>
              {loadingPricelists ? "Cargando..." : "Seleccionar"}
            </option>
            {pricelists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
        </div>

        {showMargin && (
          <div>
            <div className="muted">Coeficiente (%)</div>
            <Input
              type="number"
              value={marginPercent}
              onChange={(v) => setMarginPercent(v)}
              style={{ minWidth: 120 }}
            />
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div className="muted">Cliente final (nombre)</div>
          <Input
            value={endCustomer.name}
            onChange={(v) => setEndCustomer({ name: v })}
            placeholder="Nombre"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <div className="muted">Teléfono</div>
          <Input
            value={endCustomer.phone}
            onChange={(v) => setEndCustomer({ phone: v })}
            placeholder="Tel."
            style={{ minWidth: 160 }}
          />
        </div>

        <div>
          <div className="muted">Destino</div>
          <select
            value={fulfillmentMode || ""}
            onChange={(e) => setFulfillmentMode(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", minWidth: 180 }}
          >
            <option value="produccion">Producción</option>
            <option value="acopio">Acopio</option>
          </select>
        </div>
      </div>
    </div>
  );
}

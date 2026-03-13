import Input from "../../../ui/Input.jsx";
import { useQuoteStore } from "../../../domain/quote/store.js";
import { PAYMENT_METHODS } from "../../../domain/quote/portonConstants.js";

export default function HeaderBar({ pricelists, loadingPricelists, showMargin }) {
  const {
    pricelistId,
    marginPercent,
    marginPercentInput,
    setPricelist,
    setMarginPercentInput,
    commitMarginPercentInput,
    conditionMode,
    setConditionMode,
    conditionText,
    setConditionText,
    paymentMethod,
    setPaymentMethod,
    endCustomer,
    setEndCustomer,
  } = useQuoteStore();

  const coefClass =
    marginPercent < 0 ? "coef-input coef-negative" :
    marginPercent > 0 ? "coef-input coef-positive" :
    "coef-input";

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
              type="text"
              inputMode="decimal"
              value={marginPercentInput}
              onChange={(v) => setMarginPercentInput(v)}
              onBlur={() => commitMarginPercentInput()}
              className={coefClass}
              placeholder="0"
              style={{ minWidth: 120 }}
            />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="muted">Cliente final (nombre)</div>
          <Input
            value={endCustomer.name}
            onChange={(v) => setEndCustomer({ name: v })}
            placeholder="Nombre"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="muted">Localidad</div>
          <Input
            value={endCustomer.city || ""}
            onChange={(v) => setEndCustomer({ city: v })}
            placeholder="Localidad"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="muted">Dirección</div>
          <Input
            value={endCustomer.address}
            onChange={(v) => setEndCustomer({ address: v })}
            placeholder="Calle y altura"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ minWidth: 170 }}>
          <div className="muted">Teléfono</div>
          <Input
            value={endCustomer.phone}
            onChange={(v) => setEndCustomer({ phone: v })}
            placeholder="Sin 0 y sin 15"
            style={{ minWidth: 160 }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="muted">Correo</div>
          <Input
            value={endCustomer.email || ""}
            onChange={(v) => setEndCustomer({ email: v })}
            placeholder="cliente@correo.com"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="muted">Google Maps (URL)</div>
          <Input
            value={endCustomer.maps_url || ""}
            onChange={(v) => setEndCustomer({ maps_url: v })}
            placeholder="https://maps.app.goo.gl/..."
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <div className="muted">Condición</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={conditionMode || "cond1"}
              onChange={(e) => setConditionMode(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", minWidth: 150 }}
              title="Condición"
            >
              <option value="cond1">Condición 1</option>
              <option value="cond2">Condición 2</option>
              <option value="special">Especial</option>
            </select>

            {conditionMode === "special" ? (
              <Input
                value={conditionText || ""}
                onChange={(v) => setConditionText(v)}
                placeholder="Escribí la condición especial..."
                style={{ minWidth: 260 }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

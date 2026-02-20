import { useEffect, useRef, useState } from "react";
import Input from "../../../ui/Input.jsx";
import { useQuoteStore } from "../../../domain/quote/store.js";

function parsePercent(v) {
  const raw = String(v ?? "").trim();
  if (!raw || raw === "-" || raw === "." || raw === "-," || raw === "-," || raw === "-.") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

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

  // Permite valores intermedios ("-"), sin romper el store numérico.
  const [marginInput, setMarginInput] = useState(String(marginPercent ?? 0));
  const editingRef = useRef(false);

  useEffect(() => {
    if (editingRef.current) return;
    setMarginInput(String(marginPercent ?? 0));
  }, [marginPercent]);

  const marginNum = parsePercent(marginInput);
  const marginTone = marginNum == null ? "" : marginNum < 0 ? "dg-coef--neg" : marginNum > 0 ? "dg-coef--pos" : "";

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
              value={marginInput}
              onFocus={() => {
                editingRef.current = true;
              }}
              onBlur={() => {
                editingRef.current = false;
                const n = parsePercent(marginInput);
                if (n == null) {
                  setMarginPercent(0);
                  setMarginInput("0");
                  return;
                }
                setMarginPercent(n);
                setMarginInput(String(n));
              }}
              onChange={(v) => {
                const next = String(v ?? "");

                // Acepta: "", "-", "10", "-10", "10.5", "-10,5"
                if (!/^-?\d*(?:[.,]\d*)?$/.test(next)) return;

                setMarginInput(next);
                const n = parsePercent(next);
                if (n != null) setMarginPercent(n);
              }}
              className={marginTone}
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

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="muted">Dirección</div>
          <Input
            value={endCustomer.address}
            onChange={(v) => setEndCustomer({ address: v })}
            placeholder="Calle y altura, localidad"
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

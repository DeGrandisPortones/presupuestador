import { useMemo } from "react";
import { useQuoteStore } from "../../../domain/quote/store";
import Input from "../../../ui/Input";

function toNumber(v) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeDecimal(v) {
  // Dejamos solo dígitos y separadores decimales.
  return String(v ?? "").replace(/[^0-9.,]/g, "");
}

export default function PortonDimensions() {
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);

  const width = useMemo(() => toNumber(dimensions?.width), [dimensions?.width]);
  const height = useMemo(() => toNumber(dimensions?.height), [dimensions?.height]);
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);

  return (
    <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Medidas del portón</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Ancho (m)</div>
          <Input
            type="text"
            inputMode="decimal"
            value={dimensions?.width ?? ""}
            onChange={(v) => setDimensions({ width: normalizeDecimal(v) })}
            placeholder="Ej: 3.2"
            style={{ width: 140 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Alto (m)</div>
          <Input
            type="text"
            inputMode="decimal"
            value={dimensions?.height ?? ""}
            onChange={(v) => setDimensions({ height: normalizeDecimal(v) })}
            placeholder="Ej: 2.1"
            style={{ width: 140 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
          <div className="muted">Superficie</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{area ? `${area.toFixed(2)} m²` : "–"}</div>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        Estas medidas se guardan dentro del presupuesto (payload) para usarlas después en el cálculo de cantidades.
      </div>
    </div>
  );
}

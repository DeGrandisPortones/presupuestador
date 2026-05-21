import Input from "../../../ui/Input.jsx";
import { useQuoteStore } from "../../../domain/quote/store.js";

function parseNum(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalizeDecimal(v) {
  return String(v ?? "").replace(/[^0-9.,]/g, "");
}
function metric(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${Math.round(n * 100) / 100}`.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

export default function PuertaDimensions() {
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const width = parseNum(dimensions?.width);
  const height = parseNum(dimensions?.height);
  const area = width * height;

  return (
    <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Medidas de la puerta</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div>
          <div className="muted">Ancho puerta (m)</div>
          <Input
            value={dimensions?.width || ""}
            onChange={(v) => setDimensions({ width: normalizeDecimal(v) })}
            placeholder="Ej: 0.90"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <div className="muted">Alto puerta (m)</div>
          <Input
            value={dimensions?.height || ""}
            onChange={(v) => setDimensions({ height: normalizeDecimal(v) })}
            placeholder="Ej: 2.10"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <div className="muted">Superficie automática</div>
          <Input value={area > 0 ? `${metric(area)} m²` : ""} onChange={() => {}} disabled style={{ width: "100%", background: "#f3f4f6" }} />
        </div>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Esta sección no calcula piernas ni parantes. La superficie se usa para productos configurados como cantidad por m².
      </div>
    </div>
  );
}

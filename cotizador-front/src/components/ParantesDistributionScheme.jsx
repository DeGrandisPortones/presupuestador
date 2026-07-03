import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "../ui/Button.jsx";
import { adminGetTechnicalMeasurementRules } from "../api/admin.js";
import { ParantesSchemeDiagram, computeParantesSchemeProps, getRulesParams } from "../pages/CotizadorPage/components/PortonDimensions.jsx";

function getPayload(quote = {}) {
  return quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
}
function getDimensions(quote = {}) {
  const payload = getPayload(quote);
  return payload?.dimensions && typeof payload.dimensions === "object" ? payload.dimensions : {};
}
function getCatalogKind(quote = {}) {
  return String(quote?.catalog_kind || getPayload(quote)?.catalog_kind || getPayload(quote)?.quote_subkind || "porton").toLowerCase().trim();
}
function isPortonQuote(quote = {}) {
  const kind = getCatalogKind(quote);
  return !["ipanel", "puerta", "plegados", "otros"].includes(kind);
}
function toPositiveNumber(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// El esquema de parantes lo define siempre el presupuesto, con exactamente las mismas
// reglas que usa su editor (PortonDimensions.jsx): aptos vs no aptos, puerta embutida
// con parante fijo, distribucion especial, etc. Se reusan esas mismas funciones (en vez
// de duplicar la logica acá) para que nunca se desincronicen entre la medicion, el
// detalle de presupuesto y el editor.
function useParantesSchemeProps(quote) {
  const isPorton = isPortonQuote(quote);
  const rulesQ = useQuery({
    queryKey: ["technicalMeasurementRulesForMeasurement", "porton"],
    queryFn: () => adminGetTechnicalMeasurementRules("porton"),
    enabled: isPorton,
  });
  const dimensions = getDimensions(quote);
  const params = getRulesParams(rulesQ.data);
  const portonType = String(getPayload(quote)?.porton_type || "");
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const width = toPositiveNumber(dimensions?.width);
  const height = toPositiveNumber(dimensions?.height);
  const schemeProps = isPorton
    ? computeParantesSchemeProps({ dimensions, lines, params, portonType, width, height })
    : null;
  return { isLoading: isPorton && rulesQ.isLoading, schemeProps };
}

export function ParantesDistributionScheme({ quote }) {
  const { isLoading, schemeProps } = useParantesSchemeProps(quote);
  if (isLoading) return <div className="muted">Cargando esquema de parantes...</div>;
  if (!schemeProps?.hasScheme) return <div className="muted">Esquema de parantes no disponible para este presupuesto.</div>;
  return <ParantesSchemeDiagram {...schemeProps} />;
}

export function ParantesDistributionButton({ quote, label = "Ver esquema de parantes" }) {
  const [open, setOpen] = useState(false);
  const { isLoading, schemeProps } = useParantesSchemeProps(quote);
  if (isLoading || !schemeProps?.hasScheme) return null;
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>{label}</Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(980px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(15,23,42,0.3)",
            }}
          >
            <ParantesSchemeDiagram {...schemeProps} onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ParantesDistributionScheme;

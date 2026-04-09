import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import Input from "../../../ui/Input";

function toNumber(v) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalizeDecimal(v) {
  return String(v ?? "").replace(/[^0-9.,]/g, "");
}
function norm(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, "_");
}
function getRulesParams(rulesData) {
  const root = rulesData || {};
  return root.surface_calc_params || root.surface_params || root.measurement_surface_params || {};
}
function getNumberParam(params, keys, fallback) {
  for (const key of keys) {
    const value = Number(String(params?.[key] ?? "").replace(",", "."));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}
function inferKgM2FromType(portonType) {
  const t = norm(portonType);
  if (t.includes("inyect")) return 25;
  if (t.includes("clas")) return 15;
  return 0;
}
function isAptoDerivedType(portonType) {
  return norm(portonType) === "para_revestir_con_al_pvc_otros";
}
function legsTypeForWeight(weightKg, isApto, params) {
  const limitAngostas = getNumberParam(
    params,
    [isApto ? "limit_angostas_apto_kg" : "limit_angostas_kg", "piernas_angostas_hasta_kg"],
    isApto ? 80 : 140,
  );
  const limitComunes = getNumberParam(params, ["limit_comunes_kg", "piernas_comunes_hasta_kg"], 175);
  const limitAnchas = getNumberParam(params, ["limit_anchas_kg", "piernas_anchas_hasta_kg"], 240);
  const limitSuper = getNumberParam(params, ["limit_superanchas_kg", "piernas_superanchas_hasta_kg"], 300);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return "—";
  if (weightKg <= limitAngostas) return "Angostas";
  if (weightKg <= limitComunes) return "Comunes";
  if (weightKg <= limitAnchas) return "Anchas";
  if (weightKg <= limitSuper) return "Superanchas";
  return "Especiales";
}

export default function PortonDimensions({ kind = "porton" }) {
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);

  const rulesQ = useQuery({
    queryKey: ["technical-rules-dimensions-preview"],
    queryFn: adminGetTechnicalMeasurementRules,
    staleTime: 60 * 1000,
    enabled: (kind || "porton") === "porton",
  });

  const width = useMemo(() => toNumber(dimensions?.width), [dimensions?.width]);
  const height = useMemo(() => toNumber(dimensions?.height), [dimensions?.height]);
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);

  const params = useMemo(() => getRulesParams(rulesQ.data), [rulesQ.data]);
  const aptoParaRevestir = useMemo(() => isAptoDerivedType(portonType), [portonType]);
  const enteredKgM2 = toNumber(dimensions?.kg_m2);
  const inferredKgM2 = inferKgM2FromType(portonType);
  const effectiveKgM2 = aptoParaRevestir ? enteredKgM2 : inferredKgM2;
  const estimatedWeightKg = area > 0 && effectiveKgM2 > 0 ? area * effectiveKgM2 : 0;
  const estimatedLegs = useMemo(
    () => legsTypeForWeight(estimatedWeightKg, aptoParaRevestir, params),
    [estimatedWeightKg, aptoParaRevestir, params],
  );

  useEffect(() => {
    if ((kind || "porton") !== "porton") return;
    if (!aptoParaRevestir && String(dimensions?.kg_m2 || "").trim()) {
      setDimensions({ kg_m2: "" });
    }
  }, [aptoParaRevestir, dimensions?.kg_m2, kind, setDimensions]);

  const title =
    (kind || "porton") === "porton"
      ? "Medidas del portón"
      : (kind || "") === "ipanel"
        ? "Medidas del Ipanel"
        : "Medidas del presupuesto";

  return (
    <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Tipo / Sistema derivado</div>
          <Input value={portonType || ""} disabled placeholder="Se completa según la combinación de productos" style={{ width: 280 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Kg por m²</div>
          <Input
            type="text"
            inputMode="decimal"
            value={dimensions?.kg_m2 ?? ""}
            onChange={(v) => setDimensions({ kg_m2: normalizeDecimal(v) })}
            placeholder={aptoParaRevestir ? "Obligatorio para apto para revestir" : "Se habilita solo para apto para revestir"}
            style={{ width: 240 }}
            disabled={!aptoParaRevestir}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
          <div className="muted">Superficie</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{area ? `${area.toFixed(2)} m²` : "–"}</div>
        </div>
      </div>

      <div className="spacer" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div className="muted">Kg/m² efectivo</div>
          <div style={{ fontWeight: 800 }}>
            {effectiveKgM2 > 0 ? `${effectiveKgM2.toFixed(2)} kg/m²` : "—"}
          </div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div className="muted">Peso estimado</div>
          <div style={{ fontWeight: 800 }}>
            {estimatedWeightKg > 0 ? `${estimatedWeightKg.toFixed(2)} kg` : "—"}
          </div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div className="muted">Piernas estimadas</div>
          <div style={{ fontWeight: 800 }}>{estimatedLegs}</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div className="muted">Apto para revestir</div>
          <div style={{ fontWeight: 800 }}>{aptoParaRevestir ? "Sí" : "No"}</div>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        Estas medidas se guardan dentro del presupuesto para usarlas después en medición, cálculo de peso y comparación de superficie.
      </div>
      {aptoParaRevestir && enteredKgM2 <= 0 ? (
        <div style={{ marginTop: 8, color: "#b45309", fontWeight: 700 }}>
          Este sistema derivado es apto para revestir. Declarar kg/m² es obligatorio.
        </div>
      ) : null}
    </div>
  );
}

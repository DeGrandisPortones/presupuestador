import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import { portonTypeLabel } from "../../../domain/quote/portonConstants.js";
import Input from "../../../ui/Input";

function toNumber(v) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalizeDecimal(v) { return String(v ?? "").replace(/[^0-9.,]/g, ""); }
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
function getStringParam(params, keys, fallback = "") {
  for (const key of keys) {
    const value = String(params?.[key] ?? "").trim();
    if (value) return value;
  }
  return fallback;
}
function getProductIdSet(params, keys) {
  const raw = getStringParam(params, keys, "");
  return new Set(String(raw || "").split(/[;,\s]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0));
}
function detectAptoParaRevestir(lines, params) {
  const ids = getProductIdSet(params, ["apto_para_revestir_product_id", "apto_para_revestir_product_ids", "sin_revestimiento_product_id", "sin_revestimiento_product_ids"]);
  if (!ids.size) return false;
  return (Array.isArray(lines) ? lines : []).some((line) => ids.has(Number(line?.product_id)));
}
function inferKgM2FromType(portonType) {
  const t = norm(portonType);
  if (t.includes("inyect")) return 25;
  if (t.includes("clas")) return 15;
  return 0;
}
function legsTypeForWeight(weightKg, isApto, params) {
  const limitAngostas = getNumberParam(params, [isApto ? "limit_angostas_apto_kg" : "limit_angostas_kg", "piernas_angostas_hasta_kg"], isApto ? 80 : 140);
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
  const lines = useQuoteStore((s) => s.lines);

  const showTypeInfo = (kind || "porton") === "porton";
  const rulesQ = useQuery({ queryKey: ["technical-rules-dimensions-preview"], queryFn: adminGetTechnicalMeasurementRules, staleTime: 60 * 1000, enabled: showTypeInfo });

  const width = useMemo(() => toNumber(dimensions?.width), [dimensions?.width]);
  const height = useMemo(() => toNumber(dimensions?.height), [dimensions?.height]);
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);
  const params = useMemo(() => getRulesParams(rulesQ.data), [rulesQ.data]);
  const isAptoParaRevestir = useMemo(() => detectAptoParaRevestir(lines, params), [lines, params]);
  const enteredKgM2 = toNumber(dimensions?.kg_m2);
  const inferredKgM2 = inferKgM2FromType(portonType);
  const effectiveKgM2 = enteredKgM2 > 0 ? enteredKgM2 : inferredKgM2;
  const estimatedWeightKg = area > 0 && effectiveKgM2 > 0 ? area * effectiveKgM2 : 0;
  const estimatedLegs = useMemo(() => legsTypeForWeight(estimatedWeightKg, isAptoParaRevestir, params), [estimatedWeightKg, isAptoParaRevestir, params]);

  const title = (kind || "porton") === "porton" ? "Medidas del portón" : ((kind || "") === "ipanel" ? "Medidas del Ipanel" : "Medidas del presupuesto");

  return (
    <div>
      {showTypeInfo ? (
        <>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Sistema derivado</div>
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fafafa", marginBottom: 12 }}>
            <div style={{ fontWeight: 800 }}>{portonType ? portonTypeLabel(portonType) || portonType : "Todavía no derivado"}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Este dato ya no lo elige el vendedor/distribuidor. Se deriva según la combinación de productos y dependencias configuradas en Dashboard.
            </div>
          </div>
        </>
      ) : null}

      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Ancho (m)</div>
          <Input type="text" inputMode="decimal" value={dimensions?.width ?? ""} onChange={(v) => setDimensions({ width: normalizeDecimal(v) })} placeholder="Ej: 3.2" style={{ width: 140 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Alto (m)</div>
          <Input type="text" inputMode="decimal" value={dimensions?.height ?? ""} onChange={(v) => setDimensions({ height: normalizeDecimal(v) })} placeholder="Ej: 2.1" style={{ width: 140 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Kg por m²</div>
          <Input type="text" inputMode="decimal" value={dimensions?.kg_m2 ?? ""} onChange={(v) => setDimensions({ kg_m2: normalizeDecimal(v) })} placeholder={isAptoParaRevestir ? "Obligatorio si es apto para revestir" : "Opcional"} style={{ width: 220 }} />
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
          <div style={{ fontWeight: 800 }}>{effectiveKgM2 > 0 ? `${effectiveKgM2.toFixed(2)} kg/m²` : "—"}</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div className="muted">Peso estimado</div>
          <div style={{ fontWeight: 800 }}>{estimatedWeightKg > 0 ? `${estimatedWeightKg.toFixed(2)} kg` : "—"}</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div className="muted">Piernas estimadas</div>
          <div style={{ fontWeight: 800 }}>{estimatedLegs}</div>
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
          <div className="muted">Sin revestimiento</div>
          <div style={{ fontWeight: 800 }}>{isAptoParaRevestir ? "Sí" : "No"}</div>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Estas medidas se guardan dentro del presupuesto (payload) para usarlas después en medición, cálculo de peso y comparación de superficie.
      </div>
      {isAptoParaRevestir && enteredKgM2 <= 0 ? (
        <div style={{ marginTop: 8, color: "#b45309", fontWeight: 700 }}>
          Este portón está marcado como apto para revestir. Declarar kg/m² es obligatorio.
        </div>
      ) : null}
    </div>
  );
}

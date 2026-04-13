import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import Input from "../../../ui/Input";

const WIDTH_MIN_M = 2;
const WIDTH_MAX_M = 7;
const HEIGHT_MIN_M = 2;
const HEIGHT_MAX_M = 3;

function toNumber(v) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalizeDecimal(v) {
  return String(v ?? "").replace(/[^0-9.,]/g, "");
}
function normalizeDecimalWithDot(v) {
  return normalizeDecimal(v).replace(",", ".");
}
function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}
function clampDimensionInput(raw, min, max) {
  const normalized = normalizeDecimalWithDot(raw);
  if (!normalized.trim()) return "";
  const n = Number(normalized);
  if (!Number.isFinite(n)) return normalized;
  return formatNumberForInput(clampNumber(n, min, max));
}
function norm(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, "_");
}
function getRulesParams(rulesData) {
  const root = rulesData || {};
  return root.surface_parameters || root.surface_calc_params || root.surface_params || root.measurement_surface_params || {};
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
function normalizeAptoKgRules(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map((item, index) => ({
      id: String(item?.id || `apto_rule_${index + 1}`),
      product_id: Number(item?.product_id || 0),
      kg_m2: Number(String(item?.kg_m2 ?? "").replace(",", ".")),
    }))
    .filter((item) => item.product_id > 0 && Number.isFinite(item.kg_m2) && item.kg_m2 > 0);
}
function getBudgetProductIdSetFromLines(lines) {
  return new Set((Array.isArray(lines) ? lines : []).map((line) => Number(line?.product_id || 0)).filter(Boolean));
}
function resolveAptoKgM2ByProducts(lines, params) {
  const rules = normalizeAptoKgRules(params?.apto_revestir_kg_m2_rules);
  if (!rules.length) return 0;
  const ids = getBudgetProductIdSetFromLines(lines);
  for (const rule of rules) {
    if (ids.has(rule.product_id)) return rule.kg_m2;
  }
  return 0;
}
function formatNumberForInput(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
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

function FieldBox({ label, helper, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div className="muted">{label}</div>
      {children}
      {helper ? <div className="muted" style={{ lineHeight: 1.3, minHeight: 32 }}>{helper}</div> : <div style={{ minHeight: 32 }} />}
    </div>
  );
}

export default function PortonDimensions({ kind = "porton" }) {
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);
  const lines = useQuoteStore((s) => s.lines);

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
  const legacyKgM2 = toNumber(dimensions?.kg_m2);
  const configuredKgM2 = useMemo(
    () => (aptoParaRevestir ? resolveAptoKgM2ByProducts(lines, params) : 0),
    [aptoParaRevestir, lines, params],
  );
  const inferredKgM2 = inferKgM2FromType(portonType);
  const effectiveKgM2 = aptoParaRevestir
    ? (configuredKgM2 > 0 ? configuredKgM2 : legacyKgM2)
    : inferredKgM2;
  const estimatedWeightKg = area > 0 && effectiveKgM2 > 0 ? area * effectiveKgM2 : 0;
  const estimatedLegs = useMemo(
    () => legsTypeForWeight(estimatedWeightKg, aptoParaRevestir, params),
    [estimatedWeightKg, aptoParaRevestir, params],
  );

  useEffect(() => {
    if ((kind || "porton") !== "porton") return;
    if (!aptoParaRevestir) {
      if (String(dimensions?.kg_m2 || "").trim()) {
        setDimensions({ kg_m2: "" });
      }
      return;
    }
    if (configuredKgM2 > 0) {
      const nextValue = formatNumberForInput(configuredKgM2);
      if (String(dimensions?.kg_m2 || "").trim() !== nextValue) {
        setDimensions({ kg_m2: nextValue });
      }
    }
  }, [aptoParaRevestir, configuredKgM2, dimensions?.kg_m2, kind, setDimensions]);

  const title =
    (kind || "porton") === "porton"
      ? "Medidas del portón"
      : (kind || "") === "ipanel"
        ? "Medidas del Ipanel"
        : "Medidas del presupuesto";

  return (
    <div>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        <FieldBox label="Ancho (m)" helper="Mínimo 2 m · Máximo 7 m">
          <Input
            type="text"
            inputMode="decimal"
            value={dimensions?.width ?? ""}
            onChange={(v) => setDimensions({ width: clampDimensionInput(v, WIDTH_MIN_M, WIDTH_MAX_M) })}
            onBlur={(e) => setDimensions({ width: clampDimensionInput(e?.target?.value, WIDTH_MIN_M, WIDTH_MAX_M) })}
            placeholder="Ej: 3.2"
            style={{ width: "100%" }}
          />
        </FieldBox>

        <FieldBox label="Alto (m)" helper="Mínimo 2 m · Máximo 3 m">
          <Input
            type="text"
            inputMode="decimal"
            value={dimensions?.height ?? ""}
            onChange={(v) => setDimensions({ height: clampDimensionInput(v, HEIGHT_MIN_M, HEIGHT_MAX_M) })}
            onBlur={(e) => setDimensions({ height: clampDimensionInput(e?.target?.value, HEIGHT_MIN_M, HEIGHT_MAX_M) })}
            placeholder="Ej: 2.1"
            style={{ width: "100%" }}
          />
        </FieldBox>

        <FieldBox label="Tipo / Sistema derivado">
          <Input
            value={portonType || ""}
            disabled
            placeholder="Se completa según la combinación de productos"
            style={{ width: "100%" }}
          />
        </FieldBox>

        <FieldBox label="Kg por m²">
          <Input
            value={formatNumberForInput(effectiveKgM2)}
            placeholder={aptoParaRevestir ? "Se completa según la tabla de apto para revestir" : "Se calcula automáticamente según el sistema"}
            style={{ width: "100%" }}
            disabled
          />
        </FieldBox>

        <FieldBox label="Superficie">
          <div style={{ fontWeight: 800, fontSize: 16, minHeight: 40, display: "flex", alignItems: "center" }}>
            {area ? `${area.toFixed(2)} m²` : "–"}
          </div>
        </FieldBox>
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
      {aptoParaRevestir && configuredKgM2 <= 0 && legacyKgM2 <= 0 ? (
        <div style={{ marginTop: 8, color: "#b45309", fontWeight: 700 }}>
          Este sistema derivado es apto para revestir, pero no tiene una regla de kg/m² configurada.
        </div>
      ) : null}
    </div>
  );
}
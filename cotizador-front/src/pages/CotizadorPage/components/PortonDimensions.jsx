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
function isInjectedDoorTypeKey(value) {
  const key = norm(value);
  return key.includes("inyect") || key.includes("doble_iny") || /(^|_)iny($|_)/.test(key);
}
function isClassicDoorTypeKey(value) {
  const key = norm(value);
  return key.includes("clas") || key.includes("estandar");
}
function inferKgM2FromType(portonType) {
  if (isInjectedDoorTypeKey(portonType)) return 25;
  if (isClassicDoorTypeKey(portonType)) return 15;
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
function detectInstallationModeByProducts(lines, params) {
  const ids = getBudgetProductIdSetFromLines(lines);
  const insideId = Number(params?.installation_inside_product_id || 0);
  const behindId = Number(params?.installation_behind_product_id || 0);
  if (insideId && ids.has(insideId)) return "dentro_vano";
  if (behindId && ids.has(behindId)) return "detras_vano";
  return "sin_instalacion";
}
function formatNumberForInput(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
function legsTypeForWeight(weightKg, isApto, params) {
  const limitAngostas = getNumberParam(
    params,
    [
      isApto ? "no_cladding_angostas_max_kg" : "legs_angostas_max_kg",
      isApto ? "limit_angostas_apto_kg" : "limit_angostas_kg",
      "piernas_angostas_hasta_kg",
    ],
    isApto ? 80 : 140,
  );
  const limitComunes = getNumberParam(params, ["legs_comunes_max_kg", "limit_comunes_kg", "piernas_comunes_hasta_kg"], 175);
  const limitAnchas = getNumberParam(params, ["legs_anchas_max_kg", "limit_anchas_kg", "piernas_anchas_hasta_kg"], 240);
  const limitSuper = getNumberParam(params, ["legs_superanchas_max_kg", "limit_superanchas_kg", "piernas_superanchas_hasta_kg"], 300);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return "—";
  if (weightKg <= limitAngostas) return "Angostas";
  if (weightKg <= limitComunes) return "Comunes";
  if (weightKg <= limitAnchas) return "Anchas";
  if (weightKg <= limitSuper) return "Superanchas";
  return "Especiales";
}
function formatMmPair(heightMm, widthMm) {
  const h = Number(heightMm || 0);
  const w = Number(widthMm || 0);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return "—";
  return `${Math.round(h)} mm x ${Math.round(w)} mm`;
}
function buildPreviewContext({ width, height, lines, params, effectiveKgM2, aptoParaRevestir }) {
  const budgetHeightMm = Math.round(Math.max(0, Number(height || 0)) * 1000);
  const budgetWidthMm = Math.round(Math.max(0, Number(width || 0)) * 1000);
  const installationMode = detectInstallationModeByProducts(lines, params);
  const heightDiscountMm = Number(params?.weight_height_discount_mm || 10);
  const widthDiscountMm = Number(params?.weight_width_discount_mm || 14);
  const discountedHeightMm = Math.max(0, budgetHeightMm - heightDiscountMm);
  const discountedWidthMm = Math.max(0, budgetWidthMm - widthDiscountMm);
  const discountedHeightM = discountedHeightMm / 1000;
  const discountedWidthM = discountedWidthMm / 1000;
  const estimatedWeightKg = effectiveKgM2 > 0 ? Number((discountedHeightM * discountedWidthM * effectiveKgM2).toFixed(2)) : 0;
  const estimatedLegs = legsTypeForWeight(estimatedWeightKg, aptoParaRevestir, params);

  let stepHeightMm = discountedHeightMm;
  let stepWidthMm = discountedWidthMm;
  if (installationMode === "detras_vano") {
    stepHeightMm = Math.max(0, budgetHeightMm + Number(params?.behind_vano_add_height_mm || 100));
    const addMap = {
      angostas: Number(params?.legs_angostas_add_width_mm || 140),
      comunes: Number(params?.legs_comunes_add_width_mm || 200),
      anchas: Number(params?.legs_anchas_add_width_mm || 280),
      superanchas: Number(params?.legs_superanchas_add_width_mm || 380),
      especiales: Number(params?.legs_especiales_add_width_mm || params?.legs_superanchas_add_width_mm || 380),
    };
    stepWidthMm = Math.max(0, budgetWidthMm + Number(addMap[estimatedLegs.toLowerCase()] || 0));
  } else if (installationMode === "dentro_vano") {
    stepHeightMm = Math.max(0, budgetHeightMm - Number(params?.inside_vano_subtract_height_mm || 10));
    stepWidthMm = Math.max(0, budgetWidthMm - Number(params?.inside_vano_subtract_width_mm || 20));
  }

  return {
    installationMode,
    estimatedWeightKg,
    estimatedLegs,
    stepHeightMm,
    stepWidthMm,
  };
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
function CalculatedCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", background: "#f3f4f6", borderRadius: 10, padding: 10 }}>
      <div className="muted">{label}</div>
      <div style={{ fontWeight: 800 }}>{value || "—"}</div>
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

  const preview = useMemo(
    () => buildPreviewContext({ width, height, lines, params, effectiveKgM2, aptoParaRevestir }),
    [width, height, lines, params, effectiveKgM2, aptoParaRevestir],
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
            style={{ width: "100%", background: "#f3f4f6" }}
          />
        </FieldBox>

        <FieldBox label="Kg por m²">
          <Input
            value={formatNumberForInput(effectiveKgM2)}
            placeholder={aptoParaRevestir ? "Se completa según la tabla de apto para revestir" : "Se calcula automáticamente según el sistema"}
            style={{ width: "100%", background: "#f3f4f6" }}
            disabled
          />
        </FieldBox>

        <FieldBox label="Superficie">
          <div style={{ fontWeight: 800, fontSize: 16, minHeight: 40, display: "flex", alignItems: "center", border: "1px solid #e5e7eb", background: "#f3f4f6", borderRadius: 10, padding: "0 12px" }}>
            {area ? `${area.toFixed(2)} m²` : "–"}
          </div>
        </FieldBox>
      </div>

      <div className="spacer" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <CalculatedCard label="Kg/m² efectivo" value={effectiveKgM2 > 0 ? `${effectiveKgM2.toFixed(2)} kg/m²` : "—"} />
        <CalculatedCard label="Peso estimado" value={preview.estimatedWeightKg > 0 ? `${preview.estimatedWeightKg.toFixed(2)} kg` : "—"} />
        <CalculatedCard label="Piernas estimadas" value={preview.estimatedLegs} />
        <CalculatedCard label="Medidas de paso" value={formatMmPair(preview.stepHeightMm, preview.stepWidthMm)} />
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

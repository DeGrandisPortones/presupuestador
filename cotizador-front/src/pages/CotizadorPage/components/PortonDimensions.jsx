import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import Input from "../../../ui/Input";

const WIDTH_MIN_M = 2.4;
const WIDTH_MAX_M = 7;
const HEIGHT_MIN_M = 2;
const HEIGHT_MAX_M = 3;
const PARANTES_SPECIAL_PRODUCT_ID = 3006;

function parseOptionalNumber(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toNumber(v) {
  const n = parseOptionalNumber(v);
  return Number.isFinite(n) ? n : 0;
}
function normalizeDecimal(v) {
  return String(v ?? "").replace(/[^0-9.,]/g, "");
}
function normalizeDecimalWithDot(v) {
  return normalizeDecimal(v).replace(",", ".");
}
function normalizeIntegerInput(v) {
  return String(v ?? "").replace(/\D+/g, "");
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
function formatNumberForInput(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}
function formatMetersFromMm(mm) {
  const n = Number(mm || 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${(n / 1000).toFixed(2)} m`;
}
function getBudgetProductIdSetFromLines(lines) {
  return new Set((Array.isArray(lines) ? lines : []).map((line) => Number(line?.product_id || 0)).filter(Boolean));
}
function detectInstallationModeByProducts(lines, params) {
  const ids = getBudgetProductIdSetFromLines(lines);
  const insideId = Number(params?.installation_inside_product_id || 0);
  const behindId = Number(params?.installation_behind_product_id || 0);
  if (insideId && ids.has(insideId)) return "dentro_vano";
  if (behindId && ids.has(behindId)) return "detras_vano";
  return "sin_instalacion";
}
function detectNoCladdingByProducts(lines, params) {
  const ids = getBudgetProductIdSetFromLines(lines);
  const noCladdingId = Number(params?.no_cladding_product_id || 0);
  return !!(noCladdingId && ids.has(noCladdingId));
}
function inferKgM2FromType(portonType) {
  const t = norm(portonType);
  if (!t) return 0;
  if (t.includes("para_revestir")) return 0;
  if (
    t.includes("inyect") ||
    t.includes("doble_iny") ||
    t.endsWith("_iny") ||
    t.includes("_iny_")
  ) return 25;
  if (t.includes("clas") || t.includes("estandar")) return 15;
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
function resolveAptoKgM2ByProducts(lines, params) {
  const rules = normalizeAptoKgRules(params?.apto_revestir_kg_m2_rules);
  if (!rules.length) return 0;
  const ids = getBudgetProductIdSetFromLines(lines);
  for (const rule of rules) {
    if (ids.has(rule.product_id)) return rule.kg_m2;
  }
  return 0;
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
function mapLegsKeyForWidth(legsLabel) {
  const t = norm(legsLabel);
  if (t.includes("super")) return "superanchas";
  if (t.includes("especial")) return "especiales";
  if (t.includes("ancha")) return "anchas";
  if (t.includes("comun")) return "comunes";
  return "angostas";
}
function buildCalculatedPreview({ widthM, heightM, lines, params, portonType }) {
  const widthMm = Math.round((Number(widthM || 0) || 0) * 1000);
  const heightMm = Math.round((Number(heightM || 0) || 0) * 1000);
  const areaM2 = (Number(widthM || 0) || 0) * (Number(heightM || 0) || 0);

  const installationMode = detectInstallationModeByProducts(lines, params);
  const aptoParaRevestir = isAptoDerivedType(portonType) || detectNoCladdingByProducts(lines, params);
  const aptoKg = aptoParaRevestir ? resolveAptoKgM2ByProducts(lines, params) : 0;
  const inferredKg = inferKgM2FromType(portonType);
  const effectiveKgM2 = aptoParaRevestir ? aptoKg : inferredKg;

  const weightHeightDiscountMm = Number(params?.weight_height_discount_mm || 10);
  const weightWidthDiscountMm = Number(params?.weight_width_discount_mm || 14);
  const discountedHeightMm = Math.max(0, heightMm - weightHeightDiscountMm);
  const discountedWidthMm = Math.max(0, widthMm - weightWidthDiscountMm);
  const estimatedWeightKg = areaM2 > 0 && effectiveKgM2 > 0
    ? Number((discountedHeightMm / 1000 * discountedWidthMm / 1000 * effectiveKgM2).toFixed(2))
    : 0;

  const legsLabel = legsTypeForWeight(estimatedWeightKg, aptoParaRevestir, params);
  const legsKey = mapLegsKeyForWidth(legsLabel);

  let altoPasoMm = discountedHeightMm;
  let anchoPasoMm = discountedWidthMm;

  if (installationMode === "detras_vano") {
    const addMap = {
      angostas: Number(params?.legs_angostas_add_width_mm || 140),
      comunes: Number(params?.legs_comunes_add_width_mm || 200),
      anchas: Number(params?.legs_anchas_add_width_mm || 280),
      superanchas: Number(params?.legs_superanchas_add_width_mm || 380),
      especiales: Number(params?.legs_especiales_add_width_mm || params?.legs_superanchas_add_width_mm || 380),
    };
    altoPasoMm = Math.max(0, heightMm + Number(params?.behind_vano_add_height_mm || 100));
    anchoPasoMm = Math.max(0, widthMm + Number(addMap[legsKey] || 0));
  } else if (installationMode === "dentro_vano") {
    altoPasoMm = Math.max(0, heightMm - Number(params?.inside_vano_subtract_height_mm || 10));
    anchoPasoMm = Math.max(0, widthMm - Number(params?.inside_vano_subtract_width_mm || 20));
  }

  return {
    effectiveKgM2,
    estimatedWeightKg,
    legsLabel,
    altoPasoMm,
    anchoPasoMm,
  };
}
function inputStateStyle(hasError) {
  return hasError
    ? {
        width: "100%",
        borderColor: "#dc2626",
        boxShadow: "0 0 0 3px rgba(220, 38, 38, 0.12)",
        background: "#fff7f7",
      }
    : { width: "100%" };
}
function disabledComputedInputStyle(extra = {}) {
  return {
    width: "100%",
    background: "#f3f4f6",
    color: "#475569",
    borderColor: "#d1d5db",
    ...extra,
  };
}
function FieldBox({ label, helper, helperColor, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div className="muted">{label}</div>
      {children}
      {helper ? (
        <div className="muted" style={{ lineHeight: 1.3, minHeight: 32, color: helperColor || undefined }}>
          {helper}
        </div>
      ) : (
        <div style={{ minHeight: 32 }} />
      )}
    </div>
  );
}
function ComputedCard({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: 10,
        background: "#f3f4f6",
      }}
    >
      <div className="muted">{label}</div>
      <div style={{ fontWeight: 800, color: "#334155" }}>{value || "—"}</div>
    </div>
  );
}
function normalizeOrientation(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "horizontal" || raw === "horizontales") return "horizontal";
  return "verticales";
}
function normalizeDistribution(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "especial" ? "especial" : "repartido";
}
function hasSpecialParantesProduct(lines) {
  return getBudgetProductIdSetFromLines(lines).has(PARANTES_SPECIAL_PRODUCT_ID);
}
function computeVerticalParantesCount(widthM, lines) {
  const width = Number(widthM || 0) || 0;
  if (!(width > 0)) return 0;
  const baseWidth = hasSpecialParantesProduct(lines) ? width : Math.max(0, width - 0.8);
  return Math.max(0, Math.floor(baseWidth));
}

export default function PortonDimensions({ kind = "porton" }) {
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);
  const lines = useQuoteStore((s) => s.lines);
  const lastAutoParantesRef = useRef("");

  const rulesQ = useQuery({
    queryKey: ["technical-rules-dimensions-preview"],
    queryFn: adminGetTechnicalMeasurementRules,
    staleTime: 60 * 1000,
    enabled: (kind || "porton") === "porton",
  });

  const widthRaw = String(dimensions?.width ?? "");
  const heightRaw = String(dimensions?.height ?? "");
  const width = useMemo(() => toNumber(widthRaw), [widthRaw]);
  const height = useMemo(() => toNumber(heightRaw), [heightRaw]);
  const widthValue = useMemo(() => parseOptionalNumber(normalizeDecimalWithDot(widthRaw)), [widthRaw]);
  const heightValue = useMemo(() => parseOptionalNumber(normalizeDecimalWithDot(heightRaw)), [heightRaw]);
  const widthOutOfBounds = widthValue !== null && (widthValue < WIDTH_MIN_M || widthValue > WIDTH_MAX_M);
  const heightOutOfBounds = heightValue !== null && (heightValue < HEIGHT_MIN_M || heightValue > HEIGHT_MAX_M);
  const hasSizeError = widthOutOfBounds || heightOutOfBounds;
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);

  const orientation = useMemo(
    () => normalizeOrientation(dimensions?.orientacion_parantes),
    [dimensions?.orientacion_parantes],
  );
  const distribution = useMemo(
    () => normalizeDistribution(dimensions?.distribucion_parantes),
    [dimensions?.distribucion_parantes],
  );
  const autoParantesCount = useMemo(
    () => computeVerticalParantesCount(width, lines),
    [width, lines],
  );

  const params = useMemo(() => getRulesParams(rulesQ.data), [rulesQ.data]);
  const preview = useMemo(
    () => buildCalculatedPreview({ widthM: width, heightM: height, lines, params, portonType }),
    [width, height, lines, params, portonType],
  );

  useEffect(() => {
    if ((kind || "porton") !== "porton") return;
    if (!isAptoDerivedType(portonType)) {
      if (String(dimensions?.kg_m2 || "").trim()) setDimensions({ kg_m2: "" });
      return;
    }
    const configuredKgM2 = resolveAptoKgM2ByProducts(lines, params);
    if (configuredKgM2 > 0) {
      const nextValue = formatNumberForInput(configuredKgM2);
      if (String(dimensions?.kg_m2 || "").trim() !== nextValue) {
        setDimensions({ kg_m2: nextValue });
      }
    }
  }, [kind, portonType, dimensions?.kg_m2, lines, params, setDimensions]);

  useEffect(() => {
    if ((kind || "porton") !== "porton") return;
    const patch = {};
    if (!String(dimensions?.orientacion_parantes || "").trim()) {
      patch.orientacion_parantes = "verticales";
    }
    if (!String(dimensions?.distribucion_parantes || "").trim()) {
      patch.distribucion_parantes = "repartido";
    }
    if (orientation === "verticales") {
      const nextCount = String(autoParantesCount);
      const currentCount = String(dimensions?.cantidad_parantes ?? "").trim();
      if (!currentCount || currentCount === String(lastAutoParantesRef.current || "").trim()) {
        if (currentCount !== nextCount) {
          patch.cantidad_parantes = nextCount;
        }
      }
      lastAutoParantesRef.current = nextCount;
    } else {
      lastAutoParantesRef.current = String(autoParantesCount);
    }
    if (Object.keys(patch).length) {
      setDimensions(patch);
    }
  }, [
    kind,
    orientation,
    autoParantesCount,
    dimensions?.orientacion_parantes,
    dimensions?.distribucion_parantes,
    dimensions?.cantidad_parantes,
    setDimensions,
  ]);

  const title =
    (kind || "porton") === "porton"
      ? "Medidas del portón"
      : (kind || "") === "ipanel"
        ? "Medidas del Ipanel"
        : "Medidas del presupuesto";

  const parantesHelper =
    orientation === "verticales"
      ? (
          hasSpecialParantesProduct(lines)
            ? "Se sugiere automáticamente usando el ancho completo. Si querés, podés cambiar el valor manualmente."
            : "Se sugiere automáticamente restando 0.80 m al ancho. Si querés, podés cambiar el valor manualmente."
        )
      : "En horizontal podés ajustar manualmente la cantidad de parantes.";

  return (
    <div
      style={{
        border: `1px solid ${hasSizeError ? "#fca5a5" : "transparent"}`,
        borderRadius: 14,
        padding: 4,
        background: hasSizeError ? "#fff7f7" : "transparent",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>

      {hasSizeError ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#fee2e2",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          Se encuentra fuera de los límites de tamaño.
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        <FieldBox
          label="Ancho (m)"
          helper="Mínimo 2.4 m · Máximo 7 m"
          helperColor={widthOutOfBounds ? "#b91c1c" : undefined}
        >
          <Input
            type="text"
            inputMode="decimal"
            value={widthRaw}
            onChange={(v) => setDimensions({ width: normalizeDecimal(v) })}
            onBlur={(e) => setDimensions({ width: normalizeDecimal(e?.target?.value) })}
            placeholder="Ej: 3.2"
            style={inputStateStyle(widthOutOfBounds)}
          />
        </FieldBox>

        <FieldBox
          label="Alto (m)"
          helper="Mínimo 2 m · Máximo 3 m"
          helperColor={heightOutOfBounds ? "#b91c1c" : undefined}
        >
          <Input
            type="text"
            inputMode="decimal"
            value={heightRaw}
            onChange={(v) => setDimensions({ height: normalizeDecimal(v) })}
            onBlur={(e) => setDimensions({ height: normalizeDecimal(e?.target?.value) })}
            placeholder="Ej: 2.1"
            style={inputStateStyle(heightOutOfBounds)}
          />
        </FieldBox>

        <FieldBox label="Tipo / Sistema derivado">
          <Input
            value={portonType || ""}
            disabled
            placeholder="Se completa según la combinación de productos"
            style={disabledComputedInputStyle()}
          />
        </FieldBox>

        <FieldBox label="Kg por m²">
          <Input
            value={formatNumberForInput(preview.effectiveKgM2)}
            placeholder="Se calcula automáticamente según el sistema"
            style={disabledComputedInputStyle()}
            disabled
          />
        </FieldBox>

        <FieldBox label="Superficie">
          <div
            style={{
              fontWeight: 800,
              fontSize: 16,
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#f3f4f6",
              color: "#334155",
            }}
          >
            {area ? `${area.toFixed(2)} m²` : "—"}
          </div>
        </FieldBox>

        <FieldBox label="Orientación de los parantes">
          <select
            value={orientation}
            onChange={(e) => setDimensions({ orientacion_parantes: e.target.value })}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            <option value="verticales">Verticales</option>
            <option value="horizontal">Horizontal</option>
          </select>
        </FieldBox>

        <FieldBox
          label="Cantidad de parantes"
          helper={parantesHelper}
        >
          <Input
            type="text"
            inputMode="numeric"
            value={String(dimensions?.cantidad_parantes ?? "")}
            onChange={(v) => {
              setDimensions({ cantidad_parantes: normalizeIntegerInput(v) });
            }}
            onBlur={(e) => {
              setDimensions({ cantidad_parantes: normalizeIntegerInput(e?.target?.value) });
            }}
            style={{ width: "100%" }}
            placeholder="Ej: 3"
          />
        </FieldBox>

        <FieldBox label="Distribución de los parantes">
          <select
            value={distribution}
            onChange={(e) => setDimensions({ distribucion_parantes: e.target.value })}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            <option value="repartido">Repartido</option>
            <option value="especial">Especial</option>
          </select>
        </FieldBox>
      </div>

      {distribution === "especial" ? (
        <>
          <div className="spacer" />
          <FieldBox label="Observaciones de distribución especial">
            <textarea
              value={String(dimensions?.observaciones_parantes ?? "")}
              onChange={(e) => setDimensions({ observaciones_parantes: e.target.value })}
              rows={3}
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid #ddd",
                padding: "10px 12px",
                resize: "vertical",
                fontFamily: "inherit",
              }}
              placeholder="Indicá cómo debe ser la distribución especial de los parantes."
            />
          </FieldBox>
        </>
      ) : null}

      <div className="spacer" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <ComputedCard
          label="Medidas de paso"
          value={
            preview.altoPasoMm > 0 && preview.anchoPasoMm > 0
              ? `${formatMetersFromMm(preview.altoPasoMm)} × ${formatMetersFromMm(preview.anchoPasoMm)}`
              : "—"
          }
        />
        <ComputedCard
          label="Kg/m² efectivo"
          value={preview.effectiveKgM2 > 0 ? `${preview.effectiveKgM2.toFixed(2)} kg/m²` : "—"}
        />
        <ComputedCard
          label="Peso estimado"
          value={preview.estimatedWeightKg > 0 ? `${preview.estimatedWeightKg.toFixed(2)} kg` : "—"}
        />
        <ComputedCard label="Piernas estimadas" value={preview.legsLabel} />
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        Estas medidas se guardan dentro del presupuesto para usarlas después en medición, cálculo de peso y comparación de superficie.
      </div>
    </div>
  );
}

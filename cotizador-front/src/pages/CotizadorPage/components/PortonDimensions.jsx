import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { useAuthStore } from "../../../domain/auth/store.js";
import { PORTON_TYPES } from "../../../domain/quote/portonConstants.js";
import { getCatalogBootstrap } from "../../../api/catalog.js";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import Input from "../../../ui/Input";

function toNumber(v) {
  const n = Number(String(v || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalizeDecimal(v) { return String(v ?? "").replace(/[^0-9.,]/g, ""); }
function isTypeVisibleForUser(flags, user) {
  if (user?.is_superuser) return true;
  const dv = !!flags?.disable_for_vendedor;
  const dd = !!flags?.disable_for_distribuidor;
  if (user?.is_vendedor && user?.is_distribuidor) return !(dv && dd);
  if (user?.is_distribuidor) return !dd;
  if (user?.is_vendedor) return !dv;
  return true;
}
function normalizeText(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, "_");
}
function pickParams(raw) {
  const params = raw?.surface_calc_params || raw?.surface_parameters || {};
  return {
    default_clasico_kg_m2: Number(params?.default_clasico_kg_m2 || 15) || 15,
    default_inyectado_kg_m2: Number(params?.default_inyectado_kg_m2 || 25) || 25,
    angostas_hasta_kg: Number(params?.angostas_hasta_kg || 140) || 140,
    comunes_hasta_kg: Number(params?.comunes_hasta_kg || 175) || 175,
    anchas_hasta_kg: Number(params?.anchas_hasta_kg || 240) || 240,
    superanchas_hasta_kg: Number(params?.superanchas_hasta_kg || 300) || 300,
    sin_revestimiento_angostas_hasta_kg: Number(params?.sin_revestimiento_angostas_hasta_kg || 80) || 80,
    peso_alto_descuento_mm: Number(params?.peso_alto_descuento_mm || 10) || 10,
    peso_ancho_descuento_mm: Number(params?.peso_ancho_descuento_mm || 14) || 14,
    apto_revestir_product_ids: Array.isArray(params?.apto_revestir_product_ids)
      ? params.apto_revestir_product_ids.map((x) => Number(x)).filter(Boolean)
      : String(params?.apto_revestir_product_ids || "").split(",").map((x) => Number(String(x).trim())).filter(Boolean),
  };
}
function getLegsType(weightKg, isSinRevestimiento, params) {
  const angLimit = isSinRevestimiento ? params.sin_revestimiento_angostas_hasta_kg : params.angostas_hasta_kg;
  if (weightKg <= angLimit) return "Angostas";
  if (weightKg <= params.comunes_hasta_kg) return "Comunes";
  if (weightKg <= params.anchas_hasta_kg) return "Anchas";
  if (weightKg <= params.superanchas_hasta_kg) return "Superanchas";
  return "Especiales";
}

export default function PortonDimensions({ kind = "porton" }) {
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);
  const setPortonType = useQuoteStore((s) => s.setPortonType);
  const lines = useQuoteStore((s) => s.lines);
  const user = useAuthStore((s) => s.user);

  const showTypeSelector = (kind || "porton") === "porton";
  const catalogQ = useQuery({ queryKey: ["catalog-bootstrap-porton-type-select"], queryFn: () => getCatalogBootstrap("porton"), staleTime: 60 * 1000, enabled: showTypeSelector });
  const rulesQ = useQuery({ queryKey: ["technical-measurement-rules-for-budget-preview"], queryFn: adminGetTechnicalMeasurementRules, staleTime: 60 * 1000, enabled: showTypeSelector });
  const typeVisibility = catalogQ.data?.type_visibility || {};
  const visibleTypes = useMemo(() => PORTON_TYPES.filter((t) => isTypeVisibleForUser(typeVisibility[t.key], user)), [typeVisibility, user]);

  useEffect(() => {
    if (!showTypeSelector) {
      if (portonType) setPortonType("");
      return;
    }
    if (!portonType) return;
    if (!visibleTypes.some((t) => t.key === portonType)) setPortonType("");
  }, [showTypeSelector, portonType, visibleTypes, setPortonType]);

  const width = useMemo(() => toNumber(dimensions?.width), [dimensions?.width]);
  const height = useMemo(() => toNumber(dimensions?.height), [dimensions?.height]);
  const kgM2Input = useMemo(() => toNumber(dimensions?.kg_m2), [dimensions?.kg_m2]);
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);
  const calcParams = useMemo(() => pickParams(rulesQ.data || {}), [rulesQ.data]);
  const isInyectado = useMemo(() => normalizeText(portonType).includes("inyect"), [portonType]);
  const effectiveKgM2 = useMemo(() => {
    if (kgM2Input > 0) return kgM2Input;
    return isInyectado ? calcParams.default_inyectado_kg_m2 : calcParams.default_clasico_kg_m2;
  }, [kgM2Input, isInyectado, calcParams]);
  const lineProductIds = useMemo(() => (Array.isArray(lines) ? lines : []).map((line) => Number(line?.product_id || 0)).filter(Boolean), [lines]);
  const isSinRevestimiento = useMemo(() => {
    const ids = new Set(calcParams.apto_revestir_product_ids || []);
    return lineProductIds.some((id) => ids.has(id));
  }, [lineProductIds, calcParams]);
  const pesoEstimadoKg = useMemo(() => {
    const altoMm = Math.max(0, Math.round(height * 1000) - calcParams.peso_alto_descuento_mm);
    const anchoMm = Math.max(0, Math.round(width * 1000) - calcParams.peso_ancho_descuento_mm);
    const areaKg = (altoMm / 1000) * (anchoMm / 1000);
    return areaKg > 0 ? areaKg * effectiveKgM2 : 0;
  }, [height, width, effectiveKgM2, calcParams]);
  const piernasTipo = useMemo(() => getLegsType(pesoEstimadoKg, isSinRevestimiento, calcParams), [pesoEstimadoKg, isSinRevestimiento, calcParams]);

  const title = showTypeSelector ? "Medidas del portón" : ((kind || "") === "ipanel" ? "Medidas del Ipanel" : "Medidas del presupuesto");

  return (
    <div>
      {showTypeSelector ? (
        <>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Tipo / Sistema</div>
          <select value={portonType || ""} onChange={(e) => setPortonType(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
            <option value="">Seleccione un sistema</option>
            {visibleTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <div className="spacer" />
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
        {showTypeSelector ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="muted">Kg por m²</div>
            <Input type="text" inputMode="decimal" value={dimensions?.kg_m2 ?? ""} onChange={(v) => setDimensions({ kg_m2: normalizeDecimal(v) })} placeholder={String(isInyectado ? calcParams.default_inyectado_kg_m2 : calcParams.default_clasico_kg_m2)} style={{ width: 140 }} />
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
          <div className="muted">Superficie</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{area ? `${area.toFixed(2)} m²` : "–"}</div>
        </div>
      </div>
      {showTypeSelector ? (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
          <div>
            <div className="muted">Kg/m² efectivo</div>
            <div style={{ fontWeight: 800 }}>{effectiveKgM2 ? `${effectiveKgM2.toFixed(2)} kg/m²` : "–"}</div>
          </div>
          <div>
            <div className="muted">Peso estimado</div>
            <div style={{ fontWeight: 800 }}>{pesoEstimadoKg ? `${pesoEstimadoKg.toFixed(2)} kg` : "–"}</div>
          </div>
          <div>
            <div className="muted">Piernas estimadas</div>
            <div style={{ fontWeight: 800 }}>{piernasTipo}</div>
          </div>
          <div>
            <div className="muted">Sin revestimiento</div>
            <div style={{ fontWeight: 800 }}>{isSinRevestimiento ? "Sí" : "No"}</div>
          </div>
        </div>
      ) : null}
      <div className="muted" style={{ marginTop: 8 }}>Estas medidas se guardan dentro del presupuesto (payload) para usarlas después en el cálculo de cantidades y de medición.</div>
    </div>
  );
}

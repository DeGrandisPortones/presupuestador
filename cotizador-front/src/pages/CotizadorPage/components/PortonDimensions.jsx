import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuoteStore } from "../../../domain/quote/store";
import { useAuthStore } from "../../../domain/auth/store.js";
import { PORTON_TYPES } from "../../../domain/quote/portonConstants.js";
import { getCatalogBootstrap } from "../../../api/catalog.js";
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

export default function PortonDimensions({ kind = "porton" }) {
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);
  const setPortonType = useQuoteStore((s) => s.setPortonType);
  const user = useAuthStore((s) => s.user);

  const showTypeSelector = (kind || "porton") === "porton";

  const catalogQ = useQuery({
    queryKey: ["catalog-bootstrap-porton-type-select"],
    queryFn: () => getCatalogBootstrap("porton"),
    staleTime: 60 * 1000,
    enabled: showTypeSelector,
  });

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
  const area = useMemo(() => {
    const a = width * height;
    return Number.isFinite(a) ? a : 0;
  }, [width, height]);

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

      <div style={{ fontWeight: 800, marginBottom: 8 }}>{showTypeSelector ? "Medidas del portón" : "Medidas del Ipanel"}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Ancho (m)</div>
          <Input type="text" inputMode="decimal" value={dimensions?.width ?? ""} onChange={(v) => setDimensions({ width: normalizeDecimal(v) })} placeholder="Ej: 3.2" style={{ width: 140 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Alto (m)</div>
          <Input type="text" inputMode="decimal" value={dimensions?.height ?? ""} onChange={(v) => setDimensions({ height: normalizeDecimal(v) })} placeholder="Ej: 2.1" style={{ width: 140 }} />
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

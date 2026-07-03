import { useMemo, useState } from "react";
import Button from "../ui/Button.jsx";

const DEFAULT_TUBE_DISCOUNT_MM = 40;

function text(value) {
  return String(value ?? "").trim();
}
function toNumber(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function toPositiveNumber(value) {
  const n = toNumber(value);
  return n > 0 ? n : 0;
}
function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
function formatMm(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${formatNumber(n)} mm` : "-";
}
function normalizeOrientation(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "horizontal" || raw === "horizontales") return "horizontal";
  return "verticales";
}
function normalizeDistribution(value) {
  return String(value || "").trim().toLowerCase() === "especial" ? "especial" : "repartido";
}
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
function normalizeDistanceList(value) {
  if (Array.isArray(value)) return value.map((item) => text(item));
  if (value && typeof value === "object") return Object.values(value).map((item) => text(item));
  const raw = text(value);
  if (!raw) return [];
  return raw.split(/[;,]/).map((item) => text(item)).filter(Boolean);
}
function getParantesCount(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}
function getTubeDiscountMm(source = {}) {
  return toPositiveNumber(
    source?.descuento_cano_parantes_mm ??
      source?.parantes_tube_discount_mm ??
      source?.parantes_tube_width_mm ??
      source?.tubeDiscountMm,
  ) || DEFAULT_TUBE_DISCOUNT_MM;
}
function getBaseDimensionMm({ orientation, dimensions, form }) {
  const isHorizontal = normalizeOrientation(orientation) === "horizontal";
  const candidates = isHorizontal
    ? [
        form?.hoja_alto_mm,
        dimensions?.hoja_alto_mm,
        dimensions?.alto_hoja_mm,
        dimensions?.paso_alto_mm,
        dimensions?.alto_paso_mm,
        toPositiveNumber(form?.alto_final_mm),
        toPositiveNumber(dimensions?.height) * 1000,
      ]
    : [
        form?.hoja_ancho_mm,
        dimensions?.hoja_ancho_mm,
        dimensions?.ancho_hoja_mm,
        dimensions?.paso_ancho_mm,
        dimensions?.ancho_paso_mm,
        toPositiveNumber(form?.ancho_final_mm),
        toPositiveNumber(dimensions?.width) * 1000,
      ];
  for (const candidate of candidates) {
    const n = toPositiveNumber(candidate);
    if (n > 0) return Math.round(n);
  }
  return 0;
}
function getEffectiveSpanMm(baseDimensionMm, tubeDiscountMm) {
  const base = Math.max(0, Number(baseDimensionMm || 0));
  const tube = Math.max(0, Number(tubeDiscountMm || 0));
  return Math.max(0, base - tube * 2);
}
function buildUniformDistances({ parantesCount, baseDimensionMm, tubeDiscountMm }) {
  const count = Math.max(0, Math.trunc(Number(parantesCount || 0)));
  if (!count) return [];
  const span = getEffectiveSpanMm(baseDimensionMm, tubeDiscountMm);
  if (!(span > 0)) return Array.from({ length: count }, () => "");
  const step = span / (count + 1);
  return Array.from({ length: count }, (_, index) => formatNumber(step * (index + 1)));
}
function padDistanceList(values, count) {
  const next = normalizeDistanceList(values).slice(0, count);
  while (next.length < count) next.push("");
  return next;
}
function resolveDistances({ distances, parantesCount, baseDimensionMm, tubeDiscountMm, distribution }) {
  const count = Math.max(0, Math.trunc(Number(parantesCount || 0)));
  const list = padDistanceList(distances, count);
  const hasValues = list.some((item) => toPositiveNumber(item) > 0);
  if (normalizeDistribution(distribution) === "repartido" || !hasValues) {
    return buildUniformDistances({ parantesCount: count, baseDimensionMm, tubeDiscountMm });
  }
  return list;
}
function buildMarkers({ distances, parantesCount, baseDimensionMm, tubeDiscountMm }) {
  const count = Math.max(0, Math.trunc(Number(parantesCount || 0)));
  const tube = Math.max(0, Number(tubeDiscountMm || 0));
  const span = getEffectiveSpanMm(baseDimensionMm, tube);
  const parsed = padDistanceList(distances, count).map((item) => toPositiveNumber(item));
  const fallback = buildUniformDistances({ parantesCount: count, baseDimensionMm, tubeDiscountMm: tube }).map((item) => toPositiveNumber(item));
  const markers = [];
  for (let index = 0; index < count; index += 1) {
    const raw = parsed[index] > 0 ? parsed[index] : fallback[index];
    const centerMm = Math.max(0, Math.min(span, Number(raw || 0)));
    markers.push({ index, centerMm });
  }
  return markers.sort((a, b) => a.centerMm - b.centerMm);
}
function buildSegments(markers, span) {
  const ordered = Array.isArray(markers) ? markers.slice().sort((a, b) => a.centerMm - b.centerMm) : [];
  const points = [0, ...ordered.map((m) => m.centerMm), Math.max(0, span)];
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startMm = points[index];
    const endMm = points[index + 1];
    segments.push({ index, startMm, endMm, lengthMm: Math.max(0, endMm - startMm) });
  }
  return segments;
}
function getSchemeData(quote, form = {}) {
  if (!isPortonQuote(quote)) return null;
  const dimensions = getDimensions(quote);
  // El esquema de parantes (orientacion, distribucion, cantidad, distancias) lo define
  // siempre el presupuesto: el unico que lo puede modificar es el vendedor editando el
  // presupuesto. Lo que haya cargado el medidor o tecnica en el formulario de medicion
  // nunca lo pisa - salvo las medidas finales (alto/ancho), que si vienen de la medicion
  // real (ver getBaseDimensionMm).
  const orientation = normalizeOrientation(dimensions?.orientacion_parantes || "verticales");
  const distribution = normalizeDistribution(dimensions?.distribucion_parantes || "repartido");
  const parantesCount = getParantesCount(dimensions?.cantidad_parantes);
  const tubeDiscountMm = getTubeDiscountMm(dimensions);
  const baseDimensionMm = getBaseDimensionMm({ orientation, dimensions, form });
  if (!parantesCount || !baseDimensionMm) return null;
  const distances = dimensions?.distancias_parantes_mm ?? dimensions?.distancias_parantes ?? [];
  const resolvedDistances = resolveDistances({ distances, parantesCount, baseDimensionMm, tubeDiscountMm, distribution });
  const spanMm = Math.max(1, getEffectiveSpanMm(baseDimensionMm, tubeDiscountMm));
  const markers = buildMarkers({ distances: resolvedDistances, parantesCount, baseDimensionMm, tubeDiscountMm });
  return {
    orientation,
    distribution,
    parantesCount,
    tubeDiscountMm,
    baseDimensionMm,
    spanMm,
    distances: resolvedDistances,
    markers,
    segments: buildSegments(markers, spanMm),
  };
}

export function hasParantesSchemeData(quote, form = {}) {
  return !!getSchemeData(quote, form);
}

export function ParantesDistributionScheme({ quote, form = {}, compact = false }) {
  const data = useMemo(() => getSchemeData(quote, form), [quote, form]);
  if (!data) return <div className="muted">Esquema de parantes no disponible para este presupuesto.</div>;

  const isHorizontal = data.orientation === "horizontal";
  const width = compact ? 640 : 720;
  const height = compact ? 320 : 360;
  const rectX = 70;
  const rectY = 55;
  const rectW = width - 160;
  const rectH = compact ? 190 : 220;
  const axisLength = isHorizontal ? rectH : rectW;
  const scale = axisLength / Math.max(1, data.spanMm);
  const axisStart = isHorizontal ? rectY : rectX;
  const lateralColor = "#111827";
  const paranteColor = "#2563eb";
  const segmentColor = "#dc2626";

  return (
    <div style={{ border: "1px solid #dbeafe", background: "#f8fbff", borderRadius: 14, padding: compact ? 10 : 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: compact ? 15 : 17 }}>Esquema de distribución de parantes</div>
          <div className="muted">
            Orientación {isHorizontal ? "horizontal" : "vertical"} · {data.parantesCount} parantes internos · base {formatMm(data.baseDimensionMm)} · caño {formatMm(data.tubeDiscountMm)} · luz {formatMm(data.spanMm)}
          </div>
        </div>
        <div style={{ fontWeight: 800, color: "#1d4ed8" }}>{data.distribution === "especial" ? "Especial" : "Repartido"}</div>
      </div>
      <div style={{ marginTop: 10, overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: compact ? 520 : 620, height: "auto", border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff" }}>
          <rect x={rectX} y={rectY} width={rectW} height={rectH} rx="8" fill="#ffffff" stroke="#334155" strokeWidth="3" />
          {isHorizontal ? (
            <>
              <text x="10" y={rectY + 8} fontSize="13" fontWeight="800" fill="#111827">Superior</text>
              <text x="10" y={rectY + rectH + 18} fontSize="13" fontWeight="800" fill="#111827">Inferior</text>
              <line x1={rectX} y1={rectY + 4} x2={rectX + rectW} y2={rectY + 4} stroke={lateralColor} strokeWidth="8" strokeLinecap="round" />
              <line x1={rectX} y1={rectY + rectH - 4} x2={rectX + rectW} y2={rectY + rectH - 4} stroke={lateralColor} strokeWidth="8" strokeLinecap="round" />
            </>
          ) : (
            <>
              <text x={rectX - 36} y={rectY + rectH / 2} textAnchor="middle" fontSize="13" fontWeight="800" fill="#111827" transform={`rotate(-90 ${rectX - 36} ${rectY + rectH / 2})`}>Izquierdo</text>
              <text x={rectX + rectW + 36} y={rectY + rectH / 2} textAnchor="middle" fontSize="13" fontWeight="800" fill="#111827" transform={`rotate(90 ${rectX + rectW + 36} ${rectY + rectH / 2})`}>Derecho</text>
              <line x1={rectX + 4} y1={rectY} x2={rectX + 4} y2={rectY + rectH} stroke={lateralColor} strokeWidth="8" strokeLinecap="round" />
              <line x1={rectX + rectW - 4} y1={rectY} x2={rectX + rectW - 4} y2={rectY + rectH} stroke={lateralColor} strokeWidth="8" strokeLinecap="round" />
            </>
          )}
          {data.markers.map((marker) => {
            const posPx = axisStart + marker.centerMm * scale;
            if (isHorizontal) {
              return (
                <g key={`marker-${marker.index}`}>
                  <line x1={rectX} y1={posPx} x2={rectX + rectW} y2={posPx} stroke={paranteColor} strokeWidth="5" />
                  <circle cx={rectX + rectW + 22} cy={posPx} r="12" fill={paranteColor} />
                  <text x={rectX + rectW + 22} y={posPx + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">{marker.index + 1}</text>
                </g>
              );
            }
            return (
              <g key={`marker-${marker.index}`}>
                <line x1={posPx} y1={rectY} x2={posPx} y2={rectY + rectH} stroke={paranteColor} strokeWidth="5" />
                <circle cx={posPx} cy={rectY + rectH + 22} r="12" fill={paranteColor} />
                <text x={posPx} y={rectY + rectH + 27} textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">{marker.index + 1}</text>
              </g>
            );
          })}
          {data.segments.map((segment) => {
            const startPx = axisStart + segment.startMm * scale;
            const endPx = axisStart + segment.endMm * scale;
            const midPx = (startPx + endPx) / 2;
            const label = `${Math.round(segment.lengthMm)} mm`;
            if (isHorizontal) {
              const x = rectX + rectW + 58;
              return (
                <g key={`seg-${segment.index}`}>
                  <line x1={x} y1={startPx} x2={x} y2={endPx} stroke={segmentColor} strokeWidth="2" />
                  <line x1={x - 6} y1={startPx} x2={x + 6} y2={startPx} stroke={segmentColor} strokeWidth="2" />
                  <line x1={x - 6} y1={endPx} x2={x + 6} y2={endPx} stroke={segmentColor} strokeWidth="2" />
                  <text x={x + 10} y={midPx + 4} fontSize="11" fontWeight="800" fill={segmentColor}>{label}</text>
                </g>
              );
            }
            const y = rectY + rectH + 62;
            return (
              <g key={`seg-${segment.index}`}>
                <line x1={startPx} y1={y} x2={endPx} y2={y} stroke={segmentColor} strokeWidth="2" />
                <line x1={startPx} y1={y - 6} x2={startPx} y2={y + 6} stroke={segmentColor} strokeWidth="2" />
                <line x1={endPx} y1={y - 6} x2={endPx} y2={y + 6} stroke={segmentColor} strokeWidth="2" />
                <text x={midPx} y={y + 18} textAnchor="middle" fontSize="11" fontWeight="800" fill={segmentColor}>{label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 10 }}>
        <InfoCard label="Base exterior" value={formatMm(data.baseDimensionMm)} />
        <InfoCard label="Luz a repartir" value={formatMm(data.spanMm)} />
        <InfoCard label="Ancho caño" value={formatMm(data.tubeDiscountMm)} />
        <InfoCard label="Parantes" value={String(data.parantesCount)} />
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", padding: "8px 10px" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900 }}>{value || "-"}</div>
    </div>
  );
}

export function ParantesDistributionButton({ quote, form = {}, label = "Ver esquema de parantes" }) {
  const [open, setOpen] = useState(false);
  if (!hasParantesSchemeData(quote, form)) return null;
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
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Esquema de distribución de parantes</div>
                <div className="muted">Vista solo lectura.</div>
              </div>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>
            <div className="spacer" />
            <ParantesDistributionScheme quote={quote} form={form} />
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ParantesDistributionScheme;

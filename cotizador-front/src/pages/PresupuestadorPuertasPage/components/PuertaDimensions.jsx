import { useEffect, useMemo, useState } from "react";
import Input from "../../../ui/Input.jsx";
import { useQuoteStore } from "../../../domain/quote/store.js";

const DOOR_LAMAS_WIDTH_MAX_M = 2;
const DOOR_LAMAS_HEIGHT_MAX_M = 3;
const DOOR_LAMAS_DIVIDER_LINE_MM = 10;
const DOOR_LAMAS_EXTERIOR_PRODUCT_IDS = new Set([4108, 3637]);
const DOOR_LAMAS_INTERIOR_PRODUCT_IDS = new Set([4061, 3590]);

const DOOR_PANEL_CONFIGS = {
  exterior: {
    key: "exterior",
    title: "Panel Exterior",
    setupTitle: "Datos obligatorios del Panel Exterior en Lamas 22mm",
    description: "Completá el esquema del panel exterior de la puerta.",
    productIds: DOOR_LAMAS_EXTERIOR_PRODUCT_IDS,
    prefix: "puerta_panel_exterior_lamas",
  },
  interior: {
    key: "interior",
    title: "Panel Interior",
    setupTitle: "Datos obligatorios del Panel Interior en Lamas 22mm",
    description: "Completá el esquema del panel interior de la puerta.",
    productIds: DOOR_LAMAS_INTERIOR_PRODUCT_IDS,
    prefix: "puerta_panel_interior_lamas",
  },
};

function parseNum(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function parseOptionalNumber(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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
function normalizeDecimalMmInput(v) {
  return String(v ?? "").replace(/[^0-9.,]/g, "").replace(",", ".");
}
function parseMmNumber(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function roundMm(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
function formatNumberForInput(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(roundMm(n)).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
function metric(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${Math.round(n * 100) / 100}`.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
function formatMm(value) {
  const n = roundMm(value);
  if (!Number.isFinite(n) || n <= 0) return "0 mm";
  return `${String(n).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1")} mm`;
}
function normalizePanelOrientation(value) {
  const raw = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (raw.includes("vert")) return "vertical";
  if (raw.includes("horiz")) return "horizontal";
  return "horizontal";
}
function getDivisionsMaxByOrientation(value) {
  return normalizePanelOrientation(value) === "vertical" ? 7 : 18;
}
function normalizeDivisionsInput(v, max = 18) {
  const raw = normalizeIntegerInput(v);
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  const safeMax = Math.max(2, Math.trunc(Number(max) || 18));
  return String(Math.min(safeMax, Math.max(0, Math.trunc(n))));
}
function clampDivisions(v, max = 18) {
  const raw = normalizeIntegerInput(v);
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  const safeMax = Math.max(2, Math.trunc(Number(max) || 18));
  return String(Math.min(safeMax, Math.max(2, Math.trunc(n))));
}
function isDivisionsOutOfBounds(v, max = 18) {
  const raw = String(v ?? "").trim();
  if (!raw) return false;
  const n = Number(raw);
  const safeMax = Math.max(2, Math.trunc(Number(max) || 18));
  return !Number.isFinite(n) || n < 2 || n > safeMax || !Number.isInteger(n);
}
function sanitizeSectionSizes(value, count = 0) {
  const list = Array.isArray(value) ? value : [];
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  return list.slice(0, safeCount).map((item) => normalizeDecimalMmInput(item));
}
function getAxisDimensionMm({ orientation, widthM, heightM }) {
  const isVertical = normalizePanelOrientation(orientation) === "vertical";
  const axisMeters = isVertical ? Number(widthM || 0) : Number(heightM || 0);
  const axisMm = axisMeters > 0 ? axisMeters * 1000 : 0;
  return roundMm(Math.max(0, axisMm));
}
function buildUniformSectionSizes({ count, axisDimensionMm, dividerMm = DOOR_LAMAS_DIVIDER_LINE_MM }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (!safeCount) return [];
  const safeDivider = Math.max(0, Number(dividerMm || 0));
  const freeSpan = roundMm(Math.max(0, Number(axisDimensionMm || 0) - Math.max(0, safeCount - 1) * safeDivider));
  if (!freeSpan) return Array.from({ length: safeCount }, () => "");
  const base = roundMm(freeSpan / safeCount);
  const values = [];
  let used = 0;
  for (let index = 0; index < safeCount; index += 1) {
    const remaining = roundMm(freeSpan - used);
    const next = index === safeCount - 1 ? remaining : Math.min(base, remaining);
    values.push(formatNumberForInput(next));
    used = roundMm(used + next);
  }
  return values;
}
function buildClassicSectionSizes(axisDimensionMm, classicStepMm = 353) {
  const axis = Math.max(0, roundMm(axisDimensionMm));
  const step = Math.max(1, Number(classicStepMm || 353));
  if (!axis) return [];
  const fullCount = Math.max(0, Math.floor(axis / step));
  const remainder = roundMm(axis - fullCount * step);
  const edge = remainder > 0.01 ? roundMm(remainder / 2) : 0;
  const values = [];
  if (edge > 0) values.push(formatNumberForInput(edge));
  for (let index = 0; index < fullCount; index += 1) values.push(formatNumberForInput(step));
  if (edge > 0) values.push(formatNumberForInput(edge));
  if (values.length >= 2) return values;
  return [formatNumberForInput(roundMm(axis / 2)), formatNumberForInput(roundMm(axis / 2))];
}
function computeSectionMetrics({ values, count, axisDimensionMm, dividerMm = DOOR_LAMAS_DIVIDER_LINE_MM, dividersIncludedInSectionSizes = false }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  const safeDivider = Math.max(0, Number(dividerMm || 0));
  const safeValues = sanitizeSectionSizes(values, safeCount);
  const parsed = safeValues.map((item) => parseMmNumber(item) || 0);
  const sectionsTotalMm = roundMm(parsed.reduce((acc, item) => acc + item, 0));
  const nominalDividersTotalMm = roundMm(Math.max(0, safeCount - 1) * safeDivider);
  const dividersTotalMm = dividersIncludedInSectionSizes ? 0 : nominalDividersTotalMm;
  const totalUsedMm = roundMm(sectionsTotalMm + dividersTotalMm);
  const availableMm = roundMm(Math.max(0, Number(axisDimensionMm || 0)));
  const remainingMm = roundMm(availableMm - totalUsedMm);
  return {
    parsed,
    sectionsTotalMm,
    dividersTotalMm,
    nominalDividersTotalMm,
    totalUsedMm,
    availableMm,
    remainingMm,
    exceeds: remainingMm < -0.01,
    matchesExactly: Math.abs(remainingMm) <= 0.5,
  };
}
function inputStateStyle(hasError) {
  return {
    width: "100%",
    borderColor: hasError ? "#ef4444" : undefined,
    boxShadow: hasError ? "0 0 0 2px rgba(239,68,68,.12)" : undefined,
  };
}
function disabledComputedInputStyle() {
  return {
    width: "100%",
    background: "#f3f4f6",
    color: "#334155",
    fontWeight: 800,
  };
}
function lineMatchesProductIds(line = {}, idSet) {
  const candidates = [
    line?.product_id,
    line?.id,
    line?.odoo_id,
    line?.odoo_product_id,
    line?.odoo_template_id,
    line?.odoo_variant_id,
    line?.odoo_external_id,
  ];
  return candidates.some((value) => idSet.has(Number(value || 0)));
}
function panelField(config, name) {
  return `${config.prefix}_${name}`;
}
function getPanelState(dimensions = {}, config) {
  const orientation = normalizePanelOrientation(
    dimensions?.[panelField(config, "orientacion")] ??
    dimensions?.[panelField(config, "orientation")] ??
    "horizontal",
  );
  const divisions = String(
    dimensions?.[panelField(config, "divisiones")] ??
    dimensions?.[panelField(config, "cantidad_divisiones")] ??
    "",
  );
  const count = Math.max(0, Math.trunc(Number(divisions || 0)));
  const rawSizes = sanitizeSectionSizes(
    dimensions?.[panelField(config, "divisiones_medidas_mm")] ??
    dimensions?.[panelField(config, "section_sizes_mm")] ??
    [],
    count,
  );
  const distributionMode = String(
    dimensions?.[panelField(config, "distribucion_divisiones")] ??
    dimensions?.[panelField(config, "divisiones_distribucion")] ??
    "",
  ).trim().toLowerCase();
  const classic = dimensions?.[panelField(config, "divisiones_incluyen_liston")] === true || distributionMode === "clasica";
  const setupCompleted = dimensions?.[panelField(config, "setup_completed")] === true || dimensions?.[panelField(config, "popup_completed")] === true;
  return { orientation, divisions, count, rawSizes, distributionMode, classic, setupCompleted };
}
function clearPanelPatch(config) {
  return {
    [panelField(config, "width")]: "",
    [panelField(config, "height")]: "",
    [panelField(config, "orientacion")]: "",
    [panelField(config, "orientation")]: "",
    [panelField(config, "divisiones")]: "",
    [panelField(config, "cantidad_divisiones")]: "",
    [panelField(config, "divisiones_medidas_mm")]: [],
    [panelField(config, "section_sizes_mm")]: [],
    [panelField(config, "distribucion_divisiones")]: "",
    [panelField(config, "divisiones_distribucion")]: "",
    [panelField(config, "divisiones_incluyen_liston")]: false,
    [panelField(config, "divisor_mm")]: "",
    [panelField(config, "linea_division_mm")]: "",
    [panelField(config, "setup_completed")]: false,
    [panelField(config, "popup_completed")]: false,
  };
}
function patchForPanelSave(config, {
  widthMeters,
  heightMeters,
  orientation,
  divisionsCount,
  sectionSizes,
  classicMode,
}) {
  return {
    width: normalizeDecimal(widthMeters),
    height: normalizeDecimal(heightMeters),
    [panelField(config, "width")]: normalizeDecimal(widthMeters),
    [panelField(config, "height")]: normalizeDecimal(heightMeters),
    [panelField(config, "orientacion")]: orientation,
    [panelField(config, "orientation")]: orientation,
    [panelField(config, "divisiones")]: String(divisionsCount),
    [panelField(config, "cantidad_divisiones")]: String(divisionsCount),
    [panelField(config, "divisiones_medidas_mm")]: sectionSizes,
    [panelField(config, "section_sizes_mm")]: sectionSizes,
    [panelField(config, "distribucion_divisiones")]: classicMode ? "clasica" : "repartido",
    [panelField(config, "divisiones_distribucion")]: classicMode ? "clasica" : "repartido",
    [panelField(config, "divisiones_incluyen_liston")]: classicMode,
    [panelField(config, "divisor_mm")]: String(DOOR_LAMAS_DIVIDER_LINE_MM),
    [panelField(config, "linea_division_mm")]: String(DOOR_LAMAS_DIVIDER_LINE_MM),
    [panelField(config, "setup_completed")]: true,
    [panelField(config, "popup_completed")]: true,
  };
}

function FieldBox({ label, helper, helperColor, children }) {
  return (
    <div>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      {children}
      {helper ? <div className="muted" style={{ marginTop: 4, color: helperColor }}>{helper}</div> : null}
    </div>
  );
}
function ComputedCard({ label, value }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PanelLamasSetupModal({
  open,
  config,
  widthM = 0,
  heightM = 0,
  initialOrientation = "horizontal",
  initialDivisions = "",
  initialSectionSizes = [],
  initialClassicMode = false,
  onSave,
}) {
  const [widthMeters, setWidthMeters] = useState("");
  const [heightMeters, setHeightMeters] = useState("");
  const [orientation, setOrientation] = useState("horizontal");
  const [divisions, setDivisions] = useState("");
  const [sectionSizes, setSectionSizes] = useState([]);
  const [classicMode, setClassicMode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const normalizedOrientation = normalizePanelOrientation(initialOrientation || "horizontal");
    const count = Math.max(0, Math.trunc(Number(initialDivisions || 0)));
    setWidthMeters(formatNumberForInput(Number(widthM || 0) * 1000 ? Number(widthM || 0) : 0));
    setHeightMeters(formatNumberForInput(Number(heightM || 0) * 1000 ? Number(heightM || 0) : 0));
    setOrientation(normalizedOrientation);
    setDivisions(count >= 2 ? String(count) : "");
    setSectionSizes(count >= 2 ? sanitizeSectionSizes(initialSectionSizes, count) : []);
    setClassicMode(!!initialClassicMode);
    setError("");
  }, [open, widthM, heightM, initialOrientation, initialDivisions, initialSectionSizes, initialClassicMode]);

  const modalWidthValue = parseOptionalNumber(normalizeDecimalWithDot(widthMeters));
  const modalHeightValue = parseOptionalNumber(normalizeDecimalWithDot(heightMeters));
  const widthInvalid = modalWidthValue === null || !(modalWidthValue > 0) || modalWidthValue > DOOR_LAMAS_WIDTH_MAX_M;
  const heightInvalid = modalHeightValue === null || !(modalHeightValue > 0) || modalHeightValue > DOOR_LAMAS_HEIGHT_MAX_M;
  const modalWidthM = Number(modalWidthValue || 0);
  const modalHeightM = Number(modalHeightValue || 0);
  const maxDivisions = getDivisionsMaxByOrientation(orientation);
  const divisionsCount = Math.max(0, Math.trunc(Number(divisions || 0)));
  const axisDimensionMm = useMemo(
    () => getAxisDimensionMm({ orientation, widthM: modalWidthM, heightM: modalHeightM }),
    [orientation, modalWidthM, modalHeightM],
  );
  const safeSectionSizes = useMemo(
    () => sanitizeSectionSizes(sectionSizes, divisionsCount),
    [sectionSizes, divisionsCount],
  );
  const metrics = useMemo(
    () => computeSectionMetrics({
      values: safeSectionSizes,
      count: divisionsCount,
      axisDimensionMm,
      dividerMm: DOOR_LAMAS_DIVIDER_LINE_MM,
      dividersIncludedInSectionSizes: classicMode,
    }),
    [safeSectionSizes, divisionsCount, axisDimensionMm, classicMode],
  );
  const divisionsOutOfBounds = isDivisionsOutOfBounds(divisions, maxDivisions);
  const hasAllSectionSizes = divisionsCount >= 2
    && safeSectionSizes.length === divisionsCount
    && safeSectionSizes.every((item) => {
      const n = parseMmNumber(item);
      return Number.isFinite(n) && n > 0;
    });
  const canSave = !widthInvalid && !heightInvalid && !divisionsOutOfBounds && hasAllSectionSizes && metrics.matchesExactly;

  function setSectionSizeAt(index, value) {
    setSectionSizes((current) => {
      const next = Array.from({ length: divisionsCount }, (_, idx) => String(current?.[idx] ?? ""));
      next[index] = normalizeDecimalMmInput(value);
      return next;
    });
  }
  function applyClassicDistribution() {
    const classicSizes = buildClassicSectionSizes(axisDimensionMm, 353);
    const classicCount = classicSizes.length;
    if (classicCount < 2) {
      setError("Cargá primero ancho y alto de la puerta en este popup para calcular las divisiones.");
      return;
    }
    setDivisions(String(classicCount));
    setSectionSizes(classicSizes);
    setClassicMode(true);
    setError("");
  }
  function applyUniformDistribution() {
    const count = Math.max(2, Math.min(maxDivisions, Math.trunc(Number(divisions || 0) || 2)));
    const uniformSizes = buildUniformSectionSizes({
      count,
      axisDimensionMm,
      dividerMm: DOOR_LAMAS_DIVIDER_LINE_MM,
    });
    if (!axisDimensionMm || !uniformSizes.length) {
      setError("Cargá primero ancho y alto de la puerta en este popup para calcular las divisiones.");
      return;
    }
    setDivisions(String(count));
    setSectionSizes(uniformSizes);
    setClassicMode(false);
    setError("");
  }
  function handleSave() {
    if (widthInvalid || heightInvalid) {
      setError(`Completá ancho y alto de la puerta. Panel en lamas permite hasta ${DOOR_LAMAS_WIDTH_MAX_M.toFixed(2)} m de ancho y ${DOOR_LAMAS_HEIGHT_MAX_M.toFixed(2)} m de alto.`);
      return;
    }
    if (divisionsOutOfBounds) {
      setError(`La cantidad de divisiones debe ser un entero entre 2 y ${maxDivisions}.`);
      return;
    }
    if (!hasAllSectionSizes) {
      setError("Completá la medida en mm de todas las secciones.");
      return;
    }
    if (!metrics.matchesExactly) {
      setError(metrics.exceeds
        ? `Las divisiones exceden la medida disponible por ${formatMm(Math.abs(metrics.remainingMm))}.`
        : `Las divisiones no completan la medida disponible. Restan ${formatMm(metrics.remainingMm)}.`);
      return;
    }
    onSave?.(patchForPanelSave(config, {
      widthMeters,
      heightMeters,
      orientation,
      divisionsCount,
      sectionSizes: safeSectionSizes,
      classicMode,
    }));
  }

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "min(860px, 96vw)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 18, padding: 18, boxShadow: "0 22px 70px rgba(15,23,42,0.35)", border: "1px solid #e5e7eb" }}>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 6 }}>{config.setupTitle}</div>
        <div className="muted" style={{ marginBottom: 14 }}>{config.description} Después podés modificarlo desde la sección Medidas de la puerta.</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start" }}>
          <FieldBox label="Ancho de la puerta (m)" helper={`Panel en lamas max ${DOOR_LAMAS_WIDTH_MAX_M.toFixed(2)} m.`} helperColor={widthInvalid ? "#b91c1c" : undefined}>
            <Input type="text" inputMode="decimal" value={widthMeters} onChange={(value) => { setWidthMeters(normalizeDecimal(value)); setClassicMode(false); setError(""); }} onBlur={(e) => setWidthMeters(normalizeDecimal(e?.target?.value))} placeholder="Ej: 0.90" style={inputStateStyle(widthInvalid)} />
          </FieldBox>
          <FieldBox label="Alto de la puerta (m)" helper={`Panel en lamas max ${DOOR_LAMAS_HEIGHT_MAX_M.toFixed(2)} m.`} helperColor={heightInvalid ? "#b91c1c" : undefined}>
            <Input type="text" inputMode="decimal" value={heightMeters} onChange={(value) => { setHeightMeters(normalizeDecimal(value)); setClassicMode(false); setError(""); }} onBlur={(e) => setHeightMeters(normalizeDecimal(e?.target?.value))} placeholder="Ej: 2.10" style={inputStateStyle(heightInvalid)} />
          </FieldBox>
          <FieldBox label="Orientación de lamas">
            <select value={orientation} onChange={(e) => { const nextOrientation = normalizePanelOrientation(e.target.value); const nextMax = getDivisionsMaxByOrientation(nextOrientation); const nextDivisions = clampDivisions(divisions, nextMax); setOrientation(nextOrientation); if (nextDivisions && nextDivisions !== divisions) { setDivisions(nextDivisions); setSectionSizes((current) => sanitizeSectionSizes(current, Number(nextDivisions || 0))); } setError(""); }} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </FieldBox>
          <FieldBox label="Cantidad de divisiones" helper={`Entero entre 2 y ${maxDivisions}.`} helperColor={divisionsOutOfBounds ? "#b91c1c" : undefined}>
            <Input type="text" inputMode="numeric" value={divisions} onChange={(value) => { const next = normalizeDivisionsInput(value, maxDivisions); setDivisions(next); setSectionSizes((current) => sanitizeSectionSizes(current, Number(next || 0))); setClassicMode(false); setError(""); }} onBlur={(e) => { const next = clampDivisions(e?.target?.value, maxDivisions); setDivisions(next); setSectionSizes((current) => sanitizeSectionSizes(current, Number(next || 0))); }} placeholder="Ej: 4" style={inputStateStyle(divisionsOutOfBounds)} />
          </FieldBox>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 14px" }}>
          <button type="button" onClick={applyClassicDistribution} style={{ border: "1px solid #c7d2fe", borderRadius: 10, background: "#eef2ff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Usar distribución clásica automática</button>
          <button type="button" onClick={applyUniformDistribution} style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Repartir uniforme</button>
        </div>

        {divisionsCount >= 2 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {Array.from({ length: divisionsCount }, (_, index) => (
              <FieldBox key={`setup-door-panel-${config.key}-section-${index}`} label={`Sección ${index + 1}`} helper={orientation === "vertical" ? "Medida útil en mm sobre el ancho." : "Medida útil en mm sobre el alto."}>
                <Input type="text" inputMode="decimal" value={String(sectionSizes[index] ?? "")} onChange={(value) => { setSectionSizeAt(index, value); setClassicMode(false); setError(""); }} onBlur={(e) => setSectionSizeAt(index, e?.target?.value)} placeholder={index === 0 ? "Ej: 600" : "Ej: 580"} style={{ width: "100%" }} />
              </FieldBox>
            ))}
          </div>
        ) : null}

        <div className="spacer" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <ComputedCard label="Base para repartir" value={axisDimensionMm > 0 ? formatMm(axisDimensionMm) : "-"} />
          <ComputedCard label="Espesor total de líneas" value={metrics.nominalDividersTotalMm > 0 ? formatMm(metrics.nominalDividersTotalMm) : "-"} />
          <ComputedCard label="Medidas útiles cargadas" value={metrics.sectionsTotalMm > 0 ? formatMm(metrics.sectionsTotalMm) : "-"} />
          <ComputedCard label="Estado" value={metrics.exceeds ? `Excede ${formatMm(Math.abs(metrics.remainingMm))}` : (metrics.matchesExactly ? "Reparto completo" : `Restan ${formatMm(metrics.remainingMm)}`)} />
        </div>

        {error ? <div style={{ color: "#b91c1c", fontWeight: 800, marginTop: 12 }}>{error}</div> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={handleSave} disabled={!canSave} style={{ border: "1px solid #00a99d", borderRadius: 10, background: canSave ? "#00a99d" : "#9ca3af", color: "#fff", padding: "10px 14px", fontWeight: 900, cursor: canSave ? "pointer" : "not-allowed" }}>Guardar datos y continuar</button>
        </div>
      </div>
    </div>
  );
}

function PanelSketchModal({
  open,
  onClose,
  title,
  orientation = "horizontal",
  widthMm = 0,
  heightMm = 0,
  dividerMm = DOOR_LAMAS_DIVIDER_LINE_MM,
  sectionSizes = [],
  dividersIncludedInSectionSizes = false,
}) {
  if (!open) return null;
  const normalizedOrientation = normalizePanelOrientation(orientation);
  const isVertical = normalizedOrientation === "vertical";
  const safeSectionSizes = Array.isArray(sectionSizes) ? sectionSizes : [];
  const count = safeSectionSizes.length;
  const panelWidthMm = Math.max(1, Number(widthMm || 0));
  const panelHeightMm = Math.max(1, Number(heightMm || 0));
  const maxCanvasWidth = 420;
  const maxCanvasHeight = 460;
  const scale = Math.min(maxCanvasWidth / panelWidthMm, maxCanvasHeight / panelHeightMm, 1);
  const panelWidthPx = Math.max(170, Math.round(panelWidthMm * scale));
  const panelHeightPx = Math.max(220, Math.round(panelHeightMm * scale));
  const panelX = 20;
  const panelY = 20;
  const sectionGuideTickPx = 8;
  const sectionGuideLabelGapPx = 8;
  const topGuideOffsetPx = 32;
  const bottomGuideOffsetPx = 34;
  const leftGuideOffsetPx = 14;
  const rightGuideOffsetPx = 34;
  const axisDimensionMm = isVertical ? panelWidthMm : panelHeightMm;
  const mainAxisPx = isVertical ? panelWidthPx : panelHeightPx;
  const sectionsTotalMm = safeSectionSizes.reduce((acc, item) => acc + Math.max(0, Number(item || 0)), 0);
  const totalUsedMm = sectionsTotalMm + (dividersIncludedInSectionSizes ? 0 : Math.max(0, count - 1) * dividerMm);
  const correctionScale = totalUsedMm > 0 ? axisDimensionMm / totalUsedMm : 1;
  const clampedCorrectionScale = Number.isFinite(correctionScale) && correctionScale > 0 ? correctionScale : 1;
  const bands = [];
  let cursorMm = 0;
  for (let index = 0; index < count; index += 1) {
    const rawSectionMm = Math.max(0, Number(safeSectionSizes[index] || 0));
    const sectionMm = rawSectionMm * clampedCorrectionScale;
    bands.push({ type: "section", index, startMm: cursorMm, sizeMm: sectionMm, rawSizeMm: rawSectionMm });
    cursorMm += sectionMm;
    if (!dividersIncludedInSectionSizes && index < count - 1) {
      const dividerSize = dividerMm * clampedCorrectionScale;
      bands.push({ type: "divider", index, startMm: cursorMm, sizeMm: dividerSize, rawSizeMm: dividerMm });
      cursorMm += dividerSize;
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{ width: "min(960px, 100%)", maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 18, border: "1px solid #e5e7eb", boxShadow: "0 18px 50px rgba(15,23,42,.18)", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Esquema del {title}</div>
            <div className="muted" style={{ marginTop: 4 }}>Orientación de lamas {isVertical ? "vertical" : "horizontal"} · {count || 0} secciones · línea entre secciones {formatMm(dividerMm)}</div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "1px solid #ddd", borderRadius: 10, background: "#fff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Cerrar</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 420px) minmax(240px, 1fr)", gap: 18, alignItems: "start" }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, background: "#f8fafc" }}>
            <svg width="100%" viewBox={`-80 -50 ${panelWidthPx + (isVertical ? 160 : 290)} ${panelHeightPx + (isVertical ? 200 : 170)}`} role="img" aria-label={`Esquema del ${title} con divisiones`}>
              <rect x={panelX} y={panelY} width={panelWidthPx} height={panelHeightPx} rx="14" fill="#ffffff" stroke="#0f172a" strokeWidth="2.2" />
              {bands.map((band) => {
                const startPx = (axisDimensionMm > 0 ? band.startMm / axisDimensionMm : 0) * mainAxisPx;
                const sizePx = (axisDimensionMm > 0 ? band.sizeMm / axisDimensionMm : 0) * mainAxisPx;
                if (band.type === "section") {
                  const x = isVertical ? panelX + startPx : panelX;
                  const y = isVertical ? panelY : panelY + startPx;
                  const width = isVertical ? sizePx : panelWidthPx;
                  const height = isVertical ? panelHeightPx : sizePx;
                  const guideColor = "#2563eb";
                  const isAlt = band.index % 2 === 1;
                  return (
                    <g key={`band-${band.type}-${band.index}`}>
                      <rect x={x} y={y} width={Math.max(0, width)} height={Math.max(0, height)} fill={band.index % 2 === 0 ? "#dff3f6" : "#eef2f7"} />
                      {isVertical ? (
                        <g>
                          {(() => {
                            const guideY = isAlt ? panelY + panelHeightPx + bottomGuideOffsetPx : panelY - topGuideOffsetPx;
                            const labelY = guideY + (isAlt ? 22 : -10);
                            return (
                              <>
                                <line x1={x} y1={guideY} x2={x + width} y2={guideY} stroke={guideColor} strokeWidth="1.8" />
                                <line x1={x} y1={guideY - sectionGuideTickPx} x2={x} y2={guideY + sectionGuideTickPx} stroke={guideColor} strokeWidth="1.8" />
                                <line x1={x + width} y1={guideY - sectionGuideTickPx} x2={x + width} y2={guideY + sectionGuideTickPx} stroke={guideColor} strokeWidth="1.8" />
                                <text x={x + width / 2} y={labelY} textAnchor="middle" fontSize="11" fontWeight="700" fill={guideColor}>{formatNumberForInput(band.rawSizeMm)} mm</text>
                              </>
                            );
                          })()}
                        </g>
                      ) : (
                        <g>
                          {(() => {
                            const guideX = isAlt ? panelX - leftGuideOffsetPx : panelX + panelWidthPx + rightGuideOffsetPx;
                            const labelX = guideX + (isAlt ? -sectionGuideLabelGapPx : sectionGuideLabelGapPx);
                            return (
                              <>
                                <line x1={guideX} y1={y} x2={guideX} y2={y + height} stroke={guideColor} strokeWidth="1.8" />
                                <line x1={guideX - sectionGuideTickPx} y1={y} x2={guideX + sectionGuideTickPx} y2={y} stroke={guideColor} strokeWidth="1.8" />
                                <line x1={guideX - sectionGuideTickPx} y1={y + height} x2={guideX + sectionGuideTickPx} y2={y + height} stroke={guideColor} strokeWidth="1.8" />
                                <text x={labelX} y={y + height / 2 + 4} textAnchor={isAlt ? "end" : "start"} fontSize="11" fontWeight="700" fill={guideColor}>{formatNumberForInput(band.rawSizeMm)} mm</text>
                              </>
                            );
                          })()}
                        </g>
                      )}
                    </g>
                  );
                }
                const dividerX = isVertical ? panelX + startPx : panelX;
                const dividerY = isVertical ? panelY : panelY + startPx;
                return isVertical
                  ? <rect key={`divider-${band.index}`} x={dividerX} y={panelY} width={Math.max(2, sizePx)} height={panelHeightPx} fill="#0f172a" opacity="0.7" />
                  : <rect key={`divider-${band.index}`} x={panelX} y={dividerY} width={panelWidthPx} height={Math.max(2, sizePx)} fill="#0f172a" opacity="0.7" />;
              })}
            </svg>
          </div>
          <div>
            <ComputedCard label="Medida del panel" value={`${formatMm(panelWidthMm)} x ${formatMm(panelHeightMm)}`} />
            <div className="spacer" />
            <ComputedCard label="Cantidad de secciones" value={String(count || 0)} />
            <div className="spacer" />
            <ComputedCard label="Línea entre secciones" value={formatMm(dividerMm)} />
            <div className="spacer" />
            <ComputedCard label="Distribución" value={dividersIncludedInSectionSizes ? "Clásica" : "Repartida / manual"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelLamasConfigCard({ config, dimensions, setDimensions }) {
  const [sketchOpen, setSketchOpen] = useState(false);
  const state = getPanelState(dimensions, config);
  const width = parseNum(dimensions?.width);
  const height = parseNum(dimensions?.height);
  const maxDivisions = getDivisionsMaxByOrientation(state.orientation);
  const axisDimensionMm = useMemo(
    () => getAxisDimensionMm({ orientation: state.orientation, widthM: width, heightM: height }),
    [state.orientation, width, height],
  );
  const metrics = useMemo(
    () => computeSectionMetrics({ values: state.rawSizes, count: state.count, axisDimensionMm, dividerMm: DOOR_LAMAS_DIVIDER_LINE_MM, dividersIncludedInSectionSizes: state.classic }),
    [state.rawSizes, state.count, axisDimensionMm, state.classic],
  );
  const divisionsHasError = isDivisionsOutOfBounds(state.divisions, maxDivisions);

  function setPatch(patch) {
    setDimensions(patch);
  }
  function setSectionSizeAt(index, value) {
    const next = Array.from({ length: state.count }, (_, idx) => String(state.rawSizes?.[idx] ?? ""));
    next[index] = normalizeDecimalMmInput(value);
    setPatch({
      [panelField(config, "divisiones_medidas_mm")]: next,
      [panelField(config, "section_sizes_mm")]: next,
      [panelField(config, "distribucion_divisiones")]: "manual",
      [panelField(config, "divisiones_distribucion")]: "manual",
      [panelField(config, "divisiones_incluyen_liston")]: false,
      [panelField(config, "setup_completed")]: false,
      [panelField(config, "popup_completed")]: false,
    });
  }
  function redistributeSections() {
    const next = buildUniformSectionSizes({ count: state.count, axisDimensionMm, dividerMm: DOOR_LAMAS_DIVIDER_LINE_MM });
    if (!next.length) return;
    setPatch({
      [panelField(config, "divisiones_medidas_mm")]: next,
      [panelField(config, "section_sizes_mm")]: next,
      [panelField(config, "distribucion_divisiones")]: "repartido",
      [panelField(config, "divisiones_distribucion")]: "repartido",
      [panelField(config, "divisiones_incluyen_liston")]: false,
      [panelField(config, "setup_completed")]: metrics.matchesExactly,
      [panelField(config, "popup_completed")]: metrics.matchesExactly,
    });
  }
  function applyClassicDistribution() {
    const next = buildClassicSectionSizes(axisDimensionMm, 353);
    if (!next.length) return;
    setPatch({
      [panelField(config, "divisiones")]: String(next.length),
      [panelField(config, "cantidad_divisiones")]: String(next.length),
      [panelField(config, "divisiones_medidas_mm")]: next,
      [panelField(config, "section_sizes_mm")]: next,
      [panelField(config, "distribucion_divisiones")]: "clasica",
      [panelField(config, "divisiones_distribucion")]: "clasica",
      [panelField(config, "divisiones_incluyen_liston")]: true,
      [panelField(config, "setup_completed")]: true,
      [panelField(config, "popup_completed")]: true,
    });
  }

  return (
    <div style={{ marginTop: 12, border: "1px solid #e0e7ff", background: "#f8fbff", borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, marginBottom: 4 }}>Esquema {config.title}</div>
          <div className="muted">Se activa por Panel en Lamas 22mm. Misma lógica de distribución que Ipanel.</div>
        </div>
        <button type="button" onClick={() => setSketchOpen(true)} style={{ border: "1px solid #c7d2fe", borderRadius: 10, background: "#eef2ff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Ver esquema {config.title}</button>
      </div>
      {!state.setupCompleted ? <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontWeight: 800 }}>Falta completar y guardar el esquema de {config.title.toLowerCase()}.</div> : null}
      <div className="spacer" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start" }}>
        <FieldBox label="Orientación de lamas">
          <select value={state.orientation} onChange={(e) => { const nextOrientation = normalizePanelOrientation(e.target.value); const nextMax = getDivisionsMaxByOrientation(nextOrientation); const nextDivisions = clampDivisions(state.divisions, nextMax); setPatch({ [panelField(config, "orientacion")]: nextOrientation, [panelField(config, "orientation")]: nextOrientation, ...(nextDivisions ? { [panelField(config, "divisiones")]: nextDivisions, [panelField(config, "cantidad_divisiones")]: nextDivisions } : {}), [panelField(config, "setup_completed")]: false, [panelField(config, "popup_completed")]: false }); }} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </FieldBox>
        <FieldBox label="Cantidad de divisiones" helper={`Entero positivo entre 2 y ${maxDivisions}.`} helperColor={divisionsHasError ? "#b91c1c" : undefined}>
          <Input type="text" inputMode="numeric" value={state.divisions} onChange={(v) => { const next = normalizeDivisionsInput(v, maxDivisions); setPatch({ [panelField(config, "divisiones")]: next, [panelField(config, "cantidad_divisiones")]: next, [panelField(config, "distribucion_divisiones")]: "repartido", [panelField(config, "divisiones_distribucion")]: "repartido", [panelField(config, "divisiones_incluyen_liston")]: false, [panelField(config, "setup_completed")]: false, [panelField(config, "popup_completed")]: false }); }} onBlur={(e) => { const next = clampDivisions(e?.target?.value, maxDivisions); setPatch({ [panelField(config, "divisiones")]: next, [panelField(config, "cantidad_divisiones")]: next, [panelField(config, "distribucion_divisiones")]: "repartido", [panelField(config, "divisiones_distribucion")]: "repartido", [panelField(config, "divisiones_incluyen_liston")]: false, [panelField(config, "setup_completed")]: false, [panelField(config, "popup_completed")]: false }); }} placeholder="Ej: 4" style={inputStateStyle(divisionsHasError)} />
        </FieldBox>
      </div>

      {state.count >= 2 ? (
        <>
          <div className="spacer" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <ComputedCard label="Base para repartir" value={axisDimensionMm > 0 ? formatMm(axisDimensionMm) : "-"} />
            <ComputedCard label="Espesor total de líneas" value={metrics.nominalDividersTotalMm > 0 ? formatMm(metrics.nominalDividersTotalMm) : "-"} />
            <ComputedCard label="Medidas útiles cargadas" value={metrics.sectionsTotalMm > 0 ? formatMm(metrics.sectionsTotalMm) : "-"} />
            <ComputedCard label="Estado" value={metrics.exceeds ? `Excede ${formatMm(Math.abs(metrics.remainingMm))}` : (metrics.matchesExactly ? "Reparto completo" : `Restan ${formatMm(metrics.remainingMm)}`)} />
          </div>
          <div className="spacer" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {Array.from({ length: state.count }, (_, index) => (
              <FieldBox key={`${config.key}-section-${index}`} label={`Sección ${index + 1}`} helper={state.orientation === "vertical" ? "Medida útil en mm sobre el ancho." : "Medida útil en mm sobre el alto."}>
                <Input type="text" inputMode="decimal" value={String(state.rawSizes[index] ?? "")} onChange={(value) => setSectionSizeAt(index, value)} onBlur={(e) => setSectionSizeAt(index, e?.target?.value)} placeholder={index === 0 ? "Ej: 600" : "Ej: 580"} style={{ width: "100%" }} />
              </FieldBox>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <button type="button" onClick={redistributeSections} style={{ border: "1px solid #ddd", borderRadius: 10, background: "#fff", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Repartir en partes iguales</button>
            <button type="button" onClick={applyClassicDistribution} style={{ border: "1px solid #0f766e", borderRadius: 10, background: "#ecfdf5", color: "#0f766e", padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>Distribución clásica</button>
          </div>
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: metrics.exceeds ? "#fee2e2" : "#eff6ff", color: metrics.exceeds ? "#991b1b" : "#1d4ed8", fontWeight: 700 }}>
            {metrics.exceeds
              ? `Las medidas de las secciones superan la dimensión total disponible. Reducí ${formatMm(Math.abs(metrics.remainingMm))} para continuar.`
              : metrics.matchesExactly
                ? "Las divisiones ocupan exactamente toda la dimensión del panel."
                : `Todavía quedan ${formatMm(metrics.remainingMm)} sin repartir. Podés asignarlo manualmente o usar el reparto automático.`}
          </div>
        </>
      ) : null}

      <PanelSketchModal
        open={sketchOpen}
        onClose={() => setSketchOpen(false)}
        title={config.title}
        orientation={state.orientation}
        widthMm={Math.max(0, roundMm(width * 1000))}
        heightMm={Math.max(0, roundMm(height * 1000))}
        dividerMm={DOOR_LAMAS_DIVIDER_LINE_MM}
        sectionSizes={metrics.parsed}
        dividersIncludedInSectionSizes={state.classic}
      />
    </div>
  );
}

export default function PuertaDimensions() {
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const lines = useQuoteStore((s) => s.lines);
  const [setupOpenKey, setSetupOpenKey] = useState(null);
  const width = parseNum(dimensions?.width);
  const height = parseNum(dimensions?.height);
  const area = width * height;

  const hasExteriorPanel = useMemo(() => (Array.isArray(lines) ? lines : []).some((line) => lineMatchesProductIds(line, DOOR_PANEL_CONFIGS.exterior.productIds)), [lines]);
  const hasInteriorPanel = useMemo(() => (Array.isArray(lines) ? lines : []).some((line) => lineMatchesProductIds(line, DOOR_PANEL_CONFIGS.interior.productIds)), [lines]);
  const exteriorState = getPanelState(dimensions, DOOR_PANEL_CONFIGS.exterior);
  const interiorState = getPanelState(dimensions, DOOR_PANEL_CONFIGS.interior);

  useEffect(() => {
    if (hasExteriorPanel) return;
    const state = getPanelState(dimensions, DOOR_PANEL_CONFIGS.exterior);
    if (!state.setupCompleted && !state.divisions && !state.rawSizes.length) return;
    setDimensions(clearPanelPatch(DOOR_PANEL_CONFIGS.exterior));
  }, [hasExteriorPanel]);

  useEffect(() => {
    if (hasInteriorPanel) return;
    const state = getPanelState(dimensions, DOOR_PANEL_CONFIGS.interior);
    if (!state.setupCompleted && !state.divisions && !state.rawSizes.length) return;
    setDimensions(clearPanelPatch(DOOR_PANEL_CONFIGS.interior));
  }, [hasInteriorPanel]);

  useEffect(() => {
    if (setupOpenKey) return;
    if (hasExteriorPanel && !exteriorState.setupCompleted) {
      setSetupOpenKey("exterior");
      return;
    }
    if (hasInteriorPanel && !interiorState.setupCompleted) {
      setSetupOpenKey("interior");
    }
  }, [setupOpenKey, hasExteriorPanel, hasInteriorPanel, exteriorState.setupCompleted, interiorState.setupCompleted]);

  const activeSetupConfig = setupOpenKey ? DOOR_PANEL_CONFIGS[setupOpenKey] : null;
  const activeSetupState = activeSetupConfig ? getPanelState(dimensions, activeSetupConfig) : null;

  function savePanelSetup(patch) {
    setDimensions(patch);
    if (setupOpenKey === "exterior" && hasInteriorPanel && !getPanelState({ ...dimensions, ...patch }, DOOR_PANEL_CONFIGS.interior).setupCompleted) {
      setSetupOpenKey("interior");
      return;
    }
    setSetupOpenKey(null);
  }

  return (
    <div>
      {activeSetupConfig ? (
        <PanelLamasSetupModal
          open={!!activeSetupConfig}
          config={activeSetupConfig}
          widthM={width}
          heightM={height}
          initialOrientation={activeSetupState?.orientation || "horizontal"}
          initialDivisions={activeSetupState?.divisions || ""}
          initialSectionSizes={activeSetupState?.rawSizes || []}
          initialClassicMode={!!activeSetupState?.classic}
          onSave={savePanelSetup}
        />
      ) : null}

      <div style={{ fontWeight: 800, marginBottom: 8 }}>Medidas de la puerta</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div>
          <div className="muted">Ancho puerta (m)</div>
          <Input value={dimensions?.width || ""} onChange={(v) => setDimensions({ width: normalizeDecimal(v) })} placeholder="Ej: 0.90" style={{ width: "100%" }} />
        </div>
        <div>
          <div className="muted">Alto puerta (m)</div>
          <Input value={dimensions?.height || ""} onChange={(v) => setDimensions({ height: normalizeDecimal(v) })} placeholder="Ej: 2.10" style={{ width: "100%" }} />
        </div>
        <div>
          <div className="muted">Superficie automática</div>
          <Input value={area > 0 ? `${metric(area)} m²` : ""} onChange={() => {}} disabled style={{ width: "100%", background: "#f3f4f6" }} />
        </div>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Esta sección no calcula piernas ni parantes. La superficie se usa para productos configurados como cantidad por m².
      </div>

      {hasExteriorPanel ? <PanelLamasConfigCard config={DOOR_PANEL_CONFIGS.exterior} dimensions={dimensions} setDimensions={setDimensions} /> : null}
      {hasInteriorPanel ? <PanelLamasConfigCard config={DOOR_PANEL_CONFIGS.interior} dimensions={dimensions} setDimensions={setDimensions} /> : null}
    </div>
  );
}

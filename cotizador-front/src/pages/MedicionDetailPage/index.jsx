import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getMeasurement, reviewMeasurement, saveMeasurement } from "../../api/measurements.js";
import { adminGetTechnicalMeasurementFieldDefinitions, adminGetTechnicalMeasurementRules } from "../../api/admin.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { mergeMeasurementFields, parseOptions } from "../../domain/measurement/technicalMeasurementRuleFields.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

function text(v) { return v === null || v === undefined ? "" : String(v).trim(); }
function boolValue(v) { return v === true || String(v || "").toLowerCase().trim() === "si"; }
function splitName(endCustomer = {}) {
  const first = text(endCustomer.first_name);
  const last = text(endCustomer.last_name);
  if (first || last) return { first, last };
  const parts = text(endCustomer.name).split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function extractBudgetDimensionMm(quote, key) {
  const dims = quote?.payload?.dimensions || {};
  const raw = key === "ancho" ? dims?.width : dims?.height;
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 1000));
}
function normalizeTriple(values = [], suggested = "") {
  const arr = Array.isArray(values) ? values.slice(0, 3).map((v) => text(v)) : [];
  while (arr.length < 3) arr.push("");
  if (!arr.some(Boolean) && suggested) arr[1] = suggested;
  return arr;
}
const SCHEME_RECT_PCTS = {
  alto: [
    { left: 9.22, top: 43.73, width: 14.4, height: 14.24 },
    { left: 27.02, top: 43.73, width: 14.4, height: 14.24 },
    { left: 44.5, top: 43.73, width: 14.24, height: 14.24 },
  ],
  ancho: [
    { left: 71.36, top: 22.71, width: 14.4, height: 14.24 },
    { left: 71.36, top: 48.14, width: 14.4, height: 13.9 },
    { left: 71.36, top: 82.71, width: 14.4, height: 14.24 },
  ],
};
const schemeOverlayBaseStyle = {
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  color: "#111",
  textShadow: "0 1px 0 rgba(255,255,255,0.9)",
  background: "rgba(255,255,255,0.55)",
  borderRadius: 6,
  pointerEvents: "none",
};
const SECTION_LABELS = {
  datos_generales: "Datos generales",
  esquema_medidas: "Esquema (medidas)",
  revestimiento: "Revestimiento",
  puerta_estructura: "Puerta / estructura",
  rebajes_suelo: "Rebajes / suelo",
  observaciones: "Observaciones",
  otros: "Otros / configurables",
};

function updateSchemeValue(form, axis, index, value) {
  const next = {
    ...(form.esquema || {}),
    alto: normalizeTriple(form.esquema?.alto || []),
    ancho: normalizeTriple(form.esquema?.ancho || []),
  };
  next[axis][index] = value;
  return { ...form, esquema: next };
}
function buildInitialForm(quote, current = {}) {
  const end = quote?.end_customer || {};
  const split = splitName(end);
  const suggestedAlto = extractBudgetDimensionMm(quote, "alto");
  const suggestedAncho = extractBudgetDimensionMm(quote, "ancho");
  return {
    ...current,
    fecha: text(current.fecha) || todayISO(),
    fecha_nota_pedido: text(current.fecha_nota_pedido) || (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : ""),
    nota_venta: text(current.nota_venta) || text(quote?.final_sale_order_name || quote?.odoo_sale_order_name || quote?.quote_number),
    cliente_nombre: text(current.cliente_nombre) || split.first,
    cliente_apellido: text(current.cliente_apellido) || split.last,
    distribuidor: text(current.distribuidor) || text(quote?.created_by_full_name || quote?.created_by_username || (quote?.created_by_role === "vendedor" ? "De Grandis Portones" : "")),
    tipo_revestimiento_comercial: text(current.tipo_revestimiento_comercial),
    fabricante_revestimiento: text(current.fabricante_revestimiento),
    lucera: boolValue(current.lucera),
    lucera_cantidad: current.lucera_cantidad ?? "",
    lucera_posicion: current.lucera_posicion ?? "",
    color_revestimiento: text(current.color_revestimiento),
    color_sistema: text(current.color_sistema),
    listones: text(current.listones),
    puerta: boolValue(current.puerta),
    posicion_puerta: text(current.posicion_puerta || current.lado_puerta),
    parantes: { cant: text(current?.parantes?.cant), distribucion: text(current?.parantes?.distribucion) },
    pasador_manual: boolValue(current.pasador_manual),
    instalacion: boolValue(current.instalacion),
    anclaje: text(current.anclaje),
    piernas: text(current.piernas),
    rebaje: boolValue(current.rebaje),
    rebaje_altura: text(current.rebaje_altura),
    rebaje_lateral: boolValue(current.rebaje_lateral),
    rebaje_inferior: boolValue(current.rebaje_inferior),
    trampa_tierra: boolValue(current.trampa_tierra),
    trampa_tierra_altura: text(current.trampa_tierra_altura),
    esquema: {
      alto: normalizeTriple(current?.esquema?.alto || [], suggestedAlto),
      ancho: normalizeTriple(current?.esquema?.ancho || [], suggestedAncho),
    },
    alto_final_mm: text(current.alto_final_mm) || suggestedAlto,
    ancho_final_mm: text(current.ancho_final_mm) || suggestedAncho,
    observaciones: text(current.observaciones),
  };
}
function Section({ title, children }) { return <div className="card" style={{ background: "#fafafa", marginBottom: 12 }}><div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>{children}</div>; }
function Row({ children }) { return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>; }
function Field({ label, children }) { return <div style={{ flex: 1, minWidth: 220 }}><div className="muted" style={{ marginBottom: 6 }}>{label}</div>{children}</div>; }
function YesNo({ value, onChange, disabled }) { return <select value={value ? "si" : "no"} onChange={(e) => onChange(e.target.value === "si")} disabled={disabled} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="si">Sí</option><option value="no">No</option></select>; }

function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}
function setByPath(obj, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return obj;
  const root = { ...(obj || {}) };
  let cur = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    cur[key] = cur[key] && typeof cur[key] === "object" ? { ...cur[key] } : {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}
function normalizeRuleText(value) {
  if (typeof value === "boolean") return value ? "si" : "no";
  return String(value ?? "").trim().toLowerCase();
}
function compareRule(currentRaw, operator, compareRaw) {
  const currentText = normalizeRuleText(currentRaw);
  const expectedText = normalizeRuleText(compareRaw);
  const currentNum = Number(String(currentRaw ?? "").replace(",", "."));
  const expectedNum = Number(String(compareRaw ?? "").replace(",", "."));
  switch (String(operator || "=").trim()) {
    case "=": return currentText === expectedText;
    case "!=": return currentText !== expectedText;
    case ">": return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum > expectedNum;
    case ">=": return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum >= expectedNum;
    case "<": return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum < expectedNum;
    case "<=": return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum <= expectedNum;
    case "contains": return currentText.includes(expectedText);
    default: return currentText === expectedText;
  }
}
function buildRuleContext(form, quote) {
  const heightFinal = Number(String(form?.alto_final_mm ?? "").replace(",", "."));
  const widthFinal = Number(String(form?.ancho_final_mm ?? "").replace(",", "."));
  const dims = quote?.payload?.dimensions || {};
  const budgetWidth = Number(String(dims?.width ?? "").replace(",", "."));
  const budgetHeight = Number(String(dims?.height ?? "").replace(",", "."));
  const surfaceFinal = Number.isFinite(heightFinal) && Number.isFinite(widthFinal) ? (heightFinal * widthFinal) / 1000000 : null;
  return {
    ...form,
    surface_m2: surfaceFinal ?? ((Number.isFinite(budgetWidth) && Number.isFinite(budgetHeight)) ? (budgetWidth * budgetHeight) : 0),
    budget_width_m: Number.isFinite(budgetWidth) ? budgetWidth : 0,
    budget_height_m: Number.isFinite(budgetHeight) ? budgetHeight : 0,
    payment_method: quote?.payload?.payment_method || "",
    porton_type: quote?.payload?.porton_type || "",
  };
}
function evaluateDynamicRules({ form, quote, rules }) {
  const context = buildRuleContext(form, quote);
  const hidden = new Set();
  const forcedValues = {};
  const clearedFields = new Set();
  const allowedOptions = {};
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule?.active || !rule?.source_key) continue;
    const current = getByPath(context, rule.source_key);
    if (!compareRule(current, rule.operator, rule.compare_value)) continue;
    if (rule.action_type === "set_value" && rule.target_field) {
      forcedValues[rule.target_field] = rule.target_value;
      clearedFields.delete(rule.target_field);
    }
    if (rule.action_type === "clear_field" && rule.target_field) {
      delete forcedValues[rule.target_field];
      clearedFields.add(rule.target_field);
    }
    if (rule.action_type === "show_field" && rule.target_field) hidden.delete(rule.target_field);
    if (rule.action_type === "hide_field" && rule.target_field) hidden.add(rule.target_field);
    if (rule.action_type === "allow_options" && rule.target_field) {
      const options = Array.isArray(rule.target_options) ? rule.target_options : parseOptions(rule.target_value || "").map((item) => item.value);
      allowedOptions[rule.target_field] = options;
    }
  }
  return { hidden, forcedValues, clearedFields, allowedOptions };
}
function renderDynamicInput({ field, value, onChange, allowedValues, disabled = false }) {
  const fieldType = String(field?.type || "text").trim().toLowerCase();
  if (fieldType === "boolean") return <YesNo value={boolValue(value)} onChange={(v) => onChange(v)} disabled={disabled} />;
  if (fieldType === "enum") {
    const allOptions = Array.isArray(field?.options) ? field.options : [];
    const filtered = Array.isArray(allowedValues) && allowedValues.length ? allOptions.filter((opt) => allowedValues.includes(opt.value)) : allOptions;
    return <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="">Seleccione…</option>{filtered.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>;
  }
  return <Input value={value ?? ""} onChange={onChange} type={fieldType === "number" ? "number" : "text"} style={{ width: "100%" }} disabled={disabled} />;
}
function renderDynamicSectionFields({ sectionKey, fieldsBySection, dynamicUi, allFields, form, setForm }) {
  const sectionFields = fieldsBySection[sectionKey] || [];
  const visibleFields = sectionFields.filter((field) => !dynamicUi.hidden.has(field.key));
  if (!visibleFields.length) return null;
  return (
    <>
      <div className="spacer" />
      <Row>
        {visibleFields.map((field) => {
          const fieldMeta = allFields.find((item) => item.key === field.key) || field;
          const allowed = dynamicUi.allowedOptions[field.key];
          const value = getByPath(form, field.key);
          return (
            <Field key={field.key} label={field.label}>
              {renderDynamicInput({
                field: fieldMeta,
                value,
                allowedValues: allowed,
                onChange: (nextValue) => setForm((prev) => setByPath(prev, field.key, nextValue)),
              })}
            </Field>
          );
        })}
      </Row>
    </>
  );
}

export default function MedicionDetailPage() {
  const { id } = useParams();
  const quoteId = id ? String(id) : null;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isTechnical = !!user?.is_rev_tecnica;
  const isMedidor = !!user?.is_medidor;

  const q = useQuery({ queryKey: ["measurement", quoteId], queryFn: () => getMeasurement(quoteId), enabled: !!quoteId });
  const dynamicFieldsQ = useQuery({ queryKey: ["technicalMeasurementFieldsForMeasurement"], queryFn: adminGetTechnicalMeasurementFieldDefinitions, enabled: !!quoteId });
  const dynamicRulesQ = useQuery({ queryKey: ["technicalMeasurementRulesForMeasurement"], queryFn: adminGetTechnicalMeasurementRules, enabled: !!quoteId });

  const quote = q.data;
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!quote) return;
    setForm(buildInitialForm(quote, quote.measurement_form || {}));
  }, [quote]);

  const dynamicFields = useMemo(() => (dynamicFieldsQ.data?.fields || []).filter((field) => field?.active !== false), [dynamicFieldsQ.data]);
  const allFields = useMemo(() => mergeMeasurementFields(dynamicFields), [dynamicFields]);
  const fieldMetaByKey = useMemo(() => new Map(allFields.map((field) => [field.key, field])), [allFields]);
  const fieldsBySection = useMemo(() => {
    const out = {};
    for (const field of dynamicFields) {
      const key = String(field?.section || "otros").trim().toLowerCase() || "otros";
      if (!out[key]) out[key] = [];
      out[key].push(field);
    }
    return out;
  }, [dynamicFields]);
  const dynamicUi = useMemo(() => {
    if (!form || !quote) return { hidden: new Set(), forcedValues: {}, clearedFields: new Set(), allowedOptions: {} };
    return evaluateDynamicRules({ form, quote, rules: dynamicRulesQ.data?.rules || [] });
  }, [form, quote, dynamicRulesQ.data]);

  useEffect(() => {
    if (!form) return;
    const entries = Object.entries(dynamicUi.forcedValues || {});
    if (!entries.length) return;
    let next = form;
    let changed = false;
    for (const [fieldKey, fieldValue] of entries) {
      const current = getByPath(next, fieldKey);
      if (String(current ?? "") !== String(fieldValue ?? "")) {
        next = setByPath(next, fieldKey, fieldValue);
        changed = true;
      }
    }
    if (changed) setForm(next);
  }, [dynamicUi.forcedValues, form]);

  useEffect(() => {
    if (!form) return;
    const fieldsToClear = Array.from(dynamicUi.clearedFields || []);
    if (!fieldsToClear.length) return;
    let next = form;
    let changed = false;
    for (const fieldKey of fieldsToClear) {
      const current = getByPath(next, fieldKey);
      if (current !== null && current !== "" && current !== undefined) {
        next = setByPath(next, fieldKey, null);
        changed = true;
      }
    }
    if (changed) setForm(next);
  }, [dynamicUi.clearedFields, form]);

  const saveM = useMutation({
    mutationFn: ({ submit }) => saveMeasurement(quoteId, { form, submit, endCustomer: quote?.end_customer || {} }),
    onSuccess: () => q.refetch(),
  });
  const rejectM = useMutation({
    mutationFn: (notes) => reviewMeasurement(quoteId, { action: "reject", notes }),
    onSuccess: () => q.refetch(),
  });

  if (q.isLoading) return <div className="container"><div className="card"><div className="muted">Cargando…</div></div></div>;
  if (q.isError) return <div className="container"><div className="card"><div style={{ color: "#d93025" }}>{q.error.message}</div></div></div>;
  if (!quote || !form) return null;

  const showField = (fieldKey) => !dynamicUi.hidden.has(fieldKey);
  const fieldAllowed = (fieldKey) => dynamicUi.allowedOptions[fieldKey];
  const fieldMeta = (fieldKey, fallback) => fieldMetaByKey.get(fieldKey) || fallback;
  const renderSystemField = (fieldKey, label, fallbackField, value, onChange, disabled = false) => {
    if (!showField(fieldKey)) return null;
    return (
      <Field label={label}>
        {renderDynamicInput({
          field: fieldMeta(fieldKey, fallbackField),
          value,
          allowedValues: fieldAllowed(fieldKey),
          onChange,
          disabled,
        })}
      </Field>
    );
  };

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Planilla de medición / datos técnicos</h2>
        <div className="muted">Presupuesto #{quote?.quote_number || quote?.odoo_sale_order_name || "—"}</div>
        <div className="spacer" />
        <Button variant="ghost" onClick={() => navigate(-1)}>Volver</Button>
      </div>

      <div className="spacer" />
      <Section title={SECTION_LABELS.datos_generales}>
        <Row>
          {renderSystemField("nota_venta", "Nota de Venta / NV", { key: "nota_venta", type: "text", options: [] }, form.nota_venta, (v) => setForm({ ...form, nota_venta: v }), !isTechnical)}
          {renderSystemField("fecha_nota_pedido", "Fecha de Nota de Pedido", { key: "fecha_nota_pedido", type: "text", options: [] }, form.fecha_nota_pedido, (v) => setForm({ ...form, fecha_nota_pedido: v }), !isTechnical)}
          {renderSystemField("fecha", "Fecha de medición", { key: "fecha", type: "text", options: [] }, form.fecha, (v) => setForm({ ...form, fecha: v }), !isTechnical && !isMedidor)}
          {renderSystemField("distribuidor", "Distribuidor", { key: "distribuidor", type: "text", options: [] }, form.distribuidor, (v) => setForm({ ...form, distribuidor: v }), !isTechnical)}
        </Row>
        <div className="spacer" />
        <Row>
          {renderSystemField("cliente_nombre", "Nombre del cliente", { key: "cliente_nombre", type: "text", options: [] }, form.cliente_nombre, (v) => setForm({ ...form, cliente_nombre: v }), !isTechnical)}
          {renderSystemField("cliente_apellido", "Apellido del cliente", { key: "cliente_apellido", type: "text", options: [] }, form.cliente_apellido, (v) => setForm({ ...form, cliente_apellido: v }), !isTechnical)}
          {renderSystemField("alto_final_mm", "Alto final (mm)", { key: "alto_final_mm", type: "number", options: [] }, form.alto_final_mm, (v) => setForm({ ...form, alto_final_mm: v }), !isTechnical)}
          {renderSystemField("ancho_final_mm", "Ancho final (mm)", { key: "ancho_final_mm", type: "number", options: [] }, form.ancho_final_mm, (v) => setForm({ ...form, ancho_final_mm: v }), !isTechnical)}
        </Row>
        {renderDynamicSectionFields({ sectionKey: "datos_generales", fieldsBySection, dynamicUi, allFields, form, setForm })}
      </Section>

      <Section title={SECTION_LABELS.esquema_medidas}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 2, minWidth: 320 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fff" }}>
              <div style={{ position: "relative", width: "100%" }}>
                <img src="/measurement_scheme.png" alt="Esquema de medición" style={{ width: "100%", height: "auto", display: "block" }} />
                {SCHEME_RECT_PCTS.alto.map((p, i) => {
                  const v = form.esquema?.alto?.[i];
                  if (!v) return null;
                  return <div key={`alto-ov-${i}`} style={{ ...schemeOverlayBaseStyle, left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%`, fontSize: 14 }}>{v}</div>;
                })}
                {SCHEME_RECT_PCTS.ancho.map((p, i) => {
                  const v = form.esquema?.ancho?.[i];
                  if (!v) return null;
                  return <div key={`ancho-ov-${i}`} style={{ ...schemeOverlayBaseStyle, left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%`, fontSize: 14 }}>{v}</div>;
                })}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Altos</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`alto-${i}`} label={`Alto ${i + 1} (mm)`}><Input value={form.esquema?.alto?.[i] || ""} onChange={(v) => setForm((prev) => updateSchemeValue(prev, "alto", i, v))} style={{ width: "100%" }} /></Field>
              ))}
            </Row>
            <div className="spacer" />
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Anchos</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`ancho-${i}`} label={`Ancho ${i + 1} (mm)`}><Input value={form.esquema?.ancho?.[i] || ""} onChange={(v) => setForm((prev) => updateSchemeValue(prev, "ancho", i, v))} style={{ width: "100%" }} /></Field>
              ))}
            </Row>
          </div>
        </div>
        {renderDynamicSectionFields({ sectionKey: "esquema_medidas", fieldsBySection, dynamicUi, allFields, form, setForm })}
      </Section>

      <Section title={SECTION_LABELS.revestimiento}>
        <Row>
          {renderSystemField("tipo_revestimiento_comercial", "Tipo revestimiento", { key: "tipo_revestimiento_comercial", type: "enum", options: fieldMeta("tipo_revestimiento_comercial", { options: [] }).options || [] }, form.tipo_revestimiento_comercial, (v) => setForm({ ...form, tipo_revestimiento_comercial: v }))}
          {renderSystemField("fabricante_revestimiento", "Fabricante revestimiento", { key: "fabricante_revestimiento", type: "text", options: [] }, form.fabricante_revestimiento, (v) => setForm({ ...form, fabricante_revestimiento: v }))}
          {renderSystemField("color_revestimiento", "Color revestimiento", { key: "color_revestimiento", type: "text", options: [] }, form.color_revestimiento, (v) => setForm({ ...form, color_revestimiento: v }))}
          {renderSystemField("color_sistema", "Color sistema", { key: "color_sistema", type: "text", options: [] }, form.color_sistema, (v) => setForm({ ...form, color_sistema: v }))}
        </Row>
        <div className="spacer" />
        <Row>
          {renderSystemField("listones", "Listones", { key: "listones", type: "text", options: [] }, form.listones, (v) => setForm({ ...form, listones: v }))}
          {renderSystemField("lucera", "Lucera", { key: "lucera", type: "boolean", options: fieldMeta("lucera", { options: [] }).options || [] }, form.lucera, (v) => setForm({ ...form, lucera: v }))}
          {renderSystemField("lucera_cantidad", "Cant. de luceras", { key: "lucera_cantidad", type: "enum", options: fieldMeta("lucera_cantidad", { options: [] }).options || [] }, form.lucera_cantidad, (v) => setForm({ ...form, lucera_cantidad: v }), !form.lucera)}
          {renderSystemField("lucera_posicion", "Posición de lucera", { key: "lucera_posicion", type: "enum", options: fieldMeta("lucera_posicion", { options: [] }).options || [] }, form.lucera_posicion, (v) => setForm({ ...form, lucera_posicion: v }), !form.lucera)}
        </Row>
        {renderDynamicSectionFields({ sectionKey: "revestimiento", fieldsBySection, dynamicUi, allFields, form, setForm })}
      </Section>

      <Section title={SECTION_LABELS.puerta_estructura}>
        <Row>
          {renderSystemField("puerta", "Puerta", { key: "puerta", type: "boolean", options: fieldMeta("puerta", { options: [] }).options || [] }, form.puerta, (v) => setForm({ ...form, puerta: v }))}
          {renderSystemField("posicion_puerta", "Posición de la puerta", { key: "posicion_puerta", type: "text", options: [] }, form.posicion_puerta, (v) => setForm({ ...form, posicion_puerta: v }), !form.puerta)}
          {renderSystemField("parantes.cant", "Parantes cantidad", { key: "parantes.cant", type: "number", options: [] }, form.parantes?.cant || "", (v) => setForm({ ...form, parantes: { ...(form.parantes || {}), cant: v } }))}
          {renderSystemField("parantes.distribucion", "Parantes distribución", { key: "parantes.distribucion", type: "text", options: [] }, form.parantes?.distribucion || "", (v) => setForm({ ...form, parantes: { ...(form.parantes || {}), distribucion: v } }))}
        </Row>
        <div className="spacer" />
        <Row>
          {renderSystemField("pasador_manual", "Pasador manual", { key: "pasador_manual", type: "boolean", options: fieldMeta("pasador_manual", { options: [] }).options || [] }, form.pasador_manual, (v) => setForm({ ...form, pasador_manual: v }))}
          {renderSystemField("instalacion", "Instalación", { key: "instalacion", type: "boolean", options: fieldMeta("instalacion", { options: [] }).options || [] }, form.instalacion, (v) => setForm({ ...form, instalacion: v }))}
          {renderSystemField("anclaje", "Anclaje", { key: "anclaje", type: "enum", options: fieldMeta("anclaje", { options: [] }).options || [] }, form.anclaje, (v) => setForm({ ...form, anclaje: v }))}
          {renderSystemField("piernas", "Piernas", { key: "piernas", type: "text", options: [] }, form.piernas, (v) => setForm({ ...form, piernas: v }))}
        </Row>
        {renderDynamicSectionFields({ sectionKey: "puerta_estructura", fieldsBySection, dynamicUi, allFields, form, setForm })}
      </Section>

      <Section title={SECTION_LABELS.rebajes_suelo}>
        <Row>
          {renderSystemField("rebaje", "Rebaje", { key: "rebaje", type: "boolean", options: fieldMeta("rebaje", { options: [] }).options || [] }, form.rebaje, (v) => setForm({ ...form, rebaje: v }))}
          {renderSystemField("rebaje_altura", "Altura de rebaje", { key: "rebaje_altura", type: "enum", options: fieldMeta("rebaje_altura", { options: [] }).options || [] }, form.rebaje_altura, (v) => setForm({ ...form, rebaje_altura: v }), !form.rebaje)}
          {renderSystemField("rebaje_lateral", "Rebaje lateral", { key: "rebaje_lateral", type: "boolean", options: fieldMeta("rebaje_lateral", { options: [] }).options || [] }, form.rebaje_lateral, (v) => setForm({ ...form, rebaje_lateral: v }))}
          {renderSystemField("rebaje_inferior", "Rebaje inferior", { key: "rebaje_inferior", type: "boolean", options: fieldMeta("rebaje_inferior", { options: [] }).options || [] }, form.rebaje_inferior, (v) => setForm({ ...form, rebaje_inferior: v }))}
        </Row>
        <div className="spacer" />
        <Row>
          {renderSystemField("trampa_tierra", "Trampa de tierra", { key: "trampa_tierra", type: "boolean", options: fieldMeta("trampa_tierra", { options: [] }).options || [] }, form.trampa_tierra, (v) => setForm({ ...form, trampa_tierra: v }))}
          {renderSystemField("trampa_tierra_altura", "Altura trampa de tierra", { key: "trampa_tierra_altura", type: "enum", options: fieldMeta("trampa_tierra_altura", { options: [] }).options || [] }, form.trampa_tierra_altura, (v) => setForm({ ...form, trampa_tierra_altura: v }), !form.trampa_tierra)}
        </Row>
        {renderDynamicSectionFields({ sectionKey: "rebajes_suelo", fieldsBySection, dynamicUi, allFields, form, setForm })}
      </Section>

      <Section title={SECTION_LABELS.observaciones}>
        {showField("observaciones") && <textarea value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} style={{ width: "100%", minHeight: 100, padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />}
        {renderDynamicSectionFields({ sectionKey: "observaciones", fieldsBySection, dynamicUi, allFields, form, setForm })}
      </Section>

      {!!(fieldsBySection.otros || []).filter((field) => !dynamicUi.hidden.has(field.key)).length && (
        <Section title={SECTION_LABELS.otros}>
          <div className="muted" style={{ marginBottom: 10 }}>Campos extra que no quedaron asignados a un sector puntual.</div>
          <Row>
            {(fieldsBySection.otros || []).filter((field) => !dynamicUi.hidden.has(field.key)).map((field) => {
              const fieldMetaValue = allFields.find((item) => item.key === field.key) || field;
              const allowed = dynamicUi.allowedOptions[field.key];
              const value = getByPath(form, field.key);
              return (
                <Field key={field.key} label={field.label}>
                  {renderDynamicInput({
                    field: fieldMetaValue,
                    value,
                    allowedValues: allowed,
                    onChange: (nextValue) => setForm((prev) => setByPath(prev, field.key, nextValue)),
                  })}
                </Field>
              );
            })}
          </Row>
        </Section>
      )}

      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" disabled={saveM.isPending} onClick={() => saveM.mutate({ submit: false })}>{saveM.isPending ? "Guardando..." : "Guardar"}</Button>
          <Button disabled={saveM.isPending} onClick={() => saveM.mutate({ submit: true })}>{saveM.isPending ? "Enviando..." : (isTechnical ? "Confirmar datos técnicos" : "Enviar a Técnica")}</Button>
          {isTechnical && <Button variant="ghost" disabled={rejectM.isPending} onClick={() => { const notes = window.prompt("Motivo de corrección:", "") || ""; if (!notes) return; rejectM.mutate(notes); }}>{rejectM.isPending ? "Devolviendo..." : "Devolver para corregir"}</Button>}
        </div>
      </div>
    </div>
  );
}

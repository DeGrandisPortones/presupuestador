import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  getMeasurement,
  reviewMeasurement,
  saveMeasurement,
} from "../../api/measurements.js";
import {
  adminGetTechnicalMeasurementFieldDefinitions,
  adminGetTechnicalMeasurementRules,
} from "../../api/admin.js";
import { getCatalogBootstrap } from "../../api/catalog.js";
import { useAuthStore } from "../../domain/auth/store.js";
import {
  mergeMeasurementFields,
  parseOptions,
} from "../../domain/measurement/technicalMeasurementRuleFields.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

function text(v) {
  return String(v ?? "").trim();
}
function boolValue(v) {
  if (v === true) return true;
  const normalized = String(v || "")
    .toLowerCase()
    .trim();
  return ["si", "sí", "true", "1", "yes"].includes(normalized);
}
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
  const arr = Array.isArray(values)
    ? values.slice(0, 3).map((v) => text(v))
    : [];
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
    fecha_nota_pedido:
      text(current.fecha_nota_pedido) ||
      (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : ""),
    nota_venta:
      text(current.nota_venta) ||
      text(
        quote?.final_sale_order_name ||
          quote?.odoo_sale_order_name ||
          quote?.quote_number,
      ),
    cliente_nombre: text(current.cliente_nombre) || split.first,
    cliente_apellido: text(current.cliente_apellido) || split.last,
    distribuidor:
      text(current.distribuidor) ||
      text(
        quote?.created_by_full_name ||
          quote?.created_by_username ||
          (quote?.created_by_role === "vendedor" ? "De Grandis Portones" : ""),
      ),
    tipo_revestimiento_comercial: text(current.tipo_revestimiento_comercial),
    fabricante_revestimiento: text(current.fabricante_revestimiento),
    lucera: boolValue(current.lucera),
    lucera_cantidad: text(current.lucera_cantidad),
    lucera_posicion: text(current.lucera_posicion),
    color_revestimiento: text(current.color_revestimiento),
    color_sistema: text(current.color_sistema),
    listones: text(current.listones),
    puerta: boolValue(current.puerta),
    posicion_puerta: text(current.posicion_puerta || current.lado_puerta),
    parantes: {
      cant: text(current?.parantes?.cant),
      distribucion: text(current?.parantes?.distribucion),
    },
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
function Section({ title, children }) {
  return (
    <div className="card" style={{ background: "#fafafa", marginBottom: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
function YesNo({ value, onChange, disabled }) {
  return (
    <select
      value={value ? "si" : "no"}
      onChange={(e) => onChange(e.target.value === "si")}
      disabled={disabled}
      style={{
        width: "100%",
        padding: 10,
        borderRadius: 10,
        border: "1px solid #ddd",
      }}
    >
      <option value="si">Sí</option>
      <option value="no">No</option>
    </select>
  );
}

function getByPath(obj, path) {
  const parts = String(path || "")
    .split(".")
    .filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}
function isNumericSegment(value) {
  return /^\d+$/.test(String(value || ""));
}
function cloneContainer(value) {
  return Array.isArray(value) ? value.slice() : { ...(value || {}) };
}
function setByPath(obj, path, value) {
  const parts = String(path || "")
    .split(".")
    .filter(Boolean);
  if (!parts.length) return obj;
  const root = cloneContainer(obj || {});
  let cur = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = isNumericSegment(parts[i]) ? Number(parts[i]) : parts[i];
    const nextSegment = parts[i + 1];
    const existing = cur[key];
    if (existing && typeof existing === "object") {
      cur[key] = cloneContainer(existing);
    } else {
      cur[key] = isNumericSegment(nextSegment) ? [] : {};
    }
    cur = cur[key];
  }
  const lastKey = isNumericSegment(parts[parts.length - 1])
    ? Number(parts[parts.length - 1])
    : parts[parts.length - 1];
  cur[lastKey] = value;
  return root;
}
function normalizeRuleText(value) {
  if (typeof value === "boolean") return value ? "si" : "no";
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
function compareRule(currentRaw, operator, compareRaw) {
  const currentText = normalizeRuleText(currentRaw);
  const expectedText = normalizeRuleText(compareRaw);
  const currentNum = Number(String(currentRaw ?? "").replace(",", "."));
  const expectedNum = Number(String(compareRaw ?? "").replace(",", "."));
  switch (String(operator || "=").trim()) {
    case "=":
      return currentText === expectedText;
    case "!=":
      return currentText !== expectedText;
    case ">":
      return (
        Number.isFinite(currentNum) &&
        Number.isFinite(expectedNum) &&
        currentNum > expectedNum
      );
    case ">=":
      return (
        Number.isFinite(currentNum) &&
        Number.isFinite(expectedNum) &&
        currentNum >= expectedNum
      );
    case "<":
      return (
        Number.isFinite(currentNum) &&
        Number.isFinite(expectedNum) &&
        currentNum < expectedNum
      );
    case "<=":
      return (
        Number.isFinite(currentNum) &&
        Number.isFinite(expectedNum) &&
        currentNum <= expectedNum
      );
    case "contains":
      return currentText.includes(expectedText);
    default:
      return currentText === expectedText;
  }
}
function buildRuleContext(form, quote, user) {
  const heightFinal = Number(
    String(form?.alto_final_mm ?? "").replace(",", "."),
  );
  const widthFinal = Number(
    String(form?.ancho_final_mm ?? "").replace(",", "."),
  );
  const dims = quote?.payload?.dimensions || {};
  const budgetWidth = Number(String(dims?.width ?? "").replace(",", "."));
  const budgetHeight = Number(String(dims?.height ?? "").replace(",", "."));
  const surfaceFinal =
    Number.isFinite(heightFinal) && Number.isFinite(widthFinal)
      ? (heightFinal * widthFinal) / 1000000
      : null;
  return {
    ...form,
    surface_m2:
      surfaceFinal ??
      (Number.isFinite(budgetWidth) && Number.isFinite(budgetHeight)
        ? budgetWidth * budgetHeight
        : 0),
    budget_width_m: Number.isFinite(budgetWidth) ? budgetWidth : 0,
    budget_height_m: Number.isFinite(budgetHeight) ? budgetHeight : 0,
    payment_method: quote?.payload?.payment_method || "",
    porton_type: quote?.payload?.porton_type || "",
    current_user: {
      user_id: user?.user_id || "",
      username: user?.username || "",
      full_name: user?.full_name || "",
      is_vendedor: !!user?.is_vendedor,
      is_distribuidor: !!user?.is_distribuidor,
      is_superuser: !!user?.is_superuser,
      is_medidor: !!user?.is_medidor,
      is_rev_tecnica: !!user?.is_rev_tecnica,
      is_enc_comercial: !!user?.is_enc_comercial,
    },
  };
}
function evaluateDynamicRules({ form, quote, user, rules }) {
  const context = buildRuleContext(form, quote, user);
  const hidden = new Set();
  const forcedValues = {};
  const allowedOptions = {};
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule?.active || !rule?.source_key) continue;
    const current = getByPath(context, rule.source_key);
    if (!compareRule(current, rule.operator, rule.compare_value)) continue;
    if (rule.action_type === "set_value" && rule.target_field)
      forcedValues[rule.target_field] = rule.target_value;
    if (rule.action_type === "show_field" && rule.target_field)
      hidden.delete(rule.target_field);
    if (rule.action_type === "hide_field" && rule.target_field)
      hidden.add(rule.target_field);
    if (rule.action_type === "allow_options" && rule.target_field) {
      const options = Array.isArray(rule.target_options)
        ? rule.target_options
        : parseOptions(rule.target_value || "").map((item) => item.value);
      allowedOptions[rule.target_field] = options;
    }
  }
  return { hidden, forcedValues, allowedOptions };
}
function normalizeNameKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function buildBudgetSectionsContext(quote, catalog) {
  const sections = Array.isArray(catalog?.sections)
    ? catalog.sections.slice()
    : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const lineByProductId = new Map(
    lines.map((line) => [Number(line?.product_id), line]),
  );
  const byId = {};
  const byName = {};
  for (const section of sections) {
    const item = {
      id: Number(section?.id),
      name: String(section?.name || ""),
      selected_products: [],
    };
    byId[item.id] = item;
    byName[normalizeNameKey(item.name)] = item;
  }
  for (const product of products) {
    const line = lineByProductId.get(Number(product?.id));
    if (!line) continue;
    const sectionIds = Array.isArray(product?.section_ids)
      ? product.section_ids
      : [];
    for (const sectionIdRaw of sectionIds) {
      const sectionId = Number(sectionIdRaw);
      if (!byId[sectionId])
        byId[sectionId] = { id: sectionId, name: "", selected_products: [] };
      const displayName = String(
        line?.name ||
          product?.display_name ||
          product?.alias ||
          product?.name ||
          "",
      ).trim();
      byId[sectionId].selected_products.push({
        product_id: Number(product?.id),
        display_name: displayName,
        alias: String(product?.alias || "").trim(),
        raw_name: String(line?.raw_name || product?.name || displayName).trim(),
        code: String(line?.code || product?.code || "").trim(),
        qty: Number(line?.qty || 1) || 1,
      });
    }
  }
  return { by_id: byId, by_name: byName };
}
function buildBudgetContext(quote, catalog, user) {
  return {
    payload: quote?.payload || {},
    end_customer: quote?.end_customer || {},
    measurement_prefill: quote?.measurement_prefill || {},
    quote: {
      id: quote?.id || null,
      quote_number: quote?.quote_number || "",
      fulfillment_mode: quote?.fulfillment_mode || "",
      note: quote?.note || "",
      created_by_role: quote?.created_by_role || "",
      created_by_full_name: quote?.created_by_full_name || "",
      created_by_username: quote?.created_by_username || "",
      odoo_sale_order_name: quote?.odoo_sale_order_name || "",
      final_sale_order_name: quote?.final_sale_order_name || "",
      confirmed_at: quote?.confirmed_at || "",
    },
    current_user: {
      user_id: user?.user_id || "",
      username: user?.username || "",
      full_name: user?.full_name || "",
      is_vendedor: !!user?.is_vendedor,
      is_distribuidor: !!user?.is_distribuidor,
      is_superuser: !!user?.is_superuser,
      is_medidor: !!user?.is_medidor,
      is_rev_tecnica: !!user?.is_rev_tecnica,
      is_enc_comercial: !!user?.is_enc_comercial,
    },
    budget_sections: buildBudgetSectionsContext(quote, catalog),
  };
}
function getSectionBudgetProducts(field, budgetContext) {
  const sections = budgetContext?.budget_sections || {};
  const byId = sections.by_id || {};
  const byName = sections.by_name || {};
  const section =
    byId[Number(field?.budget_section_id || 0)] ||
    byName[normalizeNameKey(field?.budget_section_name)];
  return Array.isArray(section?.selected_products)
    ? section.selected_products
    : [];
}

function getSectionCatalogProducts(field, catalog) {
  const sectionId = Number(field?.budget_section_id || 0);
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  if (!sectionId) return [];
  return products.filter((product) =>
    Array.isArray(product?.section_ids)
      ? product.section_ids.some((sid) => Number(sid) === sectionId)
      : false,
  );
}
function productDisplayLabel(product) {
  const alias = String(product?.alias || '').trim();
  const display = String(product?.display_name || product?.name || '').trim();
  const code = String(product?.code || '').trim();
  return `${alias || display}${code ? ` · ${code}` : ''}`.trim();
}
function coerceBudgetSectionProductValue(field, product) {
  const key = String(field?.budget_product_value_key || 'display_name');
  if (key === 'presence_si_no') return 'si';
  if (key === 'product_id') return String(product?.id || product?.product_id || '');
  if (key === 'alias') return String(product?.alias || '').trim();
  if (key === 'raw_name') return String(product?.name || product?.raw_name || '').trim();
  if (key === 'code') return String(product?.code || '').trim();
  return String(product?.display_name || product?.alias || product?.name || '').trim();
}
function resolveSectionBudgetValue(field, budgetContext) {
  const products = getSectionBudgetProducts(field, budgetContext);
  if (!products.length) return String(field?.budget_product_value_key || "") === "presence_si_no" ? "no" : "";
  const key = String(field?.budget_product_value_key || "display_name");
  const mode = String(field?.budget_multiple_mode || "first");
  const values = products
    .map((product) =>
      key === "presence_si_no"
        ? "si"
        : key === "product_id"
          ? String(product.product_id || "")
          : String(product?.[key] || product?.display_name || "").trim(),
    )
    .filter(Boolean);
  if (!values.length) return "";
  return mode === "join" ? values.join(", ") : values[0];
}
function coerceDynamicValue(field, value) {
  const fieldType = String(field?.type || "text")
    .trim()
    .toLowerCase();
  if (fieldType === "boolean") return boolValue(value);
  if (fieldType === "number") {
    const n = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(n) ? String(n) : "";
  }
  return String(value ?? "");
}
function resolveFieldAutofillValue(field, budgetContext) {
  const sourceType = String(field?.value_source_type || "manual");
  if (sourceType === "fixed") return field?.fixed_value ?? "";
  if (sourceType === "budget_field" || sourceType === "current_user_field")
    return getByPath(budgetContext, field?.value_source_path);
  if (sourceType === "budget_section_product")
    return resolveSectionBudgetValue(field, budgetContext);
  return "";
}
function canEditDynamicField(field, { isTechnical, isMedidor }) {
  const mode = String(field?.editable_by || "both");
  if (mode === "none") return false;
  if (mode === "both") return isTechnical || isMedidor;
  if (mode === "tecnico") return isTechnical;
  if (mode === "medidor") return isMedidor;
  return true;
}
function renderDynamicInput({
  field,
  value,
  onChange,
  allowedValues,
  disabled,
}) {
  const fieldType = String(field?.type || "text")
    .trim()
    .toLowerCase();
  if (fieldType === "boolean")
    return (
      <YesNo
        value={boolValue(value)}
        onChange={(v) => onChange(v)}
        disabled={disabled}
      />
    );
  if (fieldType === "enum") {
    const allOptions = Array.isArray(field?.options) ? field.options : [];
    const filtered =
      Array.isArray(allowedValues) && allowedValues.length
        ? allOptions.filter((opt) => allowedValues.includes(opt.value))
        : allOptions;
    return (
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 10,
          border: "1px solid #ddd",
        }}
      >
        <option value="">Seleccione…</option>
        {filtered.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Input
      value={value || ""}
      onChange={onChange}
      type={fieldType === "number" ? "number" : "text"}
      style={{ width: "100%" }}
      disabled={disabled}
    />
  );
}
function renderDynamicSectionFields({
  sectionKey,
  fieldsBySection,
  dynamicUi,
  allFields,
  form,
  setForm,
  isTechnical,
  isMedidor,
  catalog,
  budgetContext,
}) {
  const sectionFields = fieldsBySection[sectionKey] || [];
  const visibleFields = sectionFields.filter(
    (field) => !dynamicUi.hidden.has(field.key),
  );
  if (!visibleFields.length) return null;
  return (
    <>
      <div className="spacer" />
      <Row>
        {visibleFields.map((field) => {
          const fieldMeta =
            allFields.find((item) => item.key === field.key) || field;
          const allowed = dynamicUi.allowedOptions[field.key];
          const value = getByPath(form, field.key);
          const disabled = !canEditDynamicField(fieldMeta, {
            isTechnical,
            isMedidor,
          });
          const sectionCatalogProducts = getSectionCatalogProducts(fieldMeta, catalog);
          const selectedBindingProduct = getByPath(form, `__selected_binding_product.${field.key}`);
          const effectiveSelectedProductId = String(selectedBindingProduct?.product_id || getByPath(form, `__budget_binding_products.${field.key}.0.product_id`) || "");
          const shouldRenderSectionProductSelector =
            String(fieldMeta?.value_source_type || "") === "budget_section_product" &&
            String(fieldMeta?.odoo_binding_type || "") === "selected_measurement_product" &&
            sectionCatalogProducts.length > 0;
          return (
            <Field key={field.key} label={field.label}>
              {shouldRenderSectionProductSelector ? (
                <select
                  value={effectiveSelectedProductId}
                  onChange={(e) => {
                    const product = sectionCatalogProducts.find((item) => String(item.id) === String(e.target.value));
                    setForm((prev) => {
                      let next = prev;
                      if (!product) {
                        next = setByPath(next, field.key, "");
                        next = setByPath(next, `__selected_binding_product.${field.key}`, null);
                        return next;
                      }
                      next = setByPath(next, field.key, coerceDynamicValue(fieldMeta, coerceBudgetSectionProductValue(fieldMeta, product)));
                      next = setByPath(next, `__selected_binding_product.${field.key}`, {
                        product_id: Number(product.id),
                        display_name: String(product.display_name || product.alias || product.name || '').trim(),
                        alias: String(product.alias || '').trim(),
                        raw_name: String(product.name || '').trim(),
                        code: String(product.code || '').trim(),
                        qty: 1,
                      });
                      return next;
                    });
                  }}
                  disabled={disabled}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
                >
                  <option value="">Seleccione producto…</option>
                  {sectionCatalogProducts.map((product) => (
                    <option key={product.id} value={product.id}>{productDisplayLabel(product)}</option>
                  ))}
                </select>
              ) : renderDynamicInput({
                field: fieldMeta,
                value,
                allowedValues: allowed,
                disabled,
                onChange: (nextValue) =>
                  setForm((prev) => setByPath(prev, field.key, nextValue)),
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

  const q = useQuery({
    queryKey: ["measurement", quoteId],
    queryFn: () => getMeasurement(quoteId),
    enabled: !!quoteId,
  });
  const dynamicFieldsQ = useQuery({
    queryKey: ["technicalMeasurementFieldsForMeasurement"],
    queryFn: adminGetTechnicalMeasurementFieldDefinitions,
    enabled: !!quoteId,
  });
  const dynamicRulesQ = useQuery({
    queryKey: ["technicalMeasurementRulesForMeasurement"],
    queryFn: adminGetTechnicalMeasurementRules,
    enabled: !!quoteId,
  });
  const catalogQ = useQuery({
    queryKey: ["catalogBootstrapForMeasurement", "porton"],
    queryFn: () => getCatalogBootstrap("porton"),
    enabled: !!quoteId,
  });

  const quote = q.data;
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!quote) return;
    setForm(buildInitialForm(quote, quote.measurement_form || {}));
  }, [quote]);

  const configuredFieldDefinitions = useMemo(() => {
    return Array.isArray(dynamicFieldsQ.data?.fields)
      ? dynamicFieldsQ.data.fields
      : [];
  }, [dynamicFieldsQ.data]);
  const allFields = useMemo(() => {
    return mergeMeasurementFields(configuredFieldDefinitions).filter(
      (field) => field?.active !== false,
    );
  }, [configuredFieldDefinitions]);
  const dynamicFields = useMemo(
    () => allFields.filter((field) => !field?.system && !field?.context_only),
    [allFields],
  );
  const fieldConfigByKey = useMemo(
    () => new Map(allFields.map((field) => [field.key, field])),
    [allFields],
  );
  const fieldsBySection = useMemo(() => {
    const out = {};
    for (const field of dynamicFields) {
      const key =
        String(field?.section || "otros")
          .trim()
          .toLowerCase() || "otros";
      if (!out[key]) out[key] = [];
      out[key].push(field);
    }
    return out;
  }, [dynamicFields]);
  const budgetContext = useMemo(
    () => buildBudgetContext(quote, catalogQ.data, user),
    [quote, catalogQ.data, user],
  );
  const dynamicUi = useMemo(() => {
    if (!form || !quote)
      return { hidden: new Set(), forcedValues: {}, allowedOptions: {} };
    return evaluateDynamicRules({
      form,
      quote,
      user,
      rules: dynamicRulesQ.data?.rules || [],
    });
  }, [form, quote, user, dynamicRulesQ.data]);

  function getConfiguredField(key) {
    return fieldConfigByKey.get(String(key || "").trim()) || null;
  }
  function canEditField(key) {
    const field = getConfiguredField(key);
    if (!field) return isTechnical || isMedidor;
    return canEditDynamicField(field, { isTechnical, isMedidor });
  }
  function getFieldLabel(key, fallback) {
    const field = getConfiguredField(key);
    return String(field?.label || fallback || key || "");
  }
  function isFieldHidden(key) {
    return dynamicUi.hidden.has(String(key || "").trim());
  }
  function renderBuiltInField(key, fallbackLabel, content) {
    if (isFieldHidden(key)) return null;
    return <Field label={getFieldLabel(key, fallbackLabel)}>{content}</Field>;
  }

  useEffect(() => {
    const autofillFields = allFields.filter(
      (field) => field?.context_only !== true,
    );
    if (!form || !autofillFields.length) return;
    let next = form;
    let changed = false;
    for (const field of autofillFields) {
      if (String(field?.value_source_type || "") === "budget_section_product") {
        const selectedProducts = getSectionBudgetProducts(field, budgetContext)
          .map((item) => ({
            product_id: Number(item?.product_id || 0) || null,
            display_name: String(item?.display_name || "").trim(),
            alias: String(item?.alias || "").trim(),
            raw_name: String(item?.raw_name || "").trim(),
            code: String(item?.code || "").trim(),
            qty: Number(item?.qty || 1) || 1,
          }))
          .filter((item) => item.product_id);
        const currentBindingProducts = getByPath(
          next,
          `__budget_binding_products.${field.key}`,
        );
        const currentSerialized = JSON.stringify(
          Array.isArray(currentBindingProducts) ? currentBindingProducts : [],
        );
        const nextSerialized = JSON.stringify(selectedProducts);
        if (currentSerialized != nextSerialized) {
          next = setByPath(
            next,
            `__budget_binding_products.${field.key}`,
            selectedProducts,
          );
          changed = true;
        }
      }
      const sourceValue = resolveFieldAutofillValue(field, budgetContext);
      if (
        sourceValue === undefined ||
        sourceValue === null ||
        sourceValue === ""
      )
        continue;
      const currentValue = getByPath(next, field.key);
      const isCurrentEmpty =
        currentValue === undefined ||
        currentValue === null ||
        currentValue === "";
      if (!isCurrentEmpty) continue;
      next = setByPath(next, field.key, coerceDynamicValue(field, sourceValue));
      changed = true;
    }
    if (changed) setForm(next);
  }, [form, allFields, budgetContext]);

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

  const saveM = useMutation({
    mutationFn: ({ submit }) =>
      saveMeasurement(quoteId, {
        form,
        submit,
        endCustomer: quote?.end_customer || {},
      }),
    onSuccess: () => q.refetch(),
  });
  const rejectM = useMutation({
    mutationFn: (notes) =>
      reviewMeasurement(quoteId, { action: "reject", notes }),
    onSuccess: () => q.refetch(),
  });

  if (q.isLoading)
    return (
      <div className="container">
        <div className="card">
          <div className="muted">Cargando…</div>
        </div>
      </div>
    );
  if (q.isError)
    return (
      <div className="container">
        <div className="card">
          <div style={{ color: "#d93025" }}>{q.error.message}</div>
        </div>
      </div>
    );
  if (!quote || !form) return null;

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Planilla de medición / datos técnicos</h2>
        <div className="muted">
          Presupuesto #
          {quote?.quote_number || quote?.odoo_sale_order_name || "—"}
        </div>
        <div className="spacer" />
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Volver
        </Button>
      </div>
      <div className="spacer" />
      <Section title={SECTION_LABELS.datos_generales}>
        <Row>
          {renderBuiltInField(
            "nota_venta",
            "Nota de Venta / NV",
            <Input
              value={form.nota_venta || ""}
              onChange={(v) => setForm({ ...form, nota_venta: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("nota_venta")}
            />,
          )}
          {renderBuiltInField(
            "fecha_nota_pedido",
            "Fecha de Nota de Pedido",
            <Input
              type="date"
              value={form.fecha_nota_pedido || ""}
              onChange={(v) => setForm({ ...form, fecha_nota_pedido: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("fecha_nota_pedido")}
            />,
          )}
          {renderBuiltInField(
            "fecha",
            "Fecha de medición",
            <Input
              type="date"
              value={form.fecha || ""}
              onChange={(v) => setForm({ ...form, fecha: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("fecha")}
            />,
          )}
          {renderBuiltInField(
            "distribuidor",
            "Distribuidor",
            <Input
              value={form.distribuidor || ""}
              onChange={(v) => setForm({ ...form, distribuidor: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("distribuidor")}
            />,
          )}
        </Row>
        <div className="spacer" />
        <Row>
          {renderBuiltInField(
            "cliente_nombre",
            "Nombre del cliente",
            <Input
              value={form.cliente_nombre || ""}
              onChange={(v) => setForm({ ...form, cliente_nombre: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("cliente_nombre")}
            />,
          )}
          {renderBuiltInField(
            "cliente_apellido",
            "Apellido del cliente",
            <Input
              value={form.cliente_apellido || ""}
              onChange={(v) => setForm({ ...form, cliente_apellido: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("cliente_apellido")}
            />,
          )}
          {renderBuiltInField(
            "alto_final_mm",
            "Alto final (mm)",
            <Input
              value={form.alto_final_mm || ""}
              onChange={(v) => setForm({ ...form, alto_final_mm: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("alto_final_mm")}
            />,
          )}
          {renderBuiltInField(
            "ancho_final_mm",
            "Ancho final (mm)",
            <Input
              value={form.ancho_final_mm || ""}
              onChange={(v) => setForm({ ...form, ancho_final_mm: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("ancho_final_mm")}
            />,
          )}
        </Row>
        {renderDynamicSectionFields({
          sectionKey: "datos_generales",
          fieldsBySection,
          dynamicUi,
          allFields,
          form,
          setForm,
          isTechnical,
          isMedidor,
          catalog: catalogQ.data,
          budgetContext,
        })}
      </Section>
      <Section title={SECTION_LABELS.esquema_medidas}>
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 2, minWidth: 320 }}>
            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 10,
                background: "#fff",
              }}
            >
              <div style={{ position: "relative", width: "100%" }}>
                <img
                  src="/measurement_scheme.png"
                  alt="Esquema de medición"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
                {SCHEME_RECT_PCTS.alto.map((p, i) => {
                  const v = form.esquema?.alto?.[i];
                  if (!v) return null;
                  return (
                    <div
                      key={`alto-ov-${i}`}
                      style={{
                        ...schemeOverlayBaseStyle,
                        left: `${p.left}%`,
                        top: `${p.top}%`,
                        width: `${p.width}%`,
                        height: `${p.height}%`,
                        fontSize: 14,
                      }}
                    >
                      {v}
                    </div>
                  );
                })}
                {SCHEME_RECT_PCTS.ancho.map((p, i) => {
                  const v = form.esquema?.ancho?.[i];
                  if (!v) return null;
                  return (
                    <div
                      key={`ancho-ov-${i}`}
                      style={{
                        ...schemeOverlayBaseStyle,
                        left: `${p.left}%`,
                        top: `${p.top}%`,
                        width: `${p.width}%`,
                        height: `${p.height}%`,
                        fontSize: 14,
                      }}
                    >
                      {v}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Altos</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`alto-${i}`} label={`Alto ${i + 1} (mm)`}>
                  <Input
                    value={form.esquema?.alto?.[i] || ""}
                    onChange={(v) =>
                      setForm((prev) => updateSchemeValue(prev, "alto", i, v))
                    }
                    style={{ width: "100%" }}
                  />
                </Field>
              ))}
            </Row>
            <div className="spacer" />
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Anchos</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`ancho-${i}`} label={`Ancho ${i + 1} (mm)`}>
                  <Input
                    value={form.esquema?.ancho?.[i] || ""}
                    onChange={(v) =>
                      setForm((prev) => updateSchemeValue(prev, "ancho", i, v))
                    }
                    style={{ width: "100%" }}
                  />
                </Field>
              ))}
            </Row>
          </div>
        </div>
        {renderDynamicSectionFields({
          sectionKey: "esquema_medidas",
          fieldsBySection,
          dynamicUi,
          allFields,
          form,
          setForm,
          isTechnical,
          isMedidor,
          catalog: catalogQ.data,
          budgetContext,
        })}
      </Section>
      <Section title={SECTION_LABELS.revestimiento}>
        <Row>
          {renderBuiltInField(
            "tipo_revestimiento_comercial",
            "Tipo revestimiento",
            <select
              value={form.tipo_revestimiento_comercial || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  tipo_revestimiento_comercial: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
              disabled={!canEditField("tipo_revestimiento_comercial")}
            >
              <option value="">Seleccione…</option>
              <option value="PVC">PVC</option>
              <option value="Madera">Madera</option>
              <option value="Aluminio">Aluminio</option>
              <option value="chapa">Chapa</option>
              <option value="otros">Otros</option>
            </select>,
          )}
          {renderBuiltInField(
            "fabricante_revestimiento",
            "Fabricante revestimiento",
            <Input
              value={form.fabricante_revestimiento || ""}
              onChange={(v) =>
                setForm({ ...form, fabricante_revestimiento: v })
              }
              style={{ width: "100%" }}
              disabled={!canEditField("fabricante_revestimiento")}
            />,
          )}
          {renderBuiltInField(
            "color_revestimiento",
            "Color revestimiento",
            <Input
              value={form.color_revestimiento || ""}
              onChange={(v) => setForm({ ...form, color_revestimiento: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("color_revestimiento")}
            />,
          )}
          {renderBuiltInField(
            "color_sistema",
            "Color sistema",
            <Input
              value={form.color_sistema || ""}
              onChange={(v) => setForm({ ...form, color_sistema: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("color_sistema")}
            />,
          )}
        </Row>
        <div className="spacer" />
        <Row>
          {renderBuiltInField(
            "listones",
            "Listones",
            <Input
              value={form.listones || ""}
              onChange={(v) => setForm({ ...form, listones: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("listones")}
            />,
          )}
          {renderBuiltInField(
            "lucera",
            "Lucera",
            <YesNo
              value={form.lucera}
              onChange={(v) => setForm({ ...form, lucera: v })}
              disabled={!canEditField("lucera")}
            />,
          )}
          {renderBuiltInField(
            "lucera_cantidad",
            "Cant. de luceras",
            renderDynamicInput({
              field: getConfiguredField("lucera_cantidad") || {
                key: "lucera_cantidad",
                type: "enum",
                options: parseOptions(["1", "2", "3", "4"]),
              },
              value: form.lucera_cantidad || "",
              allowedValues: dynamicUi.allowedOptions["lucera_cantidad"],
              disabled: !canEditField("lucera_cantidad") || !form.lucera,
              onChange: (nextValue) =>
                setForm({ ...form, lucera_cantidad: String(nextValue || "") }),
            }),
          )}
          {renderBuiltInField(
            "lucera_posicion",
            "Posición de lucera",
            <Input
              value={form.lucera_posicion || ""}
              onChange={(v) => setForm({ ...form, lucera_posicion: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("lucera_posicion") || !form.lucera}
            />,
          )}
        </Row>
        {renderDynamicSectionFields({
          sectionKey: "revestimiento",
          fieldsBySection,
          dynamicUi,
          allFields,
          form,
          setForm,
          isTechnical,
          isMedidor,
          catalog: catalogQ.data,
          budgetContext,
        })}
      </Section>
      <Section title={SECTION_LABELS.puerta_estructura}>
        <Row>
          {renderBuiltInField(
            "puerta",
            "Puerta",
            <YesNo
              value={form.puerta}
              onChange={(v) => setForm({ ...form, puerta: v })}
              disabled={!canEditField("puerta")}
            />,
          )}
          {renderBuiltInField(
            "posicion_puerta",
            "Posición de la puerta",
            <Input
              value={form.posicion_puerta || ""}
              onChange={(v) => setForm({ ...form, posicion_puerta: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("posicion_puerta") || !form.puerta}
            />,
          )}
          {renderBuiltInField(
            "parantes.cant",
            "Parantes cantidad",
            <Input
              value={form.parantes?.cant || ""}
              onChange={(v) =>
                setForm({
                  ...form,
                  parantes: { ...(form.parantes || {}), cant: v },
                })
              }
              style={{ width: "100%" }}
              disabled={!canEditField("parantes.cant")}
            />,
          )}
          {renderBuiltInField(
            "parantes.distribucion",
            "Parantes distribución",
            <Input
              value={form.parantes?.distribucion || ""}
              onChange={(v) =>
                setForm({
                  ...form,
                  parantes: { ...(form.parantes || {}), distribucion: v },
                })
              }
              style={{ width: "100%" }}
              disabled={!canEditField("parantes.distribucion")}
            />,
          )}
        </Row>
        <div className="spacer" />
        <Row>
          {renderBuiltInField(
            "pasador_manual",
            "Pasador manual",
            <YesNo
              value={form.pasador_manual}
              onChange={(v) => setForm({ ...form, pasador_manual: v })}
              disabled={!canEditField("pasador_manual")}
            />,
          )}
          {renderBuiltInField(
            "instalacion",
            "Instalación",
            <YesNo
              value={form.instalacion}
              onChange={(v) => setForm({ ...form, instalacion: v })}
              disabled={!canEditField("instalacion")}
            />,
          )}
          {renderBuiltInField(
            "anclaje",
            "Anclaje",
            <select
              value={form.anclaje || ""}
              onChange={(e) => setForm({ ...form, anclaje: e.target.value })}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
              disabled={!canEditField("anclaje")}
            >
              <option value="">Seleccione…</option>
              <option value="no">No</option>
              <option value="lateral">Lateral</option>
              <option value="superior">Superior</option>
            </select>,
          )}
          {renderBuiltInField(
            "piernas",
            "Piernas",
            <Input
              value={form.piernas || ""}
              onChange={(v) => setForm({ ...form, piernas: v })}
              style={{ width: "100%" }}
              disabled={!canEditField("piernas")}
            />,
          )}
        </Row>
        {renderDynamicSectionFields({
          sectionKey: "puerta_estructura",
          fieldsBySection,
          dynamicUi,
          allFields,
          form,
          setForm,
          isTechnical,
          isMedidor,
          catalog: catalogQ.data,
          budgetContext,
        })}
      </Section>
      <Section title={SECTION_LABELS.rebajes_suelo}>
        <Row>
          {renderBuiltInField(
            "rebaje",
            "Rebaje",
            <YesNo
              value={form.rebaje}
              onChange={(v) => setForm({ ...form, rebaje: v })}
              disabled={!canEditField("rebaje")}
            />,
          )}
          {renderBuiltInField(
            "rebaje_altura",
            "Altura de rebaje",
            <select
              value={form.rebaje_altura || ""}
              onChange={(e) =>
                setForm({ ...form, rebaje_altura: e.target.value })
              }
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
              disabled={!canEditField("rebaje_altura") || !form.rebaje}
            >
              <option value="">Seleccione…</option>
              <option value="75mm">75mm</option>
              <option value="100mm">100mm</option>
              <option value="125mm">125mm</option>
            </select>,
          )}
          {renderBuiltInField(
            "rebaje_lateral",
            "Rebaje lateral",
            <YesNo
              value={form.rebaje_lateral}
              onChange={(v) => setForm({ ...form, rebaje_lateral: v })}
              disabled={!canEditField("rebaje_lateral")}
            />,
          )}
          {renderBuiltInField(
            "rebaje_inferior",
            "Rebaje inferior",
            <YesNo
              value={form.rebaje_inferior}
              onChange={(v) => setForm({ ...form, rebaje_inferior: v })}
              disabled={!canEditField("rebaje_inferior")}
            />,
          )}
        </Row>
        <div className="spacer" />
        <Row>
          {renderBuiltInField(
            "trampa_tierra",
            "Trampa de tierra",
            <YesNo
              value={form.trampa_tierra}
              onChange={(v) => setForm({ ...form, trampa_tierra: v })}
              disabled={!canEditField("trampa_tierra")}
            />,
          )}
          {renderBuiltInField(
            "trampa_tierra_altura",
            "Altura trampa de tierra",
            <select
              value={form.trampa_tierra_altura || ""}
              onChange={(e) =>
                setForm({ ...form, trampa_tierra_altura: e.target.value })
              }
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
              }}
              disabled={
                !canEditField("trampa_tierra_altura") || !form.trampa_tierra
              }
            >
              <option value="">Seleccione…</option>
              <option value="2 cm">2 cm</option>
              <option value="5 cm">5 cm</option>
            </select>,
          )}
        </Row>
        {renderDynamicSectionFields({
          sectionKey: "rebajes_suelo",
          fieldsBySection,
          dynamicUi,
          allFields,
          form,
          setForm,
          isTechnical,
          isMedidor,
          catalog: catalogQ.data,
          budgetContext,
        })}
      </Section>
      <Section title={SECTION_LABELS.observaciones}>
        <textarea
          value={form.observaciones || ""}
          onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
          style={{
            width: "100%",
            minHeight: 100,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />
        {renderDynamicSectionFields({
          sectionKey: "observaciones",
          fieldsBySection,
          dynamicUi,
          allFields,
          form,
          setForm,
          isTechnical,
          isMedidor,
          catalog: catalogQ.data,
          budgetContext,
        })}
      </Section>
      {!!(fieldsBySection.otros || []).filter(
        (field) => !dynamicUi.hidden.has(field.key),
      ).length && (
        <Section title={SECTION_LABELS.otros}>
          <div className="muted" style={{ marginBottom: 10 }}>
            Campos extra que no quedaron asignados a un sector puntual.
          </div>
          <Row>
            {(fieldsBySection.otros || [])
              .filter((field) => !dynamicUi.hidden.has(field.key))
              .map((field) => {
                const fieldMeta =
                  allFields.find((item) => item.key === field.key) || field;
                const allowed = dynamicUi.allowedOptions[field.key];
                const value = getByPath(form, field.key);
                const disabled = !canEditDynamicField(fieldMeta, {
                  isTechnical,
                  isMedidor,
                });
                return (
                  <Field key={field.key} label={field.label}>
                    {renderDynamicInput({
                      field: fieldMeta,
                      value,
                      allowedValues: allowed,
                      disabled,
                      onChange: (nextValue) =>
                        setForm((prev) =>
                          setByPath(prev, field.key, nextValue),
                        ),
                    })}
                  </Field>
                );
              })}
          </Row>
        </Section>
      )}
      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            disabled={saveM.isPending}
            onClick={() => saveM.mutate({ submit: false })}
          >
            {saveM.isPending ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            disabled={saveM.isPending}
            onClick={() => saveM.mutate({ submit: true })}
          >
            {saveM.isPending
              ? "Enviando..."
              : isTechnical
                ? "Confirmar datos técnicos"
                : "Enviar a Técnica"}
          </Button>
          {isTechnical && (
            <Button
              variant="ghost"
              disabled={rejectM.isPending}
              onClick={() => {
                const notes = window.prompt("Motivo de corrección:", "") || "";
                if (!notes) return;
                rejectM.mutate(notes);
              }}
            >
              {rejectM.isPending ? "Devolviendo..." : "Devolver para corregir"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

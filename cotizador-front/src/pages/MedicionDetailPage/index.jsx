import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getMeasurement,
  reviewMeasurement,
  saveMeasurementDetailed,
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
  const alias = String(product?.alias || "").trim();
  const display = String(product?.display_name || product?.name || "").trim();
  const code = String(product?.code || "").trim();
  return `${alias || display}${code ? ` · ${code}` : ""}`.trim();
}
function coerceBudgetSectionProductValue(field, product) {
  const key = String(field?.budget_product_value_key || "display_name");
  if (key === "presence_si_no") return "si";
  if (key === "product_id") return String(product?.id || product?.product_id || "");
  if (key === "alias") return String(product?.alias || "").trim();
  if (key === "raw_name") return String(product?.name || product?.raw_name || "").trim();
  if (key === "code") return String(product?.code || "").trim();
  return String(product?.display_name || product?.alias || product?.name || "").trim();
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
  if (String(field?.type || "") === "odoo_product") return resolveSectionBudgetValue({ ...field, budget_product_value_key: field?.budget_product_value_key || "alias" }, budgetContext);
  const sourceType = String(field?.value_source_type || "manual");
  if (sourceType === "fixed") return field?.fixed_value ?? "";
  if (sourceType === "budget_field" || sourceType === "current_user_field")
    return getByPath(budgetContext, field?.value_source_path);
  if (sourceType === "budget_section_product")
    return resolveSectionBudgetValue(field, budgetContext);
  return "";
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
function formatDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function formatARS(value) {
  const n = Number(value || 0);
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function normalizeDiffItems(items) {
  return Array.isArray(items) ? items : [];
}

export default function MedicionDetailPage() {
  const { id } = useParams();
  const quoteId = id ? String(id) : null;
  const navigate = useNavigate();
  const location = useLocation();
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
  const isCommercialReviewer = useMemo(() => {
    if (!quote || !user) return false;
    const isOwner = String(quote.created_by_user_id) === String(user.user_id);
    const isSellerOwner = isOwner && (user.is_vendedor || user.is_distribuidor);
    return String(quote.measurement_status || "") === "commercial_review" && (user.is_enc_comercial || isSellerOwner);
  }, [quote, user]);
  const [form, setForm] = useState(null);
  const [lastMessage, setLastMessage] = useState("");

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
  const commercialDiffItems = useMemo(
    () => normalizeDiffItems(quote?.measurement_commercial_diff_json),
    [quote?.measurement_commercial_diff_json],
  );
  const commercialEditableKeys = useMemo(
    () => new Set(commercialDiffItems.map((item) => String(item?.key || "").trim()).filter(Boolean)),
    [commercialDiffItems],
  );
  const defaultReturnReason =
    "El tamaño del portón es mayor al presupuestado originalmente";
  const forceReturnToSeller = useMemo(() => {
    if (!quote) return false;
    return Boolean(
      quote?.measurement_force_return_to_seller === true ||
      quote?.measurement_surface_blocked === true ||
      quote?.measurement_requires_budget_update === true,
    );
  }, [quote]);

  function getConfiguredField(key) {
    return fieldConfigByKey.get(String(key || "").trim()) || null;
  }
  function canEditField(key) {
    const field = getConfiguredField(key);
    if (isCommercialReviewer) return commercialEditableKeys.has(String(key || "").trim());
    if (!field) return isTechnical || isMedidor;
    const mode = String(field?.editable_by || "both");
    if (mode === "none") return false;
    if (mode === "both") return isTechnical || isMedidor;
    if (mode === "tecnico") return isTechnical;
    if (mode === "medidor") return isMedidor;
    return true;
  }
  function getFieldLabel(key, fallback) {
    const field = getConfiguredField(key);
    return String(field?.label || fallback || key || "");
  }
  function isFieldHidden(key) {
    if (isCommercialReviewer) return false;
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
    if (!form || !autofillFields.length || isCommercialReviewer) return;
    let next = form;
    let changed = false;
    for (const field of autofillFields) {
      if (String(field?.value_source_type || "") === "budget_section_product" || String(field?.type || "") === "odoo_product") {
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
        if (currentSerialized !== nextSerialized) {
          next = setByPath(
            next,
            `__budget_binding_products.${field.key}`,
            selectedProducts,
          );
          changed = true;
        }
        if (String(field?.type || "") === "odoo_product") {
          const existingSelected = getByPath(next, `__selected_binding_product.${field.key}`);
          if (!existingSelected?.product_id && selectedProducts[0]?.product_id) {
            next = setByPath(next, `__selected_binding_product.${field.key}`, selectedProducts[0]);
            changed = true;
          }
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
  }, [form, allFields, budgetContext, isCommercialReviewer]);

  useEffect(() => {
    if (!form || isCommercialReviewer) return;
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
  }, [dynamicUi.forcedValues, form, isCommercialReviewer]);

  function dynamicFieldDisabled(fieldMeta) {
    if (isCommercialReviewer) return !commercialEditableKeys.has(String(fieldMeta?.key || "").trim());
    const mode = String(fieldMeta?.editable_by || "both");
    if (mode === "none") return true;
    if (mode === "both") return !(isTechnical || isMedidor);
    if (mode === "tecnico") return !isTechnical;
    if (mode === "medidor") return !isMedidor;
    return false;
  }
  function renderDynamicSectionFields(sectionKey) {
    const sectionFields = fieldsBySection[sectionKey] || [];
    const visibleFields = isCommercialReviewer
      ? sectionFields.filter((field) => commercialEditableKeys.has(String(field?.key || "").trim()))
      : sectionFields.filter((field) => !dynamicUi.hidden.has(field.key));
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
            const disabled = dynamicFieldDisabled(fieldMeta);
            const sectionCatalogProducts = getSectionCatalogProducts(fieldMeta, catalogQ.data);
            const selectedBindingProduct = getByPath(form, `__selected_binding_product.${field.key}`);
            const effectiveSelectedProductId = String(selectedBindingProduct?.product_id || getByPath(form, `__budget_binding_products.${field.key}.0.product_id`) || "");
            const shouldRenderSectionProductSelector =
              ((String(fieldMeta?.type || "") === "odoo_product") || (
                String(fieldMeta?.value_source_type || "") === "budget_section_product" &&
                String(fieldMeta?.odoo_binding_type || "") === "selected_measurement_product"
              )) &&
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
                        const visibleValue = String(fieldMeta?.type || "") === "odoo_product"
                          ? coerceBudgetSectionProductValue({ ...fieldMeta, budget_product_value_key: fieldMeta?.budget_product_value_key || "alias" }, product)
                          : coerceBudgetSectionProductValue(fieldMeta, product);
                        next = setByPath(next, field.key, coerceDynamicValue(fieldMeta, visibleValue));
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

  const saveM = useMutation({
    mutationFn: ({ submit, returnToSeller = false, returnReason = "" }) =>
      saveMeasurementDetailed(quoteId, {
        form,
        submit,
        returnToSeller,
        returnReason,
        endCustomer: quote?.end_customer || {},
        baselineForm: quote?.measurement_original_form || buildInitialForm(quote, quote.measurement_original_form || quote.measurement_form || {}),
      }),
    onSuccess: (response) => {
      if (response?.returned_to_seller) {
        setLastMessage("El portón fue devuelto al vendedor para rehacer el presupuesto.");
      } else if (response?.requiresCommercialReview) {
        setLastMessage("La medición quedó en revisión comercial.");
      } else if (response?.moved_to_tecnica) {
        setLastMessage("La revisión comercial quedó lista y pasó a técnica.");
      } else {
        setLastMessage("Guardado.");
      }
      q.refetch();
    },
  });
  const rejectM = useMutation({
    mutationFn: (notes) =>
      reviewMeasurement(quoteId, { action: "reject", notes }),
    onSuccess: () => q.refetch(),
  });

  if (q.isLoading) {
    return (
      <div className="container">
        <div className="card">
          <div className="muted">Cargando medición...</div>
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ color: "#d93025", fontSize: 13 }}>
            {q.error?.message || "No se pudo cargar la medición"}
          </div>
        </div>
      </div>
    );
  }

  if (!quote || !form) {
    return (
      <div className="container">
        <div className="card">
          <div className="muted">Sin datos de medición.</div>
        </div>
      </div>
    );
  }

  const returnPath =
    (typeof location.state?.from === "string" && location.state.from.trim()) ||
    "/mediciones";

  const previewMetrics = quote?.measurement_commercial_preview_json || {};

  return (
    <div className="container">
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Medición / Datos técnicos</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Cliente: <b>{quote?.end_customer?.name || "—"}</b> · Estado: <b>{quote?.measurement_status || "pending"}</b>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={() => navigate(returnPath)}>
              Volver
            </Button>
            {(!forceReturnToSeller || isTechnical || isCommercialReviewer) && (
              <Button
                variant="secondary"
                disabled={saveM.isPending}
                onClick={() => saveM.mutate({ submit: false })}
              >
                {saveM.isPending
                  ? "Guardando..."
                  : isCommercialReviewer
                    ? "Guardar revisión comercial"
                    : "Guardar"}
              </Button>
            )}

            {!forceReturnToSeller && (
              <Button
                disabled={saveM.isPending}
                onClick={() => saveM.mutate({ submit: true })}
              >
                {saveM.isPending
                  ? "Procesando..."
                  : isCommercialReviewer
                    ? "Enviar a Técnica"
                    : isTechnical
                      ? "Confirmar datos técnicos"
                      : "Guardar y Enviar"}
              </Button>
            )}

            {isMedidor && !isCommercialReviewer ? (
              <Button
                variant="ghost"
                disabled={saveM.isPending}
                onClick={() => {
                  const prefilled = forceReturnToSeller ? defaultReturnReason : "";
                  const notes =
                    window.prompt("Motivo de devolución al vendedor:", prefilled) ||
                    prefilled;
                  if (!String(notes || "").trim()) return;
                  saveM.mutate({
                    submit: false,
                    returnToSeller: true,
                    returnReason: notes,
                  });
                }}
              >
                {saveM.isPending ? "Procesando..." : "Devolver al vendedor"}
              </Button>
            ) : null}

            {isTechnical && (
              <>
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
                <Button
                  variant="ghost"
                  disabled={rejectM.isPending}
                  onClick={async () => {
                    const prefilled = forceReturnToSeller
                      ? defaultReturnReason
                      : "";
                    const notes =
                      window.prompt("Motivo de devolución al vendedor:", prefilled) ||
                      prefilled;
                    if (!String(notes || "").trim()) return;
                    try {
                      await reviewMeasurement(quoteId, {
                        action: "return_to_seller",
                        notes,
                      });
                      setLastMessage(
                        "El portón fue devuelto al vendedor para rehacer el presupuesto.",
                      );
                      q.refetch();
                    } catch (e) {
                      window.alert(
                        e?.message || "No se pudo devolver al vendedor",
                      );
                    }
                  }}
                >
                  Devolver al vendedor
                </Button>
              </>
            )}
          </div>
        </div>

        {forceReturnToSeller ? (
          <>
            <div className="spacer" />
            <div
              style={{
                border: "1px solid #f2d3bf",
                background: "#fff8f3",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Presupuesto fuera de tolerancia
              </div>
              <div className="muted">
                La superficie final del portón supera lo presupuestado originalmente
                por fuera de la tolerancia permitida. Debe volver al vendedor para
                rehacer el presupuesto antes de seguir a técnica.
              </div>
            </div>
          </>
        ) : null}

        {quote?.measurement_return_to_seller_reason ? (
          <>
            <div className="spacer" />
            <div
              style={{
                border: "1px solid #f2d3bf",
                background: "#fff8f3",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Motivo de devolución al vendedor
              </div>
              <div>{quote.measurement_return_to_seller_reason}</div>
            </div>
          </>
        ) : null}

        {commercialDiffItems.length ? (
          <>
            <div className="spacer" />
            <div className="card" style={{ background: "#fafafa" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                Cambios enviados a comercial
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {commercialDiffItems.map((item, index) => (
                  <div
                    key={`${item?.key || "diff"}-${index}`}
                    style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {getFieldLabel(item?.key, item?.label || item?.key)}
                    </div>
                    <div className="muted">
                      Original: <b>{formatDisplayValue(item?.original_value)}</b> · Nuevo: <b>{formatDisplayValue(item?.new_value)}</b>
                    </div>
                  </div>
                ))}
              </div>
              {previewMetrics ? (
                <>
                  <div className="spacer" />
                  <div className="muted">
                    Monto estimado a cobrar: <b>{formatARS(previewMetrics?.final_amount_to_charge || 0)}</b>
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="spacer" />
        <Section title="Datos generales">
          <Row>
            {renderBuiltInField(
              "fecha",
              "Fecha",
              <Input
                value={form.fecha || ""}
                onChange={(v) => setForm((prev) => ({ ...prev, fecha: v }))}
                disabled={!canEditField("fecha")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "fecha_nota_pedido",
              "Fecha nota pedido",
              <Input
                value={form.fecha_nota_pedido || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, fecha_nota_pedido: v }))
                }
                disabled={!canEditField("fecha_nota_pedido")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "nota_venta",
              "Nota de venta",
              <Input
                value={form.nota_venta || ""}
                onChange={(v) => setForm((prev) => ({ ...prev, nota_venta: v }))}
                disabled={!canEditField("nota_venta")}
                style={{ width: "100%" }}
              />,
            )}
          </Row>
          <div className="spacer" />
          <Row>
            {renderBuiltInField(
              "cliente_nombre",
              "Cliente nombre",
              <Input
                value={form.cliente_nombre || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, cliente_nombre: v }))
                }
                disabled={!canEditField("cliente_nombre")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "cliente_apellido",
              "Cliente apellido",
              <Input
                value={form.cliente_apellido || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, cliente_apellido: v }))
                }
                disabled={!canEditField("cliente_apellido")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "distribuidor",
              "Vendedor / Distribuidor",
              <Input
                value={form.distribuidor || ""}
                onChange={(v) => setForm((prev) => ({ ...prev, distribuidor: v }))}
                disabled={!canEditField("distribuidor")}
                style={{ width: "100%" }}
              />,
            )}
          </Row>
          {renderDynamicSectionFields("datos_generales")}
        </Section>

        <Section title="Esquema de medidas">
          <Row>
            {renderBuiltInField(
              "alto_final_mm",
              "Alto final (mm)",
              <Input
                value={form.alto_final_mm || ""}
                onChange={(v) => setForm((prev) => ({ ...prev, alto_final_mm: v }))}
                disabled={!canEditField("alto_final_mm")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "ancho_final_mm",
              "Ancho final (mm)",
              <Input
                value={form.ancho_final_mm || ""}
                onChange={(v) => setForm((prev) => ({ ...prev, ancho_final_mm: v }))}
                disabled={!canEditField("ancho_final_mm")}
                style={{ width: "100%" }}
              />,
            )}
          </Row>
          <div className="spacer" />
          <Row>
            {[0, 1, 2].map((idx) => (
              <Field key={`alto-${idx}`} label={`Alto ${idx + 1} (mm)`}>
                <Input
                  value={form.esquema?.alto?.[idx] || ""}
                  onChange={(v) =>
                    setForm((prev) => updateSchemeValue(prev, "alto", idx, v))
                  }
                  disabled={!canEditField("esquema.alto")}
                  style={{ width: "100%" }}
                />
              </Field>
            ))}
          </Row>
          <div className="spacer" />
          <Row>
            {[0, 1, 2].map((idx) => (
              <Field key={`ancho-${idx}`} label={`Ancho ${idx + 1} (mm)`}>
                <Input
                  value={form.esquema?.ancho?.[idx] || ""}
                  onChange={(v) =>
                    setForm((prev) => updateSchemeValue(prev, "ancho", idx, v))
                  }
                  disabled={!canEditField("esquema.ancho")}
                  style={{ width: "100%" }}
                />
              </Field>
            ))}
          </Row>
          <div className="spacer" />
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 780,
              margin: "0 auto",
            }}
          >
            <img
              src="/measurement_scheme.png"
              alt="Esquema de medición"
              style={{ width: "100%", height: "auto", display: "block" }}
            />
            {SCHEME_RECT_PCTS.alto.map((rect, idx) => (
              <div
                key={`overlay-alto-${idx}`}
                style={{
                  ...schemeOverlayBaseStyle,
                  left: `${rect.left}%`,
                  top: `${rect.top}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                }}
              >
                {form.esquema?.alto?.[idx] || ""}
              </div>
            ))}
            {SCHEME_RECT_PCTS.ancho.map((rect, idx) => (
              <div
                key={`overlay-ancho-${idx}`}
                style={{
                  ...schemeOverlayBaseStyle,
                  left: `${rect.left}%`,
                  top: `${rect.top}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                }}
              >
                {form.esquema?.ancho?.[idx] || ""}
              </div>
            ))}
          </div>
          {renderDynamicSectionFields("esquema_medidas")}
        </Section>

        <Section title="Revestimiento">
          <Row>
            {renderBuiltInField(
              "fabricante_revestimiento",
              "Fabricante revestimiento",
              <Input
                value={form.fabricante_revestimiento || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, fabricante_revestimiento: v }))
                }
                disabled={!canEditField("fabricante_revestimiento")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "color_revestimiento",
              "Color revestimiento",
              <Input
                value={form.color_revestimiento || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, color_revestimiento: v }))
                }
                disabled={!canEditField("color_revestimiento")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "color_sistema",
              "Color sistema",
              <Input
                value={form.color_sistema || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, color_sistema: v }))
                }
                disabled={!canEditField("color_sistema")}
                style={{ width: "100%" }}
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
                onChange={(v) => setForm((prev) => ({ ...prev, listones: v }))}
                disabled={!canEditField("listones")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "lucera",
              "Lucera",
              <YesNo
                value={!!form.lucera}
                onChange={(v) => setForm((prev) => ({ ...prev, lucera: v }))}
                disabled={!canEditField("lucera")}
              />,
            )}
            {renderBuiltInField(
              "lucera_cantidad",
              "Cantidad luceras",
              <Input
                value={form.lucera_cantidad || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, lucera_cantidad: v }))
                }
                disabled={!canEditField("lucera_cantidad")}
                style={{ width: "100%" }}
              />,
            )}
          </Row>
          <div className="spacer" />
          <Row>
            {renderBuiltInField(
              "lucera_posicion",
              "Posición lucera",
              <Input
                value={form.lucera_posicion || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, lucera_posicion: v }))
                }
                disabled={!canEditField("lucera_posicion")}
                style={{ width: "100%" }}
              />,
            )}
          </Row>
          {renderDynamicSectionFields("revestimiento")}
        </Section>

        <Section title="Puerta / estructura">
          <Row>
            {renderBuiltInField(
              "puerta",
              "Puerta",
              <YesNo
                value={!!form.puerta}
                onChange={(v) => setForm((prev) => ({ ...prev, puerta: v }))}
                disabled={!canEditField("puerta")}
              />,
            )}
            {renderBuiltInField(
              "posicion_puerta",
              "Posición puerta",
              <Input
                value={form.posicion_puerta || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, posicion_puerta: v }))
                }
                disabled={!canEditField("posicion_puerta")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "parantes.cant",
              "Cantidad de parantes",
              <Input
                value={form.parantes?.cant || ""}
                onChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    parantes: { ...(prev.parantes || {}), cant: v },
                  }))
                }
                disabled={!canEditField("parantes.cant")}
                style={{ width: "100%" }}
              />,
            )}
          </Row>
          <div className="spacer" />
          <Row>
            {renderBuiltInField(
              "parantes.distribucion",
              "Distribución de parantes",
              <Input
                value={form.parantes?.distribucion || ""}
                onChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    parantes: { ...(prev.parantes || {}), distribucion: v },
                  }))
                }
                disabled={!canEditField("parantes.distribucion")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "pasador_manual",
              "Pasador manual",
              <YesNo
                value={!!form.pasador_manual}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, pasador_manual: v }))
                }
                disabled={!canEditField("pasador_manual")}
              />,
            )}
            {renderBuiltInField(
              "instalacion",
              "Instalación",
              <YesNo
                value={!!form.instalacion}
                onChange={(v) => setForm((prev) => ({ ...prev, instalacion: v }))}
                disabled={!canEditField("instalacion")}
              />,
            )}
          </Row>
          {renderDynamicSectionFields("puerta_estructura")}
        </Section>

        <Section title="Rebajes / suelo">
          <Row>
            {renderBuiltInField(
              "anclaje",
              "Anclaje",
              <Input
                value={form.anclaje || ""}
                onChange={(v) => setForm((prev) => ({ ...prev, anclaje: v }))}
                disabled={!canEditField("anclaje")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "piernas",
              "Piernas",
              <Input
                value={form.piernas || ""}
                onChange={(v) => setForm((prev) => ({ ...prev, piernas: v }))}
                disabled={!canEditField("piernas")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "rebaje",
              "Rebaje",
              <YesNo
                value={!!form.rebaje}
                onChange={(v) => setForm((prev) => ({ ...prev, rebaje: v }))}
                disabled={!canEditField("rebaje")}
              />,
            )}
          </Row>
          <div className="spacer" />
          <Row>
            {renderBuiltInField(
              "rebaje_altura",
              "Rebaje altura",
              <Input
                value={form.rebaje_altura || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, rebaje_altura: v }))
                }
                disabled={!canEditField("rebaje_altura")}
                style={{ width: "100%" }}
              />,
            )}
            {renderBuiltInField(
              "rebaje_lateral",
              "Rebaje lateral",
              <YesNo
                value={!!form.rebaje_lateral}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, rebaje_lateral: v }))
                }
                disabled={!canEditField("rebaje_lateral")}
              />,
            )}
            {renderBuiltInField(
              "rebaje_inferior",
              "Rebaje inferior",
              <YesNo
                value={!!form.rebaje_inferior}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, rebaje_inferior: v }))
                }
                disabled={!canEditField("rebaje_inferior")}
              />,
            )}
          </Row>
          <div className="spacer" />
          <Row>
            {renderBuiltInField(
              "trampa_tierra",
              "Trampa tierra",
              <YesNo
                value={!!form.trampa_tierra}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, trampa_tierra: v }))
                }
                disabled={!canEditField("trampa_tierra")}
              />,
            )}
            {renderBuiltInField(
              "trampa_tierra_altura",
              "Trampa tierra altura",
              <Input
                value={form.trampa_tierra_altura || ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, trampa_tierra_altura: v }))
                }
                disabled={!canEditField("trampa_tierra_altura")}
                style={{ width: "100%" }}
              />,
            )}
          </Row>
          {renderDynamicSectionFields("rebajes_suelo")}
        </Section>

        <Section title="Observaciones">
          <div className="muted" style={{ marginBottom: 6 }}>
            Observaciones
          </div>
          <textarea
            value={form.observaciones || ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, observaciones: e.target.value }))
            }
            disabled={!canEditField("observaciones")}
            style={{
              width: "100%",
              minHeight: 110,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              resize: "vertical",
            }}
          />
          {renderDynamicSectionFields("observaciones")}
          {renderDynamicSectionFields("otros")}
        </Section>

        {saveM.isError ? (
          <>
            <div className="spacer" />
            <div style={{ color: "#d93025", fontSize: 13 }}>
              {saveM.error?.message || "No se pudo guardar la medición"}
            </div>
          </>
        ) : null}

        {lastMessage ? (
          <>
            <div className="spacer" />
            <div className="muted">{lastMessage}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}
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

const DEFAULT_RETURN_REASON_ITEM_18 =
  "El cambio en el item 18 puede ocasionar costos adicionales y debe pasar al vendedor.";
const DEFAULT_RETURN_REASON_OBSERVATIONS =
  "El medidor dejó observaciones y debe revisarlo el vendedor antes de seguir.";

function text(v) {
  return String(v ?? "").trim();
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function splitName(endCustomer = {}) {
  const first = text(endCustomer.first_name);
  const last = text(endCustomer.last_name);
  if (first || last) return { first, last };
  const parts = text(endCustomer.name).split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}
function toNumberLike(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function averageTriple(values = []) {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => toNumberLike(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return "";
  return String(Math.round(nums.reduce((acc, n) => acc + n, 0) / nums.length));
}
function extractBudgetDimensionMm(quote, key) {
  const dims = quote?.payload?.dimensions || {};
  const raw = key === "ancho" ? dims?.width : dims?.height;
  const n = toNumberLike(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 1000));
}
function normalizeTriple(values = [], suggested = "") {
  const arr = Array.isArray(values) ? values.slice(0, 3).map((v) => text(v)) : [];
  while (arr.length < 3) arr.push("");
  if (!arr.some(Boolean) && suggested) arr[1] = suggested;
  return arr;
}
function cloneContainer(value) {
  return Array.isArray(value) ? value.slice() : { ...(value || {}) };
}
function isNumericSegment(value) {
  return /^\d+$/.test(String(value || ""));
}
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
function compareRule(currentRaw, operator, compareRaw) {
  const currentText = String(currentRaw ?? "").trim().toLowerCase();
  const expectedText = String(compareRaw ?? "").trim().toLowerCase();
  const currentNum = Number(String(currentRaw ?? "").replace(",", "."));
  const expectedNum = Number(String(compareRaw ?? "").replace(",", "."));
  switch (String(operator || "=").trim()) {
    case "=":
      return currentText === expectedText;
    case "!=":
      return currentText !== expectedText;
    case ">":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum > expectedNum;
    case ">=":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum >= expectedNum;
    case "<":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum < expectedNum;
    case "<=":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum <= expectedNum;
    case "contains":
      return currentText.includes(expectedText);
    default:
      return currentText === expectedText;
  }
}
function evaluateDynamicRules({ form, quote, user, rules }) {
  const dims = quote?.payload?.dimensions || {};
  const budgetWidth = Number(String(dims?.width ?? "").replace(",", "."));
  const budgetHeight = Number(String(dims?.height ?? "").replace(",", "."));
  const context = {
    ...form,
    surface_m2:
      Number.isFinite(budgetWidth) && Number.isFinite(budgetHeight)
        ? budgetWidth * budgetHeight
        : 0,
    budget_width_m: Number.isFinite(budgetWidth) ? budgetWidth : 0,
    budget_height_m: Number.isFinite(budgetHeight) ? budgetHeight : 0,
    payment_method: quote?.payload?.payment_method || "",
    porton_type: quote?.payload?.porton_type || "",
    current_user: {
      is_medidor: !!user?.is_medidor,
      is_rev_tecnica: !!user?.is_rev_tecnica,
      is_enc_comercial: !!user?.is_enc_comercial,
    },
  };
  const hidden = new Set();
  const forcedValues = {};
  const allowedOptions = {};
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule?.active || !rule?.source_key) continue;
    const current = getByPath(context, rule.source_key);
    if (!compareRule(current, rule.operator, rule.compare_value)) continue;
    if (rule.action_type === "set_value" && rule.target_field) forcedValues[rule.target_field] = rule.target_value;
    if (rule.action_type === "show_field" && rule.target_field) hidden.delete(rule.target_field);
    if (rule.action_type === "hide_field" && rule.target_field) hidden.add(rule.target_field);
    if (rule.action_type === "allow_options" && rule.target_field) {
      const options = Array.isArray(rule.target_options)
        ? rule.target_options
        : parseOptions(rule.target_value || "").map((item) => item.value);
      allowedOptions[rule.target_field] = options;
    }
  }
  return { hidden, forcedValues, allowedOptions };
}
function buildInitialForm(quote, current = {}) {
  const end = quote?.end_customer || {};
  const split = splitName(end);
  const suggestedAlto = extractBudgetDimensionMm(quote, "alto");
  const suggestedAncho = extractBudgetDimensionMm(quote, "ancho");
  const esquemaAlto = normalizeTriple(current?.esquema?.alto || [], suggestedAlto);
  const esquemaAncho = normalizeTriple(current?.esquema?.ancho || [], suggestedAncho);
  return {
    ...current,
    fecha: text(current.fecha) || todayISO(),
    fecha_nota_pedido:
      text(current.fecha_nota_pedido) ||
      (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : ""),
    nota_venta:
      text(current.nota_venta) ||
      text(quote?.final_sale_order_name || quote?.odoo_sale_order_name || quote?.quote_number),
    cliente_nombre: text(current.cliente_nombre) || split.first,
    cliente_apellido: text(current.cliente_apellido) || split.last,
    distribuidor:
      text(current.distribuidor) ||
      text(
        quote?.created_by_full_name ||
          quote?.created_by_username ||
          (quote?.created_by_role === "vendedor" ? "De Grandis Portones" : ""),
      ),
    esquema: {
      alto: esquemaAlto,
      ancho: esquemaAncho,
    },
    alto_final_mm: text(current.alto_final_mm) || averageTriple(esquemaAlto) || suggestedAlto,
    ancho_final_mm: text(current.ancho_final_mm) || averageTriple(esquemaAncho) || suggestedAncho,
    observaciones_medicion: text(current.observaciones_medicion),
  };
}
function updateSchemeValue(form, axis, index, value) {
  const next = {
    ...(form.esquema || {}),
    alto: normalizeTriple(form.esquema?.alto || []),
    ancho: normalizeTriple(form.esquema?.ancho || []),
  };
  next[axis][index] = value;
  return { ...form, esquema: next };
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
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
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
function buildMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) return reject(new Error("Geolocalización no disponible"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  });
}
function normalizeNameKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function buildBudgetSectionsContext(quote, catalog) {
  const sections = Array.isArray(catalog?.sections) ? catalog.sections.slice() : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const lineByProductId = new Map(lines.map((line) => [Number(line?.product_id), line]));
  const byId = {};
  const byName = {};
  for (const section of sections) {
    const item = { id: Number(section?.id), name: String(section?.name || ""), selected_products: [] };
    byId[item.id] = item;
    byName[normalizeNameKey(item.name)] = item;
  }
  for (const product of products) {
    const line = lineByProductId.get(Number(product?.id));
    if (!line) continue;
    const sectionIds = Array.isArray(product?.section_ids) ? product.section_ids : [];
    for (const sectionIdRaw of sectionIds) {
      const sectionId = Number(sectionIdRaw);
      if (!byId[sectionId]) byId[sectionId] = { id: sectionId, name: "", selected_products: [] };
      const displayName = String(
        line?.name || product?.display_name || product?.alias || product?.name || "",
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
    quote: {
      quote_number: quote?.quote_number || "",
      created_by_full_name: quote?.created_by_full_name || "",
      created_by_username: quote?.created_by_username || "",
      odoo_sale_order_name: quote?.odoo_sale_order_name || "",
      final_sale_order_name: quote?.final_sale_order_name || "",
      confirmed_at: quote?.confirmed_at || "",
    },
    current_user: {
      is_medidor: !!user?.is_medidor,
      is_rev_tecnica: !!user?.is_rev_tecnica,
      is_enc_comercial: !!user?.is_enc_comercial,
    },
    budget_sections: buildBudgetSectionsContext(quote, catalog),
  };
}
function chooseAllowedSections(budgetSectionsById = {}) {
  const present39 = !!budgetSectionsById[39];
  const present40 = !!budgetSectionsById[40];
  const out = new Set([18, 23]);
  if (present39) out.add(39);
  else if (present40) out.add(40);
  return out;
}
function buildBudgetSummaryItems(budgetContext, form) {
  const sectionsById = budgetContext?.budget_sections?.by_id || {};
  return Object.values(sectionsById)
    .filter((section) => Array.isArray(section?.selected_products) && section.selected_products.length)
    .map((section) => {
      const original = section.selected_products
        .map((product) => product.display_name || product.alias || product.raw_name || "")
        .filter(Boolean)
        .join(", ");
      const override = text(form?.__budget_section_override?.[section.id]?.value);
      return {
        key: `section-${section.id}`,
        sectionId: Number(section.id),
        sectionName: section.name || `Sección ${section.id}`,
        value: override || original,
      };
    })
    .sort((a, b) => Number(a.sectionId || 0) - Number(b.sectionId || 0));
}
function productDisplayLabel(product) {
  const alias = String(product?.alias || "").trim();
  const display = String(product?.display_name || product?.name || "").trim();
  const code = String(product?.code || "").trim();
  return `${alias || display}${code ? ` · ${code}` : ""}`.trim();
}
function MeasurementSchemeVisual({ form }) {
  const altos = normalizeTriple(form?.esquema?.alto || []);
  const anchos = normalizeTriple(form?.esquema?.ancho || []);
  const cellStyle = {
    width: 64,
    minHeight: 28,
    borderRadius: 8,
    border: "1px solid #d8d8d8",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 12,
    padding: "4px 8px",
  };
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 14,
        background: "#ffffff",
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 12 }}>
        {anchos.map((value, idx) => (
          <div key={`va-${idx}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div className="muted" style={{ fontSize: 11 }}>{`Ancho ${idx + 1}`}</div>
            <div style={cellStyle}>{value || "—"}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, justifyContent: "center" }}>
          {altos.map((value, idx) => (
            <div key={`vh-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="muted" style={{ width: 54, fontSize: 11 }}>{`Alto ${idx + 1}`}</div>
              <div style={cellStyle}>{value || "—"}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            width: 230,
            minHeight: 180,
            borderRadius: 18,
            border: "3px solid #64748b",
            background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#475569",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          Esquema del portón
          <div style={{ position: "absolute", left: 12, top: 12, width: 10, height: 10, borderRadius: 999, background: "#94a3b8" }} />
          <div style={{ position: "absolute", right: 12, top: 12, width: 10, height: 10, borderRadius: 999, background: "#94a3b8" }} />
          <div style={{ position: "absolute", left: 12, bottom: 12, width: 10, height: 10, borderRadius: 999, background: "#94a3b8" }} />
          <div style={{ position: "absolute", right: 12, bottom: 12, width: 10, height: 10, borderRadius: 999, background: "#94a3b8" }} />
        </div>
      </div>
    </div>
  );
}
function computeTechnicalSummary({ quote, form }) {
  const kgM2 = toNumberLike(quote?.payload?.dimensions?.kg_m2) || 0;
  const altoFinal = toNumberLike(form?.alto_final_mm) || toNumberLike(averageTriple(form?.esquema?.alto || [])) || 0;
  const anchoFinal = toNumberLike(form?.ancho_final_mm) || toNumberLike(averageTriple(form?.esquema?.ancho || [])) || 0;
  const areaM2 = altoFinal > 0 && anchoFinal > 0 ? (altoFinal * anchoFinal) / 1000000 : 0;
  const pesoAprox = kgM2 > 0 && areaM2 > 0 ? Math.round(areaM2 * kgM2) : 0;
  const tipoPiernas =
    text(quote?.payload?.dimensions?.tipo_piernas) ||
    text(quote?.payload?.tipo_piernas) ||
    text(form?.tipo_piernas) ||
    (anchoFinal > 4500 ? "Piernas dobles" : "Piernas simples");
  return {
    altoFinal: altoFinal ? String(Math.round(altoFinal)) : "",
    anchoFinal: anchoFinal ? String(Math.round(anchoFinal)) : "",
    areaM2: areaM2 ? areaM2.toFixed(2) : "",
    pesoAprox: pesoAprox ? String(pesoAprox) : "",
    tipoPiernas,
  };
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
  const [form, setForm] = useState(null);
  const [lastMessage, setLastMessage] = useState("");

  useEffect(() => {
    if (!quote) return;
    setForm(buildInitialForm(quote, quote.measurement_form || {}));
  }, [quote]);

  const configuredFieldDefinitions = useMemo(
    () => (Array.isArray(dynamicFieldsQ.data?.fields) ? dynamicFieldsQ.data.fields : []),
    [dynamicFieldsQ.data],
  );
  const allFields = useMemo(
    () => mergeMeasurementFields(configuredFieldDefinitions).filter((field) => field?.active !== false),
    [configuredFieldDefinitions],
  );
  const budgetContext = useMemo(
    () => buildBudgetContext(quote, catalogQ.data, user),
    [quote, catalogQ.data, user],
  );
  const allowedSectionIds = useMemo(
    () => chooseAllowedSections(budgetContext?.budget_sections?.by_id || {}),
    [budgetContext],
  );
  const dynamicUi = useMemo(() => {
    if (!form || !quote) return { hidden: new Set(), forcedValues: {}, allowedOptions: {} };
    return evaluateDynamicRules({ form, quote, user, rules: dynamicRulesQ.data?.rules || [] });
  }, [form, quote, user, dynamicRulesQ.data]);
  const budgetSummaryItems = useMemo(
    () => buildBudgetSummaryItems(budgetContext, form),
    [budgetContext, form],
  );

  const editableConfiguredFields = useMemo(() => {
    return allFields.filter((field) => {
      const sectionId = Number(field?.budget_section_id || 0);
      if (!allowedSectionIds.has(sectionId)) return false;
      if (dynamicUi.hidden.has(String(field?.key || "").trim())) return false;
      const bindingType = String(
        field?.odoo_binding_type ||
          (String(field?.type || "") === "odoo_product" ? "selected_measurement_product" : "none"),
      )
        .trim()
        .toLowerCase();
      return String(field?.type || "") === "odoo_product" || bindingType === "selected_measurement_product";
    });
  }, [allFields, dynamicUi.hidden, allowedSectionIds]);

  const fallbackSections = useMemo(() => {
    const byId = budgetContext?.budget_sections?.by_id || {};
    const configuredIds = new Set(editableConfiguredFields.map((field) => Number(field?.budget_section_id || 0)));
    return Object.values(byId)
      .filter((section) => allowedSectionIds.has(Number(section?.id || 0)))
      .filter((section) => Array.isArray(section?.selected_products) && section.selected_products.length > 0)
      .filter((section) => !configuredIds.has(Number(section?.id || 0)))
      .map((section) => ({
        id: Number(section.id),
        name: String(section.name || `Sección ${section.id}`),
        currentProducts: section.selected_products,
        catalogProducts: (Array.isArray(catalogQ.data?.products) ? catalogQ.data.products : []).filter((product) =>
          Array.isArray(product?.section_ids)
            ? product.section_ids.some((sid) => Number(sid) === Number(section.id))
            : false,
        ),
      }));
  }, [budgetContext, editableConfiguredFields, catalogQ.data, allowedSectionIds]);

  useEffect(() => {
    if (!form) return;
    let next = form;
    let changed = false;

    for (const field of editableConfiguredFields) {
      const sectionId = Number(field?.budget_section_id || 0);
      const section = budgetContext?.budget_sections?.by_id?.[sectionId];
      const selectedProducts = Array.isArray(section?.selected_products) ? section.selected_products : [];
      const currentBinding = getByPath(next, `__budget_binding_products.${field.key}`);
      if (JSON.stringify(currentBinding || []) !== JSON.stringify(selectedProducts)) {
        next = setByPath(next, `__budget_binding_products.${field.key}`, selectedProducts);
        changed = true;
      }
      const currentSelected = getByPath(next, `__selected_binding_product.${field.key}`);
      if (!currentSelected?.product_id && selectedProducts[0]?.product_id) {
        next = setByPath(next, `__selected_binding_product.${field.key}`, selectedProducts[0]);
        next = setByPath(
          next,
          `__budget_section_override.${sectionId}.value`,
          selectedProducts[0]?.display_name || selectedProducts[0]?.alias || selectedProducts[0]?.raw_name || "",
        );
        changed = true;
      }
    }

    for (const section of fallbackSections) {
      const currentBinding = getByPath(next, `__fallback_budget_binding_products.${section.id}`);
      if (JSON.stringify(currentBinding || []) !== JSON.stringify(section.currentProducts || [])) {
        next = setByPath(next, `__fallback_budget_binding_products.${section.id}`, section.currentProducts || []);
        changed = true;
      }
      const currentSelected = getByPath(next, `__fallback_selected_section_products.${section.id}`);
      if (!currentSelected?.product_id && section.currentProducts[0]?.product_id) {
        next = setByPath(next, `__fallback_selected_section_products.${section.id}`, section.currentProducts[0]);
        next = setByPath(
          next,
          `__budget_section_override.${section.id}.value`,
          section.currentProducts[0]?.display_name ||
            section.currentProducts[0]?.alias ||
            section.currentProducts[0]?.raw_name ||
            "",
        );
        changed = true;
      }
    }

    if (changed) setForm(next);
  }, [form, editableConfiguredFields, fallbackSections, budgetContext]);

  const baselineForm = useMemo(
    () => quote?.measurement_original_form || buildInitialForm(quote, quote?.measurement_form || {}),
    [quote],
  );

  const item18Changed = useMemo(() => {
    if (!form) return false;
    const configured18 = editableConfiguredFields.filter(
      (field) => Number(field?.budget_section_id || 0) === 18,
    );
    for (const field of configured18) {
      const current = Number(getByPath(form, `__selected_binding_product.${field.key}.product_id`) || 0);
      const base = Number(
        getByPath(baselineForm, `__selected_binding_product.${field.key}.product_id`) ||
          getByPath(form, `__budget_binding_products.${field.key}.0.product_id`) ||
          0,
      );
      if (current && base && current !== base) return true;
    }
    const currentFallback = Number(getByPath(form, `__fallback_selected_section_products.18.product_id`) || 0);
    const baseFallback = Number(
      getByPath(baselineForm, `__fallback_selected_section_products.18.product_id`) ||
        getByPath(form, `__fallback_budget_binding_products.18.0.product_id`) ||
        0,
    );
    return !!(currentFallback && baseFallback && currentFallback !== baseFallback);
  }, [form, baselineForm, editableConfiguredFields]);

  const hasObservationsForSeller = !!text(form?.observaciones_medicion);
  const mustGoToSeller = item18Changed || hasObservationsForSeller;
  const technicalSummary = useMemo(() => computeTechnicalSummary({ quote, form }), [quote, form]);

  function handleTechnicalFinalDimensionChange(key, value) {
    if (!isTechnical) {
      setForm((prev) => ({ ...prev, [key]: value }));
      return;
    }
    const previous = text(form?.[key]);
    if (value === previous) {
      setForm((prev) => ({ ...prev, [key]: value }));
      return;
    }
    const confirmed = window.confirm("¿Desea modificar el dato de alto y ancho finales?");
    if (!confirmed) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const saveMedicionM = useMutation({
    mutationFn: async ({ submit }) => {
      let nextEndCustomer = { ...(quote?.end_customer || {}) };
      let returnToSeller = false;
      let returnReason = "";
      if (submit && isMedidor) {
        try {
          const pos = await getCurrentPositionAsync();
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            nextEndCustomer.maps_url = buildMapsUrl(lat, lng);
          }
        } catch {
          // sin ubicación, no bloquea el guardado
        }
        if (item18Changed) {
          returnToSeller = true;
          returnReason = DEFAULT_RETURN_REASON_ITEM_18;
        } else if (hasObservationsForSeller) {
          returnToSeller = true;
          returnReason = `${DEFAULT_RETURN_REASON_OBSERVATIONS}\n\nObservación del medidor: ${text(
            form?.observaciones_medicion,
          )}`;
        }
      }
      return saveMeasurementDetailed(quoteId, {
        form,
        submit,
        returnToSeller,
        returnReason,
        endCustomer: nextEndCustomer,
        baselineForm,
      });
    },
    onSuccess: (response, variables) => {
      if (variables?.submit === true) {
        const sentToSeller = response?.returned_to_seller === true || response?.moved_to_seller === true;
        window.alert(
          sentToSeller
            ? "La medición fue enviada al vendedor correctamente."
            : "La medición fue enviada al técnico correctamente.",
        );
        navigate("/menu", { replace: true });
        return;
      }
      setLastMessage("Guardado.");
      q.refetch();
    },
  });

  const approveTechnicalM = useMutation({
    mutationFn: async () => {
      await saveMeasurementDetailed(quoteId, {
        form,
        submit: false,
        returnToSeller: false,
        returnReason: "",
        endCustomer: quote?.end_customer || {},
        baselineForm,
      });
      return reviewMeasurement(quoteId, { action: "approve", notes: null });
    },
    onSuccess: () => {
      window.alert("La revisión técnica final fue aprobada correctamente.");
      navigate("/menu", { replace: true });
    },
  });

  const rejectTechnicalM = useMutation({
    mutationFn: (notes) => reviewMeasurement(quoteId, { action: "return_to_seller", notes }),
    onSuccess: () => {
      window.alert("La revisión técnica final fue enviada al vendedor correctamente.");
      navigate("/menu", { replace: true });
    },
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
    (typeof location.state?.from === "string" && location.state.from.trim()) || "/mediciones";
  const editableCount = editableConfiguredFields.length + fallbackSections.length;
  const submitButtonLabel = isTechnical
    ? "Aprobar revisión final"
    : mustGoToSeller
      ? "Enviar al vendedor"
      : "Enviar al técnico";
  const pageTitle = isTechnical ? "Revisión técnica final" : "Medición";

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
            <h2 style={{ margin: 0 }}>{pageTitle}</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Cliente: <b>{quote?.end_customer?.name || "—"}</b> · Estado: <b>{quote?.measurement_status || "pending"}</b>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={() => navigate(returnPath)}>
              Volver
            </Button>
            {!isTechnical ? (
              <Button
                variant="secondary"
                disabled={saveMedicionM.isPending}
                onClick={() => saveMedicionM.mutate({ submit: false })}
              >
                {saveMedicionM.isPending ? "Guardando..." : "Guardar"}
              </Button>
            ) : null}
            {isTechnical ? (
              <>
                <Button disabled={approveTechnicalM.isPending} onClick={() => approveTechnicalM.mutate()}>
                  {approveTechnicalM.isPending ? "Aprobando..." : submitButtonLabel}
                </Button>
                <Button
                  variant="ghost"
                  disabled={rejectTechnicalM.isPending}
                  onClick={() => {
                    const notes = window.prompt("Motivo de devolución al vendedor:", "") || "";
                    if (!notes) return;
                    rejectTechnicalM.mutate(notes);
                  }}
                >
                  {rejectTechnicalM.isPending ? "Enviando..." : "Rechazar y enviar al vendedor"}
                </Button>
              </>
            ) : (
              <Button disabled={saveMedicionM.isPending} onClick={() => saveMedicionM.mutate({ submit: true })}>
                {saveMedicionM.isPending ? "Procesando..." : submitButtonLabel}
              </Button>
            )}
          </div>
        </div>

        <div className="spacer" />
        <Section title="Datos del cliente">
          <Row>
            <Field label="Cliente">
              <div>{quote?.end_customer?.name || "—"}</div>
            </Field>
            <Field label="Teléfono">
              <div>{quote?.end_customer?.phone || "—"}</div>
            </Field>
            <Field label="Dirección">
              <div>{quote?.end_customer?.address || "—"}</div>
            </Field>
          </Row>
          <div className="spacer" />
          <Row>
            <Field label="Localidad">
              <div>{quote?.end_customer?.city || "—"}</div>
            </Field>
            <Field label="Maps">
              <div>{quote?.end_customer?.maps_url || "—"}</div>
            </Field>
            <Field label="Vendedor / Distribuidor">
              <div>{form.distribuidor || quote?.created_by_full_name || quote?.created_by_username || "—"}</div>
            </Field>
          </Row>
        </Section>

        <Section title="Resumen del presupuesto">
          <Row>
            <Field label="Nota de venta">
              <div>{form.nota_venta || quote?.odoo_sale_order_name || quote?.quote_number || "—"}</div>
            </Field>
            <Field label="Cliente">
              <div>{quote?.end_customer?.name || "—"}</div>
            </Field>
            <Field label="Vendedor / Distribuidor">
              <div>{form.distribuidor || quote?.created_by_full_name || quote?.created_by_username || "—"}</div>
            </Field>
          </Row>
          <div className="spacer" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {budgetSummaryItems.map((item) => (
              <div key={item.key} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <b>{item.sectionName} · ID {item.sectionId}:</b> {item.value || "—"}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Esquema de medidas">
          <MeasurementSchemeVisual form={form} />
          <Row>
            <Field label="Alto final (mm)">
              <Input
                value={form.alto_final_mm || ""}
                onChange={(v) => handleTechnicalFinalDimensionChange("alto_final_mm", v)}
                style={{ width: "100%" }}
              />
            </Field>
            <Field label="Ancho final (mm)">
              <Input
                value={form.ancho_final_mm || ""}
                onChange={(v) => handleTechnicalFinalDimensionChange("ancho_final_mm", v)}
                style={{ width: "100%" }}
              />
            </Field>
          </Row>
          <div className="spacer" />
          <Row>
            {[0, 1, 2].map((idx) => (
              <Field key={`alto-${idx}`} label={`Alto ${idx + 1} (mm)`}>
                <Input
                  value={form.esquema?.alto?.[idx] || ""}
                  onChange={(v) => setForm((prev) => updateSchemeValue(prev, "alto", idx, v))}
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
                  onChange={(v) => setForm((prev) => updateSchemeValue(prev, "ancho", idx, v))}
                  style={{ width: "100%" }}
                />
              </Field>
            ))}
          </Row>
        </Section>

        <Section title="Datos técnicos finales">
          <Row>
            <Field label="Alto final calculado (mm)">
              <div>{technicalSummary.altoFinal || "—"}</div>
            </Field>
            <Field label="Ancho final calculado (mm)">
              <div>{technicalSummary.anchoFinal || "—"}</div>
            </Field>
            <Field label="Peso aproximado (kg)">
              <div>{technicalSummary.pesoAprox || "—"}</div>
            </Field>
            <Field label="Tipo de piernas">
              <div>{technicalSummary.tipoPiernas || "—"}</div>
            </Field>
          </Row>
        </Section>

        <Section title="Productos que puede cambiar el medidor">
          {editableCount ? null : (
            <div className="muted">
              No hay campos configurados de tipo producto para las secciones permitidas.
            </div>
          )}

          {editableConfiguredFields.map((field) => {
            const sectionId = Number(field?.budget_section_id || 0);
            const sectionName = text(field?.budget_section_name) || `Sección ${sectionId}`;
            const sectionCatalogProducts = (Array.isArray(catalogQ.data?.products)
              ? catalogQ.data.products
              : []
            ).filter((product) =>
              Array.isArray(product?.section_ids)
                ? product.section_ids.some((sid) => Number(sid) === sectionId)
                : false,
            );
            const selectedProductId = String(
              getByPath(form, `__selected_binding_product.${field.key}.product_id`) || "",
            );
            return (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <Field label={`${sectionName} · ID ${sectionId}`}>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      const product = sectionCatalogProducts.find(
                        (item) => String(item.id) === String(e.target.value),
                      );
                      setForm((prev) => {
                        let next = prev;
                        if (!product) return next;
                        next = setByPath(
                          next,
                          field.key,
                          text(product.alias || product.display_name || product.name),
                        );
                        next = setByPath(next, `__selected_binding_product.${field.key}`, {
                          product_id: Number(product.id),
                          display_name: text(product.display_name || product.alias || product.name),
                          alias: text(product.alias),
                          raw_name: text(product.name),
                          code: text(product.code),
                          qty: 1,
                        });
                        next = setByPath(
                          next,
                          `__budget_section_override.${sectionId}.value`,
                          text(product.display_name || product.alias || product.name),
                        );
                        return next;
                      });
                    }}
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    <option value="">Seleccione producto…</option>
                    {sectionCatalogProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {productDisplayLabel(product)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            );
          })}

          {fallbackSections.map((section) => {
            const selectedProductId = String(
              getByPath(form, `__fallback_selected_section_products.${section.id}.product_id`) || "",
            );
            return (
              <div key={`fallback-${section.id}`} style={{ marginBottom: 12 }}>
                <Field label={`${section.name} · ID ${section.id}`}>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      const product = section.catalogProducts.find(
                        (item) => String(item.id) === String(e.target.value),
                      );
                      setForm((prev) => {
                        let next = prev;
                        if (!product) return next;
                        next = setByPath(next, `__fallback_selected_section_products.${section.id}`, {
                          product_id: Number(product.id),
                          display_name: text(product.display_name || product.alias || product.name),
                          alias: text(product.alias),
                          raw_name: text(product.name),
                          code: text(product.code),
                          qty: 1,
                        });
                        next = setByPath(
                          next,
                          `fallback_section_${section.id}`,
                          text(product.alias || product.display_name || product.name),
                        );
                        next = setByPath(
                          next,
                          `__budget_section_override.${section.id}.value`,
                          text(product.display_name || product.alias || product.name),
                        );
                        return next;
                      });
                    }}
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    <option value="">Seleccione producto…</option>
                    {section.catalogProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {productDisplayLabel(product)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            );
          })}

          {item18Changed ? (
            <div
              style={{
                marginTop: 14,
                border: "2px solid #b91c1c",
                background: "#fee2e2",
                color: "#7f1d1d",
                borderRadius: 12,
                padding: 14,
                fontWeight: 800,
                boxShadow: "0 0 0 2px rgba(185,28,28,0.08) inset",
              }}
            >
              Atención: cambiaste un producto de la sección 18. Este cambio puede ocasionar costos adicionales y debe enviarse al vendedor.
            </div>
          ) : null}
        </Section>

        <Section title="Observaciones del medidor">
          <textarea
            value={form.observaciones_medicion || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, observaciones_medicion: e.target.value }))}
            rows={4}
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid #d7d7d7",
              padding: 12,
              resize: "vertical",
              fontFamily: "inherit",
            }}
            placeholder="Escribí una observación para el vendedor si necesitás devolver el portón por un motivo adicional."
          />
          {hasObservationsForSeller ? (
            <div
              style={{
                marginTop: 12,
                border: "2px solid #b91c1c",
                background: "#fee2e2",
                color: "#7f1d1d",
                borderRadius: 12,
                padding: 14,
                fontWeight: 800,
              }}
            >
              Hay observaciones cargadas. Al enviar, este portón se derivará al vendedor para revisión.
            </div>
          ) : null}
        </Section>

        {(saveMedicionM.isError || approveTechnicalM.isError || rejectTechnicalM.isError) ? (
          <>
            <div className="spacer" />
            <div style={{ color: "#d93025", fontSize: 13 }}>
              {saveMedicionM.error?.message || approveTechnicalM.error?.message || rejectTechnicalM.error?.message || "No se pudo completar la acción"}
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

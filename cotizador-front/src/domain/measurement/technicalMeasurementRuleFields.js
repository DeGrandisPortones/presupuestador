export const BUILTIN_MEASUREMENT_FIELDS = [
  { key: "pasador_manual", label: "Pasador manual", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }] },
  { key: "anclaje", label: "Anclaje", type: "enum", options: [{ value: "no", label: "no" }, { value: "lateral", label: "lateral" }, { value: "superior", label: "superior" }] },
  { key: "rebaje_altura", label: "Altura de rebaje", type: "enum", options: [{ value: "75mm", label: "75mm" }, { value: "100mm", label: "100mm" }, { value: "125mm", label: "125mm" }] },
  { key: "trampa_tierra_altura", label: "Altura trampa de tierra", type: "enum", options: [{ value: "2 cm", label: "2 cm" }, { value: "5 cm", label: "5 cm" }] },
  { key: "surface_m2", label: "Superficie m2", type: "number", options: [] },
  { key: "budget_width_m", label: "Ancho presupuesto (m)", type: "number", options: [] },
  { key: "budget_height_m", label: "Alto presupuesto (m)", type: "number", options: [] },
];

export const TECHNICAL_MEASUREMENT_FIELD_OPTIONS = BUILTIN_MEASUREMENT_FIELDS.map((field) => ({
  key: field.key,
  label: field.label,
}));

export const TECHNICAL_RULE_OPERATORS = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
  { value: "contains", label: "contiene" },
];

export const TECHNICAL_RULE_ACTIONS = [
  { value: "set_value", label: "Completar valor" },
  { value: "show_field", label: "Mostrar campo" },
  { value: "hide_field", label: "Ocultar campo" },
  { value: "allow_options", label: "Restringir opciones" },
];

export const VALUE_SOURCE_TYPE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "fixed", label: "Valor fijo" },
  { value: "budget_field", label: "Dato del presupuesto" },
  { value: "budget_section_product", label: "Producto presupuestado por sección" },
];

export const EDITABLE_BY_OPTIONS = [
  { value: "both", label: "Medidor y técnica" },
  { value: "medidor", label: "Solo medidor" },
  { value: "tecnico", label: "Solo técnica" },
  { value: "none", label: "Ninguno (solo lectura)" },
];

export const ODOO_BINDING_TYPE_OPTIONS = [
  { value: "none", label: "No pegar en Odoo" },
  { value: "product", label: "Agregar producto a Odoo" },
];

export const BUDGET_PRODUCT_VALUE_OPTIONS = [
  { value: "display_name", label: "Texto visible del presupuesto" },
  { value: "alias", label: "Alias del producto" },
  { value: "raw_name", label: "Nombre original" },
  { value: "code", label: "Código" },
  { value: "product_id", label: "ID producto" },
];

export const BUDGET_MULTIPLE_MODE_OPTIONS = [
  { value: "first", label: "Tomar el primero" },
  { value: "join", label: "Unir todos" },
];

export const BUDGET_FIELD_OPTIONS = [
  { value: "payload.payment_method", label: "Presupuesto · Forma de pago" },
  { value: "payload.porton_type", label: "Presupuesto · Tipo/sistema" },
  { value: "payload.dimensions.width", label: "Presupuesto · Ancho" },
  { value: "payload.dimensions.height", label: "Presupuesto · Alto" },
  { value: "payload.dimensions.area_m2", label: "Presupuesto · Superficie" },
  { value: "end_customer.name", label: "Cliente · Nombre completo" },
  { value: "end_customer.first_name", label: "Cliente · Nombre" },
  { value: "end_customer.last_name", label: "Cliente · Apellido" },
  { value: "end_customer.phone", label: "Cliente · Teléfono" },
  { value: "end_customer.email", label: "Cliente · Email" },
  { value: "end_customer.address", label: "Cliente · Dirección" },
  { value: "end_customer.city", label: "Cliente · Localidad" },
  { value: "measurement_prefill.accionamiento", label: "Prefill · Accionamiento" },
  { value: "measurement_prefill.levadizo", label: "Prefill · Levadizo" },
  { value: "measurement_prefill.revestimiento", label: "Prefill · Revestimiento" },
  { value: "measurement_prefill.color_sistema", label: "Prefill · Color sistema" },
  { value: "measurement_prefill.color_revestimiento", label: "Prefill · Color revestimiento" },
  { value: "measurement_prefill.alto_mm", label: "Prefill · Alto (mm)" },
  { value: "measurement_prefill.ancho_mm", label: "Prefill · Ancho (mm)" },
  { value: "quote.fulfillment_mode", label: "Cotización · Destino" },
  { value: "quote.note", label: "Cotización · Observaciones" },
  { value: "quote.created_by_role", label: "Cotización · Rol creador" },
  { value: "quote.quote_number", label: "Cotización · Número" },
];

function normalizeValueSourceType(value) {
  const v = String(value || "manual").trim().toLowerCase();
  return ["manual", "fixed", "budget_field", "budget_section_product"].includes(v) ? v : "manual";
}
function normalizeEditableBy(value) {
  const v = String(value || "both").trim().toLowerCase();
  return ["both", "medidor", "tecnico", "none"].includes(v) ? v : "both";
}
function normalizeOdooBindingType(value) {
  const v = String(value || "none").trim().toLowerCase();
  return ["none", "product"].includes(v) ? v : "none";
}
function normalizeBudgetProductValueKey(value) {
  const v = String(value || "display_name").trim();
  return ["display_name", "alias", "raw_name", "code", "product_id"].includes(v) ? v : "display_name";
}
function normalizeBudgetMultipleMode(value) {
  const v = String(value || "first").trim().toLowerCase();
  return ["first", "join"].includes(v) ? v : "first";
}

export function parseOptions(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((item) =>
        typeof item === "object"
          ? { value: String(item.value || "").trim(), label: String(item.label || item.value || "").trim() }
          : { value: String(item || "").trim(), label: String(item || "").trim() }
      )
      .filter((x) => x.value);
  }
  return String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => ({ value: x, label: x }));
}

export function mergeMeasurementFields(customFields = []) {
  const byKey = new Map(BUILTIN_MEASUREMENT_FIELDS.map((field) => [field.key, {
    ...field,
    value_source_type: "manual",
    value_source_path: "",
    fixed_value: "",
    budget_section_id: null,
    budget_section_name: "",
    budget_product_value_key: "display_name",
    budget_multiple_mode: "first",
    editable_by: "both",
    odoo_binding_type: "none",
    odoo_product_id: null,
    odoo_product_label: "",
    dynamic: false,
  }]));

  for (const field of Array.isArray(customFields) ? customFields : []) {
    const key = String(field?.key || "").trim();
    if (!key) continue;
    byKey.set(key, {
      key,
      label: String(field?.label || key).trim(),
      type: String(field?.type || "text").trim().toLowerCase(),
      options: parseOptions(field?.options),
      active: field?.active !== false,
      required: field?.required === true,
      section: String(field?.section || "otros").trim().toLowerCase(),
      sort_order: Number(field?.sort_order || 9999) || 9999,
      value_source_type: normalizeValueSourceType(field?.value_source_type),
      value_source_path: String(field?.value_source_path || "").trim(),
      fixed_value: field?.fixed_value ?? "",
      budget_section_id: Number(field?.budget_section_id || 0) || null,
      budget_section_name: String(field?.budget_section_name || "").trim(),
      budget_product_value_key: normalizeBudgetProductValueKey(field?.budget_product_value_key),
      budget_multiple_mode: normalizeBudgetMultipleMode(field?.budget_multiple_mode),
      editable_by: normalizeEditableBy(field?.editable_by),
      odoo_binding_type: normalizeOdooBindingType(field?.odoo_binding_type),
      odoo_product_id: Number(field?.odoo_product_id || 0) || null,
      odoo_product_label: String(field?.odoo_product_label || "").trim(),
      dynamic: true,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.label || a.key).localeCompare(String(b.label || b.key), "es")
  );
}

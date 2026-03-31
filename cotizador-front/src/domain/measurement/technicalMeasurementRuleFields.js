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

export const TECHNICAL_MEASUREMENT_SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "budget_path", label: "Tomar del presupuestador" },
  { value: "fixed_value", label: "Valor fijo" },
];

export const TECHNICAL_MEASUREMENT_EDITABLE_OPTIONS = [
  { value: "both", label: "Medidor y Técnica" },
  { value: "medidor", label: "Solo medidor" },
  { value: "tecnico", label: "Solo técnica" },
  { value: "none", label: "Ninguno" },
];

export const TECHNICAL_MEASUREMENT_ODOO_BINDING_OPTIONS = [
  { value: "none", label: "No pegar a Odoo" },
  { value: "line_product", label: "Agregar producto en Odoo" },
];

export const TECHNICAL_MEASUREMENT_BUDGET_PATH_GROUPS = [
  {
    label: "Payload del presupuestador",
    options: [
      { value: "payload.payment_method", label: "Forma de pago" },
      { value: "payload.porton_type", label: "Tipo de portón" },
      { value: "payload.dimensions.width", label: "Ancho presupuestado" },
      { value: "payload.dimensions.height", label: "Alto presupuestado" },
    ],
  },
  {
    label: "Cliente final",
    options: [
      { value: "end_customer.name", label: "Nombre completo" },
      { value: "end_customer.first_name", label: "Nombre" },
      { value: "end_customer.last_name", label: "Apellido" },
      { value: "end_customer.phone", label: "Teléfono" },
      { value: "end_customer.email", label: "Email" },
      { value: "end_customer.address", label: "Dirección" },
      { value: "end_customer.city", label: "Ciudad" },
      { value: "end_customer.maps_url", label: "Google Maps" },
    ],
  },
  {
    label: "Prefill técnico calculado",
    options: [
      { value: "measurement_prefill.accionamiento", label: "Accionamiento sugerido" },
      { value: "measurement_prefill.levadizo", label: "Tipo levadizo sugerido" },
      { value: "measurement_prefill.revestimiento", label: "Revestimiento sugerido" },
      { value: "measurement_prefill.color_sistema", label: "Color sistema sugerido" },
      { value: "measurement_prefill.color_revestimiento", label: "Color revestimiento sugerido" },
      { value: "measurement_prefill.alto_mm", label: "Alto sugerido (mm)" },
      { value: "measurement_prefill.ancho_mm", label: "Ancho sugerido (mm)" },
    ],
  },
  {
    label: "Datos de la cotización",
    options: [
      { value: "quote_number", label: "Número de presupuesto" },
      { value: "odoo_sale_order_name", label: "NV / nombre Odoo" },
      { value: "final_sale_order_name", label: "NV final Odoo" },
      { value: "created_by_full_name", label: "Usuario creador (nombre)" },
      { value: "created_by_username", label: "Usuario creador" },
    ],
  },
  {
    label: "Formulario actual",
    options: [
      { value: "form.alto_final_mm", label: "Alto final cargado" },
      { value: "form.ancho_final_mm", label: "Ancho final cargado" },
      { value: "form.observaciones", label: "Observaciones" },
    ],
  },
];

export const TECHNICAL_MEASUREMENT_BUDGET_PATH_OPTIONS = TECHNICAL_MEASUREMENT_BUDGET_PATH_GROUPS.flatMap((group) => group.options);

function normalizeValueSourceType(value) {
  const v = String(value || "manual").trim().toLowerCase();
  return ["manual", "budget_path", "fixed_value"].includes(v) ? v : "manual";
}
function normalizeEditableBy(value) {
  const v = String(value || "both").trim().toLowerCase();
  return ["both", "medidor", "tecnico", "none"].includes(v) ? v : "both";
}
function normalizeOdooBindingType(value) {
  const v = String(value || "none").trim().toLowerCase();
  return ["none", "line_product"].includes(v) ? v : "none";
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
  const byKey = new Map(BUILTIN_MEASUREMENT_FIELDS.map((f) => [f.key, { ...f }]));
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
      section: String(field?.section || "otros").trim().toLowerCase() || "otros",
      sort_order: Number(field?.sort_order || 9999) || 9999,
      value_source_type: normalizeValueSourceType(field?.value_source_type),
      value_source_path: String(field?.value_source_path || "").trim(),
      default_value: field?.default_value ?? "",
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

const FIELD_RUNTIME_DEFAULTS = {
  active: true,
  required: false,
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
  system: false,
  context_only: false,
  can_delete: true,
};

export const CONTEXT_ONLY_MEASUREMENT_FIELDS = [
  {
    key: "surface_m2",
    label: "Superficie m2",
    type: "number",
    options: [],
    sort_order: 9001,
    context_only: true,
    can_delete: false,
  },
  {
    key: "budget_width_m",
    label: "Ancho presupuesto (m)",
    type: "number",
    options: [],
    sort_order: 9002,
    context_only: true,
    can_delete: false,
  },
  {
    key: "budget_height_m",
    label: "Alto presupuesto (m)",
    type: "number",
    options: [],
    sort_order: 9003,
    context_only: true,
    can_delete: false,
  },
];

export const SYSTEM_MEASUREMENT_FIELDS = [
  {
    key: "nota_venta",
    label: "Nota de Venta / NV",
    type: "text",
    section: "datos_generales",
    editable_by: "tecnico",
    sort_order: 10,
  },
  {
    key: "fecha_nota_pedido",
    label: "Fecha de Nota de Pedido",
    type: "text",
    section: "datos_generales",
    editable_by: "tecnico",
    sort_order: 20,
  },
  {
    key: "fecha",
    label: "Fecha de medición",
    type: "text",
    section: "datos_generales",
    editable_by: "both",
    sort_order: 30,
  },
  {
    key: "distribuidor",
    label: "Distribuidor",
    type: "text",
    section: "datos_generales",
    editable_by: "tecnico",
    sort_order: 40,
  },
  {
    key: "cliente_nombre",
    label: "Nombre del cliente",
    type: "text",
    section: "datos_generales",
    editable_by: "tecnico",
    sort_order: 50,
  },
  {
    key: "cliente_apellido",
    label: "Apellido del cliente",
    type: "text",
    section: "datos_generales",
    editable_by: "tecnico",
    sort_order: 60,
  },
  {
    key: "alto_final_mm",
    label: "Alto final (mm)",
    type: "number",
    section: "datos_generales",
    editable_by: "tecnico",
    sort_order: 70,
  },
  {
    key: "ancho_final_mm",
    label: "Ancho final (mm)",
    type: "number",
    section: "datos_generales",
    editable_by: "tecnico",
    sort_order: 80,
  },

  {
    key: "tipo_revestimiento_comercial",
    label: "Tipo revestimiento",
    type: "enum",
    section: "revestimiento",
    editable_by: "both",
    sort_order: 110,
    options: ["PVC", "Madera", "Aluminio", "chapa", "otros"],
  },
  {
    key: "fabricante_revestimiento",
    label: "Fabricante revestimiento",
    type: "text",
    section: "revestimiento",
    editable_by: "both",
    sort_order: 120,
  },
  {
    key: "lucera",
    label: "Lucera",
    type: "boolean",
    section: "revestimiento",
    editable_by: "both",
    sort_order: 130,
    options: ["si", "no"],
  },
  {
    key: "lucera_cantidad",
    label: "Cant. de luceras",
    type: "number",
    section: "revestimiento",
    editable_by: "both",
    sort_order: 140,
  },
  {
    key: "lucera_posicion",
    label: "Posición de lucera",
    type: "text",
    section: "revestimiento",
    editable_by: "both",
    sort_order: 150,
  },
  {
    key: "color_revestimiento",
    label: "Color revestimiento",
    type: "text",
    section: "revestimiento",
    editable_by: "both",
    sort_order: 160,
  },
  {
    key: "color_sistema",
    label: "Color sistema",
    type: "text",
    section: "revestimiento",
    editable_by: "both",
    sort_order: 170,
  },
  {
    key: "listones",
    label: "Listones",
    type: "text",
    section: "revestimiento",
    editable_by: "both",
    sort_order: 180,
  },

  {
    key: "puerta",
    label: "Puerta",
    type: "boolean",
    section: "puerta_estructura",
    editable_by: "both",
    sort_order: 210,
    options: ["si", "no"],
  },
  {
    key: "posicion_puerta",
    label: "Posición de la puerta",
    type: "text",
    section: "puerta_estructura",
    editable_by: "both",
    sort_order: 220,
  },
  {
    key: "parantes.cant",
    label: "Parantes cantidad",
    type: "number",
    section: "puerta_estructura",
    editable_by: "both",
    sort_order: 230,
  },
  {
    key: "parantes.distribucion",
    label: "Parantes distribución",
    type: "text",
    section: "puerta_estructura",
    editable_by: "both",
    sort_order: 240,
  },
  {
    key: "pasador_manual",
    label: "Pasador manual",
    type: "boolean",
    section: "puerta_estructura",
    editable_by: "both",
    sort_order: 250,
    options: ["si", "no"],
  },
  {
    key: "instalacion",
    label: "Instalación",
    type: "boolean",
    section: "puerta_estructura",
    editable_by: "both",
    sort_order: 260,
    options: ["si", "no"],
  },
  {
    key: "anclaje",
    label: "Anclaje",
    type: "enum",
    section: "puerta_estructura",
    editable_by: "both",
    sort_order: 270,
    options: ["no", "lateral", "superior"],
  },
  {
    key: "piernas",
    label: "Piernas",
    type: "text",
    section: "puerta_estructura",
    editable_by: "both",
    sort_order: 280,
  },

  {
    key: "rebaje",
    label: "Rebaje",
    type: "boolean",
    section: "rebajes_suelo",
    editable_by: "both",
    sort_order: 310,
    options: ["si", "no"],
  },
  {
    key: "rebaje_altura",
    label: "Altura de rebaje",
    type: "enum",
    section: "rebajes_suelo",
    editable_by: "both",
    sort_order: 320,
    options: ["75mm", "100mm", "125mm"],
  },
  {
    key: "rebaje_lateral",
    label: "Rebaje lateral",
    type: "boolean",
    section: "rebajes_suelo",
    editable_by: "both",
    sort_order: 330,
    options: ["si", "no"],
  },
  {
    key: "rebaje_inferior",
    label: "Rebaje inferior",
    type: "boolean",
    section: "rebajes_suelo",
    editable_by: "both",
    sort_order: 340,
    options: ["si", "no"],
  },
  {
    key: "trampa_tierra",
    label: "Trampa de tierra",
    type: "boolean",
    section: "rebajes_suelo",
    editable_by: "both",
    sort_order: 350,
    options: ["si", "no"],
  },
  {
    key: "trampa_tierra_altura",
    label: "Altura trampa de tierra",
    type: "enum",
    section: "rebajes_suelo",
    editable_by: "both",
    sort_order: 360,
    options: ["2 cm", "5 cm"],
  },

  {
    key: "observaciones",
    label: "Observaciones",
    type: "text",
    section: "observaciones",
    editable_by: "both",
    sort_order: 410,
  },
];

export const BUILTIN_MEASUREMENT_FIELDS = [
  ...SYSTEM_MEASUREMENT_FIELDS,
  ...CONTEXT_ONLY_MEASUREMENT_FIELDS,
];

export const TECHNICAL_MEASUREMENT_FIELD_OPTIONS =
  BUILTIN_MEASUREMENT_FIELDS.map((field) => ({
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
  {
    value: "budget_section_product",
    label: "Producto presupuestado por sección",
  },
];

export const EDITABLE_BY_OPTIONS = [
  { value: "both", label: "Medidor y técnica" },
  { value: "medidor", label: "Solo medidor" },
  { value: "tecnico", label: "Solo técnica" },
  { value: "none", label: "Ninguno (solo lectura)" },
];

export const ODOO_BINDING_TYPE_OPTIONS = [
  { value: "none", label: "No pegar en Odoo" },
  {
    value: "repeat_budget_product",
    label: "Agregar producto a Odoo · repetir producto presupuestado",
  },
  {
    value: "custom_product",
    label: "Agregar producto a Odoo · elegir otro producto",
  },
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
  {
    value: "measurement_prefill.accionamiento",
    label: "Prefill · Accionamiento",
  },
  { value: "measurement_prefill.levadizo", label: "Prefill · Levadizo" },
  {
    value: "measurement_prefill.revestimiento",
    label: "Prefill · Revestimiento",
  },
  {
    value: "measurement_prefill.color_sistema",
    label: "Prefill · Color sistema",
  },
  {
    value: "measurement_prefill.color_revestimiento",
    label: "Prefill · Color revestimiento",
  },
  { value: "measurement_prefill.alto_mm", label: "Prefill · Alto (mm)" },
  { value: "measurement_prefill.ancho_mm", label: "Prefill · Ancho (mm)" },
  { value: "quote.fulfillment_mode", label: "Cotización · Destino" },
  { value: "quote.note", label: "Cotización · Observaciones" },
  { value: "quote.created_by_role", label: "Cotización · Rol creador" },
  { value: "quote.quote_number", label: "Cotización · Número" },
];

function normalizeValueSourceType(value) {
  const v = String(value || "manual")
    .trim()
    .toLowerCase();
  return ["manual", "fixed", "budget_field", "budget_section_product"].includes(
    v,
  )
    ? v
    : "manual";
}
function normalizeEditableBy(value) {
  const v = String(value || "both")
    .trim()
    .toLowerCase();
  return ["both", "medidor", "tecnico", "none"].includes(v) ? v : "both";
}
function normalizeOdooBindingType(value) {
  const v = String(value || "none")
    .trim()
    .toLowerCase();
  if (v === "product") return "custom_product";
  return ["none", "repeat_budget_product", "custom_product"].includes(v)
    ? v
    : "none";
}
function normalizeBudgetProductValueKey(value) {
  const v = String(value || "display_name").trim();
  return ["display_name", "alias", "raw_name", "code", "product_id"].includes(v)
    ? v
    : "display_name";
}
function normalizeBudgetMultipleMode(value) {
  const v = String(value || "first")
    .trim()
    .toLowerCase();
  return ["first", "join"].includes(v) ? v : "first";
}

export function parseOptions(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((item) =>
        typeof item === "object"
          ? {
              value: String(item.value || "").trim(),
              label: String(item.label || item.value || "").trim(),
            }
          : {
              value: String(item || "").trim(),
              label: String(item || "").trim(),
            },
      )
      .filter((x) => x.value);
  }
  return String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => ({ value: x, label: x }));
}

function normalizeBaseField(field = {}) {
  return {
    ...FIELD_RUNTIME_DEFAULTS,
    key: String(field?.key || "").trim(),
    label: String(field?.label || field?.key || "").trim(),
    type: String(field?.type || "text")
      .trim()
      .toLowerCase(),
    options: parseOptions(field?.options),
    active: field?.active !== false,
    required: field?.required === true,
    section: String(field?.section || "otros")
      .trim()
      .toLowerCase(),
    sort_order: Number(field?.sort_order || 9999) || 9999,
    value_source_type: normalizeValueSourceType(field?.value_source_type),
    value_source_path: String(field?.value_source_path || "").trim(),
    fixed_value: field?.fixed_value ?? "",
    budget_section_id: Number(field?.budget_section_id || 0) || null,
    budget_section_name: String(field?.budget_section_name || "").trim(),
    budget_product_value_key: normalizeBudgetProductValueKey(
      field?.budget_product_value_key,
    ),
    budget_multiple_mode: normalizeBudgetMultipleMode(
      field?.budget_multiple_mode,
    ),
    editable_by: normalizeEditableBy(field?.editable_by),
    odoo_binding_type: normalizeOdooBindingType(field?.odoo_binding_type),
    odoo_product_id: Number(field?.odoo_product_id || 0) || null,
    odoo_product_label: String(field?.odoo_product_label || "").trim(),
    dynamic: field?.dynamic === true,
    system: field?.system === true,
    context_only: field?.context_only === true,
    can_delete: field?.can_delete !== false,
  };
}

export function mergeMeasurementFields(customFields = []) {
  const byKey = new Map();
  for (const builtin of BUILTIN_MEASUREMENT_FIELDS) {
    const normalized = normalizeBaseField(builtin);
    normalized.system = !normalized.context_only;
    normalized.context_only = builtin.context_only === true;
    normalized.dynamic = false;
    normalized.can_delete = false;
    byKey.set(normalized.key, normalized);
  }

  for (const field of Array.isArray(customFields) ? customFields : []) {
    const key = String(field?.key || "").trim();
    if (!key) continue;
    const base = byKey.get(key);
    const normalized = normalizeBaseField({ ...base, ...field, key });
    if (base) {
      normalized.system = base.system;
      normalized.context_only = base.context_only;
      normalized.dynamic = false;
      normalized.can_delete = base.can_delete;
    } else {
      normalized.dynamic = true;
      normalized.system = false;
      normalized.context_only = false;
      normalized.can_delete = true;
    }
    byKey.set(key, normalized);
  }

  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.label || a.key).localeCompare(String(b.label || b.key), "es"),
  );
}

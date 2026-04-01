export const BUILTIN_MEASUREMENT_FIELDS = [
  { key: "nota_venta", label: "Nota de Venta / NV", type: "text", options: [], system: true },
  { key: "fecha_nota_pedido", label: "Fecha de Nota de Pedido", type: "text", options: [], system: true },
  { key: "fecha", label: "Fecha de medición", type: "text", options: [], system: true },
  { key: "distribuidor", label: "Distribuidor", type: "text", options: [], system: true },
  { key: "cliente_nombre", label: "Nombre del cliente", type: "text", options: [], system: true },
  { key: "cliente_apellido", label: "Apellido del cliente", type: "text", options: [], system: true },
  { key: "alto_final_mm", label: "Alto final (mm)", type: "number", options: [], system: true },
  { key: "ancho_final_mm", label: "Ancho final (mm)", type: "number", options: [], system: true },

  { key: "tipo_revestimiento_comercial", label: "Tipo revestimiento", type: "enum", options: [
    { value: "PVC", label: "PVC" },
    { value: "Madera", label: "Madera" },
    { value: "Aluminio", label: "Aluminio" },
    { value: "chapa", label: "chapa" },
    { value: "otros", label: "otros" },
  ], system: true },
  { key: "fabricante_revestimiento", label: "Fabricante revestimiento", type: "text", options: [], system: true },
  { key: "color_revestimiento", label: "Color revestimiento", type: "text", options: [], system: true },
  { key: "color_sistema", label: "Color sistema", type: "text", options: [], system: true },
  { key: "listones", label: "Listones", type: "text", options: [], system: true },

  { key: "lucera", label: "Lucera", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }], system: true },
  { key: "lucera_cantidad", label: "Cant. de luceras", type: "enum", options: [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
  ], system: true },
  { key: "lucera_posicion", label: "Posición de lucera", type: "enum", options: [
    { value: "superior", label: "superior" },
    { value: "inferior", label: "inferior" },
    { value: "lateral", label: "lateral" },
    { value: "repartida", label: "repartida" },
  ], system: true },

  { key: "puerta", label: "Puerta", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }], system: true },
  { key: "posicion_puerta", label: "Posición de la puerta", type: "text", options: [], system: true },
  { key: "parantes.cant", label: "Parantes cantidad", type: "number", options: [], system: true },
  { key: "parantes.distribucion", label: "Parantes distribución", type: "text", options: [], system: true },
  { key: "pasador_manual", label: "Pasador manual", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }], system: true },
  { key: "instalacion", label: "Instalación", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }], system: true },
  { key: "anclaje", label: "Anclaje", type: "enum", options: [
    { value: "no", label: "no" },
    { value: "lateral", label: "lateral" },
    { value: "superior", label: "superior" },
  ], system: true },
  { key: "piernas", label: "Piernas", type: "text", options: [], system: true },

  { key: "rebaje", label: "Rebaje", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }], system: true },
  { key: "rebaje_altura", label: "Altura de rebaje", type: "enum", options: [
    { value: "75mm", label: "75mm" },
    { value: "100mm", label: "100mm" },
    { value: "125mm", label: "125mm" },
  ], system: true },
  { key: "rebaje_lateral", label: "Rebaje lateral", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }], system: true },
  { key: "rebaje_inferior", label: "Rebaje inferior", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }], system: true },

  { key: "trampa_tierra", label: "Trampa de tierra", type: "boolean", options: [{ value: "si", label: "si" }, { value: "no", label: "no" }], system: true },
  { key: "trampa_tierra_altura", label: "Altura trampa de tierra", type: "enum", options: [
    { value: "2 cm", label: "2 cm" },
    { value: "5 cm", label: "5 cm" },
  ], system: true },

  { key: "observaciones", label: "Observaciones", type: "text", options: [], system: true },

  { key: "surface_m2", label: "Superficie m2", type: "number", options: [], system: true },
  { key: "budget_width_m", label: "Ancho presupuesto (m)", type: "number", options: [], system: true },
  { key: "budget_height_m", label: "Alto presupuesto (m)", type: "number", options: [], system: true },
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
  { value: "clear_field", label: "Limpiar campo" },
  { value: "show_field", label: "Mostrar campo" },
  { value: "hide_field", label: "Ocultar campo" },
  { value: "allow_options", label: "Restringir opciones" },
];

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
    const base = byKey.get(key) || {};
    byKey.set(key, {
      ...base,
      key,
      label: String(field?.label || base.label || key).trim(),
      type: String(field?.type || base.type || "text").trim().toLowerCase(),
      options: parseOptions(field?.options || base.options),
      active: field?.active !== false,
      required: field?.required === true,
      section: String(field?.section || base.section || "otros").trim().toLowerCase(),
      sort_order: Number(field?.sort_order || base.sort_order || 9999) || 9999,
      dynamic: base.system !== true,
      system: base.system === true,
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.label || a.key).localeCompare(String(b.label || b.key), "es")
  );
}

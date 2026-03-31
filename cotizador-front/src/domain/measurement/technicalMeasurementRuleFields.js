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
      sort_order: Number(field?.sort_order || 9999) || 9999,
      dynamic: true,
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.label || a.key).localeCompare(String(b.label || b.key), "es")
  );
}

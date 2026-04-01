const FORM_SYSTEM_FIELDS = [
  { key: 'nota_venta', label: 'Nota de venta / NV', type: 'text', section: 'datos_generales', system: true },
  { key: 'fecha_nota_pedido', label: 'Fecha de nota de pedido', type: 'text', section: 'datos_generales', system: true },
  { key: 'fecha', label: 'Fecha de medición', type: 'text', section: 'datos_generales', system: true },
  { key: 'distribuidor', label: 'Distribuidor', type: 'text', section: 'datos_generales', system: true },
  { key: 'cliente_nombre', label: 'Nombre del cliente', type: 'text', section: 'datos_generales', system: true },
  { key: 'cliente_apellido', label: 'Apellido del cliente', type: 'text', section: 'datos_generales', system: true },
  { key: 'alto_final_mm', label: 'Alto final (mm)', type: 'number', section: 'datos_generales', system: true },
  { key: 'ancho_final_mm', label: 'Ancho final (mm)', type: 'number', section: 'datos_generales', system: true },
  { key: 'tipo_revestimiento_comercial', label: 'Tipo revestimiento', type: 'enum', section: 'revestimiento', system: true, options: ['PVC', 'Madera', 'Aluminio', 'chapa', 'otros'] },
  { key: 'fabricante_revestimiento', label: 'Fabricante revestimiento', type: 'text', section: 'revestimiento', system: true },
  { key: 'lucera', label: 'Lucera', type: 'boolean', section: 'revestimiento', system: true, options: ['si', 'no'] },
  { key: 'lucera_cantidad', label: 'Cant. de luceras', type: 'text', section: 'revestimiento', system: true },
  { key: 'lucera_posicion', label: 'Posición de lucera', type: 'text', section: 'revestimiento', system: true },
  { key: 'color_revestimiento', label: 'Color revestimiento', type: 'text', section: 'revestimiento', system: true },
  { key: 'color_sistema', label: 'Color sistema', type: 'text', section: 'revestimiento', system: true },
  { key: 'listones', label: 'Listones', type: 'text', section: 'revestimiento', system: true },
  { key: 'puerta', label: 'Puerta', type: 'boolean', section: 'puerta_estructura', system: true, options: ['si', 'no'] },
  { key: 'posicion_puerta', label: 'Posición de la puerta', type: 'text', section: 'puerta_estructura', system: true },
  { key: 'pasador_manual', label: 'Pasador manual', type: 'boolean', section: 'puerta_estructura', system: true, options: ['si', 'no'] },
  { key: 'instalacion', label: 'Instalación', type: 'boolean', section: 'puerta_estructura', system: true, options: ['si', 'no'] },
  { key: 'anclaje', label: 'Anclaje', type: 'enum', section: 'puerta_estructura', system: true, options: ['no', 'lateral', 'superior'] },
  { key: 'piernas', label: 'Piernas', type: 'text', section: 'puerta_estructura', system: true },
  { key: 'rebaje', label: 'Rebaje', type: 'boolean', section: 'rebajes_suelo', system: true, options: ['si', 'no'] },
  { key: 'rebaje_altura', label: 'Altura de rebaje', type: 'enum', section: 'rebajes_suelo', system: true, options: ['75mm', '100mm', '125mm'] },
  { key: 'rebaje_lateral', label: 'Rebaje lateral', type: 'boolean', section: 'rebajes_suelo', system: true, options: ['si', 'no'] },
  { key: 'rebaje_inferior', label: 'Rebaje inferior', type: 'boolean', section: 'rebajes_suelo', system: true, options: ['si', 'no'] },
  { key: 'trampa_tierra', label: 'Trampa de tierra', type: 'boolean', section: 'rebajes_suelo', system: true, options: ['si', 'no'] },
  { key: 'trampa_tierra_altura', label: 'Altura trampa de tierra', type: 'enum', section: 'rebajes_suelo', system: true, options: ['2 cm', '5 cm'] },
  { key: 'observaciones', label: 'Observaciones', type: 'text', section: 'observaciones', system: true },
];

const DERIVED_COMPARISON_FIELDS = [
  { key: 'surface_m2', label: 'Presupuesto / Superficie m2', type: 'number', source_only: true, sort_order: 8000 },
  { key: 'budget_width_m', label: 'Presupuesto / Ancho (m)', type: 'number', source_only: true, sort_order: 8001 },
  { key: 'budget_height_m', label: 'Presupuesto / Alto (m)', type: 'number', source_only: true, sort_order: 8002 },
  { key: 'payload.payment_method', label: 'Presupuesto / Forma de pago', type: 'text', source_only: true, sort_order: 8010 },
  { key: 'payload.porton_type', label: 'Presupuesto / Tipo o sistema', type: 'text', source_only: true, sort_order: 8011 },
  { key: 'payload.dimensions.width', label: 'Presupuesto / Dimensión ancho', type: 'number', source_only: true, sort_order: 8012 },
  { key: 'payload.dimensions.height', label: 'Presupuesto / Dimensión alto', type: 'number', source_only: true, sort_order: 8013 },
  { key: 'quote.id', label: 'Presupuesto / ID', type: 'text', source_only: true, sort_order: 8020 },
  { key: 'quote.quote_number', label: 'Presupuesto / Número', type: 'text', source_only: true, sort_order: 8021 },
  { key: 'quote.fulfillment_mode', label: 'Presupuesto / Destino', type: 'text', source_only: true, sort_order: 8022 },
  { key: 'quote.created_by_role', label: 'Presupuesto / Rol creador', type: 'text', source_only: true, sort_order: 8023 },
  { key: 'quote.created_by_full_name', label: 'Presupuesto / Nombre creador', type: 'text', source_only: true, sort_order: 8024 },
  { key: 'quote.created_by_username', label: 'Presupuesto / Usuario creador', type: 'text', source_only: true, sort_order: 8025 },
  { key: 'quote.odoo_sale_order_name', label: 'Presupuesto / NV Odoo', type: 'text', source_only: true, sort_order: 8026 },
  { key: 'quote.final_sale_order_name', label: 'Presupuesto / NV final', type: 'text', source_only: true, sort_order: 8027 },
  { key: 'quote.confirmed_at', label: 'Presupuesto / Fecha confirmación', type: 'text', source_only: true, sort_order: 8028 },
  { key: 'end_customer.name', label: 'Cliente / Nombre', type: 'text', source_only: true, sort_order: 8030 },
  { key: 'end_customer.city', label: 'Cliente / Localidad', type: 'text', source_only: true, sort_order: 8031 },
  { key: 'end_customer.address', label: 'Cliente / Dirección', type: 'text', source_only: true, sort_order: 8032 },
  { key: 'current_user.user_id', label: 'Usuario actual / ID', type: 'text', source_only: true, sort_order: 8040 },
  { key: 'current_user.username', label: 'Usuario actual / Usuario', type: 'text', source_only: true, sort_order: 8041 },
  { key: 'current_user.full_name', label: 'Usuario actual / Nombre completo', type: 'text', source_only: true, sort_order: 8042 },
  { key: 'current_user.is_vendedor', label: 'Usuario actual / Es vendedor', type: 'boolean', source_only: true, sort_order: 8043 },
  { key: 'current_user.is_distribuidor', label: 'Usuario actual / Es distribuidor', type: 'boolean', source_only: true, sort_order: 8044 },
  { key: 'current_user.is_superuser', label: 'Usuario actual / Es superusuario', type: 'boolean', source_only: true, sort_order: 8045 },
  { key: 'current_user.is_medidor', label: 'Usuario actual / Es medidor', type: 'boolean', source_only: true, sort_order: 8046 },
  { key: 'current_user.is_rev_tecnica', label: 'Usuario actual / Es rev. técnica', type: 'boolean', source_only: true, sort_order: 8047 },
  { key: 'current_user.is_enc_comercial', label: 'Usuario actual / Es enc. comercial', type: 'boolean', source_only: true, sort_order: 8048 },
  { key: 'current_user.default_maps_url', label: 'Usuario actual / Maps por defecto', type: 'text', source_only: true, sort_order: 8049 },
];

export const VALUE_SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'fixed_value', label: 'Valor fijo' },
  { value: 'quote_field', label: 'Dato del presupuesto' },
  { value: 'current_user_field', label: 'Dato del usuario logeado' },
  { value: 'budget_section_product', label: 'Producto presupuestado por sección' },
];

export const BUDGET_PRODUCT_COPY_OPTIONS = [
  { value: 'presence_si_no', label: 'Presencia en presupuesto (si/no)' },
  { value: 'display_name', label: 'Nombre visible del producto' },
  { value: 'alias', label: 'Alias del producto' },
  { value: 'raw_name', label: 'Nombre original del producto' },
  { value: 'code', label: 'Código del producto' },
  { value: 'product_id', label: 'ID del producto' },
];

export const USER_CONTEXT_SOURCE_OPTIONS = [
  { value: 'current_user.username', label: 'Usuario actual / Usuario' },
  { value: 'current_user.full_name', label: 'Usuario actual / Nombre completo' },
  { value: 'current_user.is_vendedor', label: 'Usuario actual / Es vendedor' },
  { value: 'current_user.is_distribuidor', label: 'Usuario actual / Es distribuidor' },
  { value: 'current_user.is_superuser', label: 'Usuario actual / Es superusuario' },
  { value: 'current_user.is_medidor', label: 'Usuario actual / Es medidor' },
  { value: 'current_user.is_rev_tecnica', label: 'Usuario actual / Es rev. técnica' },
  { value: 'current_user.is_enc_comercial', label: 'Usuario actual / Es enc. comercial' },
  { value: 'current_user.default_maps_url', label: 'Usuario actual / Maps por defecto' },
];

export const QUOTE_CONTEXT_SOURCE_OPTIONS = [
  { value: 'quote.quote_number', label: 'Presupuesto / Número' },
  { value: 'quote.fulfillment_mode', label: 'Presupuesto / Destino' },
  { value: 'quote.created_by_role', label: 'Presupuesto / Rol creador' },
  { value: 'quote.created_by_full_name', label: 'Presupuesto / Nombre creador' },
  { value: 'quote.created_by_username', label: 'Presupuesto / Usuario creador' },
  { value: 'quote.odoo_sale_order_name', label: 'Presupuesto / NV Odoo' },
  { value: 'quote.final_sale_order_name', label: 'Presupuesto / NV final' },
  { value: 'quote.confirmed_at', label: 'Presupuesto / Fecha confirmación' },
  { value: 'payload.payment_method', label: 'Presupuesto / Forma de pago' },
  { value: 'payload.porton_type', label: 'Presupuesto / Tipo o sistema' },
  { value: 'payload.dimensions.width', label: 'Presupuesto / Dimensión ancho' },
  { value: 'payload.dimensions.height', label: 'Presupuesto / Dimensión alto' },
  { value: 'end_customer.name', label: 'Cliente / Nombre' },
  { value: 'end_customer.city', label: 'Cliente / Localidad' },
  { value: 'end_customer.address', label: 'Cliente / Dirección' },
  { value: 'surface_m2', label: 'Presupuesto / Superficie m2' },
  { value: 'budget_width_m', label: 'Presupuesto / Ancho (m)' },
  { value: 'budget_height_m', label: 'Presupuesto / Alto (m)' },
];

export const BUILTIN_MEASUREMENT_FIELDS = [
  ...FORM_SYSTEM_FIELDS.map((field, index) => ({ ...field, options: parseOptions(field.options), sort_order: index + 1 })),
  ...DERIVED_COMPARISON_FIELDS,
];

export const TECHNICAL_MEASUREMENT_FIELD_OPTIONS = BUILTIN_MEASUREMENT_FIELDS.map((field) => ({
  key: field.key,
  label: field.label,
}));

export const TECHNICAL_RULE_OPERATORS = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: 'contains', label: 'contiene' },
];

export const TECHNICAL_RULE_ACTIONS = [
  { value: 'set_value', label: 'Completar valor' },
  { value: 'show_field', label: 'Mostrar campo' },
  { value: 'hide_field', label: 'Ocultar campo' },
  { value: 'allow_options', label: 'Restringir opciones' },
];

export function parseOptions(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((item) =>
        typeof item === 'object'
          ? { value: String(item.value || '').trim(), label: String(item.label || item.value || '').trim() }
          : { value: String(item || '').trim(), label: String(item || '').trim() }
      )
      .filter((x) => x.value);
  }
  return String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => ({ value: x, label: x }));
}

export function mergeMeasurementFields(customFields = []) {
  const byKey = new Map(BUILTIN_MEASUREMENT_FIELDS.map((field) => [field.key, { ...field }]));
  for (const field of Array.isArray(customFields) ? customFields : []) {
    const key = String(field?.key || '').trim();
    if (!key) continue;
    const base = byKey.get(key) || {};
    byKey.set(key, {
      ...base,
      key,
      label: String(field?.label || base.label || key).trim(),
      type: String(field?.type || base.type || 'text').trim().toLowerCase(),
      section: String(field?.section || base.section || 'otros').trim().toLowerCase(),
      options: parseOptions(field?.options ?? base.options),
      active: field?.active !== false,
      required: field?.required === true,
      sort_order: Number(field?.sort_order || base.sort_order || 9999) || 9999,
      dynamic: !base.system,
      system: base.system === true,
      source_only: base.source_only === true,
      value_source_type: String(field?.value_source_type || base.value_source_type || 'manual').trim(),
      value_source_path: String(field?.value_source_path || base.value_source_path || '').trim(),
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.label || a.key).localeCompare(String(b.label || b.key), 'es')
  );
}

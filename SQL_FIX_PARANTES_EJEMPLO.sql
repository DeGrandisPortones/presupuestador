-- Ejemplo opcional para corregir manualmente la configuración si querés probar sin usar la UI.
-- Cambiá los valores de texto según corresponda.

update public.presupuestador_settings
set value_json =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(value_json,
              '{catalog_rules,porton,surface_parameters,non_apto_parantes_horizontal_product_ids}',
              to_jsonb('3025'::text),
              true
            ),
            '{catalog_rules,porton,surface_calc_params,non_apto_parantes_horizontal_product_ids}',
            to_jsonb('3025'::text),
            true
          ),
          '{surface_parameters,non_apto_parantes_horizontal_product_ids}',
          to_jsonb('3025'::text),
          true
        ),
        '{surface_calc_params,non_apto_parantes_horizontal_product_ids}',
        to_jsonb('3025'::text),
        true
      ),
      '{catalog_rules,porton,parantes_config,non_apto_parantes_horizontal_product_ids}',
      to_jsonb('3025'::text),
      true
    ),
    '{parantes_config,non_apto_parantes_horizontal_product_ids}',
    to_jsonb('3025'::text),
    true
  ),
  updated_at = now()
where key = 'technical_measurement_rules';

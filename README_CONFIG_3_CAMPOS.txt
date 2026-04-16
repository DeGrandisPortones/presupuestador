Este bundle cambia la pantalla de medición para que los campos editables del medidor se vean como SELECTOR DE PRODUCTOS por sección.

Importante:
- Para que el producto elegido impacte automáticamente en el presupuesto final, el campo debe existir en el admin de medición como tipo `odoo_product`.
- Si la sección aparece sólo como fallback (sin field definition), se va a poder elegir otro producto en pantalla, pero el backend actual no lo toma automáticamente para la finalización.

Configuración correcta recomendada para los 3 campos editables:
- type = odoo_product
- editable_by = medidor
- budget_section_id = 18 / 23 / 39 / 45 según corresponda
- budget_section_name = nombre de la sección

El código actual ya convierte `odoo_product` a `selected_measurement_product`, que es el modo que usa la finalización para reemplazar el producto presupuestado por el elegido en medición.

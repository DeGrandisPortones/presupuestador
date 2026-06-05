# Listados: referencias Odoo NP/NV

Se agrega visibilidad de la referencia Odoo generada en los listados principales.

## Cambios

- En **Mis presupuestos** se agrega columna `NP/NV Odoo` para portones, Ipanel, Otros, Plegados y Puertas.
- En **Aprobación Comercial** se agrega columna `NP/NV Odoo` en:
  - Aprobaciones.
  - Mediciones.
  - Acopio -> Producción.
  - Portones en Acopio.
  - Portones enviados a Producción.
  - Puertas.
- En **Técnica** se agrega columna `NP/NV Odoo` en:
  - Aprobaciones Portones.
  - Circuito técnico.
  - Acopio -> Producción.
  - Portones en Acopio.
  - Portones enviados a Producción.
  - Puertas.

## Criterio de visualización

Para presupuestos se muestran, si existen:

- `production_sale_order_name`
- `final_sale_order_name`
- `final_copy_sale_order_name`
- `odoo_sale_order_name`

Para puertas se muestran, si existen:

- `odoo_sale_order_name`
- `odoo_purchase_order_name`

Si no hay referencia generada todavía, se muestra `—`.

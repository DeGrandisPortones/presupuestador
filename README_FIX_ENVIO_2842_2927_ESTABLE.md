# Fix Envío editable sin reset de dependencias

El video muestra que al confirmar cantidad se recalculaba el flujo de secciones.

Se estabiliza la edición de cantidades de los productos de envío de la última sección:
- 2842 Envío: cantidad editable, precio editable sólo distribuidor, proforma/Odoo distribuidor en $0.
- 2927 Envío bonificado: cantidad estable si ya viene editable, sin disparar refresco de precios ni resetear dependencias.

No se modifica el flujo de Odoo ni el cálculo general.

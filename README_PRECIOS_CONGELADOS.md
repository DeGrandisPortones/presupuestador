# Precios congelados de presupuesto

Cambios incluidos:

- Las pantallas de autorizacion comercial/tecnica y el envio a Odoo usan los precios guardados en el presupuesto.
- Al abrir un presupuesto ya guardado/confirmado, el front no vuelve a pisar precios con la lista actual de Odoo.
- La forma de pago tambien queda congelada como porcentaje en el payload:
  - quote_adjustment_percent_snapshot
  - financing_percent_snapshot
  - iva_rate_snapshot
  - pricing_snapshot_at
- El boton "Actualizar presupuesto" sigue siendo la unica accion que fuerza traer precios actuales de Odoo y volver a guardar snapshots.
- Si se agrega una linea nueva a un presupuesto existente y no tiene precio guardado, solo esa linea puede resolver precio; no pisa las lineas ya valorizadas.
- El backend usa los precios y porcentajes congelados del presupuesto para crear las ordenes en Odoo.

Nota:
- Este cambio evita que vuelva a pasar hacia adelante. Si algun presupuesto existente ya fue guardado con un precio actualizado por error, hay que restaurar ese precio puntual en la base o volver a guardarlo desde la version correcta.

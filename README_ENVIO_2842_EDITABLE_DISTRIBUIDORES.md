# Producto Envío 2842 editable

Cambios incluidos:

- Producto `Envío` / ID presupuestador `2842`:
  - cantidad editable con decimales para el usuario.
  - precio editable sólo para usuarios distribuidores.
- En presupuesto/PDF presupuesto se muestra con la cantidad y precio cargados.
- En proforma de distribuidores se mantiene la línea y la cantidad, pero con precio cero.
- En Odoo, para presupuestos creados por distribuidores, el producto 2842 se envía con precio cero.
- Si el distribuidor edita manualmente el precio de envío, no se pisa con refrescos automáticos de precio.

Archivos modificados/agregados:

- `cotizador-front/src/domain/quote/store.js`
- `cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx`
- `cotizador-front/src/pages/CotizadorPage/index.jsx`
- `cotizador-back/src/routes/pdf.routes.js`
- `cotizador-back/src/routes/quotes.routes.js`
- `cotizador-back/src/measurementFinalization.js`

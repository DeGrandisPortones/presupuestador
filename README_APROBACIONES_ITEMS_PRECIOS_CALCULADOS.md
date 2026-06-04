# Aprobaciones: ítems con precio calculado

Se ajustó `cotizador-front/src/pages/QuoteDetailPage/index.jsx` para que, en el detalle usado por Enc. Comercial y Técnica, la tabla de ítems muestre:

- Precio calculado por ítem, no precio base crudo.
- Total del ítem calculado con ese precio.

El cálculo usa la misma lógica del presupuestador:

- Precio base.
- Coeficiente/margen aplicado.
- Recargo/descuento de forma de pago.
- Condición 2 sin descuento del 10,5% por producto.

El IVA queda discriminado en el bloque de Datos comerciales, igual que en la pantalla/PDF del presupuesto.

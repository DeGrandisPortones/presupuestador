# Visualización de montos en aprobaciones

Cambio aplicado:

- En el detalle de presupuesto que ve Comercial/Técnica, la tarjeta de Datos comerciales ahora muestra:
  - Fecha del presupuesto
  - Forma de pago
  - Condición
  - Destino
  - Coeficiente aplicado
  - Neto
  - IVA aplicado (21,0% si Condición 1 / 10,5% si Condición 2)
  - Monto IVA
  - Total del presupuesto

La fórmula usa el mismo cálculo del presupuestador (`calcTotals`) y toma el recargo/descuento de la forma de pago con `getFinancingPreview`, para que sea fiel a lo que ve el vendedor y al PDF enviado al cliente.

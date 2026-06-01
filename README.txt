ZIP directo para copiar y reemplazar.

Descomprimir el contenido en la raíz del repo presupuestador.
Sobrescribe estos archivos:
- cotizador-front/src/domain/quote/pricing.js
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/LinesTable.jsx

Cambio:
- Condición 2 aplica un descuento del 10,5% en el presupuesto.
- Se calcula igual que los recargos/descuentos de forma de pago: afecta precio final, subtotal, IVA, total y PDF de presupuesto/proforma.

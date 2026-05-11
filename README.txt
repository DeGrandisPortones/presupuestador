ZIP directo para copiar y pegar en la raiz del repo presupuestador.

Cambio aplicado:
- En instalacion dentro del vano, las medidas de paso descuentan el ancho de una sola pierna segun el tipo estimado.
- Ejemplo: superanchas descuenta legs_superanchas_add_width_mm, por defecto 380 mm.
- No se modifica el ancho calculado/final del porton.
- No se modifican peso, limites de peso, tipo de piernas, aprobaciones ni Odoo.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/QuoteDetailPage/index.jsx
- cotizador-back/src/pdfBudgetExtras.js

Uso:
Copiar estas carpetas sobre la raiz del repo y reemplazar los archivos existentes.

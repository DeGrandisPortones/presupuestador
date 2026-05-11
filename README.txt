Cambio listo para copiar y pegar

Ruta incluida:
- cotizador-front/src/pages/QuoteDetailPage/index.jsx

Qué agrega:
- En el detalle de presupuesto usado por Aprobación Comercial y Técnica, se muestra una tarjeta de solo lectura con datos técnicos/comerciales para aprobar.
- Incluye ancho, alto, tipología/sistema, kg/m² efectivo, superficie, medidas de paso, peso estimado, piernas estimadas, orientación/cantidad/distribución de parantes, observaciones de parantes, forma de pago, condición, destino, estado de medición y productos clave.
- No cambia endpoints, mutaciones, permisos, decisiones ni flujo de aprobación.

Validación realizada:
- npx tsc --jsx react-jsx --allowJs --checkJs false --noEmit --skipLibCheck --moduleResolution node --target ES2020 cotizador-front/src/pages/QuoteDetailPage/index.jsx

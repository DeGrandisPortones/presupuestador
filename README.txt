Reemplazo directo.

Archivos incluidos:
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/components/MeasurementReadOnlyView.jsx
- cotizador-back/src/routes/measurements.routes.js
- cotizador-back/src/measurementFinalization.js

Incluye:
- esquema visual de las 3 medidas de alto y 3 de ancho en medicion y vista de solo lectura
- flujo correcto medidor -> vendedor o tecnica
- tecnica ve resumen tecnico con alto/ancho finales, peso aproximado y tipo de piernas
- tecnica puede modificar alto/ancho finales con confirmacion previa
- aprobar tecnica dispara el endpoint correcto de aprobacion final
- si falla la generacion de la venta final en Odoo, la aprobacion ya no queda marcada como exitosa
- WhatsApp de aprobacion usando link de aceptacion del cliente

Nota de link de aceptacion:
- Si existe CLIENT_ACCEPTANCE_BASE_URL, el mensaje usa:
  <CLIENT_ACCEPTANCE_BASE_URL>/aceptacion-cliente/<measurement_share_token>
- Si no existe, usa el link publico actual de la planilla tecnica/PDF.

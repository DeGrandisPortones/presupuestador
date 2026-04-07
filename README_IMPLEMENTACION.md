Reemplazar estos archivos completos:

- cotizador-back/src/settingsDb.js
- cotizador-back/src/measurementFinalization.js
- cotizador-back/src/routes/measurements.routes.js
- cotizador-front/src/api/admin.js
- cotizador-front/src/api/measurements.js
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/pages/DashboardPage/index.jsx

Notas:
- Este paquete corrige el export faltante de settingsDb que rompía el deploy del back.
- Mantiene compatibilidad temporal con imports viejos de tolerancia por porcentaje.
- Agrega devolución al vendedor desde medición y desde revisión técnica.
- Agrega el modo de presupuesto devuelto con “Facturado previamente”, restablecer al original y confirmar para volver a Técnica.
- La tolerancia de cotización final sigue en m².

Reemplazo directo:
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/pages/ClientAcceptancePage/index.jsx
- cotizador-front/src/api/measurements.js
- cotizador-front/src/App.jsx
- cotizador-back/src/routes/clientAcceptance.routes.js
- cotizador-back/src/index.js

Incluye:
- cantidad de parantes (0 a 6) solo en revisión técnica final
- web pública de aceptación del cliente
- aceptación guardada en base de datos dentro de payload.measurement_client_acceptance
- uso del link /aceptacion-cliente/:token que ya envía WhatsApp en aprobación técnica final

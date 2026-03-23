Este zip trae archivos completos para reemplazar, no parches.

Reemplazá estos archivos en el repo presupuestador:

- cotizador-back/src/measurementFinalization.js
- cotizador-back/src/routes/quotes.routes.js
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx

Después reiniciá backend y frontend.

Qué corrige:
- Producción sin medición: un solo disparo a Odoo desde Datos Técnicos, con NVS + correlativo, sin UUID.
- Producción con medición: conserva anticipo / venta genérica antes de medición y segundo disparo final después.
- Acopio sin medición: conserva anticipo en acopio y final desde Datos Técnicos al pasar a producción.
- Acopio con medición: conserva anticipo en acopio y final desde medición aprobada al pasar a producción.
- UI: los casos sin medición se muestran como Detalle técnico / Datos técnicos.

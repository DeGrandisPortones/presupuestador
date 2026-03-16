Reemplazar estos archivos respetando la estructura de carpetas:

- cotizador-back/src/index.js
- cotizador-back/src/settingsDb.js
- cotizador-back/src/measurementFinalization.js
- cotizador-back/src/routes/admin.routes.js
- cotizador-back/src/routes/measurements.routes.js
- cotizador-front/src/api/admin.js
- cotizador-front/src/pages/DashboardPage/index.jsx
- cotizador-front/src/pages/MedicionDetailPage/index.jsx

Este paquete agrega:
- Dashboard/Admin: pestaña Medicion -> Productos
- Configuracion de reglas campo/valor -> producto
- Prefills sugeridos en gris en medicion (sin autoseleccionar)
- Al aprobar en tecnica, intenta generar/actualizar la copia final con items desde medicion
- Envio final a Odoo con referencia NV... y control de tolerancia

IMPORTANTE:
- Reiniciar backend y frontend luego de copiar.
- Si ya habia copias finales previas, el sistema reutiliza la mas reciente.

Parche de corrección para presupuestador

Archivos incluidos:
- cotizador-front/src/api/quotes.js
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-back/src/routes/doors.routes.js

Qué corrige:
1. Reemplaza el prompt A/P por un selector visual con botones Acopio / Producción.
2. Envía realmente fulfillment_mode al backend al confirmar.
3. Hace que “Pasar a Producción” desde Acopio solicite el cambio en vez de moverlo directo.
4. Mantiene visible el portón vinculado en la puerta aunque todavía no exista NV de Odoo.

Copiar estos archivos sobre el repo y reconstruir front/back según su flujo habitual.

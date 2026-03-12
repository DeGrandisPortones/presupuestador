Patch para flujo de puertas en Presupuestador

Cambios incluidos:
1. Producto puerta por defecto en Odoo cambiado a 3226.
2. En el cotizador, el botón "Puerta" ahora:
   - crea/abre puerta vinculada si hay líneas de portón;
   - crea puerta aislada con datos del cliente precargados si no hay líneas.
3. En el detalle del presupuesto, se agrega botón para crear/abrir la puerta vinculada.
4. El filtro de proveedores por tag "Puerta" se mantiene sin cambios.

Archivos:
- cotizador-back/src/routes/doors.routes.js
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/QuoteDetailPage/index.jsx

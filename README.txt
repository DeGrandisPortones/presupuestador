Parche corregido de puertas.

Este zip NO reemplaza cotizador-back/src/index.js.
La idea es no volver a tocar el bootstrap de Odoo ni romper /api/odoo/pricelists.

Archivos incluidos:
- cotizador-back/src/doorsSchema.js
- cotizador-back/src/routes/doors.routes.js
- cotizador-front/src/api/doors.js
- cotizador-front/src/App.jsx
- cotizador-front/src/pages/MenuPage/index.jsx
- cotizador-front/src/pages/PuertasPage/index.jsx
- cotizador-front/src/pages/PuertaChecklistPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/AprobacionComercialPage/index.jsx
- cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx
- cotizador-front/src/pages/QuoteDetailPage/index.jsx

Importante:
1) No pises tu index.js del backend.
2) Tu index.js actual ya debe tener montado /api/doors.
3) Si no lo tiene, solo agregá:
   import { buildDoorsRouter } from "./routes/doors.routes.js";
   app.use("/api/doors", buildDoorsRouter());

Producto de puerta en Odoo:
- Usa el item 3225 para venta y compra.

Proveedor:
- Busca proveedores por tag/categoría "Puerta".
- Si tu tag en Odoo tiene otro nombre exacto, seteá:
  ODOO_DOOR_SUPPLIER_TAG_NAME=<nombre exacto>

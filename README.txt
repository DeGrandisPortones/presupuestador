Patch: Puerta aislada o vinculada a portón

Incluye:
- Alta de puerta standalone desde Menú > Puertas
- Vinculación opcional a presupuesto de portón
- Lista de proveedores Odoo con tag/categoría "Puerta"
- Monto de venta y costo de compra de la puerta
- Flujo de aprobación Comercial/Técnica para puertas
- Al aprobarse ambas, crea en Odoo:
  * sale.order del cliente
  * purchase.order al proveedor
- Producto Odoo usado para venta y compra: 3225
- En el detalle del portón, muestra puertas vinculadas para logística

Archivos incluidos:
- cotizador-back/src/index.js
- cotizador-back/src/doorsSchema.js
- cotizador-back/src/routes/doors.routes.js
- cotizador-front/src/App.jsx
- cotizador-front/src/api/doors.js
- cotizador-front/src/pages/MenuPage/index.jsx
- cotizador-front/src/pages/AprobacionComercialPage/index.jsx
- cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx
- cotizador-front/src/pages/PuertaChecklistPage/index.jsx
- cotizador-front/src/pages/QuoteDetailPage/index.jsx

Copiar y reemplazar respetando la misma estructura de carpetas.

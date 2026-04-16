Cambios incluidos:
- Se agrega el ID de Odoo (template) al bootstrap de productos.
- En el catálogo se muestra:
  - ID Presupuestador
  - ID Odoo
- En la tabla de ítems también se muestran ambos IDs.
- Al agregar y guardar líneas, se conserva el ID Odoo para que no se pierda en el presupuesto.

Archivos:
- cotizador-back/src/odooBootstrap.js
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx

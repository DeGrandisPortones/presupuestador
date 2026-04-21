Reemplazo directo:
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/routes/pdf.routes.js

Fix:
- odoo_external_id viaja desde el front con el mismo valor que ID Odoo del producto.
- el PDF deja de consultar product.template y consulta product.product usando odoo_external_id / odoo_id.
- para el caso 3287, el back va a leer product.product(3287).name.

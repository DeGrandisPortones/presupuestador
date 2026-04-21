Reemplazo directo:
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/routes/pdf.routes.js

Fix real segun logs:
- el PDF ahora usa odoo_external_id / odoo_variant_id para consultar product.product.
- ya no usa odoo_id (template) para buscar el nombre.
- el front llena odoo_external_id con odoo_variant_id cuando existe.

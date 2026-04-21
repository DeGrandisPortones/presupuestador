Reemplazo directo:
- cotizador-back/src/routes/pdf.routes.js
- cotizador-front/src/domain/quote/store.js

Cambios:
- el PDF usa SOLO odoo_id / odoo_template_id para buscar el nombre en Odoo (product.template)
- ya no usa raw_name, alias ni nombre de variant para el PDF
- si no encuentra el nombre en Odoo, tira error y no genera PDF
- el front deja de mandar fallback a product_id como si fuera id de Odoo

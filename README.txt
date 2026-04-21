Reemplazo directo:
- cotizador-back/src/routes/pdf.routes.js
- cotizador-front/src/domain/quote/store.js

Fix:
- el PDF deja de resolver nombres live usando solo product_id del presupuestador
- ahora usa odoo_variant_id / odoo_template_id / odoo_id y fallback por modelo product.template
- el frontend guarda esos ids de Odoo dentro de cada linea para que el PDF pueda encontrar el nombre real

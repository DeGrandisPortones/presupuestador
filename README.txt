Reemplazo directo:
- cotizador-back/src/routes/pdf.routes.js

Fix:
- el PDF busca el nombre live de Odoo usando odoo_variant_id / odoo_id / odoo_template_id antes de product_id.
- evita que salga el alias corto interno (por ejemplo N) cuando el producto real en Odoo es Negro Semimate.

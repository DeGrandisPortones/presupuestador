Reemplazo directo:
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/routes/pdf.routes.js

Fix:
- se prioriza SIEMPRE odoo_variant_id sobre odoo_external_id / odoo_id.
- esto evita que quotes viejas sigan mandando ids template viejos como 3252/3287.
- el PDF consulta product.product con el id variant correcto.

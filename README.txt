Reemplazo directo:
- cotizador-back/src/routes/pdf.routes.js
- cotizador-front/src/domain/quote/store.js

Cambio pedido:
- el front manda odoo_external_id = ID Odoo del producto
- el PDF usa SOLO ese id para consultar product.product en Odoo
- si Odoo devuelve un nombre raro/corto como N, el PDF falla y muestra error en lugar de usarlo

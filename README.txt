Cambio minimo pedido

Objetivo:
- el front ya envia odoo_id / odoo_template_id
- el servidor usa ese id para consultar Odoo
- el PDF usa ese name

Este zip reemplaza solo:
- cotizador-back/src/routes/pdf.routes.js

Que hace:
- deja de resolver el nombre por odoo_variant_id
- consulta product.template usando odoo_id / odoo_template_id
- pone ese nombre directo en el PDF

Para tu caso:
- si la linea trae odoo_id: 3287
- el backend consulta product.template 3287
- el nombre del PDF sale de ahi

No usa raw_name ni name del payload para el nombre del PDF.

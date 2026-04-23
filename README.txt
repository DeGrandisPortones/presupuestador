Fix PDF 400 por líneas sin odoo_id / odoo_template_id

Qué pasaba:
- el PDF estaba exigiendo odoo_id / odoo_template_id en todas las líneas
- algunas quotes viejas o algunas líneas llegan solo con product_id / odoo_variant_id
- eso disparaba el error:
  Falta odoo_id / odoo_template_id en la línea ...

Qué cambia:
- primero intenta usar override de nombre PDF
- si no, intenta product.template por odoo_id / odoo_template_id
- si no, intenta product.product por odoo_variant_id / product_id
- si tampoco, usa name / raw_name del payload
- así deja de romper el PDF con 400

Archivo:
- cotizador-back/src/routes/pdf.routes.js

Presupuestador - logs PDF front/backend

Archivos incluidos para reemplazar directamente:
- cotizador-front/src/api/pdf.js
- cotizador-back/src/routes/pdf.routes.js

Qué agregan:
1) Front:
   - log del payload completo
   - resumen de líneas con product_id / odoo_variant_id / odoo_external_id
   - log de la respuesta del endpoint PDF

2) Backend:
   - log del request que entra a /presupuesto y /proforma
   - log de las líneas crudas del payload
   - log de los IDs product.product resueltos
   - log exacto de lo que se le pide a Odoo
   - log exacto de lo que devuelve Odoo
   - log por línea con payload_name vs live_odoo_name
   - log de las líneas finales renderizadas al PDF
   - log de bytes del PDF devuelto

Cómo usar:
- Reemplazá los archivos en el repo con los de este zip
- reiniciá front y back
- generá PDF vendedor y proforma
- mirá:
  * consola del navegador
  * logs del backend

Claves para revisar:
- [PDF API]
- [PDF ROUTE]
- [PDF BUILD]
- [PDF ODOO]

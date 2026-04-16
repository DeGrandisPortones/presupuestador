Fix incluido:
- El endpoint de precios ya trae el nombre actualizado desde Odoo.
- El front estaba actualizando solo el precio, no el nombre.
- El PDF además priorizaba raw_name antes que name.

Con este patch:
- al recalcular precios, también se sincroniza el nombre actual desde Odoo
- el PDF prioriza name antes que raw_name
- queda incorporado el hotfix de Vercel en store.js para no reintroducir el error de build

Archivos:
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/routes/pdf.routes.js

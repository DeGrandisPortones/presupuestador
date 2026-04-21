Reemplazo directo:
- cotizador-back/src/routes/odoo.routes.js
- cotizador-front/src/domain/quote/store.js

Fix real del problema de N en PDF:
- /api/odoo/prices ya no devuelve el nombre corto de product.product si existe nombre completo en product.template
- el front deja de pisar raw_name con nombres cortos/alias cuando recalcula precios

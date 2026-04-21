Reemplazo directo:
- cotizador-back/src/catalogBootstrap.js
- cotizador-back/src/odooBootstrap.js
- cotizador-front/src/domain/quote/store.js

Resultado:
- vendedor/distribuidor sigue viendo alias en pantalla
- raw_name y client_display_name quedan con nombre Odoo
- PDF/proforma y cliente toman nombre Odoo
- cache corto para reflejar cambios de nombre en Odoo mas rapido

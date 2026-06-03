ZIP copiar y reemplazar - Vendedor Odoo para no distribuidores

Incluye:
- cotizador-back/src/routes/quotes.routes.js

Cambio:
- El presupuestador sigue escribiendo el vendedor en Odoo para presupuestos de vendedor.
- Aplica en Portones, Ipanels, Puertas y Otros, tanto NP como NV/directas.
- Para distribuidores NO escribe el campo vendedor, porque el partner/cliente de Odoo ya es el distribuidor.
- Tampoco agrega la leyenda "Vendedor:" en la nota de Odoo cuando el creador es distribuidor.

Campo Odoo esperado:
- x_studio_vendedor preferentemente, tipo Texto/Char en sale.order.
- Si usas otro nombre tecnico, configurar en backend:
  ODOO_SALE_ORDER_VENDOR_FIELD=nombre_tecnico_del_campo

Despues de copiar:
- Reiniciar backend.

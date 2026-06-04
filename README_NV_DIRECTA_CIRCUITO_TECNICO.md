# Ajuste NV directa + circuito tecnico

Cambio incluido:

- Porton a produccion sin medicion / detalle tecnico:
  - Al aprobar Comercial + Tecnica genera la NV en Odoo inmediatamente.
  - Queda igualmente en el Circuito tecnico como `Detalle tecnico` pendiente.
  - Cuando Tecnica aprueba el circuito final, se dispara/envia el WhatsApp.
  - No crea una segunda NV en Odoo, porque la NV ya existe.

Se mantiene el flujo existente:

- Acopio o produccion con medicion:
  - Primera aprobacion Comercial + Tecnica genera NP.
  - Aprobacion final del circuito tecnico genera NV con detalle.

Archivos incluidos:

- cotizador-back/src/routes/quotes.routes.js
- cotizador-back/src/measurementFinalization.js

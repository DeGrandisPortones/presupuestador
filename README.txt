Archivos incluidos para reemplazo directo:

- cotizador-back/src/index.js
- cotizador-back/src/quotesSchema.js
- cotizador-back/src/measurementFinalization.js
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/pages/QuoteDetailPage/index.jsx

Este paquete corrige con seguridad:
- parent_quote_id como UUID para que no falle la copia final desde medicion
- montaje del router de mediciones con cliente Odoo
- referencia final tipo NVS1001 usando el nombre original de Odoo
- guardado de la copia final como synced_odoo
- acceso estable a Ver/editar final desde Produccion y desde el detalle del presupuesto

Despues de copiar, reiniciar backend y frontend.

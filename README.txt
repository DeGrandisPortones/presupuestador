Cambio Envio 2842

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-back/src/routes/quotes.routes.js

Comportamiento:
- El item Envio 2842 mantiene la cantidad editable.
- El precio ya no es editable para distribuidores.
- El precio se toma de la lista asignada.
- El Envio 2842 deja de tratarse como producto propio del distribuidor a $0 para Odoo/proforma desde el flujo de presupuesto.

Nota: si tambien tienen copia local de pdf.routes.js con la lista DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS incluyendo 2842, quitar 2842 ahi tambien para que el PDF de proforma backend no lo vuelva a poner en cero.

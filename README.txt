Fix Envio 2842 en proforma de distribuidores

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-back/src/routes/quotes.routes.js

Comportamiento:
- Envio 2842 sigue apareciendo en el presupuesto como item normal.
- Envio 2842 solo mantiene editable la cantidad.
- El precio del Envio 2842 no lo edita el usuario: queda el precio base tomado de la lista asignada.
- En PDF presupuesto aplica los calculos normales segun forma de pago, condicion, coeficiente, etc.
- En PDF proforma para distribuidores aparece con precio base de lista, no a $0.
- Para vendedores no cambia el comportamiento.

Nota tecnica:
- La proforma del distribuidor ahora envia el Envio 2842 como linea PDF regular para evitar la regla legacy del backend que ponia a $0 los productos propios del distribuidor.
- La persistencia y Odoo siguen usando el producto real 2842.

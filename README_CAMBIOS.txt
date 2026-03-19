Cambios incluidos:

1) cotizador-back/src/doorQuoteFormula.js
- Corrige el error de formula de puerta cuando hay caracteres invisibles, espacios no standard o signos unicode.
- Sigue aceptando: precio_ipanel, precio_compra_marco, precio_venta_marco.

2) cotizador-back/src/routes/pdf.routes.js
- En presupuesto / proforma deja solo Vendedor y Obs en la banda informativa.
- Ya no muestra Condicion ni Coeficiente.

3) cotizador-front/src/pages/PuertasPage/index.jsx
- La puerta se crea como bundle: Marco + Ipanel.
- Ya no arranca como marco aislado.
- Permite elegir si empezar por Marco o por Ipanel.

IMPORTANTE
- Reemplazar estos archivos en el repo tal cual.
- Hacer deploy nuevo.

Patch: quitar linea automatica de Sistema estandar / Sistema coplanar del presupuesto.

Archivos incluidos:
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx

Que cambia:
- Ya no agrega automaticamente los productos 3008 / 3009 por sistema derivado.
- El presupuesto queda solo con los items que el usuario selecciona.
- Se mantienen las lineas con cantidad por superficie.
- Al abrir presupuestos viejos, limpia del front las lineas legacy auto_system_item.
- Al guardar, tampoco vuelve a enviarlas.

Este paquete corrige el ingreso al Dashboard de "Otros" y la separación de catálogo.

Incluye:
- cotizador-back/src/catalogDb.js  -> acepta kind "otros"
- cotizador-back/src/catalogBootstrap.js -> evita mezclar productos no-Ipanel dentro de "Otros"
- cotizador-back/src/routes/quotes.routes.PARCHE.txt -> reemplazo puntual requerido en quotes.routes.js

Aplicación:
1. Reemplazá los 2 archivos .js por los incluidos en este zip.
2. Aplicá el reemplazo indicado en quotes.routes.PARCHE.txt dentro de cotizador-back/src/routes/quotes.routes.js
3. Reiniciá backend y frontend.

Nota:
La corrección de catalogBootstrap.js hace que "Otros" muestre solo productos cuyas etiquetas fueron configuradas para el catálogo "otros" en el Dashboard, en lugar de traer todos los no-Ipanel.

Presupuestador - refresh de raw_name + PDF

Qué corrige
-----------
1. El botón "Actualizar catálogo" ahora puede forzar el refresh para cualquier usuario autenticado.
2. Al refrescar, el catálogo vuelve a leer los nombres desde Odoo y actualiza las líneas ya seleccionadas del presupuesto:
   - raw_name
   - name
   - ids de Odoo
3. El PDF pasa a priorizar raw_name del payload (que ahora queda resyncado con el refresh), y si falta usa Odoo como fallback.
4. El bootstrap de Odoo prioriza display_name / nombre de template para traer nombres más actuales.

Archivos incluidos
------------------
- cotizador-back/src/odooBootstrap.js
- cotizador-back/src/routes/admin.routes.js
- cotizador-back/src/routes/pdf.routes.js
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx

Notas
-----
Tus logs muestran que raw_name llega viejo como "N" y que ese valor queda en las líneas del presupuesto fileciteturn28file0.
También muestran que incluso la lectura backend a Odoo devolvió "N" para ese producto en esa prueba fileciteturn28file0.
Por eso esta solución hace dos cosas a la vez:
- refresca el catálogo y sobreescribe raw_name en el quote abierto
- usa raw_name en el PDF como fuente principal, para que el refresh impacte directamente

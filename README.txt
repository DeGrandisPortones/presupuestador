Presupuestador - fix nombres Odoo en PDF + refresh manual

Qué corrige
-----------
1) El PDF ahora toma el nombre del product.template de Odoo cuando existe.
   Esto evita el caso donde product.product sigue con un nombre corto/viejo
   como "N", pero la ficha del producto en Odoo muestra el nombre actualizado
   en el template.

2) El botón "Actualizar catálogo" del presupuestador ahora refresca realmente
   desde Odoo para cualquier usuario autenticado, limpiando cache de backend
   y recargando el catálogo.

Archivos incluidos
------------------
- cotizador-back/src/odooBootstrap.js
- cotizador-back/src/routes/catalog.routes.js
- cotizador-back/src/routes/pdf.routes.js
- cotizador-front/src/api/catalog.js
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx

Resultado esperado para tu caso
-------------------------------
Para el item:
- ID Presupuestador: 3618
- ID Odoo template: 3287
- ID Odoo variant: 3618

El PDF ya no debería imprimir "N".
Debería usar el nombre del template en Odoo:
"Negro Semimate Color del revestimiento"

Cómo probar
-----------
1) Reemplazá estos archivos.
2) Reiniciá front y back.
3) Entrá al cotizador.
4) Tocá "Actualizar catálogo".
5) Volvé a generar PDF presupuesto / proforma.
6) En logs del backend deberías ver:
   - lectura de product.product
   - lectura de product.template
   - live_odoo_name con el nombre del template

Notas
-----
- El alias visible para vendedor/distribuidor sigue igual.
- El cambio impacta en el PDF y en el refresh del catálogo.

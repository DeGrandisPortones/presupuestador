ZIP para copiar y reemplazar
============================

Cambio incluido:
- Corrige la generacion del PDF Proforma para que use precios base limpios de la lista asignada.
- La proforma ya no aplica condicion 2, descuento/recargo de forma de pago, financiacion ni coeficiente del distribuidor al armar el PDF.
- El PDF Presupuesto cliente queda igual: sigue aplicando condicion, descuento/recargo y coeficiente cuando corresponde.

Archivo incluido:
- cotizador-front/src/pages/CotizadorPage/index.jsx

Instalacion:
1) Copiar la carpeta cotizador-front incluida en este ZIP sobre el repo.
2) Reemplazar archivos cuando el sistema lo pida.
3) Recompilar frontend:

   cd cotizador-front
   rm -rf dist node_modules/.vite
   npm run build

4) Redeploy frontend sin cache y refrescar con Ctrl+F5.

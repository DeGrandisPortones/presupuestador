ZIP copy/replace - proforma base + planchuela manual

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-back/src/routes/pdf.routes.js

Cambios:
1) Proforma:
   - Las lineas usan siempre precio base limpio.
   - No aplica coeficiente del distribuidor.
   - No aplica recargos ni descuentos de forma de pago.
   - No aplica descuento de Condicion 2 en las lineas.
   - Si es Condicion 2, el IVA se calcula al 10.5%.
   - Si no es Condicion 2, el IVA se calcula al 21%.
   - La etiqueta visible queda como "IVA".

2) Planchuela 2903:
   - Se deshabilita el agregado automatico en todos los portones.
   - El usuario debe elegirla manualmente desde la seccion correspondiente.

Pasos:
1. Copiar y reemplazar los archivos en el repo.
2. Recompilar frontend:
   cd cotizador-front
   rm -rf dist node_modules/.vite
   npm run build
3. Reiniciar backend y redeployar frontend sin cache.
4. Refrescar navegador con Ctrl+F5.

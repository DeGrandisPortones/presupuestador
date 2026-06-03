ZIP proforma condición 2 con etiqueta IVA simple

Copiar y reemplazar estos archivos:

- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-back/src/routes/pdf.routes.js

Qué cambia:

1) PDF proforma:
   - No aplica coeficiente del distribuidor.
   - No aplica financiación ni recargos/descuentos de forma de pago.
   - Sí aplica el descuento de Condición 2 cuando corresponde.
   - Muestra las líneas como PRECIO s/IVA y TOTAL s/IVA.
   - En el resumen muestra Subtotal s/IVA, IVA y TOTAL.
   - Si es Condición 2, el renglón IVA calcula internamente 10.5%, pero no lo muestra en la etiqueta.
   - Si no es Condición 2, mantiene el cálculo normal de IVA, pero también mostrando líneas sin IVA.

2) PDF presupuesto cliente:
   - Queda sin cambios.

Después de copiar:

Backend:
- Reiniciar el servicio backend.

Frontend:
cd cotizador-front
rm -rf dist node_modules/.vite
npm run build

Luego redeploy sin cache y refrescar con Ctrl+F5.

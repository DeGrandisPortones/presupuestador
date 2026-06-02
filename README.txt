Correccion para Presupuesto Otros - cantidad editable

Reemplaza:
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx

Corrige:
- elimina la variable rota que generaba pantalla blanca
- permite cantidades con punto o coma en Otros
- no elimina el producto mientras se escribe un valor intermedio como 2. o 2,

Despues de copiar:
cd cotizador-front
rm -rf dist node_modules/.vite
npm run build

Luego redeployar frontend sin cache.

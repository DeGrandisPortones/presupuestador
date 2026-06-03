ZIP copiar y reemplazar - Ipanel medidas extendidas solo en lamas

Archivo incluido:
- cotizador-front/src/pages/CotizadorPage/index.jsx

Cambios:
- Para Ipanels, el limite normal sigue siendo ancho 1.13 m y alto 2.45 m.
- Si las medidas superan ese limite normal pero no superan ancho 2.00 m y alto 3.00 m, se permite solamente con Tipo de plegado: Revestimiento en lamas.
- Al detectar ese rango extendido, muestra un alert indicando que solo se puede producir en lamas.
- En el bloque Tipo de plegado, oculta Panel simple y Revestimiento Varillado, dejando solo Revestimiento en lamas.
- Si ya estaba elegido Panel simple o Varillado, lo quita del presupuesto para evitar combinaciones invalidas.
- Si se intenta guardar/confirmar/descargar sin Revestimiento en lamas dentro del rango extendido, muestra error y no continua.
- Si supera ancho 2.00 m o alto 3.00 m, sigue bloqueando por fuera de limite.

Despues de copiar:
cd cotizador-front
rm -rf dist node_modules/.vite
npm run build

Luego redeployar frontend sin cache y refrescar con Ctrl+F5.

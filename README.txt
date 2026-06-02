ZIP: otros_cantidad_editable_copy_replace

Copiar y reemplazar desde la raiz del repo.

Incluye:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx
- cotizador-back/src/routes/quotes.routes.js

Cambio principal:
- En el cotizador Otros, las lineas permiten cantidad editable libre.
- Sirve para servicios por m2, instalacion, controles remotos u otros extras.
- No cambia el comportamiento de Porton, Ipanel ni Puerta: ahi las cantidades siguen con la logica existente.

Tambien mantiene la logica anterior de vincular Ipanel/Otros a un porton y usar el mismo numero con prefijo I/O.

Luego de copiar:
1. Reiniciar backend si se reemplaza quotes.routes.js.
2. Recompilar/redeployar frontend.
3. Refrescar navegador con Ctrl+F5.

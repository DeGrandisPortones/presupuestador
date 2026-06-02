Cambio: financiamiento con categoria Tarjetas y Cordobesa 12 cuotas 24%

Copiar y reemplazar desde la raiz del repo.

Incluye:
- cotizador-front/src/pages/CotizadorPage/components/HeaderBar.jsx
- cotizador-front/src/domain/quote/portonConstants.js
- cotizador-back/src/routes/financingSettings.routes.js

Que cambia:
- El selector principal de Forma de pago muestra:
  - Pago Multiple
  - Efectivo
  - Transferencia
  - Cheques 0 - 30 - 60 - 90 - 120
  - Cheques 0 - 30 - 60 - 90 - 120 - 150 - 180
  - Tarjetas
- Al elegir Tarjetas aparece un segundo selector con los planes de tarjeta.
- Agrega CORDOBESA 12 CUOTAS con 24% de recargo por defecto.
- Si luego se edita CORDOBESA 12 CUOTAS desde Financiamiento, el valor guardado pisa el 24% default.

Despues de copiar:
1. Reiniciar backend.
2. Recompilar/redeployar frontend sin cache.
3. Refrescar navegador con Ctrl+F5.

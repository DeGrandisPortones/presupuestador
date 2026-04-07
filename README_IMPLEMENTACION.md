Este paquete incluye una implementación parcial y coherente del nuevo flujo:

Incluido:
- Backend de medición con:
  - Guardar y enviar
  - Devolver al vendedor con motivo
  - Devolución a vendedor forzada por superficie fuera de tolerancia
  - Confirmación del vendedor para volver a Técnica
  - Restablecer presupuesto al original
- Editor del presupuesto con:
  - línea protegida 'Facturado previamente'
  - botones 'Restablecer al original' y 'Confirmar y volver a Técnica'
- Store/UI para proteger la línea de facturado previamente

Pendiente en este paquete:
- pantalla completa de superusuario con editor visual de la fórmula de superficie final
- adaptación visual completa de MedicionDetailPage para mostrar los nuevos botones sobre la pantalla actual ya existente del repo

Archivos incluidos:
- cotizador-back/src/settingsDb.js
- cotizador-back/src/routes/measurements.routes.js
- cotizador-front/src/api/measurements.js
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx

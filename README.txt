Este zip contiene una parte segura del cambio pedido:

- cotizador-back/src/settingsDb.js
  Agrega settings para la fórmula comercial de puerta.

- cotizador-back/src/routes/admin.routes.js
  Expone GET/PUT /api/admin/door-quote-settings.

- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
  Oculta el selector de Tipo/Sistema cuando el cotizador es Ipanel.

Lo que no quedó cerrado en este paquete, para no romper el repo actual:
- la UI completa del Dashboard para editar la fórmula
- el nuevo flujo completo de puerta (Ipanel + Marco) con compra sin venta y venta al confirmar el portón


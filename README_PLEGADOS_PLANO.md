Cambio aplicado: Plegados con plano obligatorio

Archivos incluidos:
- cotizador-front/src/utils/plegadoAttachment.js
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/QuoteDetailPage/index.jsx
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/pages/AprobacionComercialPage/index.jsx
- cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx
- cotizador-back/src/routes/quotes.routes.js
- cotizador-back/src/index.js

Resumen:
- En Plegados se agrega el campo obligatorio "Adjuntá el plano".
- Acepta PDF e imágenes, hasta 8 MB.
- El plano queda guardado dentro del payload del presupuesto.
- Comercial, Técnica y el usuario pueden ver/descargar el plano desde los listados/detalle.
- La descripción del plegado queda más visible, en negrita y como comentario del plegado.
- Se sube el límite JSON del backend a 15 MB para soportar el archivo codificado.

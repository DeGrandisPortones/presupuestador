Reemplazar estos archivos en el repo:
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx

Qué hace:
- El sistema agrega automáticamente el producto 3008 si el tipo contiene 'coplanar'.
- El sistema agrega automáticamente el producto 3009 si el tipo NO contiene 'coplanar'.
- Los productos 3008/3009 ya no se muestran en el catálogo para que vendedor/distribuidor no los elijan manualmente.
- Si cambia el tipo, reemplaza automáticamente 3008 por 3009 o viceversa.
- Mantiene cantidad 1 para ese ítem automático.

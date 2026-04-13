Parche: cantidades fijas por unidad + cantidad entera para Vidrio

Incluye:
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx

Qué hace:
- Mantiene cantidad por superficie solo para items con surface_quantity.
- Para el resto de los productos, fija cantidad = 1.
- Excepción: producto Vidrio permite cantidad entera y arranca en 0.
- Se contemplan ambos IDs 3582 y 3251 para evitar diferencias entre variante/template.
- Conserva la eliminación previa de la línea automática de sistema.

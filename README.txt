Patch: cálculo preview para sistemas doble_iny

Incluye:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx

Qué corrige:
- Trata correctamente los sistemas derivados con clave doble_iny / *_iny como inyectados para inferir kg/m2.
- Calcula y muestra en pantalla:
  - Kg/m2 efectivo
  - Peso estimado
  - Piernas estimadas
  - Medidas de paso
- Mantiene los campos calculados en gris.
- Usa los IDs configurados de instalación dentro/detrás del vano para la vista previa.

Aplicación:
- Copiar y reemplazar el archivo en el repo.
- Rebuild del front.

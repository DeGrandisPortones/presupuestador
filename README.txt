Patch: ajustes de dimensiones, obligatoriedad y visualización de estado

Incluye:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/CotizadorPage/index.jsx

Cambios:
- Reacomoda el bloque de ancho/alto para que no se desfasen las leyendas de mínimos/máximos.
- Mantiene límites:
  - Ancho: 2 a 7 m
  - Alto: 2 a 3 m
- Hace obligatorios ancho y alto al guardar, confirmar y descargar PDF/proforma.
- Evita mostrar UUID en el encabezado del presupuesto.
- Muestra "Guardado" en lugar de "Draft" cuando el presupuesto ya fue persistido.
- Mantiene el ajuste anterior de usar todo el ancho de la ventana en el cotizador.
- Mantiene que el texto adjunto al PDF no incluya "Peso estimado".
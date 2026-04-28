Cambios incluidos
=================

Archivos modificados:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx

Resumen:
- Portones conserva la seccion de medidas y queda ordenada como Ancho y luego Alto.
- Ipanel muestra solamente Ancho y Alto en la seccion de medidas.
- Ipanel valida maximos de presupuestacion:
  - Ancho maximo: 1.13 m (113 cm).
  - Alto maximo: 2.45 m (245 cm).
- Otros oculta completamente la seccion de medidas y no exige Ancho ni Alto para guardar, confirmar o descargar PDF.
- CotizadorPage pasa correctamente catalogKind a PortonDimensions para que cada tipo use su propia UI y validacion.

Modo de uso:
Copiar el contenido de este zip sobre la raiz del repo presupuestador y reemplazar archivos.

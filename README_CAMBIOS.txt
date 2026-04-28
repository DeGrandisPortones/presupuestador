Cambios incluidos
=================

Archivos modificados:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx

Detalle:
1. Portones
   - La seccion de medidas conserva Ancho y Alto en ese orden.
   - Mantiene Tipo / Sistema, Kg por m2, Superficie, Parantes y calculos tecnicos.
   - Mantiene las validaciones de medidas de porton.

2. Ipanels
   - La seccion de medidas muestra solamente Ancho y Alto.
   - Oculta Tipo / Sistema, Kg por m2, Superficie, Parantes y calculos tecnicos.
   - Requiere Ancho y Alto para guardar, confirmar y descargar PDF.
   - No aplica los limites especificos de portones.

3. Otros
   - Se oculta completamente la seccion de medidas.
   - No exige Ancho ni Alto para guardar, confirmar o descargar PDF.
   - No agrega medidas al texto del PDF para presupuestos de tipo Otros.

Instalacion:
Copiar la carpeta cotizador-front incluida en este zip sobre la raiz del repo presupuestador, reemplazando los archivos existentes.

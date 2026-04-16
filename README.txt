Reemplazo directo solicitado por Esteban.

Cambios incluidos:
- Medición simplificada: se quitan los bloques estáticos de revestimiento / puerta / rebajes / observaciones del formulario de medición.
- Arriba aparece un resumen del presupuesto a medir con la sección de donde viene cada opción elegida.
- El medidor ve solo:
  - fecha
  - alto final / ancho final
  - 3 altos + 3 anchos
  - los campos dinámicos asociados a secciones 39/45, 23 y 18
- Si cambia un campo de la sección 18, se muestra advertencia y se devuelve al vendedor.
- Al enviar, intenta guardar la ubicación del celular como Google Maps.

Archivos para copiar y pegar:
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/components/MeasurementReadOnlyView.jsx

Reemplazo directo.

Archivos incluidos:
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/components/MeasurementReadOnlyView.jsx
- cotizador-back/src/routes/measurements.routes.js

Qué corrige en esta versión:
- restaura el esquemita visual de 3 altos y 3 anchos sin sacar los 6 inputs
- agrega observaciones del medidor
- si hay observaciones, al enviar se deriva al vendedor con el motivo
- el vendedor sigue viendo el motivo porque se guarda en measurement_review_notes
- el técnico ya no usa el flujo incorrecto de “enviar a técnica” al aprobar
- el técnico ahora aprueba por review final y rechaza al vendedor
- el técnico ve alto/ancho final, peso aproximado y tipo de piernas
- el técnico puede modificar alto/ancho final con confirmación
- el listado y el backend de medición admiten también portones con medición en acopio si tienen línea de medición

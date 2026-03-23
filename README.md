Bundle de cambios para PRESUPUESTADOR

Incluye:
- cotizador-back/src/quotesSchema.js
- cotizador-back/src/routes/measurements.routes.js
- cotizador-back/src/routes/quotes.routes.diff
- cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/pages/PresupuestosPage/index.jsx

Objetivo funcional:
1. Unificar el origen de datos finales del portón en la planilla de medición.
2. Agregar subtipo `sin_medicion` / modo `tecnica_only`.
3. Evitar que esos portones aparezcan al medidor.
4. Exigir `alto_final_mm` y `ancho_final_mm` antes de confirmar desde Técnica.
5. Mostrar en Técnica un apartado/filtro de “Portones sin medición”.
6. Agregar botón “Ver medición” en Mis presupuestos cuando la medición ya está aprobada.

Importante:
- `quotes.routes.js` quedó como PATCH porque es el archivo más sensible del flujo a Odoo. El diff incluido contiene los reemplazos centrales para:
  - diferir el sync a Odoo hasta medición aprobada
  - marcar todos los portones de producción con flujo de medición
  - convertir los casos sin medición en `tecnica_only`
  - propagar el mismo comportamiento al paso Acopio -> Producción
- Los demás archivos están listos para reemplazar directamente.

Orden sugerido:
1. Reemplazar los archivos completos del bundle.
2. Aplicar el diff `cotizador-back/src/routes/quotes.routes.diff` sobre `cotizador-back/src/routes/quotes.routes.js`.
3. Reiniciar back y front.
4. Probar estos casos:
   - Producción con medición normal
   - Producción sin medición (debe entrar solo a Técnica)
   - Acopio -> Producción con y sin medición
   - Apertura del link “Ver medición” desde Mis presupuestos

# Patch PDF Presupuesto (estilo DeGrandis)

Incluye:
- Nuevo generador PDF con:
  - Membrete (logo + título + número)
  - Bordes redondeados y grilla similar al modelo
  - Tabla con formato (DESCRIPCIÓN / CANT / PRECIO / TOTAL) + fila TOTAL
  - Página de Términos y Condiciones
  - Footer "Página X de Y"
  - Soporta coeficiente (margin_percent_ui) desde payload.payload.margin_percent_ui (y fallback legacy)

- Ajuste en store del Front para enviar `raw_name` y `quote_id` en el payload (para que el PDF pueda mostrar el nombre real del producto y el número).

## Cómo aplicar
1) Back:
   - Copiar:
     - `cotizador-back/src/routes/pdf.routes.js`
     - `cotizador-back/src/assets/logo-degrandis.png`
   - Reiniciar el back.

2) Front:
   - Reemplazar `cotizador-front/src/domain/quote/store.js` por el incluido.
   - (o copiar solo los cambios en `buildPayloadForBack` para incluir `raw_name` y `quote_id`)


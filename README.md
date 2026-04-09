Este paquete suma:

1. kg por m2 en el presupuesto original
- Se carga junto a alto y ancho.
- Queda guardado en payload.dimensions.kg_m2.
- Se muestra peso estimado y piernas estimadas en el presupuesto.

2. Formula recomendada por defecto
- settingsDb.js deja por defecto: surface_automatica_m2
- Si ya tenias una formula vieja guardada en la base, esa no se pisa sola.
- En ese caso, entra a /dashboard/reglas-tecnicas y guarda manualmente: surface_automatica_m2

3. Presupuesto y proforma
- Al generar PDF, el front agrega al campo de observaciones:
  Alto, Ancho, Kg/m2 y Peso estimado.
- Esto evita tocar mas archivos del motor PDF y deja la info visible en ambos PDF.

Archivos para reemplazar:
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-back/src/settingsDb.js

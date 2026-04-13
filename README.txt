Patch: kg/m² por producto para "Apto para revestir"

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-back/src/routes/measurements.routes.js
- cotizador-back/src/pdfBudgetExtras.js

Que cambia:
- El kg/m² de "Apto para revestir" deja de cargarse manualmente en el cotizador.
- Se agrega una tabla configurable por producto en Reglas tecnicas.
- Si el presupuesto contiene uno de esos productos y es apto para revestir, se usa el kg/m² configurado.
- Fallback de compatibilidad: si todavia no hay regla configurada para apto, el sistema conserva el valor legacy si existe.
- Para sistemas no aptos, se mantiene la logica actual de clasico / inyectado.

Como copiar:
1. Reemplazar cada archivo del repo por el archivo del mismo path dentro de este zip.
2. Reiniciar front y back.
3. Entrar a Reglas tecnicas y cargar la nueva tabla "kg/m² para apto para revestir".

Nota:
- Se actualizo tanto front como backend y PDF para evitar diferencias entre lo que se ve en pantalla y lo que calcula tecnica/PDF.


V2 FIX:
- Se agrega cotizador-back/src/settingsDb.js
- Corrige persistencia de surface_parameters / apto_revestir_kg_m2_rules
- Mantiene compatibilidad con surface_calc_params legacy

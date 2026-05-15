Reemplazar estos archivos completos en el repo presupuestador.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx

Correccion de esta version:
- Los campos de orientacion/parantes para portones NO apto se guardan en surface_parameters y tambien en surface_calc_params para compatibilidad.
- Al recargar Reglas tecnicas, la pantalla lee surface_parameters, surface_calc_params, surface_params o measurement_surface_params, usando el primero que tenga contenido.
- El esquema tambien lee los parametros con ese mismo fallback, para que tome los IDs configurados al refrescar.

Mantiene:
- Esquema siempre disponible.
- Laterales fuera del conteo de parantes internos.
- Descuento de cano/parante configurable.
- Orientacion por IDs o combinaciones.
- No aptos en solo lectura y calculados por reglas tecnicas.

Reemplazo listo para copiar y pegar.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/settingsDb.js
- SQL_FIX_PARANTES_EJEMPLO.sql

Correccion de esta version:
- Se aplica el comportamiento de referencia + orientacion horizontal tambien para portones apto para revestir.
- Solo aparece cuando el sistema es apto para revestir y la distribucion de parantes es Especial.
- Agrega la tilde "Primer parante fijo + orientacion horizontal".
- Si se tilda:
  * fuerza orientacion horizontal,
  * usa el primer parante como referencia vertical, simulando el caso de puerta pero sin llamarlo puerta,
  * consulta si el primer parante fijo esta del lado izquierdo o derecho,
  * dibuja los parantes horizontales solo en el espacio restante desde ese parante fijo.
- El primer parante fijo toma la distancia cargada en "Distancia dentro a dentro primer parante"; si esta vacio, pone 800 mm por defecto.

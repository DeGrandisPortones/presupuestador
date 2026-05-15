Reemplazo listo para copiar y pegar.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/settingsDb.js
- SQL_FIX_PARANTES_EJEMPLO.sql

Correccion de esta version:
- Se ajusta el comportamiento de portones NO apto para revestir cuando tienen puerta y la orientacion de parantes es horizontal.
- Si la orientacion es vertical:
  * se mantiene el comportamiento actual, usando la distancia de puerta (ej. 800 mm) para fijar el primer parante y repartir el resto.
- Si la orientacion es horizontal:
  * la puerta sigue definiendo desde que lado arranca el dibujo (izquierda o derecha),
  * pero la distribucion de los parantes horizontales se calcula sobre el alto del porton, sin usar la distancia de puerta como primera distancia vertical,
  * los parantes horizontales se dibujan solamente en el espacio restante despues del sector de la puerta.

Resultado esperado:
- En puerta izquierda + orientacion horizontal, los parantes horizontales arrancan desde el parante de la puerta hacia la derecha.
- En puerta derecha + orientacion horizontal, los parantes horizontales arrancan desde el parante de la puerta hacia la izquierda.

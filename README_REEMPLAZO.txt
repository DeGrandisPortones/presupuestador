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
Correccion agregada en esta version:
- Se ajustan las Medidas de paso del porton.
- Alto de paso:
  * mantiene el descuento base de 1 cm,
  * descuenta 10 cm adicionales.
  * Formula: alto del porton - 110 mm.
- Ancho de paso:
  * mantiene el descuento base de 1 cm,
  * descuenta la mitad del parametro de pierna correspondiente al porton.
  * Formula: ancho del porton - 10 mm - (parametro de pierna / 2).
- El parametro de pierna usado es el mismo que define la tarjeta "Piernas estimadas".
- Los calculos que en esta pantalla toman las Medidas de paso pasan a usar estos nuevos valores.

Correccion agregada en esta version:
- El esquema de hoja y parantes ahora usa como base las Medidas de paso, no el ancho/alto nominal del porton.
- Si la orientacion es vertical, el esquema toma el ancho de paso.
- Si la orientacion es horizontal, el esquema toma el alto de paso.
- La tarjeta "Medidas de paso" ahora muestra el orden correcto: Ancho x Alto.

Correccion agregada en esta version:
- Solo para portones apto para revestir.
- Si la orientacion es Horizontal y la distribucion es Especial, aparece la opcion "¿Ponerle primer parante a distancia fija?".
- Esa opcion ya no fuerza la orientacion; la orientacion se toma del selector principal.
- Al tildarla, consulta si el primer parante fijo esta del lado Izquierdo o Derecho.
- Luego de cargar la distancia del primer parante fijo, se puede tildar o destildar "Distribuir uniformemente".
- Si "Distribuir uniformemente" esta destildado, las distancias siguientes quedan editables.

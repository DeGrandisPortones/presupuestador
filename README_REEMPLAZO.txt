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

Correccion agregada en esta version:
- Este ZIP reemplaza el patch anterior: incluye archivos completos para copiar y reemplazar.
- Corrige la pantalla en blanco al tildar "¿Ponerle primer parante a distancia fija?" en aptos para revestir.
- Se separa la distancia fija de referencia en parantes_referencia_distancia_mm para que no se mezcle con la distribucion interna de parantes.
- La distancia fija se carga en un campo propio junto al lado Izquierdo/Derecho.
- Distribuir uniformemente sigue pudiendo tildarse o destildarse, y las distancias internas permanecen independientes.

Correccion agregada en esta version:
- Para portones apto para revestir, cuando se habilitan los campos de parantes, la cantidad de parantes queda por defecto en 1.
- Esto aplica al campo "Cantidad de parantes" en general, no solo al caso de primer parante fijo.
- Al tildar "¿Ponerle primer parante a distancia fija?", si por algun motivo la cantidad seguia en 0, tambien se corrige inmediatamente a 1.
- Se elimina la necesidad de usar una cantidad efectiva artificial: el dato real queda seteado en el estado.

Correccion agregada en esta version:
- Para aptos para revestir con distribucion Repartido, el esquema ignora por completo las distancias guardadas de distribuciones Especiales anteriores.
- En Repartido, calcula los parantes de forma uniforme automaticamente segun cantidad de parantes, orientacion y medidas de paso.
- En Especial, se conserva la logica actual:
  * el usuario puede usar o no primer parante a distancia fija,
  * puede elegir lado izquierdo/derecho si lo fija,
  * puede tildar o destildar Distribuir uniformemente,
  * puede cargar manualmente las distancias restantes.
- El texto del esquema ahora identifica Repartido como distribucion uniforme, no como distancias cargadas manualmente.

Correccion agregada en esta version:
- Al elegir un producto en una seccion del catalogo, si se habilita una seccion siguiente por dependencias, el acordeon la abre y hace scroll suave hasta esa seccion.
- Tambien aplica si se vuelve a clickear una opcion ya elegida y existe una seccion siguiente.
- El scroll solo se dispara por avance automatico entre secciones; no molesta al abrir/cerrar manualmente.
- Se agrego el archivo completo:
  cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx

Correccion agregada en esta version:
- Solo para portones apto para revestir.
- En distribucion Especial, la opcion "¿Desea fijar un parante?" aparece tanto con orientacion Vertical como Horizontal.
- El parante fijado se maneja separado de la lista de distancias: ya no se usa un parante restante seteado a 800 mm.
- Si se fija un parante, la cantidad total de parantes se mantiene, pero las distancias que aparecen debajo son solo las de los parantes restantes.
- Si "Distribuir uniformemente" esta tildado:
  * con orientacion Horizontal reparte sobre el alto de paso;
  * con orientacion Vertical reparte sobre el ancho de paso y toma como inicio el parante fijado.
- Si "Distribuir uniformemente" esta destildado, las distancias restantes quedan editables manualmente.

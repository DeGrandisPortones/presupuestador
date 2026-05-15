ZIP de reemplazo - Parantes apto/no apto para revestir

Copiar y reemplazar estos archivos dentro del repo presupuestador:

1) cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
2) cotizador-front/src/domain/quote/store.js
3) cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx

Cambios incluidos:

- El esquema de hoja/parantes queda disponible para todos los portones.
- Los parantes laterales se dibujan aparte y NO cuentan dentro de Cantidad de parantes.
- El esquema ahora descuenta el ancho del caño/parante configurado en reglas tecnicas.
  Ejemplo: base 2000 mm, caño 40 mm, 1 parante interno => 960 mm libres, 40 mm del parante y 960 mm libres.
- Para apto para revestir se conserva:
  - orientacion, cantidad y distribucion de parantes editables;
  - distribucion especial con observaciones;
  - distancia dentro a dentro del primer parante;
  - distancias adicionales;
  - distribuir uniformemente;
  - descuento configurable del cano desde reglas tecnicas.
- Para NO apto para revestir:
  - orientacion, cantidad de parantes y distribucion quedan SOLO LECTURA;
  - la orientacion de parantes se fuerza desde Reglas tecnicas segun IDs o combinaciones de IDs;
  - si no hay regla de orientacion que matchee, queda vertical por defecto;
  - la cantidad de parantes se recalcula automaticamente segun orientacion y medidas;
  - la distribucion queda siempre repartido;
  - si detecta porton con puerta, deja el primer parante a 800 mm por defecto y reparte el resto hasta el lateral final;
  - el esquema usa esa misma distribucion aunque los campos sean solo lectura;
  - la distancia de 800 mm tambien queda configurable en Reglas tecnicas.

Configuracion en Reglas tecnicas:

Entrar como superusuario a Reglas tecnicas > Parametros de calculo de piernas, superficie y parantes.

Nuevos campos:

- Vertical si contiene estos IDs/combinaciones
  Key guardada: non_apto_parantes_vertical_product_ids

- Horizontal si contiene estos IDs/combinaciones
  Key guardada: non_apto_parantes_horizontal_product_ids

- IDs/combinaciones que indican porton con puerta
  Key guardada: parantes_door_product_ids

- Distancia primer parante con puerta (mm)
  Key guardada: parantes_door_first_distance_mm
  Default: 800

- Ancho caño/parante para esquema (mm)
  Key guardada: parantes_tube_discount_mm
  Default: 40

Formato para IDs/combinaciones:

- Un ID solo: 3025
- Varios IDs alternativos: 3025,3026 o 3025.3026 o 3025;3026 o uno por linea
- Una combinacion obligatoria: 3591+3025
- Varias combinaciones/alternativas: 3591+3025;2845

El punto, la coma, el punto y coma y el salto de linea separan IDs alternativos.
Para exigir que varios IDs esten todos presentes, usar +.

Correcciones adicionales:

- Se agrego boton Guardar parametros arriba del bloque de parametros.
- Se agrego boton Guardar configuracion de parantes dentro del bloque de orientacion para NO apto.
- Ambos botones guardan las mismas reglas tecnicas, incluyendo orientacion, puerta y distancia primer parante.

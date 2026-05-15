Reemplazo listo para copiar y pegar.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/settingsDb.js
- SQL_FIX_PARANTES_EJEMPLO.sql

Correccion de esta version:
- Se corrige el dibujo de los segmentos rojos del esquema para que queden congruentes con los parantes azules.
- En lectura de derecha a izquierda (puerta derecha), las cotas ahora se dibujan siguiendo la posicion visual real de los parantes en pantalla.
- Los segmentos se calculan sobre el eje ya mostrado en el dibujo, evitando que queden invertidos o corridos.
- Se mantiene la referencia desde el borde exterior y el grosor reforzado de los parantes laterales.

Resultado esperado en el caso mostrado:
- Si los parantes azules estan bien ubicados y los textos inferiores tambien, ahora los segmentos rojos deben alinearse con esos mismos parantes.
- En puerta derecha, el tramo mas corto debe quedar del lado derecho del dibujo (no del izquierdo) si ese es el lado de la puerta.

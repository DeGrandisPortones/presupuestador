Reemplazo listo para copiar y pegar.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/settingsDb.js
- SQL_FIX_PARANTES_EJEMPLO.sql

Cambios de esta version:

1) Nueva seccion en Reglas tecnicas: Medidas de paso y hoja
- Paso alto = alto del porton - descuento alto total configurable. Default: 110 mm.
- Paso ancho = ancho del porton - descuento segun tipo de pierna.
- La tabla permite configurar descuento de ancho para:
  * angostas
  * comunes
  * anchas
  * superanchas
  * especiales

2) Medidas de hoja
- Alto hoja = alto de paso - descuento alto hoja configurable. Default: 10 mm.
- Ancho hoja = ancho de paso.
- Si el presupuesto contiene un ID/combinacion configurado como rebaje lateral, entonces:
  ancho hoja = ancho de paso - descuento rebaje lateral configurable. Default: 5 mm total.

3) Esquema y distribucion de parantes
- El esquema usa medidas de hoja, no medidas nominales ni medidas de paso.
- Si la orientacion es vertical, reparte segun ancho de hoja.
- Si la orientacion es horizontal, reparte segun alto de hoja.
- La distribucion repartida/uniforme ahora es simple:
  distancia = medida de hoja correspondiente / (cantidad de parantes + 1)
- Si hay un parante fijo, la distribucion de los restantes se hace desde ese parante y todas las medidas restantes quedan iguales.

4) Compatibilidad
- Mantiene los campos previos de parantes, puertas izquierda/derecha y autoscroll de secciones dependientes.

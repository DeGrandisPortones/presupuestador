Reemplazo listo para copiar y pegar.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/settingsDb.js
- SQL_FIX_PARANTES_EJEMPLO.sql

Correccion de esta version:
- Se agrega soporte para detectar puerta izquierda en portones NO apto para revestir.
- Ahora se puede configurar por reglas técnicas un nuevo campo: IDs/combinaciones que indican puerta izquierda.
- Si matchea puerta izquierda, el esquema y el cálculo quedan de izquierda a derecha.
- Si matchea puerta derecha, el esquema y el cálculo quedan de derecha a izquierda.
- La puerta izquierda tiene prioridad para evitar falsos positivos de puerta derecha por textos como "Derecha" en otros ítems.
- El fallback por texto también se ajusta:
  * puerta izquierda => detecta "puerta izquierda"
  * puerta derecha => detecta "puerta derecha"
  * ya no toma cualquier "derecha" suelto.

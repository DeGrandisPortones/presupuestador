Reemplazar estos archivos:
- cotizador-back/src/settingsDb.js
- cotizador-back/src/routes/measurements.routes.js
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx

Ruta del front para editar:
- /dashboard/reglas-tecnicas

Que agrega:
- Parametros editables de piernas y superficie en superusuario.
- Calculo automatico de tipo de piernas segun peso estimado.
- Calculo automatico de alto_calculado_mm y ancho_calculado_mm segun colocacion.
- Variables nuevas disponibles en la formula final:
  alto_calculado_mm, ancho_calculado_mm, superficie_automatica_m2,
  tipo_porton, kg_m2_porton, peso_estimado_kg,
  piernas, piernas_tipo, piernas_angostas, piernas_comunes,
  piernas_anchas, piernas_superanchas, piernas_especiales,
  instalacion_dentro_vano, instalacion_detras_vano.

Formula recomendada:
(alto_calculado_mm / 1000) * (ancho_calculado_mm / 1000)

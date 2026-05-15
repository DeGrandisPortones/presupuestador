Reemplazo completo - fix persistencia reglas de parantes

Copiar y reemplazar estos archivos en el repo:

1) cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
2) cotizador-front/src/domain/quote/store.js
3) cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
4) cotizador-back/src/settingsDb.js

IMPORTANTE:
- Esta version incluye tambien el archivo del backend settingsDb.js.
- El problema de que los IDs se veian guardados pero al refrescar quedaban vacios estaba en la normalizacion/lectura de parametros de reglas tecnicas.
- Ahora los parametros de parantes se preservan como texto, incluso si tienen comas, puntos, punto y coma, saltos de linea o combinaciones con +.
- Tambien se fusionan surface_parameters y surface_calc_params, para no perder datos si una rama viene incompleta.

Campos que ahora persisten:
- non_apto_parantes_vertical_product_ids
- non_apto_parantes_horizontal_product_ids
- parantes_door_product_ids
- parantes_door_first_distance_mm
- parantes_tube_discount_mm

Formato de IDs:
- 3025,3026 => matchea cualquiera
- 3591+3025 => exige ambos
- tambien acepta punto, punto y coma o salto de linea como separadores simples.

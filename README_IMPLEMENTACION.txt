Reemplazar estos archivos completos:

- cotizador-back/src/routes/measurements.routes.js
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx

Cambios:
- La fórmula de superficie final también se edita desde Superusuario > Reglas técnicas.
- La fórmula ahora acepta auxiliares como piernas, colocación e instalación.
- Variables nuevas: budget_surface_m2, budget_width_m, budget_height_m, piernas, colocacion, instalacion, piernas_angostas, piernas_medias, piernas_anchas, colocacion_dentro_vano, instalacion_dentro_vano, descuento_superficie_m2.

Ejemplo:
((alto_final_mm / 1000) * (ancho_final_mm / 1000)) - (instalacion_dentro_vano * piernas_angostas * 0.65)

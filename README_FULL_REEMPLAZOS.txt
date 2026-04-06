REEMPLAZOS COMPLETOS PARA COPIAR Y PEGAR

Este zip trae archivos completos, no diffs.

Cambios incluidos:
- Se elimina tipo_revestimiento_comercial como campo sistema fijo.
- Se elimina su render hardcodeado de la planilla para que lo manejes por configuracion.
- Se agrega porton_type como comparable en reglas.
- Cuando en una regla el campo origen es porton_type, "Comparar contra" muestra un desplegable con los tipos/sistemas del presupuestador.

Archivos para reemplazar enteros:
- cotizador-front/src/domain/measurement/technicalMeasurementRuleFields.js
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/pages/MedicionDetailPage/index.jsx

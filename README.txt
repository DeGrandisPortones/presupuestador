Asignación de propiedades a producción - superusuario

Incluye:
- cotizador-back/src/productionPropertyAssignments.js
- cotizador-back/src/routes/admin.routes.js
- cotizador-back/src/measurementFinalization.js
- cotizador-front/src/api/admin.js
- cotizador-front/src/App.jsx
- cotizador-front/src/pages/MenuPage/index.jsx
- cotizador-front/src/pages/SuperuserProductionPropertyAssignmentsPage/index.jsx

Qué agrega:
- nuevo ítem de menú solo para superusuario:
  "Asignación de propiedades a producción"
- pantalla con:
  - primera columna = propiedad del portón desde presupuestador
  - segunda columna = dropdown con propiedades detectadas del integrador
- guardado por source_key -> target_property
- al generar la NV final:
  - arma el JSON base de preproducción
  - aplica las asignaciones guardadas
  - copia esos valores a las propiedades destino dentro del JSON
  - sigue haciendo upsert en public.preproduccion_valores

Además:
- porton_type ahora viaja como label visible en mayúsculas
- también deja porton_type_key con la key interna
- mantiene el rename de NV en Odoo

ZIP directo para copiar y reemplazar.

Incluye:
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx
- cotizador-back/src/catalogDb.js

Notas:
1) La ruta para guardar la automatización ya existe: PUT /api/admin/technical-measurement-rules?kind=porton.
   La automatización se guarda dentro de public.presupuestador_settings, key='technical_measurement_rules', en surface_parameters.auto_budget_product_rules_json.

2) El fix de backend agrega created_at/updated_at cuando esas columnas faltan en tablas existentes de catálogo.
   Esto corrige el error: column "updated_at" of relation "presupuestador_sections" does not exist.

Después de copiar:
- Reiniciar backend.
- Recompilar frontend:
  cd cotizador-front
  rm -rf dist node_modules/.vite
  npm run build
- Redeploy sin cache y Ctrl+F5.

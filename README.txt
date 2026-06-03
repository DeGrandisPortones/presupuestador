ZIP directo para copiar y reemplazar.

Incluye:
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx
- cotizador-back/src/catalogDb.js

Correcciones:
- Mantiene la seccion Automatizacion del presupuesto en Reglas Tecnicas.
- Mantiene oculto el bloque Campos dinamicos de medicion.
- Mantiene el fix backend para created_at/updated_at en tablas de catalogo.
- Corrige el loop de React al entrar al presupuestador con reglas de automatizacion cargadas.

Motivo del loop:
La automatizacion intentaba quitar el producto automatico aunque no estuviera presente en el presupuesto. Ese forceRemoveLine generaba un cambio de estado aunque no hubiera nada para quitar, y React entraba en ciclo.

Cambio aplicado:
Ahora solo llama a forceRemoveLine si el producto automatico realmente esta presente en las lineas del presupuesto.

Despues de copiar:
1) Reiniciar backend.
2) Recompilar frontend:
   cd cotizador-front
   rm -rf dist node_modules/.vite
   npm run build
3) Redeploy frontend sin cache y refrescar con Ctrl+F5.

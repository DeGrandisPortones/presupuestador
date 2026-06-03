ZIP copiar y reemplazar - Automatizaciones en Reglas Técnicas

Archivos incluidos:
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx

Cambios:
1) En Reglas Técnicas se oculta la sección de Campos dinámicos de medición.
   No se borra configuración. Solo deja de mostrarse en pantalla.

2) Se agrega la sección "Automatización del presupuesto".
   Permite cargar reglas del tipo:
   - Si el presupuesto contiene tal ID o grupo de IDs
   - Agregar tal producto automáticamente
   - Cantidad: 1 unidad o superficie del portón
   - Opción "Sólo apto para revestir"

3) Los disparadores aceptan:
   - IDs separados por coma, espacio, punto y coma o salto de línea.
   - Grupos obligatorios con +. Ejemplo: 4037+3996 exige ambos productos.

4) El producto destino se elige desde desplegable. El selector muestra ID Presupuestador e ID Odoo.

5) En el cotizador de portones, cuando la regla matchea, se agrega el producto automático.
   Si deja de matchear, se quita.

Después de copiar:
cd cotizador-front
rm -rf dist node_modules/.vite
npm run build

Luego redeploy frontend sin cache y Ctrl+F5.

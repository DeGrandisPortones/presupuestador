ZIP copiar y reemplazar - Filtro de seccion para kg/m2 apto para revestir

Archivos incluidos:
- cotizador-front/src/layouts/AppLayout.jsx
- cotizador-front/src/components/AptoKgProductSectionFilterPatch.jsx

Que hace:
- Agrega en /dashboard/reglas-tecnicas un filtro de seccion para la tabla "kg/m2 para apto para revestir".
- El filtro no cambia como se guarda la configuracion.
- Solo filtra visualmente los productos de los desplegables de esa tabla.
- Si una fila ya tenia un producto seleccionado fuera de la seccion filtrada, lo conserva visible para no perder la seleccion.

Despues de copiar:
cd cotizador-front
rm -rf dist node_modules/.vite
npm run build

Luego redeploy frontend sin cache y Ctrl+F5.

Reemplazar directo:
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/pages/MedicionesPage/index.jsx

Cambio:
- la medición aprobada abre en solo lectura
- vendedor/distribuidor y cualquier usuario no técnico en una medición aprobada ven la pantalla bloqueada
- solo Técnica puede seguir editando
- desde la lista de mediciones aprobadas, el botón pasa a decir 'Ver medición' y navega con readonly=1

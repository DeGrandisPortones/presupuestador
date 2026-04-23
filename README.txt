Fix de ancho completo para Asignación de propiedades a producción

Qué cambia:
- la página deja de quedar restringida al ancho normal del container
- fuerza un ancho casi completo de la ventana:
  width/maxWidth = calc(100vw - 48px)
- así aprovecha toda la pantalla disponible y reduce el scroll horizontal innecesario

Archivo:
- cotizador-front/src/pages/SuperuserProductionPropertyAssignmentsPage/index.jsx

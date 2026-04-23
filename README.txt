Fix nombre vendedor/distribuidor en presupuesto y proforma

Qué cambia:
- /api/pdf/presupuesto y /api/pdf/proforma ahora requieren auth
- el backend toma el usuario logeado desde req.user
- inyecta seller_name con:
  - full_name del usuario
  - si no, username
- así en el PDF deja de salir "-" y muestra el nombre del usuario logeado

Archivo:
- cotizador-back/src/routes/pdf.routes.js

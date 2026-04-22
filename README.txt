Agrega una nueva pantalla solo para superusuario para definir el nombre que sale en PDF por producto.

Incluye:
- cotizador-back/src/catalogDb.js
- cotizador-back/src/routes/admin.routes.js
- cotizador-back/src/routes/pdf.routes.js
- cotizador-front/src/api/admin.js
- cotizador-front/src/App.jsx
- cotizador-front/src/pages/MenuPage/index.jsx
- cotizador-front/src/pages/SuperuserProductPdfNamesPage/index.jsx

Qué hace:
- agrega item de menú: "Nombres PDF productos"
- lista productos con:
  - ID Presupuestador
  - ID Odoo
  - nombre Odoo
  - nombre presupuestador / alias
  - campo editable "Nombre PDF"
- guarda override por producto en base de datos
- al generar PDF:
  - si hay nombre PDF configurado, usa ese
  - si no hay override, usa nombre de Odoo

Permiso:
- solo superusuario

Ruta:
- /superuser/nombres-pdf

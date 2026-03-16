Reemplazo directo para agregar SUPERUSUARIO sin pisar los cambios posteriores.

Copiar estas rutas sobre tu repo:
- cotizador-back/src/usersDb.js
- cotizador-back/src/auth.js
- cotizador-back/src/routes/auth.routes.js
- cotizador-front/src/pages/UsersAdminPage/index.jsx

Notas:
- agrega la columna is_superuser si no existe
- hace que un superusuario herede permisos efectivos en login/token
- habilita crear/editar/listar superusuarios desde Gestor de usuarios

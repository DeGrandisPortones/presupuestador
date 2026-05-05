Cambio aplicado:

- Archivo modificado:
  cotizador-front/src/pages/LoginPage/index.jsx

Detalle:
- Se agrego un boton con icono de ojo dentro del campo Contraseña.
- Por defecto la contraseña queda oculta con type="password" y el ojo aparece cerrado.
- Al hacer click, el campo cambia a type="text", el ojo queda abierto y se ven los caracteres escritos.
- Al volver a hacer click, se oculta nuevamente.

Notas de cuidado:
- No se tocaron rutas, backend, auth, store, estilos globales ni componentes compartidos.
- El boton del ojo usa type="button" para no disparar el submit del login.
- El input mantiene autoComplete="current-password".

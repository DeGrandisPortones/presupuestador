ZIP directo para copiar y reemplazar desde la raiz del repo.

Archivos incluidos:
- cotizador-back/src/routes/financingSettings.routes.js
- cotizador-front/src/pages/FinanciamientoPage/index.jsx

Cambios:
- Los nombres de formas de pago existentes son editables desde Financiamiento.
- Solo el usuario superuser puede editar nombres o agregar nuevas formas de pago.
- Enc. Comercial puede seguir editando porcentajes y activo/inactivo, pero no nombres.
- El sistema mantiene una clave interna estable para que renombrar una forma de pago no duplique la opcion vieja.
- El selector de Forma de pago muestra el nombre editado.

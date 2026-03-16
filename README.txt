Reemplazar estos archivos en el repo:

- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/pages/QuoteDetailPage/index.jsx

Qué agrega:
- cuando un portón ya pasó de Acopio a Producción y NO requiere medición,
  el vendedor/distribuidor puede abrir la cotización final detallada con el botón
  "Editar final"
- eso reutiliza la copia/ajuste existente para que luego se envíe a Odoo
  descontando el anticipo inicial

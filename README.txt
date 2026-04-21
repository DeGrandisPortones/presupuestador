Reemplazo directo:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/api/pdf.js
- cotizador-back/src/routes/pdf.routes.js

Agrega logs para depurar PDF:
- front: payload completo y lineas antes de pedir el PDF
- front api: payload y lineas justo antes del POST
- back: body recibido, lineas recibidas, ids detectados y nombre devuelto por Odoo

Reemplazo directo.

Archivos incluidos:
- cotizador-back/src/index.js
- cotizador-back/src/routes/pdf.routes.js
- cotizador-front/src/pages/PresupuestosPage/index.jsx

Cambios:
- PDFs de presupuesto y proforma muestran nombres vivos de Odoo por product_id.
- Si cambia el nombre del producto en Odoo, el PDF toma ese nombre actualizado al generarse.
- En Mis presupuestos > Portones en Medición, los devueltos desde medición se muestran como:
  Pendiente por hacer cambios postmedición.
- Los devueltos desde medición vuelven a entrar en el filtro Portones en Medición aunque estén en draft.

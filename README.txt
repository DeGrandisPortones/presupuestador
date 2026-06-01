ZIP directo para reemplazar archivos desde la raiz del repo.

Incluye:
- cotizador-back/src/routes/odoo.routes.js
- cotizador-front/src/pages/CotizadorPage/index.jsx

Cambios:
1) El presupuestador usa la lista de precios asignada al distribuidor (odoo_pricelist_id) al iniciar un presupuesto nuevo.
2) El precio base de las lineas se recalcula contra /api/odoo/prices usando esa lista asignada.
3) El backend ahora consulta Odoo con product.pricelist antes de caer al precio base del producto.
4) Si el ID interno del presupuestador difiere del ID Odoo, el frontend consulta con el ID Odoo pero actualiza la linea interna correcta.
5) Se conserva el fallback de Parante Interno/product.template para evitar precios en cero por restricciones de product.product.

Despues de reemplazar:
- Reiniciar backend/frontend.
- Recompilar/redeployar frontend.
- Probar con un usuario distribuidor que tenga odoo_pricelist_id 25, 26 o 27.

ZIP: actualizar presupuesto fecha + lista de precios

Copiar y reemplazar desde la raiz del repo.

Incluye:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-back/src/routes/quotes.routes.js

Que hace:
- Agrega el boton "Actualizar presupuesto" debajo del total, solo cuando se abre un presupuesto guardado editable.
- Muestra una confirmacion antes de sobreescribir valores.
- Reconsulta precios actuales en Odoo con la lista actual.
  - En distribuidores usa la lista asignada al usuario.
  - En otros usuarios usa la lista que tenga seleccionada el presupuesto.
- Sobreescribe los precios base de las lineas del presupuesto.
- Guarda el presupuesto actualizado.
- Actualiza la fecha de emision moviendo created_at a now() solo cuando se usa este boton.
- Guarda metadata en payload: quote_issued_at, quote_issued_date, price_refreshed_at, refreshed_pricelist_id.

Despues de copiar:
1) Reiniciar backend.
2) Recompilar/redeployar frontend sin cache.
3) Refrescar navegador con Ctrl+F5.

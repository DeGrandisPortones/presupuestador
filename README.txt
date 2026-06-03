FIX LISTA PREDETERMINADA PARA VENDEDORES / ENC. COMERCIAL

Copiar y reemplazar estos archivos:

- cotizador-back/src/routes/quotes.routes.js
- cotizador-back/src/routes/odoo.routes.js

Que cambia:

1) Usuarios NO distribuidores:
   - Siempre usan Lista Predeterminada ID 1.
   - Aplica al consultar precios desde el presupuestador.
   - Aplica al guardar/actualizar presupuestos.
   - Aplica al crear NP/NV en Odoo.
   - Aplica a Portones, Ipanels, Puertas y Otros.

2) Usuarios distribuidores:
   - Siguen usando su lista asignada.
   - No se modifica la logica de listas de distribuidores.

3) /api/odoo/pricelists ahora devuelve las listas ordenadas por ID ascendente,
   para que la Predeterminada ID 1 quede primero.

Despues de copiar:
- Reiniciar backend.
- Recompilar/redeployar frontend solo si lo tenes cacheado, aunque el cambio principal esta en backend.
- Refrescar navegador con Ctrl+F5.

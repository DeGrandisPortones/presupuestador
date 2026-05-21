# Debug Odoo en Data + filtro productos sin tag

Copiar y reemplazar sobre la raiz del repo. Luego redeployar frontend y backend.

## Cambios backend

- Mantiene el endpoint autenticado:
  - `/api/catalog/odoo-product-debug?product_id=2894`
  - `/api/catalog/odoo-product-debug?template_id=3006`
  - `/api/catalog/odoo-product-debug?q=Estructura%20aluminio`
- El endpoint usa el token de sesion si se llama desde el frontend.
- Todos los catalogos filtran productos sin tags de Odoo.

## Cambios frontend

- En Dashboard > Data > Productos del catalogo, se agrega la columna `Odoo`.
- Cada producto tiene el boton `Ver JSON Odoo`.
- Al hacer click, el frontend llama al backend con el token actual y muestra el JSON en un modal.
- Incluye boton `Copiar JSON`.

# Debug Tag Puerta en Dashboard Data

Copiar y reemplazar sobre la raiz del repositorio y redeployar backend + frontend.

## Que agrega

- Endpoint autenticado:
  - `/api/catalog/odoo-tag-debug?tag_name=Puerta&q=SIN%20PUERTA&template_id=3006`
- Al entrar a Dashboard > Data, el front hace automaticamente:
  - GET `/api/catalog/odoo-tag-debug`
  - GET `/api/catalog/odoo-product-debug`
- Los resultados aparecen en la consola del navegador con el grupo:
  - `[DATA ODOO DEBUG] Tag/Puerta y producto`
- El backend tambien loguea en Render:
  - `[ODOO TAG DEBUG]`

## Como verlo

1. Entrar al Dashboard.
2. Ir a Data.
3. Seleccionar el tag Puerta.
4. Abrir DevTools > Console.
5. Buscar `[DATA ODOO DEBUG]`.

## Que mirar

- `matching_tags`: si Odoo esta devolviendo el tag Puerta.
- `products_with_tag_by_id_count`: si algun producto del bootstrap matchea Puerta por ID.
- `products_with_tag_by_name_count`: si algun producto matchea Puerta por nombre.
- `product_debug_by_query`: como Odoo devuelve el producto SIN PUERTA.
- `detected_tag_fields`: campos de etiquetas detectados en `product.product` y `product.template`.

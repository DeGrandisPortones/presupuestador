# Fix tags Puerta y productos sin tag

Copiar y reemplazar sobre la raiz del repositorio y redeployar backend + frontend.

## Cambios

- El backend sigue filtrando todos los catalogos para que no entren productos sin tags reales de Odoo.
- La lectura de Odoo ahora inspecciona `fields_get` y toma todos los campos many2many que realmente parezcan etiquetas, no solo una lista fija.
- El catalogo detecta Puerta/Ipanel por ID y tambien por nombre resuelto del tag en `tag_debug`.
- Cada tag ahora informa:
  - `raw_product_count`: cuantos productos vendibles de Odoo traen ese tag.
  - `catalog_product_count`: cuantos productos del catalogo actual traen ese tag.
- En Dashboard > Data, el selector de tags muestra solo tags presentes en los productos visibles del catalogo actual. Esto evita ver un tag global con cero productos en ese catalogo.

## Diagnostico

Si el tag Puerta aparece en Tags -> Secciones pero no en Data, ahora mirar:

- En Data, boton `Ver JSON Odoo` sobre el producto.
- Campos utiles del JSON:
  - `detected_fields`
  - `raw_tag_refs`
  - `tags_resolved`
  - `tag_debug`


# Fix tags Odoo + filtro sin tags

Copiar y reemplazar sobre la raiz del repositorio. Luego redeployar backend.

## Cambios

- El presupuestador ya no trae productos sin tags de Odoo para ningun catalogo: Portones, Ipanel, Puertas u Otros.
- Se agrego un GET real a Odoo para inspeccionar como llegan los tags del producto.
- El mapeo Tag -> Seccion conserva los IDs existentes de product.tag/product.template.tag.
- Si Odoo devuelve el mismo tag por otro modelo con el mismo nombre, se intenta resolver la seccion por nombre normalizado para no perder asignaciones previas.

## Endpoint de diagnostico

Con sesion iniciada, abrir en navegador:

/api/catalog/odoo-product-debug?product_id=2894
/api/catalog/odoo-product-debug?template_id=3006
/api/catalog/odoo-product-debug?q=Estructura%20aluminio

El JSON muestra:

- campos de tags detectados en product.product
- campos de tags detectados en product.template
- raw_tag_refs con campo, modelo, ID crudo e ID estable
- tags_resolved con nombre final del tag
- raw con lo que devolvio Odoo

## Despues de deployar

Entrar al Dashboard y tocar Refrescar catalogo.

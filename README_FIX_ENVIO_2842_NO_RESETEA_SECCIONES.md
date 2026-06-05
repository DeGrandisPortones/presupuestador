# Fix Envio 2842 - no resetear secciones al editar cantidad

Correccion incluida:

- La edicion de cantidad/precio de lineas ya no fuerza el recatalogado visual de secciones.
- `SectionCatalog` ahora observa una clave estable de seleccion basada solo en IDs de productos, no en cantidad/precio.
- Cambiar la cantidad del producto Envio 2842 ya no dispara el regreso a la primera seccion.
- La actualizacion automatica de precios no se dispara por cambios de cantidad del producto Envio 2842.

Alcance:
- No cambia calculos.
- No cambia PDFs.
- No cambia Odoo.
- Solo corrige comportamiento de interfaz al editar cantidad/precio de lineas editables.

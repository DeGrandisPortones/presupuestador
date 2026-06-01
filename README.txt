ZIP directo para copiar y reemplazar.

Archivo incluido:
- cotizador-back/src/routes/odoo.routes.js

Que corrige:
- El precio automatico de Parante Interno en portones aptos para revestir.
- Si Odoo devuelve precio 0 desde product.product, ahora intenta leer el precio desde product.template.
- Tambien contempla el caso frecuente en Odoo donde el ID que se ve en /odoo/products/<id> corresponde a la plantilla del producto y no a la variante.

Despues de copiar:
1) Reiniciar backend.
2) Recargar el presupuesto con Ctrl+F5.
3) Probar un porton apto para revestir con parantes internos.

No hace falta cargar una regla en la lista de precios Predeterminado si el producto ya tiene Precio de venta cargado en su ficha.

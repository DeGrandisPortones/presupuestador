ZIP directo para copiar y reemplazar.

Archivo incluido:
- cotizador-back/src/routes/odoo.routes.js

Cambio:
- Corrige el cálculo de precios de /api/odoo/prices para productos cuya variante product.product tiene list_price = 0 pero cuya plantilla product.template sí tiene precio de venta.
- Esto evita que el parante interno automático de portones aptos para revestir se agregue con precio $0.

Aplicación:
1. Descomprimir este ZIP sobre la raíz del repo.
2. Reemplazar archivos.
3. Reiniciar backend.
4. Recargar el presupuesto.

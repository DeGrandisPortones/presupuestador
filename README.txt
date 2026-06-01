ZIP directo para reemplazar desde la raiz del repo.

Incluye:
- cotizador-back/src/routes/odoo.routes.js

Cambio:
- /api/odoo/prices ahora revisa las reglas reales de product.pricelist.item antes de caer al precio predeterminado del producto.
- Esto permite que un distribuidor con Lista 6 (id 27) vea como precio base el precio fijo cargado en esa lista.
- Mantiene los arreglos anteriores para Parante Interno/product.template.

Despues de copiar:
1) Reiniciar backend.
2) Probar en consola:

fetch("/api/odoo/prices", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("presupuestador_token")}`
  },
  body: JSON.stringify({ pricelist_id: 27, partner_id: null, lines: [{ product_id: 3008, qty: 1 }] })
}).then(r => r.json()).then(console.log);

Debe devolver el precio de Lista 6, por ejemplo 136469.75 para el producto 3008 si esa regla esta cargada en Odoo.

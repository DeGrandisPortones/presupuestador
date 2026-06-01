ZIP directo para copiar y reemplazar.

Archivo incluido:
- cotizador-back/src/routes/odoo.routes.js

Objetivo:
- Evitar que el precio del Parante Interno quede en 0 cuando Odoo restringe lectura sobre product.product.
- El endpoint /api/odoo/prices ya no corta si no puede leer product.product; intenta leer product.template con el mismo ID y/o template_id informado.
- El endpoint /api/odoo/debug-product/:id ahora responde el resultado parcial aunque product.product este restringido, incluyendo el intento contra product.template.

Despues de copiar:
1) Reiniciar backend.
2) Refrescar el navegador con Ctrl+F5.
3) Probar en consola:

fetch('/api/odoo/debug-product/3538')
  .then(r => r.json())
  .then(console.log);

fetch('/api/odoo/prices', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pricelist_id: 1, partner_id: null, lines: [{ product_id: 3538, qty: 1 }] })
})
  .then(r => r.json())
  .then(console.log);

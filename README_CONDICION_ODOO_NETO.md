# Cambio: precios enviados a Odoo según condición

Este paquete modifica el envío de precios a Odoo:

- Condición 1: envía neto, sin IVA.
- Condición 2: envía neto + 10,5%.
- Condición especial: mantiene criterio de Condición 1 salvo que se defina otra regla en el futuro.
- En la nota/detalle enviado a Odoo se agrega al final: `Condición vendida: ...`.

Archivos modificados:

- `cotizador-back/src/routes/quotes.routes.js`
- `cotizador-back/src/measurementFinalization.js`

Validación ejecutada:

```bash
node --check cotizador-back/src/routes/quotes.routes.js
node --check cotizador-back/src/measurementFinalization.js
```

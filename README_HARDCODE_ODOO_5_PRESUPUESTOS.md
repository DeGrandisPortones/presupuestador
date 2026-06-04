# Hardcode Odoo - 5 presupuestos puntuales

Este entregable parte del último zip `presupuestador_plegados_distribuidores_auth_fix.zip` y agrega un hardcode controlado en:

- `cotizador-back/src/routes/quotes.routes.js`

## Casos incluidos

| quote_id | Presupuesto | Tipo | Referencia Odoo | Monto forzado | Destino |
|---|---:|---|---|---:|---|
| 4ecc5ed8-f41d-41dd-93d2-7e90c718debf | 5330 | NV | NV4238 | 3486887.45 | Producción |
| 27c8625d-6b44-4293-8d8d-8d580ebc7a91 | 5329 | NV | NV4237 | 3220305.39 | Producción |
| 55f11cf2-1205-4bd2-9471-ca7d1109b4ff | 5327 | NP | NP4236 | 3371576.90 | Acopio |
| 035c6c9b-a07d-474e-9c31-744c379b6fe7 | 5325 | NV | NV4235 | 4223523.26 | Producción |
| 3e3ec6a3-af1a-4c86-8471-39dbcf372533 | 5305 | NV | NV4231 | 1662817.53 | Producción |

## Comportamiento

- Solo aplica si el `quote_id` coincide exactamente.
- Para los casos `NV`, al aprobar Técnica se fuerza la creación como final directa NV con el número indicado.
- Para el caso `NP`, se fuerza la creación de NP con el número indicado.
- El monto enviado a Odoo se ajusta para que coincida con el monto indicado.
- El flujo normal queda igual para todos los demás presupuestos.
- Si Odoo no permite renombrar la orden al número indicado, el backend devuelve error y no marca el presupuesto como sincronizado.

## Validación realizada

```bash
node --check cotizador-back/src/routes/quotes.routes.js
```

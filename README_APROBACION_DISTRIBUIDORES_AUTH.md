# Cambios: aprobación comercial de distribuidores y acceso Acopio

Este zip contiene archivos finales completos para copiar/reemplazar encima del repo.
No contiene scripts ni patches.

## Cambios incluidos

1. Los presupuestos creados por distribuidores ya no quedan aprobados automáticamente por Comercial.
   - Al confirmar, `commercial_decision` queda en `pending`, igual que un vendedor.
   - Se elimina la nota automática `AUTO: distribuidor`.
   - La bandeja de Aprobación Comercial ahora lista también presupuestos de distribuidores pendientes.
   - El endpoint de revisión comercial permite aprobar/rechazar presupuestos de distribuidores.

2. Enc. Comercial puede abrir presupuestos de Acopio aunque sean de distribuidores.
   - Se corrigió el permiso de `GET /api/quotes/:id`.
   - Esto también corrige la descarga desde listados que primero lee el presupuesto.

3. Enc. Comercial puede consultar la estimación de planificación para esos presupuestos.
   - Se ajustó el permiso de lectura en `productionPlanning.js`.

## Archivos modificados relevantes

- `cotizador-back/src/routes/quotes.routes.js`
- `cotizador-back/src/productionPlanning.js`
- `cotizador-front/src/pages/QuoteDetailPage/index.jsx`

## Validación realizada

- `node --check cotizador-back/src/routes/quotes.routes.js`
- `node --check cotizador-back/src/productionPlanning.js`

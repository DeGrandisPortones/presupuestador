# Fix auditado NP Odoo al aprobar portón

Copiar y reemplazar este ZIP sobre la raíz del repositorio y redeployar el backend.

## Qué corrige

- Al aprobar Comercial + Técnica, el portón puede pasar a `syncing_odoo` y crear la NP en Odoo.
- No se bloquea la NP por `measurement_mode = tecnica_only` ni por `measurement_subtype = sin_medicion`.
- La medición / revisión técnica queda pendiente después de creada la NP.
- La NV sigue quedando para el flujo final correspondiente.

## Qué NO toca

- No toca frontend.
- No toca WhatsApp.
- No toca `measurements.routes.js`.
- No toca `measurementFinalization.js`.
- No fuerza `directFinal=false` globalmente; si quedó ese hotfix viejo, lo revierte a la lógica original.

## Archivos incluidos

- `cotizador-back/src/index.js`
- `cotizador-back/src/patches/quotesNpApprovalSyncPatch.js`

No requiere ejecutar comandos manuales.

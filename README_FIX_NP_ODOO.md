# Fix NP Odoo al aprobar portón

Copiar y reemplazar este ZIP sobre la raíz del repositorio y redeployar el backend.

## Qué corrige

- Al aprobar Comercial + Técnica, el portón vuelve a sincronizar contra Odoo para generar la NP.
- No se difiere la creación de NP por el estado de medición.
- La aprobación inicial ya no intenta ir directo a NV.
- La NV queda para el flujo final correspondiente.

## Archivos incluidos

- `cotizador-back/src/index.js`
- `cotizador-back/src/patches/quotesNpApprovalSyncPatch.js`

No requiere ejecutar comandos manuales.

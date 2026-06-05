# Fix Envío 2842: mantener sección final abierta

Cambio aplicado sobre el último paquete del presupuestador.

## Qué corrige

Al editar cantidad/precio del producto **Envío** (`ID Presupuestador/Odoo 2842`), la interfaz ya no vuelve a la primera sección del catálogo.

## Cómo funciona

- Cuando se confirma cantidad/precio del producto 2842, se marca temporalmente que debe mantenerse la sección terminal.
- `SectionCatalog` escucha esa marca y vuelve a abrir la sección visible que contiene el producto 2842.
- Si por algún motivo no encuentra la sección por producto, abre la última sección visible del flujo.
- El ajuste no cambia productos seleccionados, cálculos, PDF ni envío a Odoo.

## Archivos modificados

- `cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx`
- `cotizador-front/src/pages/CotizadorPage/components/LineRow.jsx`

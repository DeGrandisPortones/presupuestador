# Fix Envío 2842: no resetear secciones

Cambio sobre el paquete anterior:

- Se quitó la lógica de **Sección final** en dependencias.
- Se quitó el evento especial `keepTerminalSection` usado para Envío 2842.
- `SectionCatalog` ahora recuerda la última sección abierta por tipo de catálogo usando memoria de módulo + `sessionStorage`.
- Al editar cantidad/precio de Envío 2842 se actualiza la línea como una edición normal, similar al comportamiento de cantidades automáticas como parantes.
- Si el componente re-renderiza por cálculo de cantidad/precio, restaura la última sección abierta en lugar de volver a la sección inicial.

No cambia cálculo, PDF ni envío a Odoo.

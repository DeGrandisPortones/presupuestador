# Fix Envío 2842 - no resetea secciones al editar cantidad/precio

Cambios:

- La sección abierta del catálogo se conserva en `sessionStorage` por tipo de catálogo.
- Si el componente se re-renderiza o remonta mientras se edita una línea, vuelve a abrir la misma sección.
- Para el producto Envío 2842, cantidad y precio se aplican al salir del campo o presionar Enter, evitando actualizaciones de estado en cada tecla.
- No cambia cálculo, PDF ni envío a Odoo.

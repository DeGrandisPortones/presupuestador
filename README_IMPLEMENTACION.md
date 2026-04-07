# Implementación · Tolerancia por superficie (m²)

Este paquete cambia la lógica de tolerancia final:

- deja de usar porcentaje sobre dinero
- pasa a usar tolerancia fija en m²
- la diferencia de superficie dentro de esa tolerancia no se cobra
- los agregados extra se siguen cobrando siempre
- la base para la final sigue siendo la cotización vigente (incluida la copia final si hubo acopio → producción)

## Archivos incluidos

- `cotizador-back/src/settingsDb.js`
- `cotizador-back/src/measurementFinalization.js`
- `cotizador-front/src/api/admin.js`
- `cotizador-front/src/pages/DashboardPage/index.jsx`

## Qué hace el backend nuevo

1. Toma la cotización base vigente.
2. Detecta la superficie original desde `payload.dimensions.width` y `payload.dimensions.height`.
3. Detecta la superficie final desde `alto_final_mm` y `ancho_final_mm`.
4. Si hay líneas con `uses_surface_quantity` o `use_surface_qty`, ajusta esas cantidades al área final.
5. Calcula cuántos m² exceden la tolerancia configurada.
6. Absorbe solo la parte de superficie dentro de tolerancia.
7. Mantiene cobrables los agregados extra.

## Setting nuevo

En settings ahora se usa:

- `tolerance_area_m2`

Se mantiene `tolerance_percent` por compatibilidad, pero esta lógica nueva ya no lo usa.

## Qué revisar después de copiar

### Caso 1
Sin diferencia de superficie y sin extras:
- la final debería quedar en `NVxxxx`
- el total a cobrar debería ser `0`

### Caso 2
Diferencia de superficie menor o igual a la tolerancia:
- la parte por m² debería quedar absorbida
- si no hay extras, total `0`

### Caso 3
Diferencia de superficie mayor a la tolerancia:
- se debería cobrar solo la parte excedente

### Caso 4
Hay agregado extra, por ejemplo cerradura:
- aunque la superficie quede dentro de tolerancia, ese agregado se tiene que cobrar

## Frontend

Reemplazá `cotizador-front/src/api/admin.js` por el que viene en este zip.

Reemplazá también `cotizador-front/src/pages/DashboardPage/index.jsx` por el que viene en este zip.

Ese archivo cambia la pantalla de dashboard para que el Encargado Comercial cargue m² en vez de porcentaje.


Reemplazar completos:
- cotizador-back/src/settingsDb.js
- cotizador-back/src/measurementFinalization.js
- cotizador-front/src/api/admin.js
- cotizador-front/src/pages/DashboardPage/index.jsx

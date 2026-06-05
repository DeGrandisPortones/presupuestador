# Debug de selección de secciones del cotizador

Este paquete agrega logs temporales para encontrar quién desmarca el primer ítem/sección al editar cantidad/precio.

## Cómo activar

1. Abrir el cotizador en el navegador.
2. Abrir DevTools > Console.
3. Ejecutar:

```js
localStorage.setItem("DFLEX_DEBUG_COTIZADOR", "1");
location.reload();
```

4. Reproducir el problema.
5. En la consola, filtrar por `DFLEX`.
6. Copiar los grupos/logs donde aparezca alguno de estos eventos:
   - `forceRemoveLine`
   - `removeLine`
   - `setQty`
   - `setPortonType`
   - `autoBudget:forceRemoveLine`
   - `openSection:fallbackToFirst`
   - `getPrices:auto`

## Cómo desactivar

```js
localStorage.removeItem("DFLEX_DEBUG_COTIZADOR");
location.reload();
```

## Qué buscamos

El log que importa es el primero que muestre que desaparece el producto de la primera sección en `after`, o que dispare `forceRemoveLine` para el producto elegido de esa sección.

# Build limpio sin runtime patches

Este paquete desactiva los scripts que se ejecutaban antes de `vite build` y estaban modificando `DashboardPage/index.jsx` durante el deploy.

## Cambios

- `cotizador-front/package.json`
  - cambia `build` de:
    - `node ./scripts/apply_presupuestador_runtime_patches.cjs && vite build`
  - a:
    - `vite build`

- `cotizador-front/scripts/*.cjs`
  - quedan como scripts no-op para que, si alguna configuración vieja los ejecuta, no rompan ni muten archivos.

## Importante

No borres los scripts sin cambiar `package.json`, porque el build viejo los sigue llamando.

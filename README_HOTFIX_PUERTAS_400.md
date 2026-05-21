# Hotfix puertas - error POST /api/doors 400

Este hotfix corrige el error que ocurria al crear una puerta nueva:

- Evita que quede una puerta vacia si falla la creacion de los presupuestos internos.
- Oculta las puertas vacias generadas por el fallo anterior en la grilla.
- Asegura columnas de presupuestos antes de crear estructura/Ipanel desde `/api/doors`.
- Agrega compatibilidad: si `catalog_kind = "puerta"` todavia no esta aplicado en la BD/despliegue, la estructura se crea como `otros` marcada internamente como estructura de puerta.
- Al abrir la estructura, navega al cotizador correcto segun el `catalog_kind` real del presupuesto.

## Instalacion

Copiar el contenido del ZIP encima de la raiz del repo y redeployar frontend/backend.

Si todavia no ejecutaste el script del ZIP anterior, ejecutalo tambien:

```bash
node aplicar_cambios_puertas.cjs
```

## Puertas vacias ya creadas

Las puertas vacias que quedaron por el error anterior quedan ocultas en la pantalla. Si queres borrarlas definitivamente de la BD, podes usar el SQL incluido en `SQL_LIMPIAR_PUERTAS_VACIAS.sql`.

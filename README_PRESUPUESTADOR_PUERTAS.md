# Presupuestador Puertas

Copiar el contenido de este ZIP sobre la raíz del repositorio y reemplazar archivos. No hay que ejecutar comandos ni SQL manual.

## Cambios incluidos

- El menú **Puertas** ahora abre **Presupuestador Puertas**.
- `/puertas` redirige a `/cotizador/puerta`.
- Nuevo cotizador de puertas basado en el flujo del cotizador: cliente, forma de pago, condición, ancho, alto, catálogo, líneas y total.
- El catálogo de puertas usa `catalog_kind = "puerta"`, se arma con secciones/tags de Odoo y permite productos con tag `Puerta` / `Puertas` o tags asignados a secciones del catálogo Puerta.
- La puerta puede vincularse a un presupuesto de portón existente y copia los datos del cliente.
- Al guardar/confirmar se guarda como presupuesto normal con `catalog_kind = "puerta"`.
- El flujo de aprobación usa el mismo circuito que portones: Comercial + Técnica.
- Al generar la nota de pedido en Odoo, si la puerta está vinculada a un portón, se fuerza referencia `PNPXXXX` usando el mismo número base de la NP del portón.
- Si la puerta no está vinculada a un portón, se genera `PNP` con el número propio del presupuesto.
- Se actualizan automáticamente las constraints de BD para permitir `catalog_kind = "puerta"`.

## Archivos incluidos

- `cotizador-front/src/App.jsx`
- `cotizador-front/src/pages/MenuPage/index.jsx`
- `cotizador-front/src/pages/PresupuestadorPuertasPage/index.jsx`
- `cotizador-front/src/pages/PresupuestadorPuertasPage/components/PuertaDimensions.jsx`
- `cotizador-front/src/pages/PresupuestadorPuertasPage/components/PuertaCatalog.jsx`
- `cotizador-back/src/catalogDb.js`
- `cotizador-back/src/catalogBootstrap.js`
- `cotizador-back/src/quotesSchema.js`
- `cotizador-back/src/odoo.js`

## Después de reemplazar

Redeployar frontend y backend.

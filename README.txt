ZIP para copiar y reemplazar desde la raiz del repo.

NO incluye cambios en Mis presupuestos / PresupuestosPage.
La vinculacion se hace desde el cotizador de Ipanel u Otros, igual que en Presupuestar Puertas.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-back/src/routes/quotes.routes.js

Cambios:
- En /cotizador/ipanel aparece el bloque "Vincular a porton existente".
- En /cotizador/otros aparece el bloque "Vincular a porton existente".
- El bloque permite buscar por presupuesto, NP, NV, cliente, telefono o localidad.
- Al elegir un porton, copia cliente, destino, lista de precios y partner de facturacion si corresponde.
- Si se vincula a un porton, usa el mismo numero base:
  - Ipanel: INP / INV
  - Otros: ONP / ONV
- No agrega botones "Agregar Ipanel" ni "Agregar Otros" en Mis presupuestos.

Despues de copiar:
1. Reiniciar backend.
2. Recompilar/redeployar frontend.
3. Refrescar navegador con Ctrl+F5.

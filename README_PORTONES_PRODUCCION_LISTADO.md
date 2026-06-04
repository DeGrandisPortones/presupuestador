# Listado de portones enviados a produccion

Incluye un nuevo listado en Aprobacion Comercial y Tecnica para ver los portones que ya quedaron enviados efectivamente a produccion luego de la aprobacion tecnica final.

## Frontend
- `cotizador-front/src/pages/AprobacionComercialPage/index.jsx`
  - Nueva pestana: `Portones enviados a Produccion`.
  - Lista fecha de envio, vendedor/distribuidor, cliente, direccion, NV, semana de produccion y observacion.
  - Permite abrir el detalle y descargar PDF.

- `cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx`
  - Nueva pestana: `Portones enviados a Produccion`.
  - Lista fecha de envio, vendedor/distribuidor, cliente, direccion, NV, semana de produccion y observacion.
  - Permite abrir el detalle.

## Backend
- `cotizador-back/src/routes/quotes.routes.js`
  - Nuevo scope de `GET /quotes`: `production_sent`.
  - Accesible para Enc. Comercial y Revision Tecnica.
  - Devuelve solo presupuestos originales de porton que ya tienen NV/final sincronizado o copia final sincronizada.
  - Evita mostrar NV directa antes de la aprobacion tecnica final: exige `measurement_status='approved'` para esos casos.

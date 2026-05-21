# Actualizacion puertas - estructura propia + Ipanel automatico

## Instalacion

1. Hacer backup del repositorio actual.
2. Descomprimir este ZIP en la raiz del repo `presupuestador`, dejando que reemplace archivos existentes.
3. Ejecutar una vez desde la raiz del repo:

```bash
node aplicar_cambios_puertas.cjs
```

4. Reiniciar backend y frontend.

El script crea backups automaticos de los archivos que parcha con sufijo `.bak_puertas_<fecha>`.

## Cambios incluidos

- Un porton puede tener varias puertas vinculadas.
- Se elimina el indice unico `presupuestador_doors_linked_quote_uidx` y se reemplaza por indice normal.
- La puerta deja de requerir proveedor, compra de marco y venta de marco.
- La puerta ahora trabaja como:
  - estructura propia: `catalog_kind = "puerta"`;
  - revestimiento: Ipanel automatico `catalog_kind = "ipanel"`.
- Al crear una puerta se generan automaticamente:
  - presupuesto de estructura de puerta;
  - presupuesto Ipanel vinculado.
- La puerta debe estar vinculada a un presupuesto de porton para confirmarse.
- La venta Odoo de puerta se genera con codigo `PXXXX`, tomando el numero del porton vinculado.
- Nueva pantalla superusuario: `Reglas Tecnicas puertas`.
- Las reglas tecnicas calculan medidas del Ipanel desde las medidas cargadas en la puerta.

## Archivos de reemplazo directo

- `cotizador-back/src/doorsSchema.js`
- `cotizador-back/src/routes/doors.routes.js`
- `cotizador-back/src/doorTechnicalRulesDb.js`
- `cotizador-front/src/api/doors.js`
- `cotizador-front/src/pages/PuertasPage/index.jsx`
- `cotizador-front/src/pages/PuertaPanelPage/index.jsx`
- `cotizador-front/src/pages/PuertaWorkflowPage/index.jsx`
- `cotizador-front/src/pages/PuertaChecklistPage/index.jsx`
- `cotizador-front/src/pages/SuperuserDoorTechnicalRulesPage/index.jsx`

## Archivos parchados por script

- `cotizador-back/src/catalogDb.js`
- `cotizador-back/src/catalogBootstrap.js`
- `cotizador-back/src/settingsDb.js`
- `cotizador-back/src/routes/quotes.routes.js`
- `cotizador-back/src/routes/admin.routes.js`
- `cotizador-front/src/api/admin.js`
- `cotizador-front/src/App.jsx`
- `cotizador-front/src/pages/MenuPage/index.jsx`
- `cotizador-front/src/pages/CotizadorPage/index.jsx`

## Nota importante sobre `PXXXX`

Si el porton vinculado es `NP1234` o `NV1234`, la puerta queda como `P1234`.
Si hay varias puertas vinculadas al mismo porton, todas comparten la referencia base `P1234` como pediste. En la linea de Odoo se agrega tambien el ID interno de la puerta para distinguirlas.

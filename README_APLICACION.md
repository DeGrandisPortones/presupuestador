# Presupuestador - paquete de cambios

Este zip contiene:

- **Archivos completos para reemplazar** (copiar y pegar encima del repo)
- **Notas de merge manual** para los archivos más grandes que también necesitan ajuste

## Archivos completos incluidos

- `cotizador-front/src/domain/quote/store.js`
- `cotizador-front/src/pages/CotizadorPage/components/HeaderBar.jsx`
- `cotizador-front/src/pages/CotizadorPage/index.jsx`
- `cotizador-front/src/api/quotes.js`
- `cotizador-front/src/pages/QuoteDetailPage/index.jsx`
- `cotizador-front/src/pages/AprobacionComercialPage/index.jsx`
- `cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx`
- `cotizador-front/src/pages/PuertaPanelPage/index.jsx`

## Merge manual adicional recomendado

Todavía hay que reflejar estos cambios en los siguientes archivos del repo original:

- `cotizador-front/src/pages/PuertaChecklistPage/index.jsx`
- `cotizador-front/src/pages/MedicionDetailPage/index.jsx`
- `cotizador-front/src/components/MeasurementReadOnlyView.jsx`
- `cotizador-back/src/routes/quotes.routes.js`
- `cotizador-back/src/routes/doors.routes.js`
- `cotizador-back/src/routes/pdf.routes.js`

## Qué ya queda cubierto con los archivos completos

1. **Nombre / Apellido** en el cotizador.
2. **Alert previo** para distribuidor antes de abrir Acopio / Producción.
3. **Modal de datos fiscales** en aprobación comercial.
4. **Listado de portones en acopio** en Comercial y Técnica.
5. **Panel de puerta** preparado para tratar la puerta como circuito separado.

## Qué falta terminar en los archivos manuales

### 1) `cotizador-front/src/pages/PuertaChecklistPage/index.jsx`

Cambios a aplicar:

- Quitar el bloqueo que impide enviar puertas vinculadas.
- Permitir elegir `fulfillment_mode` aunque la puerta esté vinculada.
- Reemplazar textos que dicen que la puerta “usa el mismo destino y confirmación del portón”.

Buscar y reemplazar:

- Donde hoy el `Select` de `Destino` está con `disabled={!canSellerEdit || isLinkedDoor}` dejarlo como `disabled={!canSellerEdit}`.
- El texto:
  - `El destino de la puerta vinculada se toma del presupuesto del portón.`
  - `La puerta vinculada se manda a aprobación cuando confirmás el presupuesto del portón.`

  cambiarlo por:
  - `La puerta vinculada ahora se maneja por separado del portón.`

- En el botón de enviar a aprobación, eliminar la condición `!isLinkedDoor`.

### 2) `cotizador-front/src/pages/MedicionDetailPage/index.jsx`

Agregar al `form`:

- `trampa_tierra: false`
- `trampa_tierra_mm: ""`

Agregar normalización:

- Si `trampa_tierra` viene como string, convertirlo a boolean con `isYes(...)`.
- Si `trampa_tierra` es `false`, vaciar `trampa_tierra_mm`.

Agregar UI en la sección `Instalación / Sistema`:

- Campo `Trampa de Tierra` con opciones `Sí / No`
- Campo `Trampa de Tierra (mm)` visible solo si la respuesta es `Sí`

### 3) `cotizador-front/src/components/MeasurementReadOnlyView.jsx`

En la sección `Instalación / Sistema`, agregar:

- `Trampa de Tierra` => `Sí / No`
- `Trampa de Tierra (mm)` => valor o `No aplica`

### 4) `cotizador-back/src/routes/pdf.routes.js`

En `renderMeasurementPdf`, dentro de la sección `Instalación / Sistema`, agregar dos bloques nuevos en el `drawInfoGrid`:

- `{ label: "Trampa de Tierra", value: yn(!!pick(form, "trampa_tierra")) }`
- `{ label: "Trampa de Tierra (mm)", value: pick(form, "trampa_tierra") ? pick(form, "trampa_tierra_mm") : "—" }`

### 5) `cotizador-back/src/routes/doors.routes.js`

Cambios a aplicar:

- En `getDoorHydratedById`, dejar de forzar `record.fulfillment_mode = linked_quote_fulfillment_mode`.
- En `router.put('/:id')`, dejar de sobrescribir `fulfillment_mode` desde el quote vinculado.
- En `router.post('/:id/submit')`, eliminar este bloqueo:

```js
if (door.linked_quote_id) return res.status(409).json({ ok: false, error: "La puerta vinculada se envía a aprobación cuando confirmás el presupuesto del portón." });
```

### 6) `cotizador-back/src/routes/quotes.routes.js`

Cambios a aplicar:

- En el `scope` del listado, agregar:
  - `commercial_acopio_all`
  - `technical_acopio_all`

  Ambos deben devolver presupuestos `original` con `fulfillment_mode = 'acopio'`.

- En `review/commercial`, aceptar `billing_customer` en `req.body`, guardarlo dentro de `payload.billing_customer` y usarlo luego para Odoo.

- En las funciones que generan partner para Odoo (`syncQuoteToOdoo`, `syncFinalQuoteToOdoo`, `syncDirectProductionFinalToOdoo`), si existe `payload.billing_customer`, usar ese cliente; si no existe, usar `end_customer`.

- Quitar la llamada que dispara automáticamente la puerta vinculada al confirmar el portón.

### 7) `cotizador-front/src/pages/CotizadorPage/index.jsx`

Este archivo ya está incluido completo en el zip y **ya no** dispara la sincronización automática de la puerta vinculada desde frontend.

## Nota

Este paquete prioriza que puedas **copiar y pegar rápido** los archivos más visibles del flujo. Para cerrar el 100% funcional, conviene aplicar también los merges manuales de arriba.

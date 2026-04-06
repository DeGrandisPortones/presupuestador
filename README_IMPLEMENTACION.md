# Paquete de cambios · WhatsApp + final a Odoo desde base original/acopio

Este zip está pensado para aplicar **encima del paquete anterior de medición con revisión comercial**.

## Archivo incluido
- `cotizador-back/src/measurementFinalization.js`

## Qué corrige
1. **WhatsApp automático al aprobar Técnica**
   - Cuando Técnica aprueba la planilla/detalle técnico y el presupuesto tiene teléfono, se arma automáticamente el mensaje con el link público de la planilla aprobada.
   - El envío se hace por **WhatsApp Cloud API** si están configuradas las variables de entorno.

2. **Cotización final a Odoo basada en la cotización correcta**
   - La finalización ya no arma la venta sólo con extras de medición.
   - Toma como base el presupuesto vigente:
     - el **original** si no hay ajuste final,
     - o la **copia/final** (`final_copy_id`) si el portón vino de **Acopio → Producción**.
   - Encima de esa base aplica los cambios aprobados desde medición/comercial.

3. **Cotización final a cero cuando corresponde**
   - Si no hubo modificación real contra el presupuesto base, o si la diferencia queda absorbida por tolerancia, igual arma la cotización final y la sincroniza a Odoo con total final a cobrar `0`.

## Variables de entorno para WhatsApp
Tenés que configurar estas variables en el backend para que el envío sea real:

- `PUBLIC_BASE_URL`
  - ejemplo: `https://tu-dominio.com`
  - se usa para construir el link público a la planilla aprobada.
- `WHATSAPP_CLOUD_API_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- opcional: `WHATSAPP_GRAPH_VERSION`
  - por defecto usa `v20.0`

## Cómo funciona el link
El mensaje apunta a:

`PUBLIC_BASE_URL/api/pdf/medicion/public/:token`

El token ya lo genera el flujo actual cuando Técnica aprueba.

## Importante
- No hizo falta tocar `measurements.routes.js` porque ese flujo ya llama a `finalizeMeasurementToRevisionQuote(...)` en los dos puntos de aprobación técnica.
- Si WhatsApp no está configurado, la aprobación sigue funcionando igual y la finalización a Odoo también.
- Si existe `final_copy_id`, la final toma esa copia como base para respetar los cambios del paso **Acopio → Producción**.
- Se excluyen de la base las líneas de medición y la línea placeholder de descuento anterior, para no duplicarlas.

## Recomendado para probar
1. Caso producción directa, sin cambios:
   - Técnica aprueba.
   - Debe generarse final en Odoo con total a cobrar `0`.
   - Debe prepararse/enviarse el WhatsApp.

2. Caso Acopio → Producción con ajuste:
   - Ajustar presupuesto desde acopio.
   - Pasarlo a producción.
   - Aprobar medición/técnica.
   - La final a Odoo debe tomar la **copia final** como base.

3. Caso con cambio comercial en medición:
   - Comercial modifica un ítem disparador.
   - Técnica aprueba.
   - La final debe reflejar esa sustitución sobre la base vigente.

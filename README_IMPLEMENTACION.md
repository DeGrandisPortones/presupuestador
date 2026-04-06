# Paquete de cambios · Medición con revisión comercial

Este zip está armado para **copiar y pegar** dentro del repo `presupuestador`.

## Qué incluye
### Backend
- `cotizador-back/src/settingsDb.js`
- `cotizador-back/src/quotesSchema.js`
- `cotizador-back/src/measurementFinalization.js`
- `cotizador-back/src/routes/measurements.routes.js`

### Frontend
- `cotizador-front/src/api/measurements.js`
- `cotizador-front/src/domain/measurement/technicalMeasurementRuleFields.js`
- `cotizador-front/src/pages/AprobacionComercialPage/index.jsx`
- `cotizador-front/src/pages/MedicionDetailPage/index.jsx`

### Notas de integración
- `PATCH_superuser_measurement_rules_page.md`

## Flujo implementado
1. Cada campo técnico puede tener `send_modification_to_commercial`.
2. Cuando el medidor envía la medición:
   - si no tocó ningún campo marcado, pasa a `submitted` y sigue a técnica;
   - si tocó al menos uno, pasa a `commercial_review`.
3. En `commercial_review`:
   - comercial ve el diff;
   - sólo puede editar los campos enviados a comercial;
   - ve el preview económico y las líneas que dispararían a Odoo;
   - al confirmar, pasa a `submitted`.
4. Técnica recién entra después.
5. Se agregó persistencia de:
   - `measurement_original_form`
   - `measurement_commercial_review_required`
   - `measurement_commercial_review_status`
   - `measurement_commercial_review_by_user_id`
   - `measurement_commercial_review_at`
   - `measurement_commercial_diff_json`

## Importante
- El preview económico reutiliza lógica de finalización, pero sin sincronizar todavía a Odoo.
- Dejé la pantalla de revisión comercial de medición integrada en:
  - `/aprobacion/comercial` → pestaña **Mediciones**
  - `/mediciones/:id` para revisar y aprobar
- La pantalla de superusuario para exponer el checkbox nuevo la dejé documentada en `PATCH_superuser_measurement_rules_page.md` porque ya es una pantalla grande y preferí no reemplazarla completa a ciegas.

## Recomendado antes de subir
1. Copiar estos archivos.
2. Aplicar el patch del dashboard de reglas técnicas.
3. Levantar front y back.
4. Probar estos casos:
   - medición sin cambios comerciales → va directo a técnica
   - medición con cambio comercial → va a comercial
   - comercial corrige un campo → pasa a técnica
   - técnica aprueba → finaliza y sincroniza

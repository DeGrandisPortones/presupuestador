PATCH - localidad + corrección de contacto en medición + revisión técnica previa a WhatsApp

Incluye:
- Localidad en presupuestos (end_customer.city)
- Campo de correo visible en presupuesto
- Validaciones front para teléfono AR, correo y Google Maps
- Localidad visible en listados de Presupuestos y Mediciones
- En Medición se pueden corregir teléfono / correo / Google Maps
- Nuevo flujo:
  Medidor completa -> envía a Técnica
  Técnica revisa / puede editar la planilla -> aprueba y abre WhatsApp
  Técnica también puede devolver a corregir

Archivos:
- cotizador-front/src/utils/contactValidation.js
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/components/HeaderBar.jsx
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/PresupuestosPage/index.jsx
- cotizador-front/src/pages/MedicionesPage/index.jsx
- cotizador-front/src/pages/MedicionDetailPage/index.jsx
- cotizador-front/src/pages/AprobacionTecnicaPage/index.jsx
- cotizador-front/src/api/measurements.js
- cotizador-back/src/routes/measurements.routes.js

Nota:
- Este patch deja endurecida la validación del flujo de mediciones en backend.
- La validación estricta del submit de presupuestos quedó implementada en frontend (UI), y la localidad se persiste en end_customer.city.

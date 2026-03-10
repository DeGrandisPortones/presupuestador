Parche Puerta / Checklist

Incluye:
- cotizador-front/src/App.jsx
- cotizador-front/src/api/doors.js
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/PuertaChecklistPage/index.jsx
- cotizador-back/src/index.js
- cotizador-back/src/doorsSchema.js
- cotizador-back/src/routes/doors.routes.js

Qué hace:
- Agrega el botón "Puerta" sólo en el cotizador de portones y sólo para vendedores.
- Si el presupuesto de portón todavía no existe, primero lo guarda en draft.
- Crea (o reutiliza) un checklist de puerta ligado al presupuesto de portón.
- Si el portón ya tiene número Odoo (ej. S02049), la puerta muestra código PS02049.
- El formulario toma como base la hoja "Checklist" del Excel subido.

Notas:
- El checklist se guarda en la nueva tabla public.presupuestador_doors.
- Se asume relación 1 a 1 entre portón y puerta (índice único por linked_quote_id).

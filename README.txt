Presupuestador - Financiamiento editable y tipos manuales

Copiar el contenido de este ZIP sobre la raiz del repo.
Reemplaza/agrega estos archivos:

- cotizador-back/src/index.js
- cotizador-back/src/routes/financingSettings.routes.js
- cotizador-front/src/App.jsx
- cotizador-front/src/api/financingSettings.js
- cotizador-front/src/api/odoo.js
- cotizador-front/src/pages/MenuPage/index.jsx
- cotizador-front/src/pages/FinanciamientoPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/HeaderBar.jsx
- cotizador-front/src/pages/CotizadorPage/components/LinesTable.jsx

Cambios:

1) Menu Financiamiento
- Visible para superusuario y Enc. Comercial.
- Permite editar porcentajes de recargo.
- Permite agregar nuevos tipos/formas de financiamiento manuales.

2) Cotizador
- El selector Forma de pago conserva las opciones existentes y suma las formas agregadas en Financiamiento.
- Al elegir una forma agregada, usa el porcentaje configurado en Presupuestador.
- Si no hay configuracion guardada para una forma existente, se mantiene la referencia de Odoo.
- Los items muestran precio final y total de linea con recargo aplicado.

3) Backend
- Agrega /api/financing-settings/payment-methods para cargar tipos agregados.
- Mantiene /api/financing-settings/preview para calcular el recargo efectivo.
- No toca tablas de presupuestos ni confirmaciones/Odoo.

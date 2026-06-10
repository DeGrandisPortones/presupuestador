# Cambio aplicado: búsqueda automática de cliente fiscal en Odoo por CUIT/CUIL

Reemplazar estos archivos en el proyecto:

- cotizador-front/src/pages/QuoteDetailPage/index.jsx
- cotizador-front/src/api/odoo.js
- cotizador-back/src/routes/odoo.routes.js

Comportamiento:

- En Condición 1, el primer dato fiscal a cargar es CUIT/CUIL.
- Al completar 11 dígitos, busca automáticamente en Odoo.
- Si encuentra el cliente, completa razón social, identificación, responsabilidad AFIP, email, teléfono, dirección y localidad.
- Si no lo encuentra, avisa que el cliente no existe en Odoo y permite seguir cargando manualmente.

No se tocaron otros archivos ni lógica de portones/ipanels/puertas/parantes.

# Buscador de datos de cliente existente

Reemplazar estos archivos en el proyecto:

- cotizador-front/src/pages/CotizadorPage/components/HeaderBar.jsx
- cotizador-front/src/api/quotes.js
- cotizador-back/src/routes/quotes.routes.js

Cambios incluidos:

- Botón "Datos cliente existente" en la carga del presupuesto.
- Modal de búsqueda por nombre, apellido, teléfono, email, localidad, dirección, número de presupuesto o referencia Odoo.
- Endpoint backend `/api/quotes/customer-lookup` filtrado por el vendedor/distribuidor logueado.
- Al seleccionar un resultado, completa nombre, apellido, teléfono, correo, dirección, localidad y URL de Google Maps.

No modifica líneas, precios, condiciones, parantes, Ipanels ni Puertas.

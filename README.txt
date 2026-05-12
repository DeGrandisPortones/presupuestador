Cambio: tarjeta de aprobación comercial/técnica

Copiar la carpeta cotizador-front sobre la raíz del repo.

Incluye:
- cotizador-front/src/pages/QuoteDetailPage/index.jsx

Qué cambia:
- Se elimina el campo "Productos clave" de la tarjeta "Datos técnicos y comerciales para aprobar".
- Se agrega/asegura el campo "Cantidad de parantes".
- Si el presupuesto no trae una cantidad guardada, se calcula la sugerida igual que en el cotizador: ancho completo si está el producto de parantes especiales, o ancho - 0.80 m si no lo está.

No modifica aprobaciones, cálculo de precios, PDF, Odoo ni mediciones.

Reemplazar este archivo en el repo:
- cotizador-back/src/routes/quotes.routes.js

Cambio aplicado:
- Corrige el bug de placeholders en POST /api/quotes/:id/submit que disparaba:
  could not determine data type of parameter $2

Nuevo mapeo correcto de parametros en la query:
- $1 id
- $2 fulfillment_mode
- $3 commercial_decision
- $4 technical_decision
- $5 requires_measurement
- $6 measurement_status

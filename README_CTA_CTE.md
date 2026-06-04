# Cambios incluidos

Este zip contiene archivos finales completos para copiar/pegar encima del repo.
No contiene patch ni script aplicador.

Incluye los cambios previos de Plegados y suma:

- Nueva forma de pago: `Cta Cte`.
- `Cta Cte` aparece en el selector principal de formas de pago, junto a Efectivo, Transferencia y Cheques.
- `Cta Cte` queda con 0% de recargo/descuento por defecto.
- `Cta Cte` no habilita Condicion 2.
- Condicion 2 queda limitada a Cheque o Efectivo desde el front.
- El backend tambien rechaza confirmaciones con Condicion 2 si la forma de pago no es cheque o efectivo.

Archivos agregados/modificados por esta correccion puntual:

- cotizador-front/src/domain/quote/portonConstants.js
- cotizador-front/src/pages/CotizadorPage/components/HeaderBar.jsx
- cotizador-back/src/routes/financingSettings.routes.js
- cotizador-back/src/routes/quotes.routes.js

Validacion realizada:

- node --check sobre archivos backend modificados.

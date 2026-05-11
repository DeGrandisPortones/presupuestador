Cambio directo para copiar y pegar.

Reemplaza:
- cotizador-front/src/pages/MedicionDetailPage/index.jsx

Qué corrige:
- El alto final y ancho final se recalculan con el menor valor de las 3 medidas tomadas por el medidor.
- La medida presupuestada inicial sigue precargándose como antes.
- Al guardar/enviar, se fuerza que el formulario se persista con esos valores mínimos.
- Técnica conserva la posibilidad de editar manualmente alto/ancho final con confirmación.

Extra incluido para mantener consistencia con el cambio anterior:
- En dentro de vano, las medidas de paso descuentan una sola pierna según tipo, sin tocar el ancho final calculado.

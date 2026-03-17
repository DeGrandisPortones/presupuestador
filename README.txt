Bloque 1 - Puertas separadas en Ipanel + Marco de puerta

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/PuertaChecklistPage/index.jsx
- cotizador-front/src/pages/PuertasPage/index.jsx

Qué hace:
- El botón "Puerta" del cotizador de portones abre un popup con dos opciones:
  - Presupuesto Ipanel
  - Marco de puerta
- Presupuesto Ipanel:
  - crea o reutiliza un presupuesto de tipo ipanel
  - lo deja vinculado dentro del record del marco de puerta
  - abre el cotizador Ipanel normal
- Marco de puerta:
  - abre la ficha actual de puerta, renombrada visualmente como Marco de puerta
- La ficha de Marco de puerta ahora muestra y permite abrir el Ipanel vinculado si ya existe.
- El listado /puertas pasa a mostrarse como Marcos de puerta.

Después de copiar, reiniciar el frontend.

Este paquete agrega en el presupuesto original el entry de kg/m2 y muestra en pantalla:
- kg/m2 efectivo
- peso estimado del porton
- tipo de piernas estimadas
- deteccion de sin revestimiento por IDs configurados en reglas tecnicas

Reemplazar:
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx

Luego, en Superusuario > Reglas tecnicas, dejar la formula de superficie final como:

surface_automatica_m2

Este paquete complementa la logica de backend de los paquetes anteriores.

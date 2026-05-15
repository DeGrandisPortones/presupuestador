Archivos incluidos para copiar y reemplazar en el repo presupuestador:

1) cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
   - Activa la nueva seccion solo cuando el sistema derivado es para_revestir_con_al_pvc_otros y la distribucion de parantes es Especial.
   - Mantiene observaciones de distribucion especial.
   - Agrega distancia dentro a dentro por parante.
   - Agrega + Agregar parante, que tambien incrementa Cantidad de parantes.
   - Agrega Distribuir uniformemente.
   - Agrega boton Ver esquema de parantes con popup visual.
   - Lee el descuento del cano desde reglas tecnicas con estas keys, en orden:
     parantes_tube_discount_mm
     parantes_cano_discount_mm
     descuento_cano_parantes_mm
     descuento_tubo_parantes_mm
     parantes_tube_width_mm
   - Si no hay valor configurado, usa 40 mm.

2) cotizador-front/src/domain/quote/store.js
   - Preserva todos los campos nuevos dentro de payload.dimensions al guardar y al recargar presupuestos.
   - Antes solo recargaba width, height y kg_m2 desde dimensions; con este reemplazo no se pierden distancias de parantes.

Notas:
- No es un patch. Son archivos completos para reemplazar.
- Los datos nuevos quedan guardados en payload.dimensions:
  distancias_parantes_mm
  distancia_primer_parante_mm
  distribuir_parantes_uniformemente
  descuento_cano_parantes_mm

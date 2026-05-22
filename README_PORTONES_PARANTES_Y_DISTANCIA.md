# Fix portones: parantes y distancia fija

Copiar y reemplazar sobre la raiz del repositorio y redeployar el frontend.

## Incluye

- Restaura en Dashboard > Portones la tarjeta "Precio automatico de parantes".
- Permite cargar el ID del producto usado para parantes en reglas tecnicas de porton.
- En el cotizador de portones, para Aptos para revestir:
  - agrega automaticamente el producto configurado;
  - cantidad = cantidad de parantes;
  - vertical = precio de Odoo;
  - horizontal = precio de Odoo x2;
  - la linea queda bloqueada como automatica.
- Corrige el campo "Distancia del primer parante fijo":
  - al tildar aparece 800 por defecto;
  - permite borrar y escribir otro valor sin que vuelva a aparecer el 8;
  - si queda vacio y pierde foco, vuelve a 800.

## Archivos incluidos

- cotizador-front/package.json
- cotizador-front/scripts/apply_portones_parantes_y_distancia_patch.cjs
- cotizador-front/src/pages/CotizadorPage/components/PortonParantesPricingSync.jsx

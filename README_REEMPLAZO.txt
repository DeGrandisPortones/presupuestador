Reemplazo listo para Presupuestador
===================================

Copiar el contenido de esta carpeta sobre el proyecto, respetando rutas.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/domain/quote/store.js

Cambios incluidos:
1) Mantiene los cambios de parantes especiales para sistemas aptos para revestir:
   - Campo Distancia dentro a dentro primer parante.
   - Distancias adicionales por parante.
   - Tildecito Distribuir uniformemente.
   - Popup con esquema visual del porton segun orientacion, cantidad y distancias.
   - Descuento configurable desde reglas tecnicas con fallback de 40 mm.

2) Corrige el peso visible en el presupuestador para tipo/sistema apto para revestir:
   - Ahora el preview de la pantalla de carga busca kg/m2 igual que el PDF/vista tecnica.
   - Primero usa la tabla apto_revestir_kg_m2_rules si hay producto coincidente.
   - Si no hay coincidencia, usa kg_m2 guardado en dimensions u otros campos legacy.
   - Si tampoco hay valor, cae al kg/m2 base configurado en reglas tecnicas.
   - Con eso vuelve a mostrar Kg/m2 efectivo, Peso estimado y Piernas estimadas en apto para revestir.

Notas:
- No es patch. Son archivos completos para reemplazar.
- Si ya copiaste el zip anterior, este zip lo reemplaza y conserva esos cambios.

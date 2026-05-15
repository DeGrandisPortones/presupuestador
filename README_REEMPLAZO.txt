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
   - Descuento configurable desde reglas tecnicas con fallback de 40 mm.

2) Corrige el peso visible en el presupuestador para tipo/sistema apto para revestir:
   - El preview de la pantalla de carga busca kg/m2 igual que el PDF/vista tecnica.
   - Primero usa la tabla apto_revestir_kg_m2_rules si hay producto coincidente.
   - Si no hay coincidencia, usa kg_m2 guardado en dimensions u otros campos legacy.
   - Si tampoco hay valor, cae al kg/m2 base configurado en reglas tecnicas.

3) Ajusta el esquema de hoja y parantes:
   - El boton Ver esquema de parantes queda disponible para todos los portones, no solo aptos para revestir.
   - Los parantes laterales se dibujan siempre aparte y no se cuentan dentro de Cantidad de parantes.
   - Si el usuario carga 5 parantes, el esquema muestra: lateral inicial + 5 parantes internos + lateral final.
   - El final del porton ya no se toma como ultimo parante interno.

Notas:
- No es patch. Son archivos completos para reemplazar.
- Si ya copiaste un zip anterior, este zip lo reemplaza y conserva esos cambios.

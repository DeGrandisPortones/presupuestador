Cambio aplicado:
- Corrige las "Medidas de paso" del PDF.
- Ya no usa alto_calculado/ancho_calculado como si fueran medidas de paso.
- Ahora calcula:
  * alto_paso_mm = alto_calculado_mm - 200
  * ancho_paso_mm = ancho_calculado_mm - (ancho_pierna_mm * 2)
- Anchos de pierna usados:
  * angostas = 230 mm
  * comunes = 270 mm
  * anchas = 370 mm
  * superanchas = 370 mm
  * especiales = 370 mm

Nota:
- Dejé superanchas y especiales con 370 mm por compatibilidad, ya que no se indicó otro valor.
- No se modifican alto_calculado_mm ni ancho_calculado_mm para no romper otras fórmulas.

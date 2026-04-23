Cambio aplicado sobre el archivo completo que ya veníamos usando para preproduccion_valores.

Qué cambia:
- En el JSON que se manda a preproduccion_valores, `porton_type` ahora sale con la etiqueta visible del desplegable de sistema.
- Ejemplo:
  - antes: `acero_simil_aluminio_clasico`
  - ahora: `ACERO SIMIL ALUMINIO CLASICO`
- Además se conserva el valor técnico original en `porton_type_key`.

Campos:
- `porton_type`: etiqueta visible para mapear a propiedades como `Sistema`
- `porton_type_key`: key interna original del presupuestador

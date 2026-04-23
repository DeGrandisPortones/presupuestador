Archivo completo modificado a partir del archivo que subiste.

Qué agrega:
- cuando se genera la NV final, hace upsert en public.preproduccion_valores
- usa nv como id y nv de la fila
- guarda data con info del portón, cliente, dimensiones, measurement_form, lineas y metricas
- si existen mappings en public.preproduccion_property_mappings, también resuelve esos valores y los deja en el JSON
- no crea filas en public.portones

Además:
- intenta renombrar la sale.order final en Odoo a NVxxxx

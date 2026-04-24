Ampliación de propiedades para Asignación de propiedades a producción

Agrega:
- cliente_apellido
- cliente_nombre_completo
- vendido_por_rol
- vendido_por_nombre
- vendido_por_username
- vendedor_nombre
- distribuidor_nombre
- secciones dinámicas como rows del asignador:
  section__<slug>
  Ej: Sección: Color del revestimiento

También:
- el JSON de preproduccion_valores ahora guarda:
  - los nuevos datos del cliente
  - los datos del actor que vendió
  - sections = { section__...: "valor elegido" }
  - además copia cada section__... en la raíz del JSON
- las asignaciones pueden apuntar a propiedades del integrador usando esos nuevos source_key

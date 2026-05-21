# Restaurar tipos / sistemas automáticos de Portones

Copiar y reemplazar sobre la raíz del repositorio y redeployar el frontend.

Cambio incluido:
- En Dashboard -> Portones -> Dependencias vuelve la sección "Tipos / sistemas automáticos del portón".
- Permite configurar combinaciones de IDs de productos y asignarlas a un sistema de portón.
- Guarda esas reglas en `system_derivation_rules`, sin pisar las dependencias de secciones.
- SectionCatalog ya consume esas reglas para asignar automáticamente el tipo/sistema del portón cuando el vendedor selecciona los productos.

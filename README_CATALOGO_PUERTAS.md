# Catálogo Puertas - Dashboard

Copiar y reemplazar sobre la raíz del repositorio. No requiere comandos manuales.

## Qué agrega

- Nueva pantalla: `/dashboard/catalogo-puertas`.
- Nuevo acceso en el menú: **Catálogo Puertas**.
- Configuración exclusiva para `catalog_kind = "puerta"`:
  - crear/editar/borrar secciones,
  - marcar secciones como `Cantidad = superficie`,
  - asignar tags de Odoo a secciones,
  - generar/refrescar catálogo,
  - configurar alias internos,
  - configurar visibilidad por rol,
  - configurar nombres PDF,
  - ver vista previa del catálogo.

## Uso

1. Entrar con superusuario.
2. Menú → **Catálogo Puertas**.
3. Crear secciones.
4. Asignar tags de Odoo a esas secciones.
5. Presionar **Generar / refrescar catálogo**.
6. Entrar a **Presupuestador Puertas** y usar el catálogo.

## Nota

El paquete conserva los ajustes anteriores para permitir `catalog_kind = "puerta"` en backend y base de datos al redeployar.

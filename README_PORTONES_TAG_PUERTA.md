# Hotfix: Tag Puerta en Portones

Copiar y reemplazar sobre la raiz del repositorio.

Este paquete corrige la separacion entre:

- Tag `Puerta` dentro de Portones = puerta de escape / puerta dentro del porton.
- Catalogo `puerta` = presupuestador de puertas de acceso/casa.

Cambios incluidos:

- En `catalog_kind=porton`, los productos con tag `Puerta` vuelven a entrar al catalogo.
- En Portones solo se excluyen productos de Ipanel; no se excluye `Puerta`.
- En `catalog_kind=puerta`, ya no entra automaticamente el tag `Puerta`; solo entran tags asignados a secciones del catalogo Puertas.
- Se mantiene la regla de no traer productos sin tags reales de Odoo.
- Se mantiene la lectura segura de tags de Odoo para evitar 400 si un campo de etiqueta no se puede leer.

Despues de redeployar backend/frontend:

1. Ir a Dashboard.
2. Seleccionar Portones.
3. Tocar Refrescar catalogo.
4. En Data, el tag Puerta debe volver a mostrar productos de puerta de escape.

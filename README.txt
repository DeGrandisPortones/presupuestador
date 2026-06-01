ZIP directo para copiar y reemplazar.

Reemplaza:
  cotizador-front/src/pages/CotizadorPage/components/PortonParantesPricingSync.jsx

Motivo:
- La línea automática de parantes para portón apto para revestir estaba tomando el ID 3006.
- /api/odoo/prices confirmó que 3006 corresponde a "SIN PUERTA DE PASO PEATONAL" y devuelve precio 0.
- El producto correcto de Odoo para "Parante Interno" es 3538 y devuelve precio 9917.4.

Cambio:
- La línea automática conserva el ID configurado como presupuestador_product_id/catalog_product_id.
- Para precio y para Odoo usa el ID real 3538 cuando detecta el caso 3006.
- No toca backend ni otros archivos.

Pasos:
1. Copiar el contenido del ZIP sobre la raíz del repo.
2. Recompilar/redeployar frontend.
3. Refrescar el navegador con Ctrl+F5.

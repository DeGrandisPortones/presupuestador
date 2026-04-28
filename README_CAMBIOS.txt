Cambios incluidos en este paquete
=================================

Aplicar copiando el contenido del ZIP sobre la raiz del repo y reemplazando archivos.

Archivos modificados:
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx
- cotizador-back/src/catalogDb.js

Cambios ya incluidos de paquetes anteriores:
- Portones: orden de medidas Ancho y Alto.
- Ipanel: solo muestra Ancho y Alto.
- Ipanel: maximos para presupuestar Ancho 1.13 m y Alto 2.45 m.
- Otros: no muestra seccion de medidas y no exige Ancho/Alto.

Cambio nuevo para Otros:
- SectionCatalog ya no convierte kind="otros" a "porton".
- El cotizador Otros ahora carga el bootstrap/configuracion propia de Otros.
- Si no hay secciones configuradas para Otros, muestra el mensaje de configuracion pendiente en lugar de mostrar secciones de Portones.

Cambio nuevo de backend:
- catalogDb.js actualiza los CHECK constraints de catalog_kind para permitir porton, ipanel y otros.
- Esto corrige el error al crear secciones de Otros:
  presupuestador_sections_catalog_kind_check

Despues de reemplazar los archivos:
1. Reiniciar backend para que se ejecute ensureCatalogControls().
2. Volver al Dashboard > Otros.
3. Crear las secciones de Otros.
4. Asignar etiquetas a esas secciones.
5. Refrescar catalogo y probar /cotizador/otros.

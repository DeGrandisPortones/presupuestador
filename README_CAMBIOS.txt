Cambios incluidos en este paquete acumulado
===========================================

Este ZIP incluye todos los cambios anteriores y agrega la herencia de alias de Portones hacia Ipanel/Otros.

1) Medidas por tipo de cotizador
--------------------------------
- Portones mantiene la seccion de medidas completa, con Ancho y Alto en ese orden.
- Ipanel muestra solamente Ancho y Alto.
- Otros no muestra la seccion de medidas y no exige Ancho/Alto.

2) Limites de Ipanel
--------------------
- Ancho maximo: 1.13 m / 113 cm.
- Alto maximo: 2.45 m / 245 cm.
- La validacion aplica en pantalla, guardar, confirmar y descargar PDF.

3) Secciones de Otros
---------------------
- Otros carga sus propias secciones, no las de Portones.
- Backend permite catalog_kind = porton, ipanel u otros en las tablas de configuracion.

4) Dependencias por catalogo
----------------------------
- Portones, Ipanel y Otros tienen dependencias independientes.
- Portones conserva compatibilidad con la configuracion historica/global.
- La derivacion de Tipo/Sistema se mantiene solo para Portones.

5) Fix productos en Data para Ipanel/Otros
------------------------------------------
- El catalogo de Ipanel y Otros ahora toma productos segun las etiquetas asignadas a sus secciones.
- Ipanel conserva compatibilidad con productos que tengan etiqueta llamada exactamente "ipanel", pero ademas suma productos de cualquier etiqueta configurada en sus secciones.
- Otros toma productos de las etiquetas configuradas en sus secciones.

6) Alias heredados desde Portones
---------------------------------
- Portones mantiene sus alias propios sin cambios.
- Ipanel y Otros usan primero un alias propio, si existe.
- Si Ipanel/Otros no tienen alias propio para un producto, muestran automaticamente el alias configurado en Portones para ese mismo producto.
- Esto permite reutilizar los nombres ya cargados en Portones sin duplicar configuracion.

Archivos incluidos
------------------
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx
- cotizador-front/src/pages/DashboardPage/index.jsx
- cotizador-front/src/api/admin.js
- cotizador-back/src/catalogDb.js
- cotizador-back/src/catalogBootstrap.js
- cotizador-back/src/routes/admin.routes.js
- cotizador-back/src/settingsDb.js

Instalacion
-----------
1. Descomprimir el ZIP sobre la raiz del repo.
2. Reemplazar los archivos existentes.
3. Reiniciar backend.
4. Recompilar/reiniciar frontend.
5. Entrar al Dashboard, refrescar catalogo y revisar Data/Cotizador en Ipanel/Otros.

Cambios acumulados - Presupuestador
===================================

Este paquete es acumulativo e incluye los cambios anteriores de Ipanel/Otros y el nuevo cambio de dependencias por catalogo.
Copiar y reemplazar estos archivos sobre la raiz del repo.

Archivos incluidos
------------------
- cotizador-front/src/pages/CotizadorPage/index.jsx
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/CotizadorPage/components/SectionCatalog.jsx
- cotizador-front/src/pages/DashboardPage/index.jsx
- cotizador-front/src/api/admin.js
- cotizador-back/src/catalogDb.js
- cotizador-back/src/routes/admin.routes.js
- cotizador-back/src/settingsDb.js

Resumen de cambios previos incluidos
------------------------------------
- Portones mantiene medidas y calculos tecnicos, con orden Ancho y Alto.
- Ipanel muestra solo Ancho y Alto.
- Ipanel valida maximos: Ancho 1.13 m / 113 cm, Alto 2.45 m / 245 cm.
- Otros no muestra ni exige medidas.
- Otros carga secciones/catalogo propios y no hereda Portones.
- Backend actualiza el constraint de presupuestador_sections para aceptar catalog_kind = otros.

Nuevo cambio: dependencias por catalogo
---------------------------------------
- La configuracion de dependencias queda separada por catalogo: porton, ipanel y otros.
- Portones conserva la configuracion existente: si la base todavia tiene el formato anterior global, se sigue leyendo como configuracion de porton.
- Al guardar dependencias de Portones, tambien se mantiene la forma antigua en el JSON para compatibilidad con otras pantallas existentes.
- Ipanel y Otros pueden tener su propia seccion inicial y sus propias dependencias sin pisar las de Portones.
- En el cotizador, SectionCatalog ahora carga las reglas del catalogo correspondiente y aplica dependencias para porton, ipanel u otros.
- La derivacion de Tipo / Sistema sigue habilitada solo para Portones, para no afectar Ipanel/Otros.

Pasos despues de copiar
-----------------------
1. Reemplazar los archivos incluidos.
2. Reiniciar el backend.
3. Recompilar/reiniciar el frontend.
4. En Dashboard, seleccionar el catalogo arriba: Portones, Ipanel u Otros.
5. En cada catalogo, configurar Secciones, Etiquetas -> Secciones y luego Dependencias.
6. Probar que Portones siga mostrando su flujo original antes de cargar reglas nuevas para Ipanel/Otros.

Validacion realizada
--------------------
- Parseo de sintaxis con TypeScript createSourceFile para archivos JSX/JS incluidos.
- node --check para archivos JS de frontend/backend.

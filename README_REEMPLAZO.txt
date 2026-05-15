Reemplazo para Presupuestador - parantes no apto / persistencia de IDs

Copiar y reemplazar estos archivos completos en el repo:

- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-back/src/settingsDb.js

Cambios principales:

1) Persistencia reforzada de reglas tecnicas de parantes:
   - non_apto_parantes_vertical_product_ids
   - non_apto_parantes_horizontal_product_ids
   - parantes_door_product_ids
   - parantes_door_first_distance_mm
   - parantes_tube_discount_mm

2) El front manda estos parametros en surface_parameters, surface_calc_params,
   surface_params y measurement_surface_params, ademas de duplicarlos a nivel
   raiz del payload para compatibilidad.

3) El front guarda una copia local de respaldo en localStorage:
   presupuestador:technical_surface_parameters:porton
   Esto evita que se vacien visualmente al refrescar si el backend devuelve una
   rama antigua/vacia.

4) La pantalla de carga de presupuesto tambien lee ese respaldo local para que
   la orientacion horizontal/vertical aplique al esquema y a los campos de solo
   lectura aun si el GET del backend vuelve incompleto.

5) El backend incluido preserva como texto las listas de IDs y fusiona varias
   ramas de parametros tecnicos.

Importante:
- Despues de reemplazar, reiniciar backend y frontend.
- Probar guardando, refrescando la pantalla de reglas tecnicas y luego abriendo
  un presupuesto con un ID configurado, por ejemplo 3025 en horizontal.


Corrección adicional de persistencia de IDs de parantes
------------------------------------------------------
Este paquete agrega una rama dedicada `parantes_config` además de `surface_parameters` y `surface_calc_params` para evitar que los IDs de orientación/puerta se pierdan al normalizar el JSON.

IMPORTANTE: en el JSON que revisamos, los valores reales guardados eran:
- non_apto_parantes_vertical_product_ids = "1122"
- non_apto_parantes_horizontal_product_ids = ""
- parantes_door_product_ids = ""

Por eso un portón con ID 3025 no podía quedar horizontal: 3025 no estaba guardado en la configuración de parantes.

Después de reemplazar archivos:
1. Reiniciar backend.
2. Reiniciar frontend.
3. En Reglas técnicas, cargar de nuevo los IDs y guardar.
4. Refrescar y validar que queden cargados.

Incluye también SQL_FIX_PARANTES_EJEMPLO.sql por si querés forzar un valor manualmente desde Supabase para probar.


Corrección de orientación por IDs:
- Los JSON enviados antes/después del refresh quedan iguales; la configuración sí persiste.
- Se refuerza la lectura de parámetros desde catalog_rules.porton.surface_parameters y catalog_rules.porton.surface_calc_params.
- El match de IDs ahora compara contra product_id y también contra id/odoo_external_id/odoo_id/odoo_template_id/odoo_variant_id de cada línea.
- Esto cubre casos donde la línea del presupuesto llega al componente con otra clave de ID aunque en pantalla se muestre como ID Presupuestador.

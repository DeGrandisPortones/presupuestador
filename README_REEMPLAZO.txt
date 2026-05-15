Reemplazo listo para copiar y pegar.

Archivos incluidos:
- cotizador-front/src/pages/CotizadorPage/components/PortonDimensions.jsx
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx
- cotizador-front/src/domain/quote/store.js
- cotizador-back/src/settingsDb.js
- SQL_FIX_PARANTES_EJEMPLO.sql

Correccion de esta version:
- La pantalla de medidas fuerza refetch de reglas tecnicas al montar, para evitar leer una configuracion cacheada.
- La deteccion de orientacion para portones no apto ahora muestra diagnostico en el helper:
  * IDs detectados en el presupuesto
  * IDs configurados como horizontal
  * IDs configurados como vertical
  * regla que esta aplicando
- El match de productos revisa mas claves posibles de la linea: product_id, id, presupuestador_id, presupuestador_product_id, productId, catalog_product_id, odoo_external_id, odoo_id, odoo_template_id, odoo_variant_id y el prefijo numerico de line_key.
- Si no hay regla de ID, usa como fallback el nombre del producto que contenga orientacion horizontal o vertical.

Para el caso reportado:
- La configuracion guardada tiene horizontal: 3025,3591.
- Si la linea realmente llega al componente con ID 3025, el helper debe mostrar ese ID en "IDs detectados" y la regla debe quedar Horizontal.
- Si no aparece 3025 en "IDs detectados", la linea no esta llegando al componente con ese ID y el helper va a mostrar que IDs esta recibiendo realmente.

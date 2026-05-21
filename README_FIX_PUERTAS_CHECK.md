# Fix puertas - catalog_kind puerta

Copiar el contenido de este ZIP sobre la raiz del repositorio y reemplazar archivos.

No hace falta ejecutar comandos manuales ni SQL.

Al redeployar el backend, la primera llamada a /api/doors ejecuta automaticamente la correccion de la constraint:

- elimina el CHECK viejo de public.presupuestador_quotes.catalog_kind
- crea el nuevo CHECK permitiendo: porton, ipanel, otros, puerta

Esto corrige:

new row for relation "presupuestador_quotes" violates check constraint "presupuestador_quotes_catalog_kind_check"

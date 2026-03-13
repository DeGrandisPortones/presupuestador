Cambios incluidos:

1. Técnica:
- nueva pestaña "Mediciones" en AprobacionTecnicaPage
- asignación de fecha de visita por portón

2. Medición:
- listado ordenado por fecha de visita más próxima
- filtros por cliente, localidad y rango de fechas

3. Backend:
- nuevas columnas de programación de visita
- nuevo endpoint PUT /api/measurements/:id/schedule
- listado /api/measurements con viewer=medidor|tecnica y filtros

Archivos listos para reemplazar en el repo.

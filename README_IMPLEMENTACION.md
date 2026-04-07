
Reemplazar:
- cotizador-back/src/settingsDb.js
- cotizador-back/src/routes/measurements.routes.js
- cotizador-front/src/pages/SuperuserMeasurementRulesPage/index.jsx

Este paquete agrega:
- detección de instalación por IDs del presupuesto
- detección de "apto para revestir" por ID de producto
- cálculo automático de piernas por peso
- parámetros editables desde /dashboard/reglas-tecnicas
- uso de kg/m2 de entry del presupuesto cuando no hay producto de instalación
- excepción de 80kg para pasar de angostas a comunes cuando es sin revestimiento

PAQUETE BASE - CAMPOS DINAMICOS EN MEDICION

Incluye:
- settings para campos técnicos dinámicos
- endpoints admin para guardar/cargar campos y reglas
- funciones frontend admin para campos/rules

IMPORTANTE:
Este paquete deja la base del backend y la API frontend lista.
Para Automatización / Posición de motor necesitás completar además la UI de las páginas:
- SuperuserMeasurementRulesPage
- MedicionDetailPage

Ejemplo:
1) campo automatizacion -> enum -> si,no
2) campo posicion_motor -> enum -> derecha,izquierda,doble
3) regla: automatizacion = no -> action set_value -> target pasador_manual -> si
4) regla: automatizacion = no -> action hide_field -> target posicion_motor
5) regla: automatizacion = si -> action show_field -> target posicion_motor
6) regla: automatizacion = si -> action allow_options -> target posicion_motor -> derecha,izquierda,doble
